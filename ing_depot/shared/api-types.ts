/** Gemeinsame DTOs von Frontend (src/) und Backend (server/). Geldbeträge sind Cent (Ganzzahl). */

export interface HealthResponse {
  status: 'ok';
  version: string;
}

export interface ApiError {
  error: string;
  /** Maschinenlesbarer Code, z. B. `NOT_FOUND` */
  code?: string;
}

/** Art eines importierten ING-Dokuments. */
export type DocumentType = 'buy' | 'sell' | 'dividend' | 'statement';

/**
 * Art einer Buchung. `opening` ist ein manuell erfasster Startbestand
 * (Stücke samt Einstandswert, die vor dem ältesten importierten Kauf erworben wurden).
 */
export type TransactionType = 'buy' | 'sell' | 'dividend' | 'opening';

export interface DepotDocument {
  id: number;
  type: DocumentType;
  fileName: string;
  /** ISO-Datum des Dokuments (Ausführungstag, Zahltag bzw. Stichtag) */
  date: string;
  /** Ordernummer o. Ä., falls vorhanden */
  reference: string | null;
  source: 'upload' | 'inbox';
  importedAt: string;
  /** Kurzbeschreibung, z. B. „Kauf 3 × iShares Core MSCI World“ */
  summary: string;
}

export interface Transaction {
  id: number;
  documentId: number | null;
  type: TransactionType;
  /** ISO-Datum */
  date: string;
  isin: string;
  name: string;
  /** Stückzahl (bei Dividenden: Bestand, auf den gezahlt wurde; 0 wenn unbekannt) */
  quantity: number;
  /** Kurs in EUR je Stück (0 wenn nicht zutreffend) */
  price: number;
  /** Kurswert bzw. Bruttoertrag */
  grossCents: number;
  /** Provision und Entgelte */
  feeCents: number;
  /** Einbehaltene Steuern (negativ = Erstattung) */
  taxCents: number;
  /** Kauf: Endbetrag zu Lasten; Verkauf/Dividende: Gutschrift; Startbestand: Einstandswert */
  totalCents: number;
}

/** Manuell erfasster Startbestand. */
export interface OpeningInput {
  isin: string;
  name: string;
  /** ISO-Datum des (ursprünglichen) Kaufs */
  date: string;
  quantity: number;
  /** Gesamter Einstandswert in Cent */
  costCents: number;
}

export type ImportStatus = 'imported' | 'duplicate' | 'failed';

export interface ImportResult {
  fileName: string;
  status: ImportStatus;
  /** Verständliche Meldung (deutsch) */
  message: string;
  document?: DepotDocument;
}

/** PDF aus dem Eingangsordner, die nicht importiert werden konnte. */
export interface ImportFailure {
  id: number;
  fileName: string;
  reason: string;
  createdAt: string;
}

export type PriceSource = 'document' | 'manual' | 'ha';

export interface Position {
  isin: string;
  name: string;
  quantity: number;
  /** Einstandswert des aktuellen Bestands (FIFO, inkl. Kaufgebühren) */
  costCents: number;
  /** Letzter bekannter Kurs in EUR; `null`, wenn kein Kurs bekannt ist */
  price: number | null;
  priceDate: string | null;
  priceSource: PriceSource | null;
  /** HA-Entität, aus der der Kurs gelesen wird */
  priceEntity: string | null;
  valueCents: number;
  /** Kursgewinn seit Kauf (Wert − Einstandswert) */
  gainCents: number;
  gainPct: number | null;
  /** Kursgewinn seit 01.01. des gewählten Jahres */
  ytdGainCents: number;
  ytdGainPct: number | null;
  /** Im gewählten Jahr realisierter Gewinn (vor Steuern) */
  realizedCents: number;
  /** Im gewählten Jahr ausgezahlte Dividenden (netto) */
  dividendsNetCents: number;
}

export interface MonthlyFigures {
  /** 1–12 */
  month: number;
  investedCents: number;
  dividendsNetCents: number;
  realizedCents: number;
}

export interface Overview {
  year: number;
  /** Jahre, für die Daten vorliegen (absteigend), immer inkl. des aktuellen Jahres */
  years: number[];
  /** Bewertungsstichtag: heute bzw. 31.12. bei vergangenen Jahren */
  asOf: string;
  /** Summe aller Käufe im Jahr inkl. Gebühren */
  investedGrossCents: number;
  /** Käufe abzüglich Verkaufserlöse */
  investedNetCents: number;
  feesCents: number;
  /** Realisierte Gewinne im Jahr (FIFO, nach Gebühren, vor Steuern) */
  realizedCents: number;
  dividendsGrossCents: number;
  dividendsNetCents: number;
  /** Einbehaltene Steuern auf Verkäufe und Erträge */
  taxesCents: number;
  /** Depotwert zum Stichtag */
  valueCents: number;
  costCents: number;
  /** Kursgewinn seit Kauf über alle Positionen */
  gainCents: number;
  gainPct: number | null;
  /** Kursgewinn seit 01.01. */
  ytdGainCents: number;
  ytdGainPct: number | null;
  /** Freistellungsauftrag in Cent (0 = nicht konfiguriert) */
  exemptionCents: number;
  /** Davon rechnerisch verbraucht (Bruttoerträge + realisierte Gewinne, min. 0) */
  exemptionUsedCents: number;
  positions: Position[];
  monthly: MonthlyFigures[];
  /** Hinweise auf Datenlücken, z. B. fehlender Startbestand */
  warnings: string[];
}

export interface SecurityUpdate {
  /** HA-Entität mit dem aktuellen Kurs in EUR; leer/`null` = keine */
  priceEntity?: string | null;
}

export interface PriceInput {
  /** Kurs in EUR je Stück */
  price: number;
  /** ISO-Datum; Standard: heute */
  date?: string;
}
