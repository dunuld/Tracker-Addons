/**
 * Liest ING-Depotdokumente aus den Textzeilen eines PDFs:
 * Wertpapierabrechnung (Kauf/Verkauf), Ertragsabrechnung (Dividende, Ausschüttung, Zinsen)
 * und Depotauszug. Ausgewertet werden beschriftete Zeilen („Kurswert EUR 170,30“), nicht
 * Spaltenpositionen – so bleibt der Parser gegenüber kleinen Layoutänderungen robust.
 */

export class DocumentParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentParseError';
  }
}

interface ParsedSecurity {
  isin: string;
  wkn: string | null;
  name: string;
}

export interface ParsedTrade extends ParsedSecurity {
  type: 'buy' | 'sell';
  date: string;
  reference: string | null;
  quantity: number;
  price: number;
  grossCents: number;
  feeCents: number;
  taxCents: number;
  totalCents: number;
}

export interface ParsedDividend extends ParsedSecurity {
  type: 'dividend';
  date: string;
  reference: null;
  quantity: number;
  grossCents: number;
  taxCents: number;
  totalCents: number;
}

export interface ParsedStatementPosition {
  isin: string;
  name: string;
  quantity: number;
  /** Kurs in EUR; `null`, wenn er sich nicht sicher bestimmen ließ */
  price: number | null;
}

export interface ParsedStatement {
  type: 'statement';
  date: string;
  reference: null;
  positions: ParsedStatementPosition[];
}

export type ParsedDocument = ParsedTrade | ParsedDividend | ParsedStatement;

const NUMBER = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?`;
const NUMBER_RE = new RegExp(NUMBER, 'g');
const DATE = String.raw`(\d{2})\.(\d{2})\.(\d{4})`;
const ISIN_RE = /\b([A-Z]{2}[A-Z0-9]{9}\d)\b/;
const TAX_LINE = /^(Kapitalertrags?teuer|KapSt|Solidaritätszuschlag|Kirchensteuer)/i;
const FEE_LINE =
  /^(Provision|Handelsplatz|Handelsentgelt|Courtage|Fremde Spesen|Variable Börsenspesen)/i;

/** `1.234,5678` → `1234.5678` */
export function parseDecimal(text: string): number {
  return Number(text.replaceAll('.', '').replace(',', '.'));
}

const toCents = (value: number): number => Math.round(value * 100);

function isoDate(match: RegExpExecArray | null): string | null {
  if (!match) return null;
  const [, dd, mm, yyyy] = match.slice(-4);
  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  if (date.getUTCMonth() !== Number(mm) - 1 || date.getUTCDate() !== Number(dd)) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/** Letzte Zahl einer Zeile – bei beschrifteten Zeilen steht der Betrag rechts. */
function lastNumber(line: string | undefined): number | null {
  const last = line?.match(NUMBER_RE)?.at(-1);
  return last === undefined ? null : parseDecimal(last);
}

class Lines {
  constructor(readonly lines: string[]) {}

  find(pattern: RegExp): string | undefined {
    return this.lines.find((line) => pattern.test(line));
  }

  filter(pattern: RegExp): string[] {
    return this.lines.filter((line) => pattern.test(line));
  }

  /** Betrag in Cent aus der ersten passenden Zeile. */
  cents(pattern: RegExp): number | null {
    const value = lastNumber(this.find(pattern));
    return value === null ? null : toCents(value);
  }

  sumCents(pattern: RegExp): number {
    return this.filter(pattern).reduce((sum, line) => sum + toCents(lastNumber(line) ?? 0), 0);
  }

  date(...patterns: RegExp[]): string | null {
    for (const pattern of patterns) {
      for (const line of this.lines) {
        const date = isoDate(pattern.exec(line));
        if (date) return date;
      }
    }
    return null;
  }
}

function required<T>(value: T | null | undefined, field: string): T {
  if (value === null || value === undefined) {
    throw new DocumentParseError(`Das Feld „${field}“ wurde im Dokument nicht gefunden.`);
  }
  return value;
}

function parseSecurity(doc: Lines): ParsedSecurity {
  const isinLine = required(
    doc.lines.find((line) => /ISIN/.test(line) && ISIN_RE.test(line)),
    'ISIN',
  );
  const isin = ISIN_RE.exec(isinLine)![1]!;
  const wkn = /\(([A-Z0-9]{6})\)/.exec(isinLine.slice(isinLine.indexOf(isin)))?.[1] ?? null;
  const name = /^Wertpapierbezeichnung\s+(.+)/.exec(doc.find(/^Wertpapierbezeichnung\s+\S/) ?? '');
  return { isin, wkn, name: name?.[1]?.trim() ?? isin };
}

function parseQuantity(doc: Lines): number {
  const match = doc.find(/^Nominale\b/)?.match(NUMBER_RE)?.[0];
  const quantity = match === undefined ? null : parseDecimal(match);
  if (!quantity || quantity <= 0) throw new DocumentParseError('Stückzahl („Nominale“) fehlt.');
  return quantity;
}

function parseTrade(doc: Lines, type: 'buy' | 'sell'): ParsedTrade {
  const security = parseSecurity(doc);
  const quantity = parseQuantity(doc);
  const grossCents = required(doc.cents(/^Kurswert\b/), 'Kurswert');
  const totalCents = required(doc.cents(/^Endbetrag\b/), 'Endbetrag');
  const date = required(
    doc.date(
      new RegExp(String.raw`Ausführungstag\D*${DATE}`),
      new RegExp(String.raw`^Datum\s+${DATE}`),
      new RegExp(String.raw`Valuta\D*${DATE}`),
    ),
    'Ausführungstag',
  );

  let feeCents: number;
  let taxCents = 0;
  if (type === 'buy') {
    feeCents = totalCents - grossCents;
  } else {
    taxCents = doc.sumCents(TAX_LINE);
    feeCents = grossCents - taxCents - totalCents;
    if (feeCents < 0) {
      // z. B. Steuererstattung: Gebühren aus den Einzelzeilen, Steuern als Rest
      feeCents = doc.sumCents(FEE_LINE);
      taxCents = grossCents - feeCents - totalCents;
    }
  }

  const priceLine = doc.find(/^Kurs\s+EUR\b/);
  return {
    type,
    ...security,
    date,
    reference: /Ordernummer\s+([\d.]+)/.exec(doc.find(/Ordernummer/) ?? '')?.[1] ?? null,
    quantity,
    price: lastNumber(priceLine) ?? grossCents / 100 / quantity,
    grossCents,
    feeCents,
    taxCents,
    totalCents,
  };
}

function parseDividend(doc: Lines): ParsedDividend {
  const security = parseSecurity(doc);
  // Fremdwährung: der in EUR umgerechnete Bruttobetrag steht in einer eigenen Zeile
  const grossCents = required(
    doc.cents(/^Umg\. z\. Dev\.-Kurs/) ?? doc.cents(/^Brutto\s+EUR\b/) ?? doc.cents(/^Brutto\b/),
    'Brutto',
  );
  const totalCents = required(doc.cents(/^Gesamtbetrag zu Ihren Gunsten/), 'Gesamtbetrag');
  const date = required(
    doc.date(
      new RegExp(String.raw`^Zahltag\s+${DATE}`),
      new RegExp(String.raw`Valuta\D*${DATE}`),
      new RegExp(String.raw`^Datum\s+${DATE}`),
    ),
    'Zahltag',
  );
  return {
    type: 'dividend',
    ...security,
    date,
    reference: null,
    quantity: parseQuantity(doc),
    grossCents,
    taxCents: grossCents - totalCents,
    totalCents,
  };
}

/**
 * Depotauszug: je ISIN wird im Umfeld der Zeile die Stückzahl gesucht. Der Kurs wird nur
 * übernommen, wenn er sich mit dem Kurswert gegenprüfen lässt (Stück × Kurs ≈ Kurswert).
 */
function parseStatement(doc: Lines): ParsedStatement {
  const date = required(
    doc.date(new RegExp(String.raw`\b(?:per|zum|vom)\s+${DATE}`), new RegExp(DATE)),
    'Stichtag',
  );
  const { lines } = doc;
  const isinRows = lines.flatMap((line, index) => (ISIN_RE.test(line) ? [index] : []));
  const positions = new Map<string, ParsedStatementPosition>();

  isinRows.forEach((row, i) => {
    const isin = ISIN_RE.exec(lines[row]!)![1]!;
    const previous = isinRows[i - 1] ?? -1;
    const next = isinRows[i + 1] ?? lines.length;
    const block = [
      lines[row]!,
      ...lines.slice(Math.max(previous + 1, row - 2), row).reverse(),
      ...lines.slice(row + 1, Math.min(next, row + 4)),
    ];
    // ISINs entfernen, damit ihre Ziffern nicht als Stückzahl oder Kurs gelesen werden
    const text = block.map((line) => line.replace(new RegExp(ISIN_RE, 'g'), ' ')).join('\n');
    const quantityMatch =
      new RegExp(String.raw`(?<![\w.,])(${NUMBER}) ?(?:Stück|St\.)`).exec(text) ??
      new RegExp(String.raw`(?:Stück|St\.) ?(${NUMBER})(?![\w.,]*\d)`).exec(text);
    if (!quantityMatch) return;
    const quantity = parseDecimal(quantityMatch[1]!);
    if (quantity <= 0) return;

    const numbers = (text.match(NUMBER_RE) ?? []).filter((n) => n.includes(',')).map(parseDecimal);
    let price: number | null = null;
    for (const candidate of numbers) {
      const value = quantity * candidate;
      if (numbers.some((n) => n !== candidate && Math.abs(n - value) <= 0.011 + value * 0.0005)) {
        price = candidate;
        break;
      }
    }

    const name = lines[row]!.replace(isin, ' ')
      .replace(new RegExp(String.raw`(${NUMBER})\s*(Stück|St\.|EUR|%)?`, 'g'), ' ')
      .replace(/\b(Stück|St\.|EUR)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!positions.has(isin)) positions.set(isin, { isin, name: name || isin, quantity, price });
  });

  if (positions.size === 0) {
    throw new DocumentParseError('Im Depotauszug wurden keine Positionen gefunden.');
  }
  return { type: 'statement', date, reference: null, positions: [...positions.values()] };
}

/** Erkennt die Dokumentart und liest das Dokument aus. */
export function parseIngDocument(rawLines: string[]): ParsedDocument {
  const doc = new Lines(rawLines.map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean));
  const text = doc.lines.join('\n');

  if (/Wertpapierabrechnung/i.test(text)) {
    const kind =
      /Wertpapierabrechnung\s+(Kauf|Verkauf)/i.exec(text) ?? /^(Kauf|Verkauf)\b/im.exec(text);
    if (kind) return parseTrade(doc, kind[1]!.toLowerCase() === 'kauf' ? 'buy' : 'sell');
    throw new DocumentParseError(
      'Wertpapierabrechnung erkannt, aber weder Kauf noch Verkauf – diese Art wird nicht unterstützt.',
    );
  }
  if (/Dividendengutschrift|Ertragsgutschrift|Zinsgutschrift/i.test(text))
    return parseDividend(doc);
  if (/Depotauszug|Depotübersicht|Depotbewertung/i.test(text)) return parseStatement(doc);

  throw new DocumentParseError(
    'Unbekannte Dokumentart. Unterstützt werden Wertpapierabrechnungen (Kauf/Verkauf), ' +
      'Ertragsabrechnungen und Depotauszüge der ING.',
  );
}
