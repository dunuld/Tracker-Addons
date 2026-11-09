import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, ipFilter, normalizeIp } from '../src/app.js';
import { INGRESS_PROXY_IP, loadConfig } from '../src/config.js';
import { openDatabase, SCHEMA_VERSION, type Database } from '../src/db/database.js';
import { DEFAULT_CATEGORY_NAME, SEED_CATEGORIES } from '../src/db/seed.js';
import { accountId, insertTransactions } from './helpers.js';

const tempDirs: string[] = [];
const openDbs: Database[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'budget-test-'));
  tempDirs.push(dir);
  return dir;
}

function memoryDb(): Database {
  const db = openDatabase(':memory:');
  openDbs.push(db);
  return db;
}

afterEach(() => {
  openDbs.splice(0).forEach((db) => db.isOpen && db.close());
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

describe('Datenbank', () => {
  it('legt Schema und Seed-Kategorien inkl. Regeln an', () => {
    const db = memoryDb();
    const names = db
      .prepare('SELECT name FROM categories ORDER BY sort')
      .all()
      .map((r) => r['name']);
    expect(names).toEqual(SEED_CATEGORIES.map((c) => c.name));
    expect(names).toContain('Streaming & Abos');

    const ruleCount = Number(db.prepare('SELECT COUNT(*) AS n FROM rules').get()?.['n']);
    expect(ruleCount).toBe(SEED_CATEGORIES.reduce((sum, c) => sum + c.rules.length, 0));

    const netflix = db
      .prepare(
        `SELECT c.name FROM rules r JOIN categories c ON c.id = r.category_id WHERE r.pattern = 'NETFLIX'`,
      )
      .get();
    expect(netflix?.['name']).toBe('Streaming & Abos');

    const defaults = db.prepare('SELECT name FROM categories WHERE is_default = 1').all();
    expect(defaults).toEqual([{ name: DEFAULT_CATEGORY_NAME }]);
    expect(db.prepare('PRAGMA user_version').get()?.['user_version']).toBe(SCHEMA_VERSION);
    expect(db.prepare('PRAGMA foreign_keys').get()?.['foreign_keys']).toBe(1);
  });

  it('alle Seed-Regex-Muster sind gültig', () => {
    const db = memoryDb();
    const patterns = db.prepare(`SELECT pattern FROM rules WHERE match_type = 'regex'`).all();
    expect(patterns.length).toBeGreaterThan(0);
    for (const { pattern } of patterns)
      expect(() => new RegExp(String(pattern), 'i')).not.toThrow();
    expect(
      new RegExp(
        String(patterns.find((p) => p['pattern'] === '\\bESSO\\b')?.['pattern']),
        'i',
      ).test('Espresso Bar'),
    ).toBe(false);
  });

  it('seedet nur einmal und behält Änderungen bei erneutem Öffnen', () => {
    const file = join(tempDir(), 'nested', 'budget.db');
    let db = openDatabase(file);
    db.prepare(`DELETE FROM categories WHERE name = 'Drogerie'`).run();
    db.close();

    db = openDatabase(file);
    openDbs.push(db);
    const drogerie = db.prepare(`SELECT id FROM categories WHERE name = 'Drogerie'`).get();
    expect(drogerie).toBeUndefined();
    expect(Number(db.prepare('SELECT COUNT(*) AS n FROM categories').get()?.['n'])).toBe(
      SEED_CATEGORIES.length - 1,
    );
  });

  it('migriert Schema v1: legt je IBAN ein Konto an und behält Auszüge und Buchungen', () => {
    const file = join(tempDir(), 'budget.db');
    const v1 = new DatabaseSync(file);
    v1.exec(readFileSync(new URL('./fixtures/schema-v1.sql', import.meta.url), 'utf8'));
    v1.exec(`
      INSERT INTO categories (id, name, kind, is_default) VALUES (1, 'Sonstiges', 'expense', 1);
      INSERT INTO statements (id, bank, iban, year, month, opening_cents, closing_cents, file_hash, file_name)
      VALUES (1, 'ING', 'DE00111122223333444455', 2026, 9, 0, -500, 'h1', 'a.pdf'),
             (2, 'ING', 'DE00999988887777666655', 2026, 9, 1000, 900, 'h2', 'b.pdf'),
             (3, 'ING', 'DE00111122223333444455', 2026, 10, -500, -700, 'h3', 'c.pdf');
      INSERT INTO transactions (statement_id, booking_date, value_date, amount_cents, category_id)
      VALUES (1, '2026-09-01', '2026-09-01', -500, 1), (2, '2026-09-02', '2026-09-02', -100, 1),
             (3, '2026-10-01', '2026-10-01', -200, 1);
      PRAGMA user_version = 1;
    `);
    v1.close();

    const db = openDatabase(file);
    openDbs.push(db);
    expect(db.prepare('PRAGMA user_version').get()?.['user_version']).toBe(SCHEMA_VERSION);
    expect(db.prepare('PRAGMA foreign_keys').get()?.['foreign_keys']).toBe(1);
    expect(db.prepare('SELECT iban, bank, name, sort FROM accounts ORDER BY id').all()).toEqual([
      { iban: 'DE00111122223333444455', bank: 'ING', name: 'ING ••4455', sort: 0 },
      { iban: 'DE00999988887777666655', bank: 'ING', name: 'ING ••6655', sort: 1 },
    ]);
    expect(
      db
        .prepare(
          'SELECT s.id, a.iban, s.file_hash FROM statements s JOIN accounts a ON a.id = s.account_id ORDER BY s.id',
        )
        .all(),
    ).toEqual([
      { id: 1, iban: 'DE00111122223333444455', file_hash: 'h1' },
      { id: 2, iban: 'DE00999988887777666655', file_hash: 'h2' },
      { id: 3, iban: 'DE00111122223333444455', file_hash: 'h3' },
    ]);
    expect(Number(db.prepare('SELECT COUNT(*) AS n FROM transactions').get()?.['n'])).toBe(3);
    // Fremdschlüssel greifen weiterhin auf die neu aufgebaute Tabelle
    db.prepare('DELETE FROM statements WHERE id = 1').run();
    expect(Number(db.prepare('SELECT COUNT(*) AS n FROM transactions').get()?.['n'])).toBe(2);
  });

  it('lehnt ein neueres Schema ab', () => {
    const file = join(tempDir(), 'budget.db');
    const db = openDatabase(file);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    db.close();
    expect(() => openDatabase(file)).toThrow(/neuer/);
  });

  it('schützt die Standardkategorie und ordnet Buchungen gelöschter Kategorien ihr zu', () => {
    const db = memoryDb();
    expect(() => db.prepare('DELETE FROM categories WHERE is_default = 1').run()).toThrow(
      /Standardkategorie/,
    );

    const streamingId = db
      .prepare(`SELECT id FROM categories WHERE name = 'Streaming & Abos'`)
      .get()?.['id'];
    const defaultId = db.prepare('SELECT id FROM categories WHERE is_default = 1').get()?.['id'];
    const ruleId = db
      .prepare('SELECT id FROM rules WHERE category_id = ? LIMIT 1')
      .get(streamingId!)?.['id'];
    const { lastInsertRowid: statementId } = db
      .prepare(
        `INSERT INTO statements (account_id, year, month, opening_cents, closing_cents, file_hash, file_name)
         VALUES (?, 2026, 10, 0, -1299, 'hash', 'a.pdf')`,
      )
      .run(accountId(db, 'DE00'));
    db.prepare(
      `INSERT INTO transactions (statement_id, booking_date, value_date, type, counterparty, purpose,
                                 amount_cents, category_id, category_source, rule_id)
       VALUES (?, '2026-10-02', '2026-10-02', 'Lastschrift', 'NETFLIX', '', -1299, ?, 'rule', ?)`,
    ).run(statementId, streamingId!, ruleId!);

    db.prepare('DELETE FROM categories WHERE id = ?').run(streamingId!);

    const tx = db.prepare('SELECT category_id, category_source, rule_id FROM transactions').get();
    expect(tx).toEqual({ category_id: defaultId, category_source: 'default', rule_id: null });
    expect(
      Number(
        db.prepare('SELECT COUNT(*) AS n FROM rules WHERE category_id = ?').get(streamingId!)?.[
          'n'
        ],
      ),
    ).toBe(0);

    db.prepare('DELETE FROM statements').run();
    expect(Number(db.prepare('SELECT COUNT(*) AS n FROM transactions').get()?.['n'])).toBe(0);
  });

  it('verhindert doppelte Auszüge (Konto + Monat, Datei-Hash)', () => {
    const db = memoryDb();
    const insert = db.prepare(
      `INSERT INTO statements (account_id, year, month, opening_cents, closing_cents, file_hash, file_name)
       VALUES (?, 2026, 10, 0, 0, ?, 'a.pdf')`,
    );
    const a1 = accountId(db, 'DE01');
    const a2 = accountId(db, 'DE02');
    insert.run(a1, 'h1');
    expect(() => insert.run(a1, 'h2')).toThrow(/UNIQUE/);
    expect(() => insert.run(a2, 'h1')).toThrow(/UNIQUE/);
  });

  it('löscht mit einem Konto alle Auszüge und Buchungen', () => {
    const db = memoryDb();
    insertTransactions(db, [{ date: '2026-10-01', amountCents: -100 }], 'DE01');
    insertTransactions(db, [{ date: '2026-10-01', amountCents: -200 }], 'DE02');
    db.prepare('DELETE FROM accounts WHERE iban = ?').run('DE01');
    const rows = db.prepare('SELECT amount_cents FROM transactions').all();
    expect(rows).toEqual([{ amount_cents: -200 }]);
  });
});

describe('Konfiguration', () => {
  it('nutzt im Addon-Modus /data und den Ingress-IP-Filter', () => {
    const config = loadConfig({ ADDON_MODE: '1' });
    expect(config.dbPath).toBe('/data/budget.db');
    expect(config.uploadsDir).toBe('/data/uploads');
    expect(config.port).toBe(8099);
    expect(config.host).toBe('0.0.0.0');
    expect(config.allowedIps).toContain(INGRESS_PROXY_IP);
  });

  it('ist lokal ohne IP-Filter und per Env überschreibbar', () => {
    expect(loadConfig({}).allowedIps).toBeNull();
    const config = loadConfig({
      DB_PATH: '/tmp/x.db',
      ALLOWED_IPS: '10.0.0.1, 10.0.0.2',
      PORT: '9000',
    });
    expect(config.dbPath).toBe('/tmp/x.db');
    expect(config.allowedIps).toEqual(['10.0.0.1', '10.0.0.2']);
    expect(config.port).toBe(9000);
  });
});

describe('HTTP-Server', () => {
  it('liefert Health-Check und JSON-404 unter /api', async () => {
    const app = createApp(memoryDb(), { version: '1.2.3' });
    await request(app).get('/api/health').expect(200, { status: 'ok', version: '1.2.3' });
    const res = await request(app).get('/api/unknown').expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('antwortet auf ungültiges JSON mit 400', async () => {
    const app = createApp(memoryDb());
    await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{kaputt')
      .expect(400);
  });

  it('liefert die Angular-App statisch aus (SPA-Fallback)', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'index.html'), '<html><base href="./"></html>');
    writeFileSync(join(dir, 'main-ABCDEFGH.js'), 'console.log(1)');
    const app = createApp(memoryDb(), { staticDir: dir });

    const index = await request(app).get('/').expect(200);
    expect(index.text).toContain('base href="./"');
    expect(index.headers['cache-control']).toBe('no-cache');

    const asset = await request(app).get('/main-ABCDEFGH.js').expect(200);
    expect(asset.headers['cache-control']).toContain('immutable');

    await request(app).get('/irgendwas').expect(200);
  });

  it('blockiert im Addon-Modus Anfragen, die nicht vom Ingress-Proxy kommen', async () => {
    // supertest verbindet über Loopback
    const blocked = createApp(memoryDb(), { allowedIps: [INGRESS_PROXY_IP] });
    await request(blocked).get('/api/health').set('X-Forwarded-For', INGRESS_PROXY_IP).expect(403);

    const allowed = createApp(memoryDb(), { allowedIps: [INGRESS_PROXY_IP, '127.0.0.1', '::1'] });
    await request(allowed).get('/api/health').expect(200);
  });

  it('normalisiert IPv4-mapped-Adressen', () => {
    expect(normalizeIp('::ffff:172.30.32.2')).toBe(INGRESS_PROXY_IP);
    let passed = false;
    ipFilter([INGRESS_PROXY_IP])(
      { socket: { remoteAddress: '::ffff:172.30.32.2' } } as never,
      {} as never,
      () => (passed = true),
    );
    expect(passed).toBe(true);
  });
});
