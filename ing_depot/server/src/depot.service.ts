import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type {
  DepotDocument,
  DocumentType,
  ImportFailure,
  ImportResult,
  OpeningInput,
  Overview,
  PriceInput,
  PriceSource,
  Transaction,
  TransactionType,
} from '../../shared/api-types.js';
import { transaction, type Database, type Row } from './db/database.js';
import { badRequest, notFound } from './http-error.js';
import { DocumentParseError, parseIngDocument, type ParsedDocument } from './ing-parser.js';
import { extractLines } from './pdf-text.js';
import {
  computeOverview,
  type PriceRow,
  type SecurityRow,
  type StatementRow,
} from './portfolio.js';

export interface DepotServiceOptions {
  /** Ablage der Original-PDFs; `null` = nicht speichern (Tests). */
  documentsDir?: string | null;
  /** Freistellungsauftrag in Cent */
  exemptionCents?: number;
  /** Liefert das heutige ISO-Datum (in Tests überschreibbar). */
  today?: () => string;
  /** Liest die Textzeilen eines PDFs (in Tests überschreibbar). */
  readPdf?: (file: Uint8Array) => Promise<string[]>;
}

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ENTITY_RE = /^[a-z_]+\.[a-z0-9_]+$/;

export const localToday = (): string => {
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const quantityText = (quantity: number): string =>
  quantity.toLocaleString('de-DE', { maximumFractionDigits: 6 });

/** Browser senden UTF-8-Dateinamen, die busboy als latin1 liest – hier zurückwandeln. */
export function normalizeFileName(name: string | undefined): string {
  let result = basename(name?.trim() || 'dokument.pdf');
  const decoded = Buffer.from(result, 'latin1').toString('utf8');
  if (!decoded.includes('�') && [...result].some((c) => c.charCodeAt(0) > 0x7f)) {
    result = decoded;
  }
  return result.slice(0, 200);
}

export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const DOCUMENT_LABEL: Record<DocumentType, string> = {
  buy: 'Kauf',
  sell: 'Verkauf',
  dividend: 'Ertrag',
  statement: 'Depotauszug',
};

function summarize(doc: ParsedDocument): string {
  if (doc.type === 'statement') {
    return `Depotauszug mit ${doc.positions.length} Position${doc.positions.length === 1 ? '' : 'en'}`;
  }
  if (doc.type === 'dividend') return `Ertrag ${doc.name}`;
  return `${DOCUMENT_LABEL[doc.type]} ${quantityText(doc.quantity)} × ${doc.name}`;
}

/** Schlüssel, der dasselbe Dokument unabhängig von der Datei erkennt. */
function contentKey(doc: ParsedDocument): string {
  if (doc.type === 'statement') return `statement|${doc.date}`;
  if (doc.reference) return `${doc.type}|${doc.reference}`;
  return [doc.type, doc.isin, doc.date, doc.quantity, doc.totalCents].join('|');
}

function toDocument(row: Row): DepotDocument {
  return {
    id: Number(row['id']),
    type: row['type'] as DocumentType,
    fileName: String(row['file_name']),
    date: String(row['doc_date']),
    reference: (row['reference'] as string | null) ?? null,
    source: row['source'] as 'upload' | 'inbox',
    importedAt: String(row['imported_at']),
    summary: String(row['summary']),
  };
}

function toTransaction(row: Row): Transaction {
  return {
    id: Number(row['id']),
    documentId: row['document_id'] === null ? null : Number(row['document_id']),
    type: row['type'] as TransactionType,
    date: String(row['date']),
    isin: String(row['isin']),
    name: String(row['name']),
    quantity: Number(row['quantity']),
    price: Number(row['price']),
    grossCents: Number(row['gross_cents']),
    feeCents: Number(row['fee_cents']),
    taxCents: Number(row['tax_cents']),
    totalCents: Number(row['total_cents']),
  };
}

const TRANSACTION_SELECT = `
  SELECT t.*, s.name FROM transactions t JOIN securities s ON s.isin = t.isin`;

/** Import, Speicherung und Auswertung der Depotdaten. */
export class DepotService {
  private readonly documentsDir: string | null;
  private readonly exemptionCents: number;
  private readonly today: () => string;
  private readonly readPdf: (file: Uint8Array) => Promise<string[]>;
  private readonly listeners: (() => void)[] = [];

  constructor(
    private readonly db: Database,
    options: DepotServiceOptions = {},
  ) {
    this.documentsDir = options.documentsDir ?? null;
    this.exemptionCents = options.exemptionCents ?? 0;
    this.today = options.today ?? localToday;
    this.readPdf =
      options.readPdf ?? (async (file) => (await extractLines(file)).map((line) => line.text));
  }

  /** Meldet Änderungen am Datenbestand (z. B. um HA-Sensoren zu aktualisieren). */
  onChange(listener: () => void): void {
    this.listeners.push(listener);
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }

  // ---- Import ----

  async importPdf(
    file: Uint8Array,
    originalName: string | undefined,
    source: 'upload' | 'inbox' = 'upload',
  ): Promise<ImportResult> {
    const fileName = normalizeFileName(originalName);
    const failed = (message: string): ImportResult => ({ fileName, status: 'failed', message });

    const sha256 = createHash('sha256').update(file).digest('hex');
    if (this.db.prepare('SELECT 1 FROM documents WHERE sha256 = ?').get(sha256)) {
      return { fileName, status: 'duplicate', message: 'Diese Datei wurde bereits importiert.' };
    }

    let parsed: ParsedDocument;
    try {
      const lines = await this.readPdf(file);
      if (lines.length === 0) {
        return failed('Die PDF enthält keinen lesbaren Text (evtl. ein Scan).');
      }
      parsed = parseIngDocument(lines);
    } catch (error) {
      if (error instanceof DocumentParseError) return failed(error.message);
      console.error(`PDF „${fileName}“ konnte nicht gelesen werden:`, error);
      return failed('Die Datei ist keine lesbare PDF.');
    }

    const key = contentKey(parsed);
    if (this.db.prepare('SELECT 1 FROM documents WHERE content_key = ?').get(key)) {
      return {
        fileName,
        status: 'duplicate',
        message: 'Dieses Dokument wurde bereits importiert (andere Datei, gleicher Inhalt).',
      };
    }

    const id = transaction(this.db, () => this.store(parsed, { fileName, sha256, key, source }));
    if (this.documentsDir) {
      mkdirSync(this.documentsDir, { recursive: true });
      writeFileSync(join(this.documentsDir, `${id}.pdf`), file);
    }
    this.changed();
    const document = this.getDocument(id);
    return { fileName, status: 'imported', message: document.summary, document };
  }

  private upsertSecurity(isin: string, name: string, wkn: string | null = null): void {
    this.db
      .prepare(
        `INSERT INTO securities (isin, wkn, name) VALUES (?, ?, ?)
         ON CONFLICT (isin) DO UPDATE SET
           wkn = COALESCE(excluded.wkn, wkn),
           name = CASE WHEN name = isin OR excluded.wkn IS NOT NULL THEN excluded.name ELSE name END`,
      )
      .run(isin, wkn, name);
  }

  private upsertPrice(
    isin: string,
    date: string,
    price: number,
    source: PriceSource,
    documentId: number | null = null,
  ): void {
    this.db
      .prepare(
        `INSERT INTO prices (isin, date, price, source, document_id) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (isin, date, source) DO UPDATE SET
           price = excluded.price, document_id = excluded.document_id`,
      )
      .run(isin, date, price, source, documentId);
  }

  private store(
    doc: ParsedDocument,
    meta: { fileName: string; sha256: string; key: string; source: 'upload' | 'inbox' },
  ): number {
    const id = Number(
      this.db
        .prepare(
          `INSERT INTO documents (type, file_name, sha256, doc_date, reference, content_key, source, summary)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          doc.type,
          meta.fileName,
          meta.sha256,
          doc.date,
          doc.reference,
          meta.key,
          meta.source,
          summarize(doc),
        ).lastInsertRowid,
    );

    if (doc.type === 'statement') {
      const insert = this.db.prepare(
        'INSERT INTO statement_positions (document_id, date, isin, quantity) VALUES (?, ?, ?, ?)',
      );
      for (const position of doc.positions) {
        this.upsertSecurity(position.isin, position.name);
        insert.run(id, doc.date, position.isin, position.quantity);
        if (position.price) {
          this.upsertPrice(position.isin, doc.date, position.price, 'document', id);
        }
      }
      return id;
    }

    this.upsertSecurity(doc.isin, doc.name, doc.wkn);
    const price = doc.type === 'dividend' ? 0 : doc.price;
    this.db
      .prepare(
        `INSERT INTO transactions
           (document_id, type, date, isin, quantity, price, gross_cents, fee_cents, tax_cents, total_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        doc.type,
        doc.date,
        doc.isin,
        doc.quantity,
        price,
        doc.grossCents,
        doc.type === 'dividend' ? 0 : doc.feeCents,
        doc.taxCents,
        doc.totalCents,
      );
    if (price > 0) this.upsertPrice(doc.isin, doc.date, price, 'document', id);
    return id;
  }

  // ---- Dokumente ----

  listDocuments(): DepotDocument[] {
    return this.db
      .prepare('SELECT * FROM documents ORDER BY doc_date DESC, id DESC')
      .all()
      .map(toDocument);
  }

  getDocument(id: number): DepotDocument {
    const row = this.db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    if (!row) throw notFound('Dokument nicht gefunden');
    return toDocument(row);
  }

  /** Pfad der gespeicherten Original-PDF; `null`, wenn sie nicht (mehr) vorliegt. */
  documentFile(id: number): string | null {
    this.getDocument(id);
    if (!this.documentsDir) return null;
    const file = join(this.documentsDir, `${id}.pdf`);
    return existsSync(file) ? file : null;
  }

  deleteDocument(id: number): void {
    this.getDocument(id);
    this.db.prepare('DELETE FROM documents WHERE id = ?').run(id);
    if (this.documentsDir) rmSync(join(this.documentsDir, `${id}.pdf`), { force: true });
    this.changed();
  }

  // ---- Nicht erkannte Dateien aus dem Eingangsordner ----

  addFailure(fileName: string, reason: string): void {
    this.db
      .prepare('INSERT INTO import_failures (file_name, reason) VALUES (?, ?)')
      .run(fileName, reason);
  }

  listFailures(): ImportFailure[] {
    return this.db
      .prepare('SELECT * FROM import_failures ORDER BY id DESC')
      .all()
      .map((row) => ({
        id: Number(row['id']),
        fileName: String(row['file_name']),
        reason: String(row['reason']),
        createdAt: String(row['created_at']),
      }));
  }

  deleteFailure(id: number): void {
    const result = this.db.prepare('DELETE FROM import_failures WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Eintrag nicht gefunden');
  }

  // ---- Buchungen ----

  listTransactions(year?: number): Transaction[] {
    const rows = year
      ? this.db
          .prepare(
            `${TRANSACTION_SELECT} WHERE t.date BETWEEN ? AND ? ORDER BY t.date DESC, t.id DESC`,
          )
          .all(`${year}-01-01`, `${year}-12-31`)
      : this.db.prepare(`${TRANSACTION_SELECT} ORDER BY t.date DESC, t.id DESC`).all();
    return rows.map(toTransaction);
  }

  addOpening(input: Partial<OpeningInput>): Transaction {
    const isin = String(input.isin ?? '')
      .trim()
      .toUpperCase();
    if (!ISIN_RE.test(isin)) throw badRequest('Ungültige ISIN.', 'INVALID_ISIN');
    if (!isValidDate(input.date)) throw badRequest('Ungültiges Datum.', 'INVALID_DATE');
    const quantity = Number(input.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw badRequest('Die Stückzahl muss größer als 0 sein.', 'INVALID_QUANTITY');
    }
    const costCents = Number(input.costCents);
    if (!Number.isInteger(costCents) || costCents < 0) {
      throw badRequest('Ungültiger Einstandswert.', 'INVALID_COST');
    }
    const name = String(input.name ?? '').trim() || isin;
    const date = input.date;

    const id = transaction(this.db, () => {
      this.upsertSecurity(isin, name);
      const price = costCents / 100 / quantity;
      if (price > 0) this.upsertPrice(isin, date, price, 'document');
      return Number(
        this.db
          .prepare(
            `INSERT INTO transactions
               (type, date, isin, quantity, price, gross_cents, fee_cents, tax_cents, total_cents)
             VALUES ('opening', ?, ?, ?, ?, ?, 0, 0, ?)`,
          )
          .run(date, isin, quantity, price, costCents, costCents).lastInsertRowid,
      );
    });
    this.changed();
    return toTransaction(this.db.prepare(`${TRANSACTION_SELECT} WHERE t.id = ?`).get(id)!);
  }

  /** Löscht einen manuell erfassten Startbestand; importierte Buchungen hängen am Dokument. */
  deleteTransaction(id: number): void {
    const row = this.db.prepare('SELECT document_id FROM transactions WHERE id = ?').get(id);
    if (!row) throw notFound('Buchung nicht gefunden');
    if (row['document_id'] !== null) {
      throw badRequest(
        'Importierte Buchungen werden über das zugehörige Dokument gelöscht.',
        'IMPORTED_TRANSACTION',
      );
    }
    this.db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
    this.changed();
  }

  // ---- Kurse ----

  private requireSecurity(isin: string): void {
    if (!this.db.prepare('SELECT 1 FROM securities WHERE isin = ?').get(isin)) {
      throw notFound('Wertpapier nicht gefunden');
    }
  }

  addPrice(isin: string, input: Partial<PriceInput>, source: PriceSource = 'manual'): void {
    this.requireSecurity(isin);
    const price = Number(input.price);
    if (!Number.isFinite(price) || price <= 0) {
      throw badRequest('Der Kurs muss größer als 0 sein.', 'INVALID_PRICE');
    }
    const date = input.date ?? this.today();
    if (!isValidDate(date)) throw badRequest('Ungültiges Datum.', 'INVALID_DATE');
    this.upsertPrice(isin, date, price, source);
    this.changed();
  }

  setPriceEntity(isin: string, entity: string | null | undefined): void {
    this.requireSecurity(isin);
    const value = entity?.trim() || null;
    if (value && !ENTITY_RE.test(value)) {
      throw badRequest('Ungültige Entität (erwartet z. B. sensor.msci_world).', 'INVALID_ENTITY');
    }
    this.db.prepare('UPDATE securities SET price_entity = ? WHERE isin = ?').run(value, isin);
    this.changed();
  }

  /** Wertpapiere, deren Kurs aus einer HA-Entität gelesen wird. */
  priceEntities(): { isin: string; entity: string }[] {
    return this.db
      .prepare('SELECT isin, price_entity FROM securities WHERE price_entity IS NOT NULL')
      .all()
      .map((row) => ({ isin: String(row['isin']), entity: String(row['price_entity']) }));
  }

  // ---- Auswertung ----

  overview(year?: number): Overview {
    const today = this.today();
    const securities: SecurityRow[] = this.db
      .prepare('SELECT isin, name, price_entity FROM securities')
      .all()
      .map((row) => ({
        isin: String(row['isin']),
        name: String(row['name']),
        priceEntity: (row['price_entity'] as string | null) ?? null,
      }));
    const prices: PriceRow[] = this.db
      .prepare('SELECT isin, date, price, source FROM prices')
      .all()
      .map((row) => ({
        isin: String(row['isin']),
        date: String(row['date']),
        price: Number(row['price']),
        source: row['source'] as PriceSource,
      }));
    const statement: StatementRow[] = this.db
      .prepare(
        `SELECT date, isin, quantity FROM statement_positions
          WHERE document_id = (SELECT id FROM documents WHERE type = 'statement'
                                ORDER BY doc_date DESC, id DESC LIMIT 1)`,
      )
      .all()
      .map((row) => ({
        date: String(row['date']),
        isin: String(row['isin']),
        quantity: Number(row['quantity']),
      }));

    return computeOverview({
      year: year ?? Number(today.slice(0, 4)),
      today,
      transactions: this.listTransactions(),
      prices,
      securities,
      statement,
      exemptionCents: this.exemptionCents,
    });
  }
}
