import {
  formatDate,
  formatEuro,
  formatPercent,
  formatPrice,
  formatQuantity,
  formatSignedEuro,
  parseNumber,
  signClass,
} from './format';

const plain = (text: string) => text.replace(/\u00a0/g, ' ');

describe('Formatierung', () => {
  it('formatiert Beträge, Prozente, Stückzahlen und Kurse', () => {
    expect(plain(formatEuro(123456))).toBe('1.234,56 €');
    expect(plain(formatSignedEuro(1050))).toBe('+10,50 €');
    expect(plain(formatSignedEuro(-1050))).toBe('-10,50 €');
    expect(plain(formatSignedEuro(0))).toBe('0,00 €');
    expect(formatPercent(3.5)).toBe('+3,50 %');
    expect(formatPercent(-3.5)).toBe('-3,50 %');
    expect(formatPercent(null)).toBe('–');
    expect(formatQuantity(0.87654)).toBe('0,87654');
    expect(plain(formatPrice(56.768))).toBe('56,768 €');
    expect(formatPrice(null)).toBe('–');
  });

  it('formatiert Datumswerte', () => {
    expect(formatDate('2026-03-15')).toBe('15.03.2026');
    expect(formatDate('2026-03-15T10:00:00Z')).toBe('15.03.2026');
    expect(formatDate(null)).toBe('–');
  });

  it('liefert die CSS-Klasse für Gewinn und Verlust', () => {
    expect([signClass(1), signClass(-1), signClass(0)]).toEqual(['pos', 'neg', '']);
  });

  it('liest deutsche und englische Zahlen', () => {
    expect(parseNumber('1.234,56')).toBe(1234.56);
    expect(parseNumber('1234.56')).toBe(1234.56);
    expect(parseNumber(' 12,5 € ')).toBe(12.5);
    expect(parseNumber(7)).toBe(7);
    expect(parseNumber(Number.NaN)).toBeNull();
    expect(parseNumber('')).toBeNull();
    expect(parseNumber(null)).toBeNull();
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('1,2,3')).toBeNull();
  });
});
