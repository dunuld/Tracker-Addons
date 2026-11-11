import { formatDate, formatDateLong, formatMonth, parseHours } from './format';

describe('format', () => {
  it('formatiert Datumswerte deutsch', () => {
    expect(formatDate('2026-11-10')).toBe('10.11.2026');
    expect(formatDateLong('2026-11-10')).toBe('Di., 10.11.2026');
    expect(formatMonth('2026-11-10')).toBe('November 2026');
  });

  it('liest Stunden mit Komma oder Punkt', () => {
    expect(parseHours('38,5')).toBe(2310);
    expect(parseHours('7.75')).toBe(465);
    expect(parseHours(-2)).toBe(-120);
    expect(parseHours('')).toBeNull();
    expect(parseHours('abc')).toBeNull();
  });
});
