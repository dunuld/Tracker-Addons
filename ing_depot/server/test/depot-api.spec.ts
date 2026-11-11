import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { openDatabase, SCHEMA_VERSION, transaction, type Database } from '../src/db/database.js';
import { DepotService, isValidDate, localToday, normalizeFileName } from '../src/depot.service.js';
import { FAILED_DIR, IMPORTED_DIR, scanInbox } from '../src/inbox.js';
import {
  BUY_LINES,
  DIVIDEND_LINES,
  SELL_LINES,
  STATEMENT_LINES,
  fakePdf,
  realPdf,
  textReader,
  tradeLines,
} from './fixtures.js';

let tmp: string;
let db: Database;
let depot: DepotService;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'ing-depot-api-'));
  db = openDatabase(':memory:');
  depot = new DepotService(db, {
    documentsDir: join(tmp, 'documents'),
    exemptionCents: 100000,
    today: () => '2026-07-01',
    readPdf: textReader,
  });
  app = createApp({ depot, scanInbox: () => scanInbox(depot, join(tmp, 'inbox')) });
});

afterEach(() => {
  db.close();
  rmSync(tmp, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const uploadFiles = (...files: [string, Buffer][]) => {
  const req = request(app).post('/api/documents');
  files.forEach(([name, content]) => req.attach('files', content, name));
  return req;
};

describe('Datenbank', () => {
  it('legt die Datei an, setzt die Schema-Version und lehnt neuere Schemata ab', () => {
    const file = join(tmp, 'sub', 'depot.db');
    const first = openDatabase(file);
    expect(first.prepare('PRAGMA user_version').get()?.['user_version']).toBe(SCHEMA_VERSION);
    first.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    first.close();
    expect(() => openDatabase(file)).toThrow(/neuer als diese Version/);
  });

  it('rollt Transaktionen bei Fehlern zurück', () => {
    expect(() =>
      transaction(db, () => {
        db.prepare("INSERT INTO securities (isin, name) VALUES ('X', 'Y')").run();
        throw new Error('Abbruch');
      }),
    ).toThrow('Abbruch');
    expect(db.prepare('SELECT COUNT(*) AS n FROM securities').get()?.['n']).toBe(0);
  });
});

describe('Hilfsfunktionen', () => {
  it('normalisiert Dateinamen', () => {
    expect(normalizeFileName(undefined)).toBe('dokument.pdf');
    expect(normalizeFileName('/pfad/zu/Abrechnung.pdf')).toBe('Abrechnung.pdf');
    expect(normalizeFileName(Buffer.from('Erträge.pdf', 'utf8').toString('latin1'))).toBe(
      'Erträge.pdf',
    );
    expect(normalizeFileName('Erträge.pdf')).toBe('Erträge.pdf');
  });

  it('prüft Datumswerte', () => {
    expect(isValidDate('2026-02-28')).toBe(true);
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('28.02.2026')).toBe(false);
    expect(isValidDate(42)).toBe(false);
    expect(localToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('Import per Upload', () => {
  it('importiert mehrere Dokumente und erkennt Duplikate', async () => {
    const res = await uploadFiles(
      ['kauf.pdf', fakePdf(BUY_LINES)],
      ['verkauf.pdf', fakePdf(SELL_LINES)],
      ['dividende.pdf', fakePdf(DIVIDEND_LINES)],
      ['auszug.pdf', fakePdf(STATEMENT_LINES)],
      ['kauf-kopie.pdf', fakePdf(BUY_LINES)],
      ['kauf-neu-erzeugt.pdf', fakePdf([...BUY_LINES, 'Seite 1 von 1'])],
      ['unbekannt.pdf', fakePdf(['Kontoauszug'])],
      ['leer.pdf', Buffer.from('')],
    ).expect(200);

    expect(res.body.map((r: { status: string }) => r.status)).toEqual([
      'imported',
      'imported',
      'imported',
      'imported',
      'duplicate',
      'duplicate',
      'failed',
      'failed',
    ]);
    expect(res.body[0].message).toBe('Kauf 3 × iShs Core MSCI World U.ETF');
    expect(res.body[3].message).toBe('Depotauszug mit 2 Positionen');
    expect(res.body[5].message).toContain('gleicher Inhalt');
    expect(res.body[6].message).toContain('Unbekannte Dokumentart');
    expect(res.body[7].message).toContain('keinen lesbaren Text');

    const documents = await request(app).get('/api/documents').expect(200);
    expect(documents.body).toHaveLength(4);
    expect(documents.body[0]).toMatchObject({ type: 'sell', date: '2026-06-20', source: 'upload' });

    const transactions = await request(app).get('/api/transactions?year=2026').expect(200);
    expect(transactions.body.map((t: { type: string }) => t.type)).toEqual([
      'sell',
      'dividend',
      'buy',
    ]);
    expect((await request(app).get('/api/transactions').expect(200)).body).toHaveLength(3);
  });

  it('liest echte PDFs über pdf.js', async () => {
    const real = new DepotService(db, { today: () => '2026-07-01' });
    const result = await real.importPdf(await realPdf(BUY_LINES), 'kauf.pdf');
    expect(result).toMatchObject({ status: 'imported', document: { type: 'buy' } });
    expect(real.documentFile(result.document!.id)).toBeNull();

    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = await real.importPdf(Buffer.from('kein pdf'), 'kaputt.pdf');
    expect(broken).toMatchObject({ status: 'failed', message: 'Die Datei ist keine lesbare PDF.' });
  });

  it('lehnt Uploads ohne Datei, mit zu großer Datei oder falschem Feld ab', async () => {
    const none = await request(app).post('/api/documents').expect(400);
    expect(none.body.code).toBe('NO_FILE');
    const big = await uploadFiles(['gross.pdf', Buffer.alloc(10 * 1024 * 1024 + 1)]).expect(413);
    expect(big.body.code).toBe('FILE_TOO_LARGE');
    const wrong = await request(app)
      .post('/api/documents')
      .attach('datei', Buffer.from('x'), 'x.pdf')
      .expect(400);
    expect(wrong.body.code).toBe('INVALID_UPLOAD');
  });

  it('liefert die Original-PDF aus und löscht Dokumente samt Buchungen', async () => {
    const [imported] = (await uploadFiles(['kauf.pdf', fakePdf(BUY_LINES)]).expect(200)).body;
    const id = imported.document.id;

    const file = await request(app).get(`/api/documents/${id}/file`).expect(200);
    expect(file.headers['content-type']).toContain('application/pdf');

    await request(app).delete(`/api/documents/${id}`).expect(204);
    await request(app).get(`/api/documents/${id}/file`).expect(404);
    await request(app).delete(`/api/documents/${id}`).expect(404);
    await request(app).delete('/api/documents/abc').expect(400);
    expect((await request(app).get('/api/transactions')).body).toEqual([]);
    expect(existsSync(join(tmp, 'documents', `${id}.pdf`))).toBe(false);

    // Ohne Ablage gibt es keine Datei zum Ausliefern
    const noStore = new DepotService(db, { readPdf: textReader });
    const result = await noStore.importPdf(fakePdf(BUY_LINES), 'kauf.pdf');
    await request(app).get(`/api/documents/${result.document!.id}/file`).expect(404);
  });
});

describe('Übersicht', () => {
  it('fasst das Jahr zusammen und meldet Abweichungen zum Depotauszug', async () => {
    await uploadFiles(
      ['kauf.pdf', fakePdf(BUY_LINES)],
      ['verkauf.pdf', fakePdf(SELL_LINES)],
      ['dividende.pdf', fakePdf(DIVIDEND_LINES)],
      ['auszug.pdf', fakePdf(STATEMENT_LINES)],
    ).expect(200);

    const { body } = await request(app).get('/api/overview').expect(200);
    expect(body).toMatchObject({
      year: 2026,
      asOf: '2026-07-01',
      investedGrossCents: 17328,
      dividendsNetCents: 778,
      dividendsGrossCents: 915,
      exemptionCents: 100000,
    });
    // Verkauf 2 Stück: 155,10 € Erlös − 2/3 von 173,28 € Einstand
    expect(body.realizedCents).toBe(15510 - 11552);
    expect(body.positions).toHaveLength(2);
    expect(body.positions[0]).toMatchObject({ isin: 'IE00B4L5Y983', quantity: 1, price: 80 });
    expect(body.warnings.join(' ')).toContain('Depotauszug vom 31.12.2025');

    const past = await request(app).get('/api/overview?year=2025').expect(200);
    expect(past.body).toMatchObject({ year: 2025, asOf: '2025-12-31', investedGrossCents: 0 });
    await request(app).get('/api/overview?year=abc').expect(400);
    await request(app).get('/api/transactions?year=1800').expect(400);
  });
});

describe('Startbestand', () => {
  const opening = {
    isin: 'us5949181045',
    name: 'Microsoft',
    date: '2020-01-15',
    quantity: 20,
    costCents: 400000,
  };

  it('erfasst und löscht einen Startbestand', async () => {
    const created = await request(app).post('/api/transactions').send(opening).expect(201);
    expect(created.body).toMatchObject({
      type: 'opening',
      isin: 'US5949181045',
      name: 'Microsoft',
      documentId: null,
      price: 200,
      totalCents: 400000,
    });
    const overview = depot.overview();
    expect(overview.positions[0]).toMatchObject({ quantity: 20, costCents: 400000 });

    await request(app).delete(`/api/transactions/${created.body.id}`).expect(204);
    await request(app).delete(`/api/transactions/${created.body.id}`).expect(404);
  });

  it('prüft die Eingaben', async () => {
    const post = (patch: object) =>
      request(app)
        .post('/api/transactions')
        .send({ ...opening, ...patch });
    expect((await post({ isin: 'XX' }).expect(400)).body.code).toBe('INVALID_ISIN');
    expect((await post({ date: '2020-13-01' }).expect(400)).body.code).toBe('INVALID_DATE');
    expect((await post({ quantity: 0 }).expect(400)).body.code).toBe('INVALID_QUANTITY');
    expect((await post({ costCents: 1.5 }).expect(400)).body.code).toBe('INVALID_COST');
    await request(app).post('/api/transactions').send([]).expect(400);
    // Ohne Namen und mit Einstandswert 0 (z. B. Gratisaktie)
    const free = await post({ name: ' ', costCents: 0 }).expect(201);
    expect(free.body).toMatchObject({ name: 'US5949181045', price: 0 });
  });

  it('löscht importierte Buchungen nur über das Dokument', async () => {
    await uploadFiles(['kauf.pdf', fakePdf(BUY_LINES)]).expect(200);
    const [tx] = depot.listTransactions();
    const res = await request(app).delete(`/api/transactions/${tx!.id}`).expect(400);
    expect(res.body.code).toBe('IMPORTED_TRANSACTION');
  });
});

describe('Kurse', () => {
  beforeEach(async () => {
    await uploadFiles(['kauf.pdf', fakePdf(BUY_LINES)]).expect(200);
  });

  it('übernimmt manuelle Kurse', async () => {
    await request(app).post('/api/securities/IE00B4L5Y983/prices').send({ price: 60 }).expect(204);
    expect(depot.overview().positions[0]).toMatchObject({
      price: 60,
      priceDate: '2026-07-01',
      priceSource: 'manual',
      valueCents: 18000,
    });
    // Erneutes Setzen am selben Tag überschreibt
    await request(app)
      .post('/api/securities/IE00B4L5Y983/prices')
      .send({ price: 61, date: '2026-07-01' })
      .expect(204);
    expect(depot.overview().positions[0]!.price).toBe(61);

    await request(app).post('/api/securities/IE00B4L5Y983/prices').send({ price: -1 }).expect(400);
    await request(app)
      .post('/api/securities/IE00B4L5Y983/prices')
      .send({ price: 5, date: 'gestern' })
      .expect(400);
    await request(app).post('/api/securities/XX0000000000/prices').send({ price: 5 }).expect(404);
  });

  it('hinterlegt und entfernt die Kurs-Entität', async () => {
    const put = (priceEntity: unknown) =>
      request(app).put('/api/securities/IE00B4L5Y983').send({ priceEntity });
    await put(' sensor.msci_world ').expect(204);
    expect(depot.priceEntities()).toEqual([{ isin: 'IE00B4L5Y983', entity: 'sensor.msci_world' }]);
    expect(depot.overview().positions[0]!.priceEntity).toBe('sensor.msci_world');
    expect((await put('Kein Sensor').expect(400)).body.code).toBe('INVALID_ENTITY');
    await put(null).expect(204);
    expect(depot.priceEntities()).toEqual([]);
    await request(app).put('/api/securities/XX0000000000').send({}).expect(404);
  });

  it('meldet Änderungen an Zuhörer', () => {
    const listener = vi.fn();
    depot.onChange(listener);
    depot.addPrice('IE00B4L5Y983', { price: 70 });
    expect(listener).toHaveBeenCalledOnce();
  });
});

describe('Eingangsordner', () => {
  it('importiert PDFs, verschiebt sie und merkt sich nicht erkannte Dateien', async () => {
    const inbox = join(tmp, 'inbox');
    // Ordner fehlt noch: kein Fehler
    expect((await request(app).post('/api/inbox/scan').expect(200)).body).toEqual([]);

    mkdirSync(join(inbox, FAILED_DIR), { recursive: true });
    writeFileSync(join(inbox, FAILED_DIR, 'unbekannt.pdf'), 'alt');
    writeFileSync(join(inbox, 'kauf.pdf'), fakePdf(BUY_LINES));
    writeFileSync(join(inbox, 'kauf2.PDF'), fakePdf(tradeLines({ order: '999.001' })));
    writeFileSync(join(inbox, 'unbekannt.pdf'), fakePdf(['Kontoauszug']));
    writeFileSync(join(inbox, 'notiz.txt'), 'kein PDF');

    const res = await request(app).post('/api/inbox/scan').expect(200);
    expect(res.body.map((r: { status: string }) => r.status)).toEqual([
      'imported',
      'imported',
      'failed',
    ]);
    expect(readdirSync(inbox).sort()).toEqual([FAILED_DIR, IMPORTED_DIR, 'notiz.txt']);
    expect(readdirSync(join(inbox, IMPORTED_DIR)).sort()).toEqual(['kauf.pdf', 'kauf2.PDF']);
    expect(readdirSync(join(inbox, FAILED_DIR)).sort()).toEqual([
      'unbekannt-1.pdf',
      'unbekannt.pdf',
    ]);
    expect(depot.listDocuments().every((d) => d.source === 'inbox')).toBe(true);

    const failures = await request(app).get('/api/import-failures').expect(200);
    expect(failures.body).toHaveLength(1);
    expect(failures.body[0]).toMatchObject({ fileName: 'unbekannt.pdf' });
    await request(app).delete(`/api/import-failures/${failures.body[0].id}`).expect(204);
    await request(app).delete(`/api/import-failures/${failures.body[0].id}`).expect(404);
  });

  it('antwortet ohne konfigurierten Eingangsordner mit einer leeren Liste', async () => {
    const plain = createApp({ depot });
    expect((await request(plain).post('/api/inbox/scan').expect(200)).body).toEqual([]);
  });
});
