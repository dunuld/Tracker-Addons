import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Account, ImportResult, Statement } from '../../shared/api-types.js';
import { createApp } from '../src/app.js';
import { openDatabase, type Database } from '../src/db/database.js';
import { MAX_UPLOAD_BYTES } from '../src/routes/statements.js';
import { SYNTHETIC_ING_PDF, minimalPdf } from './fixtures.js';

const fixture = readFileSync(SYNTHETIC_ING_PDF);
const fixtureHash = createHash('sha256').update(fixture).digest('hex');
const FILE_NAME = 'Girokonto_Kontoauszug_Oktober.pdf';

let db: Database;
let uploadsDir: string;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  db = openDatabase(':memory:');
  uploadsDir = mkdtempSync(join(tmpdir(), 'budget-uploads-'));
  app = createApp(db, { uploadsDir });
});

afterEach(() => {
  db.close();
  rmSync(uploadsDir, { recursive: true, force: true });
});

const upload = (file: Buffer, name = FILE_NAME, query = '') =>
  request(app)
    .post(`/api/statements${query}`)
    .attach('file', file, { filename: name, contentType: 'application/pdf' });

const count = (sql: string, ...params: (string | number)[]) =>
  Number(db.prepare(sql).get(...params)?.['n']);

describe('POST api/statements', () => {
  it('importiert den ING-Auszug und liefert das Import-Ergebnis', async () => {
    const res = await upload(fixture).expect(201);
    const result = res.body as ImportResult;

    expect(result).toMatchObject({
      periodFrom: '2026-10-01',
      periodTo: '2026-10-31',
      transactionCount: 19,
      accountCreated: true,
      sumCents: 311034,
      balanceOk: true,
      warnings: [],
      statement: {
        bank: 'ING',
        iban: 'DE58500105175435728801',
        year: 2026,
        month: 10,
        openingCents: 120000,
        closingCents: 431034,
        accountName: 'ING ••8801',
        fileName: FILE_NAME,
        transactionCount: 19,
      },
    });
    expect(result.statement.importedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // uncategorizedCount variiert je nach Seed-Regeln; mindestens 0
    expect(result.uncategorizedCount).toBeGreaterThanOrEqual(0);

    expect(
      count('SELECT COUNT(*) AS n FROM transactions WHERE statement_id = ?', result.statement.id),
    ).toBe(19);
    // Alle Buchungen haben eine Kategorie (entweder per Regel oder Default)
    expect(count('SELECT COUNT(*) AS n FROM transactions WHERE category_id IS NOT NULL')).toBe(19);
    expect(Number(db.prepare('SELECT SUM(amount_cents) AS n FROM transactions').get()?.['n'])).toBe(
      311034,
    );

    const stored = join(uploadsDir, `${fixtureHash}.pdf`);
    expect(readFileSync(stored).equals(fixture)).toBe(true);
  });

  it('erkennt Duplikate (gleiche Datei) mit 409 und ersetzt mit replace=true', async () => {
    const first = (await upload(fixture).expect(201)).body as ImportResult;

    const duplicate = await upload(fixture).expect(409);
    expect(duplicate.body).toMatchObject({
      code: 'DUPLICATE_STATEMENT',
      existing: { id: first.statement.id, month: 10, year: 2026 },
    });
    expect(duplicate.body.error).toContain('10/2026');

    const replaced = (await upload(fixture, 'neu.pdf', '?replace=true').expect(201))
      .body as ImportResult;
    expect(replaced.statement.fileName).toBe('neu.pdf');
    expect(replaced.transactionCount).toBe(19);

    const list = (await request(app).get('/api/statements').expect(200)).body as Statement[];
    expect(list.length).toBe(1);
    expect(list[0]!.fileName).toBe('neu.pdf');
    expect(count('SELECT COUNT(*) AS n FROM transactions')).toBe(19);
    expect(existsSync(join(uploadsDir, `${fixtureHash}.pdf`))).toBe(true);
  });

  it('erkennt Duplikate über IBAN + Monat bei abweichender Datei', async () => {
    await upload(fixture).expect(201);
    const variant = Buffer.concat([fixture, Buffer.from('\n% anderer Export\n')]);
    const res = await upload(variant).expect(409);
    expect(res.body.code).toBe('DUPLICATE_STATEMENT');

    await upload(variant, FILE_NAME, '?replace=1').expect(201);
    const variantHash = createHash('sha256').update(variant).digest('hex');
    expect(existsSync(join(uploadsDir, `${variantHash}.pdf`))).toBe(true);
    expect(existsSync(join(uploadsDir, `${fixtureHash}.pdf`))).toBe(false);
  });

  it('übernimmt UTF-8-Dateinamen', async () => {
    const res = await upload(fixture, 'Auszug_März_2026.pdf').expect(201);
    expect(res.body.statement.fileName).toBe('Auszug_März_2026.pdf');
  });

  it.each([
    ['Nicht-PDF', Buffer.from('Datum;Betrag\n01.10.2026;-1,00\n'), 'INVALID_FILE'],
    ['beschädigtes PDF', Buffer.from('%PDF-1.7\nkaputt'), 'INVALID_FILE'],
    ['PDF ohne Kontoauszug', minimalPdf(), 'UNSUPPORTED_STATEMENT'],
  ])('lehnt %s mit 400 ab', async (_label, file, code) => {
    const res = await upload(file).expect(400);
    expect(res.body.code).toBe(code);
    expect(res.body.error).toEqual(expect.any(String));
    expect(count('SELECT COUNT(*) AS n FROM statements')).toBe(0);
  });

  it('verlangt eine Datei im Feld "file"', async () => {
    const res = await request(app).post('/api/statements').field('note', 'x').expect(400);
    expect(res.body.code).toBe('NO_FILE');
  });

  it('lehnt zu große Dateien mit 413 ab', async () => {
    const res = await upload(Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0x20)).expect(413);
    expect(res.body.code).toBe('FILE_TOO_LARGE');
  });
});

describe('GET/DELETE api/statements', () => {
  it('listet, liefert und löscht Auszüge inkl. Buchungen und PDF', async () => {
    const { statement } = (await upload(fixture).expect(201)).body as ImportResult;

    const list = (await request(app).get('/api/statements').expect(200)).body as Statement[];
    expect(list).toEqual([statement]);
    await request(app).get(`/api/statements/${statement.id}`).expect(200, statement);

    await request(app).delete(`/api/statements/${statement.id}`).expect(204);
    expect(count('SELECT COUNT(*) AS n FROM transactions')).toBe(0);
    expect(existsSync(join(uploadsDir, `${fixtureHash}.pdf`))).toBe(false);

    await request(app).get(`/api/statements/${statement.id}`).expect(404);
    await request(app).delete(`/api/statements/${statement.id}`).expect(404);
    await request(app).get('/api/statements').expect(200, []);
  });

  it('validiert die ID', async () => {
    const res = await request(app).get('/api/statements/abc').expect(400);
    expect(res.body.error).toBe('Ungültige ID');
  });

  it('funktioniert ohne Upload-Verzeichnis', async () => {
    const plain = createApp(db);
    await request(plain).post('/api/statements').attach('file', fixture, FILE_NAME).expect(201);
  });
});

describe('Konten beim Import', () => {
  it('legt das Konto beim ersten Import an und verwendet es danach wieder', async () => {
    const first = (await upload(fixture).expect(201)).body as ImportResult;
    expect(first.accountCreated).toBe(true);
    const replaced = (await upload(fixture, FILE_NAME, '?replace=true').expect(201))
      .body as ImportResult;
    expect(replaced.accountCreated).toBe(false);
    expect(replaced.statement.accountId).toBe(first.statement.accountId);

    const accounts = (await request(app).get('/api/accounts').expect(200)).body as Account[];
    expect(accounts).toEqual([
      {
        id: first.statement.accountId,
        iban: 'DE58500105175435728801',
        bank: 'ING',
        name: 'ING ••8801',
        color: '#2196f3',
        sort: 0,
        includeInReports: true,
        statementCount: 1,
        balanceCents: 431034,
        balanceMonth: '2026-10',
      },
    ]);
  });

  it('löscht ein Konto samt Auszügen, Buchungen und PDF-Dateien', async () => {
    const { statement } = (await upload(fixture).expect(201)).body as ImportResult;
    expect(existsSync(join(uploadsDir, `${fixtureHash}.pdf`))).toBe(true);

    await request(app).delete(`/api/accounts/${statement.accountId}`).expect(204);
    expect(count('SELECT COUNT(*) AS n FROM accounts')).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM statements')).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM transactions')).toBe(0);
    expect(existsSync(join(uploadsDir, `${fixtureHash}.pdf`))).toBe(false);
    await request(app).delete(`/api/accounts/${statement.accountId}`).expect(404);
  });
});
