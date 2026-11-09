import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { defaultAccountColor, defaultAccountName } from '../accounts.js';
import { ensureDefaultCategory, seedDefaults } from './seed.js';

/** Kapselt den SQLite-Treiber (node:sqlite); bei Bedarf gegen better-sqlite3 austauschbar. */
export type Database = DatabaseSync;

export const SCHEMA_VERSION = 3;

const schemaSql = (): string => readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

/**
 * Öffnet (oder erstellt) die Datenbank, wendet das Schema an und legt bei der
 * Erstinitialisierung die Standardkategorien und -regeln an.
 * `file` = Dateipfad oder `:memory:` (Tests).
 */
export function openDatabase(file: string): Database {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });

  const db = new DatabaseSync(file);
  try {
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA busy_timeout = 5000');
    if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
    migrate(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function migrate(db: Database): void {
  const version = Number(db.prepare('PRAGMA user_version').get()?.['user_version'] ?? 0);
  if (version > SCHEMA_VERSION) {
    throw new Error(
      `Datenbank-Schema v${version} ist neuer als diese Version des Addons (v${SCHEMA_VERSION}).`,
    );
  }
  // Tabellen-Neuaufbau (v2, v3) nur ohne Fremdschlüsselprüfung möglich, sonst löscht DROP TABLE
  // per CASCADE alle Buchungen. Das PRAGMA wirkt nicht innerhalb einer Transaktion.
  const rebuild = version >= 1 && version < 3;
  if (rebuild) db.exec('PRAGMA foreign_keys = OFF');
  try {
    transaction(db, () => {
      if (version < 1) {
        db.exec(schemaSql());
        seedDefaults(db);
      } else {
        if (version < 2) migrateToV2(db);
        if (version < 3) migrateToV3(db);
      }
      // Künftige Migrationen: if (version < 4) { ... }
      ensureDefaultCategory(db);
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    });
  } finally {
    if (rebuild) db.exec('PRAGMA foreign_keys = ON');
  }
}

/**
 * v1 → v2: Konten einführen. Aus jeder IBAN der vorhandenen Auszüge wird ein Konto;
 * `statements.iban`/`bank` werden durch `statements.account_id` ersetzt.
 */
function migrateToV2(db: Database): void {
  db.exec(`
    CREATE TABLE accounts (
      id                 INTEGER PRIMARY KEY,
      iban               TEXT    NOT NULL UNIQUE,
      bank               TEXT    NOT NULL,
      name               TEXT    NOT NULL CHECK (length(trim(name)) > 0),
      color              TEXT    NOT NULL DEFAULT '#2196f3'
                                 CHECK (color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
      sort               INTEGER NOT NULL DEFAULT 0,
      include_in_reports INTEGER NOT NULL DEFAULT 1 CHECK (include_in_reports IN (0, 1))
    )`);

  const ibans = db
    .prepare('SELECT iban, MIN(bank) AS bank FROM statements GROUP BY iban ORDER BY MIN(id)')
    .all();
  const insert = db.prepare(
    'INSERT INTO accounts (iban, bank, name, color, sort) VALUES (?, ?, ?, ?, ?)',
  );
  ibans.forEach((row, index) => {
    const iban = String(row['iban']);
    const bank = String(row['bank']);
    insert.run(iban, bank, defaultAccountName(bank, iban), defaultAccountColor(index), index);
  });

  db.exec(`
    CREATE TABLE statements_v2 (
      id            INTEGER PRIMARY KEY,
      account_id    INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
      year          INTEGER NOT NULL CHECK (year BETWEEN 1990 AND 2200),
      month         INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
      opening_cents INTEGER NOT NULL,
      closing_cents INTEGER NOT NULL,
      file_hash     TEXT    NOT NULL UNIQUE,
      file_name     TEXT    NOT NULL,
      imported_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (account_id, year, month)
    );
    INSERT INTO statements_v2 (id, account_id, year, month, opening_cents, closing_cents,
                               file_hash, file_name, imported_at)
      SELECT s.id, a.id, s.year, s.month, s.opening_cents, s.closing_cents,
             s.file_hash, s.file_name, s.imported_at
        FROM statements s JOIN accounts a ON a.iban = s.iban;
    DROP TABLE statements;
    ALTER TABLE statements_v2 RENAME TO statements;
  `);

  if (db.prepare('PRAGMA foreign_key_check').all().length) {
    throw new Error('Migration auf Schema v2 fehlgeschlagen: verwaiste Fremdschlüssel');
  }
}

/**
 * v2 → v3: `transactions.category_source` erlaubt zusätzlich `transfer`
 * (automatisch erkannte Umbuchung). SQLite kann CHECK-Constraints nur per Neuaufbau ändern.
 */
function migrateToV3(db: Database): void {
  db.exec(`
    CREATE TABLE transactions_v3 (
      id              INTEGER PRIMARY KEY,
      statement_id    INTEGER NOT NULL REFERENCES statements (id) ON DELETE CASCADE,
      booking_date    TEXT    NOT NULL CHECK (booking_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
      value_date      TEXT    NOT NULL CHECK (value_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
      type            TEXT    NOT NULL DEFAULT '',
      counterparty    TEXT    NOT NULL DEFAULT '',
      purpose         TEXT    NOT NULL DEFAULT '',
      amount_cents    INTEGER NOT NULL,
      category_id     INTEGER REFERENCES categories (id) ON DELETE SET NULL,
      category_source TEXT    NOT NULL DEFAULT 'default'
                              CHECK (category_source IN ('rule', 'manual', 'default', 'transfer')),
      rule_id         INTEGER REFERENCES rules (id) ON DELETE SET NULL
    );
    INSERT INTO transactions_v3 (id, statement_id, booking_date, value_date, type, counterparty,
                                 purpose, amount_cents, category_id, category_source, rule_id)
      SELECT id, statement_id, booking_date, value_date, type, counterparty,
             purpose, amount_cents, category_id, category_source, rule_id
        FROM transactions;
    DROP TABLE transactions;
    -- Die Trigger auf categories verweisen per Namen auf transactions, das hier kurz fehlt.
    -- Ohne Legacy-Modus bricht RENAME bei der Schemaprüfung dieser Trigger ab.
    PRAGMA legacy_alter_table = ON;
    ALTER TABLE transactions_v3 RENAME TO transactions;
    PRAGMA legacy_alter_table = OFF;
    CREATE INDEX transactions_by_statement ON transactions (statement_id);
    CREATE INDEX transactions_by_date ON transactions (booking_date);
    CREATE INDEX transactions_by_category ON transactions (category_id);
  `);
  if (db.prepare('PRAGMA foreign_key_check').all().length) {
    throw new Error('Migration auf Schema v3 fehlgeschlagen: verwaiste Fremdschlüssel');
  }
}

/** Führt `fn` in einer Transaktion aus; bei Fehlern wird zurückgerollt. Nicht verschachteln. */
export function transaction<T>(db: Database, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}
