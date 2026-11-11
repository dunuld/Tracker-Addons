/** Formatierung für die Anzeige (deutsches Zahlen- und Datumsformat). */

const EURO = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const PERCENT = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});
const QUANTITY = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 6 });
const PRICE = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 4,
});

export const MONTHS = [
  'Jan',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez',
];

export const formatEuro = (cents: number): string => EURO.format(cents / 100);

/** Betrag mit Vorzeichen, z. B. `+12,34 €` */
export const formatSignedEuro = (cents: number): string =>
  (cents > 0 ? '+' : '') + EURO.format(cents / 100);

export const formatPercent = (value: number | null): string =>
  value === null ? '–' : `${PERCENT.format(value)} %`;

export const formatQuantity = (quantity: number): string => QUANTITY.format(quantity);

export const formatPrice = (price: number | null): string =>
  price === null ? '–' : PRICE.format(price);

/** `2026-03-15` → `15.03.2026` */
export function formatDate(iso: string | null): string {
  if (!iso) return '–';
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}.${month}.${year}`;
}

/** CSS-Klasse für Gewinn/Verlust */
export const signClass = (value: number): string => (value > 0 ? 'pos' : value < 0 ? 'neg' : '');

/** Liest `1.234,56` bzw. `1234.56`; `null` bei ungültiger Eingabe. */
export function parseNumber(text: string | number | null | undefined): number | null {
  if (typeof text === 'number') return Number.isFinite(text) ? text : null;
  const trimmed = (text ?? '').trim().replace(/\s|€/g, '');
  if (!trimmed) return null;
  const normalized = trimmed.includes(',')
    ? trimmed.replaceAll('.', '').replace(',', '.')
    : trimmed;
  const value = Number(normalized);
  return /^-?\d*\.?\d+$/.test(normalized) && Number.isFinite(value) ? value : null;
}
