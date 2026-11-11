import { describe, expect, it } from 'vitest';
import { DocumentParseError, parseDecimal, parseIngDocument } from '../src/ing-parser.js';
import {
  BUY_LINES,
  DIVIDEND_LINES,
  EUR_DIVIDEND_LINES,
  SELL_LINES,
  STATEMENT_LINES,
  tradeLines,
} from './fixtures.js';

describe('parseDecimal', () => {
  it('liest deutsche Zahlen', () => {
    expect(parseDecimal('1.234,5678')).toBe(1234.5678);
    expect(parseDecimal('3,00000')).toBe(3);
    expect(parseDecimal('42')).toBe(42);
  });
});

describe('Wertpapierabrechnung', () => {
  it('liest einen Kauf samt Gebühren', () => {
    expect(parseIngDocument(BUY_LINES)).toEqual({
      type: 'buy',
      isin: 'IE00B4L5Y983',
      wkn: 'A0RPWH',
      name: 'iShs Core MSCI World U.ETF',
      date: '2026-03-15',
      reference: '12345678.001',
      quantity: 3,
      price: 56.768,
      grossCents: 17030,
      feeCents: 298,
      taxCents: 0,
      totalCents: 17328,
    });
  });

  it('erkennt Sparplan-Käufe mit Bruchstücken, auch wenn Art und Titel in einer Zeile stehen', () => {
    const lines = tradeLines({ quantity: '0,87654', gross: '50,00', fee: '0,00', total: '50,00' })
      .filter((line) => line !== 'Kauf' && !line.startsWith('Kurs EUR'))
      .map((line) =>
        line === 'Wertpapierabrechnung' ? 'Wertpapierabrechnung Kauf aus Sparplan' : line,
      );
    const doc = parseIngDocument(lines);
    expect(doc).toMatchObject({ type: 'buy', quantity: 0.87654, feeCents: 0 });
    // Ohne Kurszeile wird der Kurs aus Kurswert und Stückzahl berechnet
    expect(doc.type === 'buy' && doc.price).toBeCloseTo(57.0425, 3);
  });

  it('liest einen Verkauf mit Steuern und leitet die Gebühren ab', () => {
    expect(parseIngDocument(SELL_LINES)).toMatchObject({
      type: 'sell',
      date: '2026-06-20',
      quantity: 2,
      price: 80,
      grossCents: 16000,
      feeCents: 490,
      taxCents: 1055,
      totalCents: 14455,
    });
  });

  it('behandelt eine Steuererstattung als negative Steuer', () => {
    const lines = tradeLines({
      kind: 'Verkauf',
      gross: '100,00',
      fee: '4,90',
      total: '105,10',
      quantity: '1,00',
    });
    lines.splice(-2, 0, 'Steuererstattung EUR 10,00');
    expect(parseIngDocument(lines)).toMatchObject({ feeCents: 490, taxCents: -1000 });
  });

  it('nutzt das Datum der Abrechnung, wenn der Ausführungstag fehlt', () => {
    const lines = BUY_LINES.filter((line) => !line.startsWith('Ausführungstag'));
    expect(parseIngDocument([...lines, 'Datum 16.03.2026'])).toMatchObject({ date: '2026-03-16' });
  });

  it('meldet fehlende Pflichtfelder verständlich', () => {
    const without = (prefix: string) => BUY_LINES.filter((line) => !line.startsWith(prefix));
    expect(() => parseIngDocument(without('Kurswert'))).toThrow(/Kurswert/);
    expect(() => parseIngDocument(without('ISIN'))).toThrow(/ISIN/);
    expect(() => parseIngDocument(without('Nominale'))).toThrow(/Stückzahl/);
    expect(() => parseIngDocument(without('Ausführungstag'))).toThrow(DocumentParseError);
    expect(() =>
      parseIngDocument(BUY_LINES.map((l) => l.replace('15.03.2026', '31.02.2026'))),
    ).toThrow(/Ausführungstag/);
  });

  it('lehnt andere Abrechnungsarten ab', () => {
    const lines = BUY_LINES.map((line) => (line === 'Kauf' ? 'Einbuchung' : line));
    expect(() => parseIngDocument(lines)).toThrow(/weder Kauf noch Verkauf/);
  });

  it('nimmt die ISIN als Namen, wenn die Bezeichnung fehlt', () => {
    const lines = BUY_LINES.filter((line) => !line.startsWith('Wertpapierbezeichnung')).map((l) =>
      l.startsWith('ISIN') ? 'ISIN IE00B4L5Y983' : l,
    );
    expect(parseIngDocument(lines)).toMatchObject({ name: 'IE00B4L5Y983', wkn: null });
  });
});

describe('Ertragsabrechnung', () => {
  it('rechnet Fremdwährungsdividenden in EUR', () => {
    expect(parseIngDocument(DIVIDEND_LINES)).toEqual({
      type: 'dividend',
      isin: 'US5949181045',
      wkn: '870747',
      name: 'Microsoft Corp.',
      date: '2026-06-12',
      reference: null,
      quantity: 20,
      grossCents: 915,
      taxCents: 137,
      totalCents: 778,
    });
  });

  it('liest EUR-Erträge mit deutscher Steuer', () => {
    expect(parseIngDocument(EUR_DIVIDEND_LINES)).toMatchObject({
      date: '2026-05-12',
      grossCents: 7700,
      taxCents: 2030,
      totalCents: 5670,
    });
  });

  it('meldet einen fehlenden Gesamtbetrag', () => {
    expect(() => parseIngDocument(DIVIDEND_LINES.slice(0, -1))).toThrow(/Gesamtbetrag/);
  });
});

describe('Depotauszug', () => {
  it('liest Positionen mit Stückzahl und gegengeprüftem Kurs', () => {
    expect(parseIngDocument(STATEMENT_LINES)).toEqual({
      type: 'statement',
      date: '2025-12-31',
      reference: null,
      positions: [
        { isin: 'IE00B4L5Y983', name: 'iShs Core MSCI World U.ETF', quantity: 10, price: 50 },
        { isin: 'US5949181045', name: 'Microsoft Corp.', quantity: 20, price: 400 },
      ],
    });
  });

  it('findet die Stückzahl auch in Nachbarzeilen und lässt unsichere Kurse weg', () => {
    const doc = parseIngDocument([
      'Depotauszug vom 30.06.2026',
      'Stück 12,5',
      'DE0008404005',
      'Kurs 250,00 EUR',
      'Ohne Stückzahl US5949181045',
    ]);
    expect(doc).toMatchObject({
      date: '2026-06-30',
      positions: [{ isin: 'DE0008404005', name: 'DE0008404005', quantity: 12.5, price: null }],
    });
  });

  it('meldet einen Auszug ohne Positionen', () => {
    expect(() => parseIngDocument(['Depotauszug per 31.12.2025'])).toThrow(/keine Positionen/);
    expect(() => parseIngDocument(['Depotauszug'])).toThrow(/Stichtag/);
  });
});

describe('Dokumentart', () => {
  it('lehnt unbekannte Dokumente ab', () => {
    expect(() => parseIngDocument(['Kontoauszug', 'Girokonto'])).toThrow(/Unbekannte Dokumentart/);
  });
});
