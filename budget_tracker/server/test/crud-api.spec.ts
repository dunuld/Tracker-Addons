import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  Account,
  Category,
  MonthlyReport,
  Rule,
  Transaction,
  TrendReport,
} from '../../shared/api-types.js';
import { createApp } from '../src/app.js';
import { openDatabase, type Database } from '../src/db/database.js';
import { DEFAULT_CATEGORY_NAME } from '../src/db/seed.js';
import { MAX_TREND_MONTHS } from '../src/routes/reports.js';
import { accountId, categoryId, insertTransactions } from './helpers.js';

let db: Database;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  db = openDatabase(':memory:');
  app = createApp(db);
});
afterEach(() => db.close());

const api = () => request(app);

describe('api/categories', () => {
  it('listet, legt an, ändert und löscht Kategorien', async () => {
    const list = (await api().get('/api/categories').expect(200)).body as Category[];
    expect(list.find((c) => c.isDefault)?.name).toBe(DEFAULT_CATEGORY_NAME);

    const created = (
      await api()
        .post('/api/categories')
        .send({ name: '  Hobby ', color: '#123abc', kind: 'expense', sort: 5 })
        .expect(201)
    ).body as Category;
    expect(created).toMatchObject({
      name: 'Hobby',
      color: '#123abc',
      kind: 'expense',
      sort: 5,
      isDefault: false,
    });

    await api().get(`/api/categories/${created.id}`).expect(200, created);

    const patched = (
      await api()
        .patch(`/api/categories/${created.id}`)
        .send({ color: '#000000', sort: 7 })
        .expect(200)
    ).body as Category;
    expect(patched).toMatchObject({ name: 'Hobby', color: '#000000', sort: 7 });

    await api().delete(`/api/categories/${created.id}`).expect(204);
    await api().get(`/api/categories/${created.id}`).expect(404);
  });

  it.each([
    [{ color: '#000000', kind: 'expense' }, 'Name'],
    [{ name: 'X', color: 'rot', kind: 'expense' }, 'Farbe'],
    [{ name: 'X', color: '#000000', kind: 'other' }, 'Typ'],
    [{ name: 'X', color: '#000000', kind: 'expense', sort: 1.5 }, 'sort'],
  ])('validiert POST %o', async (body, message) => {
    const res = await api().post('/api/categories').send(body).expect(400);
    expect(res.body.error).toContain(message);
  });

  it('validiert PATCH statt Datenbankfehler (500) zu liefern', async () => {
    const id = categoryId(db, 'Bargeld');
    await api().patch(`/api/categories/${id}`).send({ color: 'red' }).expect(400);
    await api().patch(`/api/categories/${id}`).send({ kind: 'x' }).expect(400);
    await api().patch(`/api/categories/${id}`).send({ name: '   ' }).expect(400);
    await api().patch('/api/categories/99999').send({ name: 'X' }).expect(404);
  });

  it('meldet doppelte Namen mit 409 (auch case-insensitive)', async () => {
    const res = await api()
      .post('/api/categories')
      .send({ name: 'bargeld', color: '#000000', kind: 'expense' })
      .expect(409);
    expect(res.body).toMatchObject({ code: 'NAME_EXISTS' });
    await api()
      .patch(`/api/categories/${categoryId(db, 'Drogerie')}`)
      .send({ name: 'Bargeld' })
      .expect(409);
  });

  it('schützt die Standardkategorie vor dem Löschen (409)', async () => {
    const res = await api()
      .delete(`/api/categories/${categoryId(db, DEFAULT_CATEGORY_NAME)}`)
      .expect(409);
    expect(res.body).toMatchObject({ code: 'DEFAULT_CATEGORY' });
  });

  it('setzt Buchungen einer gelöschten Kategorie auf die Standardkategorie zurück', async () => {
    const bargeld = categoryId(db, 'Bargeld');
    const [id] = insertTransactions(db, [
      { date: '2026-10-01', amountCents: -5000, categoryId: bargeld, source: 'manual' },
    ]);
    await api().delete(`/api/categories/${bargeld}`).expect(204);
    expect(
      db.prepare('SELECT category_id, category_source FROM transactions WHERE id = ?').get(id!),
    ).toEqual({
      category_id: categoryId(db, DEFAULT_CATEGORY_NAME),
      category_source: 'default',
    });
  });

  it('validiert IDs', async () => {
    await api().get('/api/categories/abc').expect(400);
    await api().delete('/api/categories/0').expect(400);
    await api().delete('/api/categories/99999').expect(404);
  });
});

describe('api/rules', () => {
  it('legt Regeln mit Standardwerten an, ändert und löscht sie', async () => {
    const cat = categoryId(db, 'Bargeld');
    const rule = (
      await api().post('/api/rules').send({ categoryId: cat, pattern: ' foo ' }).expect(201)
    ).body as Rule;
    expect(rule).toMatchObject({
      categoryId: cat,
      field: 'any',
      matchType: 'contains',
      pattern: 'foo',
      priority: 100,
    });

    const list = (await api().get('/api/rules').expect(200)).body as Rule[];
    expect(list.at(-1)).toEqual(rule);
    // nach Priorität sortiert
    expect(list.map((r) => r.priority)).toEqual(
      [...list.map((r) => r.priority)].sort((a, b) => a - b),
    );

    const patched = (
      await api()
        .patch(`/api/rules/${rule.id}`)
        .send({ matchType: 'regex', pattern: '^foo\\d+', priority: 5 })
        .expect(200)
    ).body as Rule;
    expect(patched).toMatchObject({
      matchType: 'regex',
      pattern: '^foo\\d+',
      priority: 5,
      field: 'any',
    });
    await api().get(`/api/rules/${rule.id}`).expect(200, patched);

    await api().delete(`/api/rules/${rule.id}`).expect(204);
    await api().get(`/api/rules/${rule.id}`).expect(404);
    await api().delete(`/api/rules/${rule.id}`).expect(404);
  });

  it.each([
    [{ pattern: 'x' }, 'Kategorie'],
    [{ categoryId: 1, pattern: '  ' }, 'Muster'],
    [{ categoryId: 1, pattern: 'x', field: 'iban' }, 'Feld'],
    [{ categoryId: 1, pattern: 'x', matchType: 'glob' }, 'Vergleich'],
    [{ categoryId: 1, pattern: 'x', priority: 'hoch' }, 'Priorität'],
    [{ categoryId: 1, pattern: '(', matchType: 'regex' }, 'Regex'],
    // Mit u-Flag ungültig – muss bei Validierung und Auswertung gleich behandelt werden
    [{ categoryId: 1, pattern: '\\-', matchType: 'regex' }, 'Regex'],
  ])('validiert POST %o', async (body, message) => {
    const res = await api().post('/api/rules').send(body).expect(400);
    expect(res.body.error).toContain(message);
  });

  it('meldet unbekannte Kategorien mit 404', async () => {
    await api().post('/api/rules').send({ categoryId: 99999, pattern: 'x' }).expect(404);
    const [rule] = (await api().get('/api/rules')).body as Rule[];
    await api().patch(`/api/rules/${rule!.id}`).send({ categoryId: 99999 }).expect(404);
    await api()
      .patch(`/api/rules/${rule!.id}`)
      .send({ matchType: 'regex', pattern: '[' })
      .expect(400);
    await api().patch('/api/rules/99999').send({ pattern: 'x' }).expect(404);
  });

  it('wendet Regeln per reapply erneut an', async () => {
    insertTransactions(db, [{ date: '2026-10-01', counterparty: 'REWE', amountCents: -100 }]);
    await api().post('/api/rules/reapply').expect(200, { updated: 1 });
    await api().post('/api/rules/reapply').expect(200, { updated: 0 });
  });
});

describe('api/transactions', () => {
  let ids: number[];
  beforeEach(() => {
    ids = insertTransactions(db, [
      { date: '2026-03-05', counterparty: 'REWE', purpose: 'Einkauf', amountCents: -2000 },
      { date: '2026-03-31', counterparty: '100% Rabatt_Shop', amountCents: -500 },
      { date: '2026-04-01', counterparty: 'Arbeitgeber', purpose: 'GEHALT', amountCents: 300000 },
      { date: '2026-12-31', counterparty: 'Silvester', amountCents: -100 },
    ]);
    insertTransactions(
      db,
      [{ date: '2027-01-01', counterparty: 'Neujahr', amountCents: -100 }],
      'DE00OTHER',
    );
  });

  const list = async (query: Record<string, string | number>) =>
    ((await api().get('/api/transactions').query(query).expect(200)).body as Transaction[]).map(
      (t) => t.counterparty,
    );

  it('filtert nach Monat (Zahlen statt String-Verkettung)', async () => {
    expect(await list({ year: 2026, month: 3 })).toEqual(['REWE', '100% Rabatt_Shop']);
    expect(await list({ year: 2026, month: 4 })).toEqual(['Arbeitgeber']);
    expect(await list({ year: 2026, month: 12 })).toEqual(['Silvester']);
    expect(await list({})).toHaveLength(5);
  });

  it('sucht in Empfänger und Verwendungszweck, % und _ wörtlich', async () => {
    expect(await list({ q: 'gehalt' })).toEqual(['Arbeitgeber']);
    expect(await list({ q: '%' })).toEqual(['100% Rabatt_Shop']);
    expect(await list({ q: '_' })).toEqual(['100% Rabatt_Shop']);
  });

  it('filtert nach Kategorie', async () => {
    const bargeld = categoryId(db, 'Bargeld');
    db.prepare('UPDATE transactions SET category_id = ? WHERE id = ?').run(bargeld, ids[1]!);
    expect(await list({ categoryId: bargeld })).toEqual(['100% Rabatt_Shop']);
  });

  it.each([{ month: 13, year: 2026 }, { month: 'x', year: 2026 }, { categoryId: -1 }])(
    'validiert Filter %o',
    async (query) => {
      await api().get('/api/transactions').query(query).expect(400);
    },
  );

  it('ordnet manuell zu und legt optional eine Regel an', async () => {
    const bargeld = categoryId(db, 'Bargeld');
    const res = await api()
      .patch(`/api/transactions/${ids[0]}`)
      .send({ categoryId: bargeld, createRule: true })
      .expect(200);
    expect(res.body.transaction).toMatchObject({
      categoryId: bargeld,
      categorySource: 'manual',
      ruleId: null,
    });
    expect(res.body.rule).toMatchObject({
      categoryId: bargeld,
      field: 'counterparty',
      matchType: 'contains',
      pattern: 'REWE',
    });

    const noRule = await api()
      .patch(`/api/transactions/${ids[1]}`)
      .send({ categoryId: bargeld })
      .expect(200);
    expect(noRule.body.rule).toBeUndefined();
  });

  it('validiert PATCH', async () => {
    await api().patch(`/api/transactions/${ids[0]}`).send({}).expect(400);
    await api().patch('/api/transactions/99999').send({ categoryId: 1 }).expect(404);
    await api().patch(`/api/transactions/${ids[0]}`).send({ categoryId: 99999 }).expect(404);
    const [empty] = insertTransactions(db, [{ date: '2026-05-01', amountCents: -1 }], 'DE00EMPTY');
    await api()
      .patch(`/api/transactions/${empty}`)
      .send({ categoryId: 1, createRule: true })
      .expect(400);
  });
});

describe('api/reports', () => {
  beforeEach(() => {
    const food = categoryId(db, 'Lebensmittel & Einkäufe');
    const income = categoryId(db, 'Einnahmen');
    const transfer = categoryId(db, 'Umbuchungen');
    insertTransactions(db, [
      { date: '2026-11-03', amountCents: -2500, categoryId: food },
      { date: '2026-11-30', amountCents: -1500, categoryId: food },
      { date: '2026-11-15', amountCents: 300000, categoryId: income },
      { date: '2026-11-20', amountCents: -100000, categoryId: transfer },
    ]);
    insertTransactions(
      db,
      [{ date: '2026-12-01', amountCents: -999, categoryId: food }],
      'DE00DEC',
    );
  });

  it('berechnet die Monatsübersicht ohne Umbuchungen', async () => {
    const report = (
      await api().get('/api/reports/monthly').query({ year: 2026, month: 11 }).expect(200)
    ).body as MonthlyReport;
    expect(report).toMatchObject({
      year: 2026,
      month: 11,
      incomeCents: 300000,
      expenseCents: -4000,
      balanceCents: 296000,
    });
    expect(report.categories.find((c) => c.name === 'Lebensmittel & Einkäufe')).toMatchObject({
      totalCents: -4000,
      count: 2,
    });
    expect(report.categories.some((c) => c.kind === 'transfer')).toBe(false);
  });

  it('berechnet den Trend über Jahresgrenzen', async () => {
    const report = (
      await api().get('/api/reports/trend').query({ from: '2026-11', to: '2027-01' }).expect(200)
    ).body as TrendReport;
    expect(report.months.map((m) => m.month)).toEqual(['2026-11', '2026-12', '2027-01']);
    const food = categoryId(db, 'Lebensmittel & Einkäufe');
    expect(report.months[1]!.totals).toEqual([{ categoryId: food, totalCents: -999 }]);
    expect(report.months[2]!.totals).toEqual([]);
    expect(report.categories.some((c) => c.kind === 'transfer')).toBe(false);
  });

  it.each([
    ['/api/reports/monthly', {}],
    ['/api/reports/monthly', { year: 2026, month: 13 }],
    ['/api/reports/trend', { from: '2026-01' }],
    ['/api/reports/trend', { from: '2026-02', to: '2026-01' }],
    // Monat 13 hätte früher eine Endlosschleife ausgelöst
    ['/api/reports/trend', { from: '2025-13', to: '2026-01' }],
    ['/api/reports/trend', { from: '2000-01', to: `${2000 + MAX_TREND_MONTHS / 12}-01` }],
  ])('validiert %s %o', async (url, query) => {
    await api().get(url).query(query).expect(400);
  });
});

describe('api/accounts', () => {
  it('listet Konten mit Anzahl Auszüge und jüngstem Saldo', async () => {
    insertTransactions(db, [{ date: '2026-09-03', amountCents: -100 }], 'DE01');
    insertTransactions(db, [{ date: '2026-10-03', amountCents: -100 }], 'DE01');
    db.prepare('UPDATE statements SET closing_cents = 4200 WHERE month = 10').run();
    accountId(db, 'DE02');

    const list = (await api().get('/api/accounts').expect(200)).body as Account[];
    expect(list.map((a) => [a.iban, a.statementCount, a.balanceCents, a.balanceMonth])).toEqual([
      ['DE01', 2, 4200, '2026-10'],
      ['DE02', 0, null, null],
    ]);
  });

  it('ändert Name, Farbe, Sortierung und Einbeziehung', async () => {
    const id = accountId(db, 'DE01');
    const updated = (
      await api()
        .patch(`/api/accounts/${id}`)
        .send({ name: '  Girokonto ', color: '#00ff00', sort: 3, includeInReports: false })
        .expect(200)
    ).body as Account;
    expect(updated).toMatchObject({
      name: 'Girokonto',
      color: '#00ff00',
      sort: 3,
      includeInReports: false,
    });
    const partial = (await api().patch(`/api/accounts/${id}`).send({ name: 'Giro' }).expect(200))
      .body as Account;
    expect(partial).toMatchObject({ name: 'Giro', color: '#00ff00', includeInReports: false });
    await api().get(`/api/accounts/${id}`).expect(200, partial);
  });

  it('validiert Eingaben', async () => {
    const id = accountId(db, 'DE01');
    for (const body of [
      { name: ' ' },
      { name: 'x'.repeat(101) },
      { color: 'blau' },
      { sort: 1.5 },
      { includeInReports: 'ja' },
    ]) {
      await api().patch(`/api/accounts/${id}`).send(body).expect(400);
    }
    await api().patch('/api/accounts/999').send({ name: 'x' }).expect(404);
    await api().get('/api/accounts/999').expect(404);
    await api().get('/api/accounts/abc').expect(400);
  });
});

describe('Filter nach Konto', () => {
  let giro: number;
  let tagesgeld: number;
  let hidden: number;

  beforeEach(() => {
    const food = categoryId(db, 'Drogerie');
    insertTransactions(
      db,
      [{ date: '2026-10-02', counterparty: 'REWE', amountCents: -1000, categoryId: food }],
      'DE01',
    );
    insertTransactions(
      db,
      [{ date: '2026-10-03', counterparty: 'EDEKA', amountCents: -2000, categoryId: food }],
      'DE02',
    );
    hidden = accountId(db, 'DE03', false);
    insertTransactions(
      db,
      [{ date: '2026-10-04', counterparty: 'ALDI', amountCents: -4000, categoryId: food }],
      'DE03',
    );
    giro = accountId(db, 'DE01');
    tagesgeld = accountId(db, 'DE02');
  });

  const foodTotal = (report: MonthlyReport) =>
    report.categories.find((c) => c.name === 'Drogerie')?.totalCents;

  it('filtert Transaktionen; „Alle Konten“ ohne ausgeblendete Konten', async () => {
    const all = (await api().get('/api/transactions').expect(200)).body as Transaction[];
    expect(all.map((t) => [t.counterparty, t.accountId])).toEqual([
      ['REWE', giro],
      ['EDEKA', tagesgeld],
    ]);
    const one = (await api().get(`/api/transactions?accountId=${tagesgeld}`).expect(200))
      .body as Transaction[];
    expect(one.map((t) => t.counterparty)).toEqual(['EDEKA']);
    const explicit = (await api().get(`/api/transactions?accountId=${hidden}`).expect(200))
      .body as Transaction[];
    expect(explicit.map((t) => t.counterparty)).toEqual(['ALDI']);
    await api().get('/api/transactions?accountId=0').expect(400);
  });

  it('filtert Monatsübersicht und Trend', async () => {
    const all = (await api().get('/api/reports/monthly?year=2026&month=10').expect(200))
      .body as MonthlyReport;
    expect(foodTotal(all)).toBe(-3000);
    expect(all.expenseCents).toBe(-3000);

    const one = (
      await api().get(`/api/reports/monthly?year=2026&month=10&accountId=${giro}`).expect(200)
    ).body as MonthlyReport;
    expect(foodTotal(one)).toBe(-1000);

    const hiddenReport = (
      await api().get(`/api/reports/monthly?year=2026&month=10&accountId=${hidden}`).expect(200)
    ).body as MonthlyReport;
    expect(foodTotal(hiddenReport)).toBe(-4000);

    const trend = (
      await api()
        .get(`/api/reports/trend?from=2026-10&to=2026-10&accountId=${tagesgeld}`)
        .expect(200)
    ).body as TrendReport;
    expect(trend.months[0]!.totals).toEqual([
      { categoryId: categoryId(db, 'Drogerie'), totalCents: -2000 },
    ]);
    await api().get('/api/reports/monthly?year=2026&month=10&accountId=x').expect(400);
  });
});
