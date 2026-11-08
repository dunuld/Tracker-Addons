import type { Database } from '../src/db/database.js';

export interface TxSeed {
  date: string;
  counterparty?: string;
  purpose?: string;
  amountCents: number;
  categoryId?: number | null;
  source?: 'rule' | 'manual' | 'default';
}

/** ID einer Kategorie anhand ihres Namens (Seed-Daten). */
export function categoryId(db: Database, name: string): number {
  const row = db.prepare('SELECT id FROM categories WHERE name = ?').get(name);
  if (!row) throw new Error(`Kategorie ${name} fehlt`);
  return Number(row['id']);
}

/** ID des Kontos zur IBAN; legt es bei Bedarf an (Name = IBAN). */
export function accountId(db: Database, iban: string, includeInReports = true): number {
  const row = db.prepare('SELECT id FROM accounts WHERE iban = ?').get(iban);
  if (row) return Number(row['id']);
  return Number(
    db
      .prepare(
        "INSERT INTO accounts (iban, bank, name, include_in_reports) VALUES (?, 'TEST', ?, ?)",
      )
      .run(iban, iban, includeInReports ? 1 : 0).lastInsertRowid,
  );
}

/**
 * Legt direkt einen Auszug mit Buchungen an – ohne PDF-Parsing, damit API-Tests schnell bleiben.
 * Gibt die IDs der Buchungen in Eingabereihenfolge zurück.
 */
export function insertTransactions(db: Database, txs: TxSeed[], iban = 'DE00TEST'): number[] {
  const [year, month] = txs[0]!.date.split('-').map(Number);
  const { lastInsertRowid: statementId } = db
    .prepare(
      `INSERT INTO statements (account_id, year, month, opening_cents, closing_cents, file_hash, file_name)
       VALUES (?, ?, ?, 0, 0, ?, 'test.pdf')`,
    )
    .run(accountId(db, iban), year!, month!, `${iban}-${year}-${month}-${Math.random()}`);

  const insert = db.prepare(
    `INSERT INTO transactions (statement_id, booking_date, value_date, counterparty, purpose, amount_cents, category_id, category_source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  return txs.map((tx) =>
    Number(
      insert.run(
        statementId,
        tx.date,
        tx.date,
        tx.counterparty ?? '',
        tx.purpose ?? '',
        tx.amountCents,
        tx.categoryId ?? null,
        tx.source ?? 'default',
      ).lastInsertRowid,
    ),
  );
}
