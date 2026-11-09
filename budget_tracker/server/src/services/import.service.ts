import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { ImportResult, Statement } from '../../../shared/api-types.js';
import { defaultAccountColor, defaultAccountName } from '../accounts.js';
import type { CategoryAssignment } from '../categorization/categorizer.js';
import { transaction, type Database } from '../db/database.js';
import { HttpError, badRequest, notFound } from '../http-error.js';
import {
  StatementParseError,
  type BankParser,
  type ParsedTransaction,
} from '../parsing/bank-parser.js';
import { IngParser } from '../parsing/ing-parser.js';
import { extractLines } from '../parsing/pdf-text.js';

/** Ordnet einer Buchung beim Import eine Kategorie zu. */
export type Categorize = (tx: ParsedTransaction) => CategoryAssignment;

export interface ImportServiceOptions {
  /** Ablage der Original-PDFs; `null` = nicht speichern (Tests). */
  uploadsDir?: string | null;
  parsers?: BankParser[];
  /** Standard: alle Buchungen in die Fallback-Kategorie. */
  categorize?: Categorize;
}

export interface ImportOptions {
  /** Vorhandenen Auszug (gleiche Datei oder gleiche IBAN + Monat) ersetzen */
  replace?: boolean;
}

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
export const formatCents = (cents: number): string => euro.format(cents / 100);

const STATEMENT_SELECT = `
  SELECT s.*, a.iban, a.bank, a.name AS account_name,
         (SELECT COUNT(*) FROM transactions t WHERE t.statement_id = s.id) AS transaction_count
    FROM statements s JOIN accounts a ON a.id = s.account_id`;

function toStatement(row: Record<string, unknown>): Statement {
  return {
    id: Number(row['id']),
    accountId: Number(row['account_id']),
    accountName: String(row['account_name']),
    bank: String(row['bank']),
    iban: String(row['iban']),
    year: Number(row['year']),
    month: Number(row['month']),
    openingCents: Number(row['opening_cents']),
    closingCents: Number(row['closing_cents']),
    fileName: String(row['file_name']),
    importedAt: String(row['imported_at']),
    transactionCount: Number(row['transaction_count'] ?? 0),
  };
}

/** Browser senden UTF-8-Dateinamen, die busboy als latin1 liest – hier zurückwandeln. */
export function normalizeFileName(name: string | undefined): string {
  let result = basename(name?.trim() || 'kontoauszug.pdf');
  const decoded = Buffer.from(result, 'latin1').toString('utf8');
  if (!decoded.includes('\uFFFD') && [...result].some((c) => c.charCodeAt(0) > 0x7f))
    result = decoded;
  return result.slice(0, 200);
}

export class ImportService {
  private readonly uploadsDir: string | null;
  private readonly parsers: BankParser[];
  private readonly categorize: Categorize;

  constructor(
    private readonly db: Database,
    options: ImportServiceOptions = {},
  ) {
    this.uploadsDir = options.uploadsDir ?? null;
    this.parsers = options.parsers ?? [new IngParser()];
    this.categorize = options.categorize ?? this.defaultCategorize();
  }

  async importPdf(
    file: Uint8Array,
    originalName: string | undefined,
    options: ImportOptions = {},
  ): Promise<ImportResult> {
    if (!isPdf(file)) throw badRequest('Die Datei ist kein PDF-Dokument.', 'INVALID_FILE');

    const fileHash = createHash('sha256').update(file).digest('hex');
    const fileName = normalizeFileName(originalName);

    let lines;
    try {
      lines = await extractLines(file);
    } catch (error) {
      const name = (error as Error | undefined)?.name;
      if (name === 'PasswordException') {
        throw badRequest(
          'Das PDF ist passwortgeschützt und kann nicht gelesen werden.',
          'INVALID_FILE',
        );
      }
      throw badRequest('Das PDF konnte nicht gelesen werden.', 'INVALID_FILE');
    }

    const parser = this.parsers.find((p) => p.canParse(lines));
    if (!parser) {
      throw badRequest(
        'Kein unterstützter Kontoauszug erkannt (derzeit werden nur ING-Girokonto-Auszüge unterstützt).',
        'UNSUPPORTED_STATEMENT',
      );
    }

    let parsed;
    try {
      parsed = parser.parse(lines);
    } catch (error) {
      if (error instanceof StatementParseError) {
        throw badRequest(
          `Kontoauszug konnte nicht ausgewertet werden: ${error.message}`,
          'PARSE_ERROR',
        );
      }
      throw error;
    }

    const duplicateRows = this.db
      .prepare(
        `${STATEMENT_SELECT} WHERE s.file_hash = ? OR (a.iban = ? AND s.year = ? AND s.month = ?)`,
      )
      .all(fileHash, parsed.iban, parsed.year, parsed.month);
    const duplicates = duplicateRows.map(toStatement);
    if (duplicates.length && !options.replace) {
      const existing = duplicates[0]!;
      throw new HttpError(
        409,
        `Der Kontoauszug ${String(existing.month).padStart(2, '0')}/${existing.year} wurde bereits importiert.`,
        'DUPLICATE_STATEMENT',
        { existing },
      );
    }

    const warnings: string[] = [];
    const sumCents = parsed.transactions.reduce((sum, tx) => sum + tx.amountCents, 0);
    const expectedCents = parsed.closingCents - parsed.openingCents;
    const balanceOk = sumCents === expectedCents;
    if (!balanceOk) {
      warnings.push(
        `Die Summe der Buchungen (${formatCents(sumCents)}) entspricht nicht der Differenz von ` +
          `neuem und altem Saldo (${formatCents(expectedCents)}). Bitte den Auszug prüfen.`,
      );
    }
    if (parsed.transactions.length === 0)
      warnings.push('Im Kontoauszug wurden keine Buchungen gefunden.');

    const assignments = parsed.transactions.map((tx) => this.categorize(tx));
    const uncategorizedCount = assignments.filter((a) => a.source === 'default').length;

    let accountCreated = false;
    const statementId = transaction(this.db, () => {
      const remove = this.db.prepare('DELETE FROM statements WHERE id = ?');
      for (const duplicate of duplicates) remove.run(duplicate.id);

      let accountId = this.db.prepare('SELECT id FROM accounts WHERE iban = ?').get(parsed.iban)?.[
        'id'
      ];
      if (accountId === undefined) {
        const { count, maxSort } = this.db
          .prepare('SELECT COUNT(*) AS count, COALESCE(MAX(sort), -1) AS maxSort FROM accounts')
          .get() as { count: number; maxSort: number };
        accountId = this.db
          .prepare('INSERT INTO accounts (iban, bank, name, color, sort) VALUES (?, ?, ?, ?, ?)')
          .run(
            parsed.iban,
            parsed.bank,
            defaultAccountName(parsed.bank, parsed.iban),
            defaultAccountColor(Number(count)),
            Number(maxSort) + 1,
          ).lastInsertRowid;
        accountCreated = true;
      }

      const { lastInsertRowid } = this.db
        .prepare(
          `INSERT INTO statements (account_id, year, month, opening_cents, closing_cents, file_hash, file_name)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          Number(accountId),
          parsed.year,
          parsed.month,
          parsed.openingCents,
          parsed.closingCents,
          fileHash,
          fileName,
        );
      const insertTx = this.db.prepare(
        `INSERT INTO transactions (statement_id, booking_date, value_date, type, counterparty, purpose,
                                   amount_cents, category_id, category_source, rule_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      parsed.transactions.forEach((tx, index) => {
        const assignment = assignments[index]!;
        insertTx.run(
          lastInsertRowid,
          tx.bookingDate,
          tx.valueDate,
          tx.type,
          tx.counterparty,
          tx.purpose,
          tx.amountCents,
          assignment.categoryId,
          assignment.source,
          assignment.ruleId,
        );
      });
      return Number(lastInsertRowid);
    });

    // Dateien erst nach erfolgreichem Commit anfassen; ersetzte Dateien vor dem Schreiben entfernen.
    for (const row of duplicateRows) this.deleteFile(String(row['file_hash']));
    this.storeFile(fileHash, file);

    return {
      statement: this.getStatement(statementId),
      periodFrom: parsed.periodFrom,
      periodTo: parsed.periodTo,
      transactionCount: parsed.transactions.length,
      accountCreated,
      uncategorizedCount,
      sumCents,
      balanceOk,
      warnings,
    };
  }

  listStatements(): Statement[] {
    return this.db
      .prepare(`${STATEMENT_SELECT} ORDER BY s.year DESC, s.month DESC, a.sort, a.id`)
      .all()
      .map(toStatement);
  }

  getStatement(id: number): Statement {
    const row = this.db.prepare(`${STATEMENT_SELECT} WHERE s.id = ?`).get(id);
    if (!row) throw notFound('Kontoauszug nicht gefunden');
    return toStatement(row);
  }

  /** Löscht den Auszug inkl. Buchungen (ON DELETE CASCADE) und der gespeicherten PDF-Datei. */
  deleteStatement(id: number): void {
    const row = this.db.prepare('SELECT file_hash FROM statements WHERE id = ?').get(id);
    if (!row) throw notFound('Kontoauszug nicht gefunden');
    this.db.prepare('DELETE FROM statements WHERE id = ?').run(id);
    this.deleteFile(String(row['file_hash']));
  }

  /** Löscht ein Konto inkl. aller Auszüge, Buchungen (ON DELETE CASCADE) und PDF-Dateien. */
  deleteAccount(id: number): void {
    if (!this.db.prepare('SELECT id FROM accounts WHERE id = ?').get(id))
      throw notFound('Konto nicht gefunden');
    const hashes = this.db
      .prepare('SELECT file_hash FROM statements WHERE account_id = ?')
      .all(id)
      .map((row) => String(row['file_hash']));
    this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
    for (const hash of hashes) this.deleteFile(hash);
  }

  private defaultCategorize(): Categorize {
    return () => {
      const row = this.db.prepare('SELECT id FROM categories WHERE is_default = 1').get();
      return { categoryId: row ? Number(row['id']) : null, source: 'default', ruleId: null };
    };
  }

  private filePath(fileHash: string): string | null {
    return this.uploadsDir ? join(this.uploadsDir, `${fileHash}.pdf`) : null;
  }

  private storeFile(fileHash: string, file: Uint8Array): void {
    const path = this.filePath(fileHash);
    if (!path) return;
    try {
      mkdirSync(this.uploadsDir!, { recursive: true });
      writeFileSync(path, file);
    } catch (error) {
      // Import bleibt gültig, nur das Original fehlt.
      console.error('PDF konnte nicht gespeichert werden:', error);
    }
  }

  private deleteFile(fileHash: string): void {
    const path = this.filePath(fileHash);
    if (path) rmSync(path, { force: true });
  }
}

function isPdf(file: Uint8Array): boolean {
  return file.length > 5 && Buffer.from(file.subarray(0, 1024)).includes('%PDF-');
}
