import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ReapplyResult, Transaction } from '../../shared/api-types.js';
import { createApp } from '../src/app.js';
import {
  TransferDetector,
  findTransfers,
  type TransferCandidate,
} from '../src/categorization/transfers.js';
import { openDatabase, type Database } from '../src/db/database.js';
import { DEFAULT_CATEGORY_NAME } from '../src/db/seed.js';
import { accountId, categoryId, insertTransactions } from './helpers.js';

const tx = (
  id: number,
  accountId: number,
  bookingDate: string,
  amountCents: number,
  text: Partial<Pick<TransferCandidate, 'counterparty' | 'purpose'>> = {},
): TransferCandidate => ({
  id,
  accountId,
  bookingDate,
  amountCents,
  counterparty: text.counterparty ?? '',
  purpose: text.purpose ?? '',
});

const ACCOUNTS = [
  { id: 1, iban: 'DE58500105175435728801' },
  { id: 2, iban: 'DE11500105170000004711' },
];

describe('findTransfers', () => {
  it('paart Ab- und Gutschrift gleichen Betrags auf verschiedenen Konten', () => {
    const result = findTransfers(
      [tx(1, 1, '2026-10-01', -10000), tx(2, 2, '2026-10-02', 10000)],
      ACCOUNTS,
    );
    expect([...result].sort()).toEqual([1, 2]);
  });

  it('ignoriert gleiches Konto, anderen Betrag und mehr als 3 Tage Abstand', () => {
    const result = findTransfers(
      [
        tx(1, 1, '2026-10-01', -10000),
        tx(2, 1, '2026-10-01', 10000), // gleiches Konto
        tx(3, 2, '2026-10-01', 9999), // anderer Betrag
        tx(4, 2, '2026-10-05', 10000), // 4 Tage später
      ],
      ACCOUNTS,
    );
    expect(result.size).toBe(0);
  });

  it('nutzt jede Buchung nur einmal und wählt den kleinsten Abstand', () => {
    const result = findTransfers(
      [tx(1, 1, '2026-10-01', -5000), tx(2, 1, '2026-10-03', -5000), tx(3, 2, '2026-10-03', 5000)],
      ACCOUNTS,
    );
    // Abbuchung 1 kommt zuerst und nimmt die einzige Gutschrift; 2 bleibt ohne Partner
    expect([...result].sort()).toEqual([1, 3]);

    const closest = findTransfers(
      [tx(1, 1, '2026-10-03', -5000), tx(2, 2, '2026-10-01', 5000), tx(3, 2, '2026-10-03', 5000)],
      ACCOUNTS,
    );
    expect([...closest].sort()).toEqual([1, 3]);
  });

  it('erkennt die IBAN eines anderen eigenen Kontos, auch mit Leerzeichen', () => {
    const result = findTransfers(
      [
        tx(1, 1, '2026-10-01', -2500, { purpose: 'Sparen DE11 5001 0517 0000 0047 11' }),
        tx(2, 2, '2026-10-01', -100, { counterparty: 'de11500105170000004711' }), // eigene IBAN
        tx(3, 2, '2026-10-01', 777, { purpose: 'Zins DE58500105175435728801' }),
      ],
      ACCOUNTS,
    );
    expect([...result].sort()).toEqual([1, 3]);
  });
});

describe('Umbuchungen in der Datenbank', () => {
  let db: Database;
  let app: ReturnType<typeof createApp>;
  let transferId: number;

  const source = (id: number) =>
    db.prepare('SELECT category_id, category_source FROM transactions WHERE id = ?').get(id);

  beforeEach(() => {
    db = openDatabase(':memory:');
    app = createApp(db);
    transferId = categoryId(db, 'Umbuchungen');
  });
  afterEach(() => db.close());

  it('markiert beide Seiten und setzt sie zurück, wenn das Gegenkonto gelöscht wird', async () => {
    const [out] = insertTransactions(
      db,
      [{ date: '2026-10-01', counterparty: 'Max Muster', amountCents: -10000 }],
      'DE01',
    );
    const [inc] = insertTransactions(
      db,
      [{ date: '2026-10-02', counterparty: 'Max Muster', amountCents: 10000 }],
      'DE02',
    );
    expect(new TransferDetector(db).detect()).toBe(2);
    expect(source(out!)).toEqual({ category_id: transferId, category_source: 'transfer' });
    expect(source(inc!)).toEqual({ category_id: transferId, category_source: 'transfer' });
    expect(new TransferDetector(db).detect()).toBe(0);

    await request(app)
      .delete(`/api/accounts/${accountId(db, 'DE02')}`)
      .expect(204);
    const defaultId = Number(
      db.prepare('SELECT id FROM categories WHERE is_default = 1').get()?.['id'],
    );
    expect(source(out!)).toEqual({ category_id: defaultId, category_source: 'default' });
  });

  it('setzt per Regel zurück und lässt manuelle Zuordnungen unverändert', async () => {
    const insurance = categoryId(db, 'Versicherungen');
    const [manual, rule] = insertTransactions(
      db,
      [
        { date: '2026-10-01', amountCents: -500, categoryId: insurance, source: 'manual' },
        { date: '2026-10-01', counterparty: 'HUK-COBURG', amountCents: -700 },
      ],
      'DE01',
    );
    insertTransactions(db, [{ date: '2026-10-01', amountCents: 500 }], 'DE02');
    const [other] = insertTransactions(db, [{ date: '2026-10-01', amountCents: 700 }], 'DE03');

    new TransferDetector(db).detect();
    expect(source(manual!)).toEqual({ category_id: insurance, category_source: 'manual' });
    expect(source(rule!)?.['category_source']).toBe('transfer');

    // Gegenbuchung weg → Buchung fällt auf die passende Regel zurück
    db.prepare(
      'DELETE FROM statements WHERE id = (SELECT statement_id FROM transactions WHERE id = ?)',
    ).run(other!);
    new TransferDetector(db).detect();
    expect(source(rule!)).toMatchObject({ category_source: 'rule', category_id: insurance });
  });

  it('erkennt beim Löschen eines Auszugs und bei „Regeln neu anwenden“ neu', async () => {
    const fallback = categoryId(db, DEFAULT_CATEGORY_NAME);
    const [out] = insertTransactions(
      db,
      [{ date: '2026-10-01', amountCents: -300, categoryId: fallback }],
      'DE01',
    );
    insertTransactions(
      db,
      [{ date: '2026-10-01', amountCents: 300, categoryId: fallback }],
      'DE02',
    );

    const reapplied = (await request(app).post('/api/rules/reapply').expect(200))
      .body as ReapplyResult;
    expect(reapplied.updated).toBe(2);
    expect(source(out!)?.['category_source']).toBe('transfer');

    const list = (await request(app).get(`/api/transactions?accountId=${accountId(db, 'DE01')}`))
      .body as Transaction[];
    expect(list[0]!.categorySource).toBe('transfer');

    const statementId = db
      .prepare(
        'SELECT s.id FROM statements s JOIN accounts a ON a.id = s.account_id WHERE a.iban = ?',
      )
      .get('DE02')?.['id'];
    await request(app)
      .delete(`/api/statements/${String(statementId)}`)
      .expect(204);
    expect(source(out!)?.['category_source']).toBe('default');
  });

  it('nimmt die erste Umbuchungs-Kategorie und erkennt ohne eine solche nichts', () => {
    const [out] = insertTransactions(db, [{ date: '2026-10-01', amountCents: -300 }], 'DE01');
    insertTransactions(db, [{ date: '2026-10-01', amountCents: 300 }], 'DE02');
    new TransferDetector(db).detect();
    expect(source(out!)?.['category_source']).toBe('transfer');

    // Kategorie gelöscht: Trigger setzt auf Standard; erneute Erkennung findet keine Kategorie
    db.prepare("DELETE FROM categories WHERE kind = 'transfer'").run();
    expect(new TransferDetector(db).detect()).toBe(0);
    expect(source(out!)?.['category_source']).toBe('default');
  });

  it('prüft Bestandsdaten beim Start der App', () => {
    const fresh = openDatabase(':memory:');
    const [out] = insertTransactions(fresh, [{ date: '2026-10-01', amountCents: -300 }], 'DE01');
    insertTransactions(fresh, [{ date: '2026-10-02', amountCents: 300 }], 'DE02');
    createApp(fresh);
    expect(
      fresh.prepare('SELECT category_source FROM transactions WHERE id = ?').get(out!)?.[
        'category_source'
      ],
    ).toBe('transfer');
    fresh.close();
  });
});
