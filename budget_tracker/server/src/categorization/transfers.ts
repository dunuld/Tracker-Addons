import type { CategorySource } from '../../../shared/api-types.js';
import { transaction, type Database } from '../db/database.js';
import { Categorizer } from './categorizer.js';

/** Maximaler Abstand der Buchungstage zweier Gegenbuchungen. */
export const TRANSFER_WINDOW_DAYS = 3;

export interface TransferCandidate {
  id: number;
  accountId: number;
  /** ISO `yyyy-mm-dd` */
  bookingDate: string;
  amountCents: number;
  counterparty: string;
  purpose: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const dayDistance = (a: string, b: string): number =>
  Math.abs(Date.parse(a) - Date.parse(b)) / DAY_MS;

/** Großbuchstaben ohne Leerzeichen, damit `DE58 5001 …` und `DE585001…` gleich sind. */
const compact = (text: string): string => text.replace(/\s+/g, '').toUpperCase();

/**
 * Findet Umbuchungen zwischen eigenen Konten und liefert die IDs aller beteiligten Buchungen.
 *
 * 1. Gegenbuchung: Abbuchung auf einem Konto und Gutschrift über denselben Betrag auf einem
 *    anderen eigenen Konto, höchstens {@link TRANSFER_WINDOW_DAYS} Tage auseinander. Jede Buchung
 *    gehört zu höchstens einem Paar; bevorzugt wird der kleinste Abstand, dann die kleinere ID.
 * 2. IBAN: Empfänger oder Verwendungszweck enthält die IBAN eines anderen eigenen Kontos
 *    (greift auch, wenn der Auszug des Gegenkontos nicht importiert ist).
 */
export function findTransfers(
  txs: readonly TransferCandidate[],
  accounts: readonly { id: number; iban: string }[],
): Set<number> {
  const result = new Set<number>();

  const incomingByAmount = new Map<number, TransferCandidate[]>();
  for (const tx of txs) {
    if (tx.amountCents <= 0) continue;
    const list = incomingByAmount.get(tx.amountCents) ?? [];
    list.push(tx);
    incomingByAmount.set(tx.amountCents, list);
  }
  const outgoing = txs
    .filter((tx) => tx.amountCents < 0)
    .sort((a, b) => a.bookingDate.localeCompare(b.bookingDate) || a.id - b.id);

  for (const out of outgoing) {
    let best: TransferCandidate | undefined;
    let bestDistance = Infinity;
    for (const inc of incomingByAmount.get(-out.amountCents) ?? []) {
      if (inc.accountId === out.accountId || result.has(inc.id)) continue;
      const distance = dayDistance(out.bookingDate, inc.bookingDate);
      if (distance > TRANSFER_WINDOW_DAYS) continue;
      if (distance < bestDistance || (distance === bestDistance && inc.id < best!.id)) {
        best = inc;
        bestDistance = distance;
      }
    }
    if (best) {
      result.add(out.id);
      result.add(best.id);
    }
  }

  const ownIbans = accounts.map((a) => ({ id: a.id, iban: compact(a.iban) }));
  for (const tx of txs) {
    if (result.has(tx.id)) continue;
    const text = compact(`${tx.counterparty} ${tx.purpose}`);
    if (ownIbans.some((a) => a.id !== tx.accountId && a.iban && text.includes(a.iban))) {
      result.add(tx.id);
    }
  }
  return result;
}

interface TxRow {
  id: number;
  account_id: number;
  booking_date: string;
  amount_cents: number;
  counterparty: string;
  purpose: string;
  category_id: number | null;
  category_source: CategorySource;
  rule_id: number | null;
}

/**
 * Ordnet erkannte Umbuchungen der Umbuchungs-Kategorie zu (Quelle `transfer`) und setzt
 * Buchungen, die keine Umbuchung mehr sind (z. B. Gegenkonto gelöscht), per Regeln zurück.
 * Manuell zugeordnete Buchungen bleiben unverändert, zählen aber als Gegenbuchung.
 */
export class TransferDetector {
  private readonly categorizer: Categorizer;

  constructor(private readonly db: Database) {
    this.categorizer = new Categorizer(db);
  }

  /** Führt die Erkennung in einer eigenen Transaktion aus; liefert die Zahl geänderter Buchungen. */
  detect(): number {
    return transaction(this.db, () => this.detectInTransaction());
  }

  /** Wie {@link detect}, aber innerhalb einer bereits laufenden Transaktion. */
  detectInTransaction(): number {
    const categoryRow = this.db
      .prepare("SELECT id FROM categories WHERE kind = 'transfer' ORDER BY sort, id LIMIT 1")
      .get();
    const transferCategoryId = categoryRow ? Number(categoryRow['id']) : null;

    const rows = this.db
      .prepare(
        `SELECT t.id, s.account_id, t.booking_date, t.amount_cents, t.counterparty, t.purpose,
                t.category_id, t.category_source, t.rule_id
           FROM transactions t JOIN statements s ON s.id = t.statement_id`,
      )
      .all() as unknown as TxRow[];
    const accounts = this.db.prepare('SELECT id, iban FROM accounts').all() as unknown as {
      id: number;
      iban: string;
    }[];

    // Ohne Umbuchungs-Kategorie gibt es nichts zuzuordnen; bisherige Treffer fallen zurück.
    const transfers =
      transferCategoryId === null
        ? new Set<number>()
        : findTransfers(
            rows.map((r) => ({
              id: Number(r.id),
              accountId: Number(r.account_id),
              bookingDate: r.booking_date,
              amountCents: Number(r.amount_cents),
              counterparty: r.counterparty,
              purpose: r.purpose,
            })),
            accounts,
          );

    const update = this.db.prepare(
      'UPDATE transactions SET category_id = ?, category_source = ?, rule_id = ? WHERE id = ?',
    );
    const match = this.categorizer.matcher();
    let changed = 0;
    for (const row of rows) {
      if (row.category_source === 'manual') continue;
      const id = Number(row.id);
      if (transfers.has(id)) {
        if (row.category_source === 'transfer' && row.category_id === transferCategoryId) continue;
        update.run(transferCategoryId, 'transfer', null, id);
        changed++;
      } else if (row.category_source === 'transfer') {
        const a = match(row);
        update.run(a.categoryId, a.source, a.ruleId, id);
        changed++;
      }
    }
    return changed;
  }
}
