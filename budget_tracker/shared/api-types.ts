/**
 * Gemeinsame DTOs für Server (server/src) und Angular-Frontend (src/app).
 * Nur Typen – diese Datei darf keinen Laufzeitcode enthalten.
 * Alle Beträge sind vorzeichenbehaftete Integer-Cent (Ausgaben negativ).
 * Datumswerte sind ISO-Strings `yyyy-mm-dd`, Zeitstempel ISO-8601.
 */

export type CategoryKind = 'expense' | 'income' | 'transfer';

export interface Category {
  id: number;
  name: string;
  /** Hex-Farbe, z. B. `#4caf50` */
  color: string;
  kind: CategoryKind;
  sort: number;
  /** Fallback-Kategorie ("Sonstiges"); genau eine, nicht löschbar */
  isDefault: boolean;
}

export interface CategoryInput {
  name: string;
  color: string;
  kind: CategoryKind;
  sort?: number;
}

/** `any` = Empfänger oder Verwendungszweck */
export type RuleField = 'counterparty' | 'purpose' | 'any';
export type RuleMatchType = 'contains' | 'regex';

export interface Rule {
  id: number;
  categoryId: number;
  field: RuleField;
  matchType: RuleMatchType;
  /** Vergleich immer ohne Beachtung der Groß-/Kleinschreibung */
  pattern: string;
  /** Kleinere Zahl = wird zuerst geprüft; erste passende Regel gewinnt */
  priority: number;
}

export interface RuleInput {
  categoryId: number;
  field: RuleField;
  matchType: RuleMatchType;
  pattern: string;
  priority?: number;
}

export interface Account {
  id: number;
  iban: string;
  bank: string;
  /** Anzeigename, z. B. „Girokonto“; Standard: `<Bank> ••<letzte 4 Stellen der IBAN>` */
  name: string;
  /** Hex-Farbe, z. B. `#2196f3` */
  color: string;
  sort: number;
  /** false = nur sichtbar, wenn das Konto ausdrücklich ausgewählt ist (nicht unter „Alle Konten“) */
  includeInReports: boolean;
  statementCount: number;
  /** Neuer Saldo des jüngsten Auszugs; `null` ohne Auszüge */
  balanceCents: number | null;
  /** Monat des jüngsten Auszugs (`YYYY-MM`); `null` ohne Auszüge */
  balanceMonth: string | null;
}

export interface AccountInput {
  name?: string;
  color?: string;
  sort?: number;
  includeInReports?: boolean;
}

export interface Statement {
  id: number;
  accountId: number;
  /** Anzeigename des Kontos */
  accountName: string;
  bank: string;
  iban: string;
  year: number;
  month: number;
  openingCents: number;
  closingCents: number;
  fileName: string;
  importedAt: string;
  transactionCount: number;
}

/** `transfer` = automatisch als Umbuchung zwischen eigenen Konten erkannt */
export type CategorySource = 'rule' | 'manual' | 'default' | 'transfer';

export interface Transaction {
  id: number;
  statementId: number;
  accountId: number;
  bookingDate: string;
  valueDate: string;
  type: string;
  counterparty: string;
  purpose: string;
  amountCents: number;
  categoryId: number | null;
  categorySource: CategorySource;
  ruleId: number | null;
}

export interface TransactionQuery {
  /** Ohne Angabe: alle Konten mit `includeInReports` */
  accountId?: number;
  year?: number;
  month?: number;
  categoryId?: number;
  q?: string;
}

export interface TransactionPatch {
  categoryId: number;
  /** Legt zusätzlich eine Regel für den Empfänger dieser Buchung an */
  createRule?: boolean;
}

export interface TransactionPatchResult {
  transaction: Transaction;
  rule?: Rule;
}

export interface ImportResult {
  statement: Statement;
  /** Zeitraum des Auszugs (ISO-Datum) */
  periodFrom: string;
  periodTo: string;
  transactionCount: number;
  /** true, wenn das Konto bei diesem Import neu angelegt wurde */
  accountCreated: boolean;
  uncategorizedCount: number;
  /** Buchungen, die durch diesen Import als Umbuchung zwischen eigenen Konten erkannt wurden
   *  (inkl. Gegenbuchungen auf anderen Konten) */
  transferCount: number;
  /** Summe aller Buchungen */
  sumCents: number;
  /** true, wenn Summe der Buchungen = Neuer Saldo − Alter Saldo */
  balanceOk: boolean;
  warnings: string[];
}

export interface ReapplyResult {
  updated: number;
}

export interface CategoryTotal {
  categoryId: number;
  name: string;
  color: string;
  kind: CategoryKind;
  totalCents: number;
  count: number;
}

export interface AccountBalance {
  accountId: number;
  name: string;
  color: string;
  /** Neuer Saldo des jüngsten Auszugs bis einschließlich zum Berichtsmonat */
  balanceCents: number;
  /** Monat dieses Auszugs (`YYYY-MM`); älter als der Berichtsmonat, wenn dessen Auszug fehlt */
  asOf: string;
}

export interface MonthlyReport {
  year: number;
  month: number;
  incomeCents: number;
  /** negativ */
  expenseCents: number;
  balanceCents: number;
  categories: CategoryTotal[];
  /** Kontostände zum Monatsende (gleiche Kontoauswahl wie der Bericht); Konten ohne Auszug fehlen */
  accountBalances: AccountBalance[];
  /** Summe der Kontostände; `null`, wenn kein Konto einen Auszug bis zu diesem Monat hat */
  totalBalanceCents: number | null;
}

export interface TrendMonth {
  /** `YYYY-MM` */
  month: string;
  totals: { categoryId: number; totalCents: number }[];
}

export interface TrendReport {
  from: string;
  to: string;
  categories: Pick<Category, 'id' | 'name' | 'color' | 'kind'>[];
  months: TrendMonth[];
}

export interface HealthResponse {
  status: 'ok';
  version: string;
}

export interface ApiError {
  error: string;
  /** Maschinenlesbarer Code, z. B. `DUPLICATE_STATEMENT` */
  code?: string;
  /** Bei Duplikat: der bereits vorhandene Auszug */
  existing?: Statement;
}
