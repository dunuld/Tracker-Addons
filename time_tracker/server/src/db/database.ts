import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** Kapselt den SQLite-Treiber (node:sqlite). */
export type Database = DatabaseSync;

export const SCHEMA_VERSION = 1;

const schemaSql = (): string => readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

/**
 * Öffnet (oder erstellt) die Datenbank und legt bei Bedarf das Schema an.
 * `file` = Dateipfad oder `:memory:` (Tests).
 */
export function openDatabase(file: string): Database {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });

  const db = new DatabaseSync(file);
  try {
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA busy_timeout = 5000');
    if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
    initSchema(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function initSchema(db: Database): void {
  const version = Number(db.prepare('PRAGMA user_version').get()?.['user_version'] ?? 0);
  if (version === SCHEMA_VERSION) return;
  if (version !== 0) {
    throw new Error(
      `Die Datenbank hat Schema v${version}, dieses Add-on erwartet v${SCHEMA_VERSION}.`,
    );
  }
  transaction(db, () => {
    db.exec(schemaSql());
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
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
