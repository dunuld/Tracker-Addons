import { describe, expect, it } from 'vitest';
import type { Transaction, TransactionType } from '../../shared/api-types.js';
import { computeOverview, type PortfolioInput } from '../src/portfolio.js';

const WORLD = 'IE00B4L5Y983';
const MSFT = 'US5949181045';

let nextId = 1;
function tx(
  type: TransactionType,
  date: string,
  isin: string,
  quantity: number,
  values: Partial<Transaction> = {},
): Transaction {
  const grossCents = values.grossCents ?? 0;
  const feeCents = values.feeCents ?? 0;
  const taxCents = values.taxCents ?? 0;
  const totalCents =
    values.totalCents ??
    (type === 'sell' || type === 'dividend'
      ? grossCents - feeCents - taxCents
      : grossCents + feeCents);
  return {
    id: nextId++,
    documentId: null,
    type,
    date,
    isin,
    name: isin,
    quantity,
    price: 0,
    grossCents,
    feeCents,
    taxCents,
    totalCents,
  };
}

function input(overrides: Partial<PortfolioInput>): PortfolioInput {
  return {
    year: 2026,
    today: '2026-07-01',
    transactions: [],
    prices: [],
    securities: [
      { isin: WORLD, name: 'MSCI World', priceEntity: null },
      { isin: MSFT, name: 'Microsoft', priceEntity: 'sensor.msft' },
    ],
    statement: [],
    exemptionCents: 100000,
    ...overrides,
  };
}

describe('computeOverview', () => {
  it('liefert für ein leeres Depot Nullwerte und das aktuelle Jahr', () => {
    const overview = computeOverview(input({}));
    expect(overview).toMatchObject({
      year: 2026,
      years: [2026],
      asOf: '2026-07-01',
      investedGrossCents: 0,
      valueCents: 0,
      gainPct: null,
      ytdGainPct: null,
      positions: [],
      warnings: [],
    });
    expect(overview.monthly).toHaveLength(12);
  });

  it('berechnet Investition, FIFO-Gewinn, Dividenden und Kursgewinne', () => {
    const overview = computeOverview(
      input({
        transactions: [
          // Vorjahr: 10 Stück zu 50 € + 5 € Gebühr
          tx('buy', '2025-03-01', WORLD, 10, { grossCents: 50000, feeCents: 500 }),
          // dieses Jahr: 10 Stück zu 60 € + 5 € Gebühr
          tx('buy', '2026-02-10', WORLD, 10, { grossCents: 60000, feeCents: 500 }),
          // Verkauf 15 Stück zu 70 € − 10 € Gebühr, 30 € Steuer
          tx('sell', '2026-05-05', WORLD, 15, {
            grossCents: 105000,
            feeCents: 1000,
            taxCents: 3000,
          }),
          tx('dividend', '2026-06-12', MSFT, 20, { grossCents: 1000, taxCents: 250 }),
          tx('opening', '2020-01-01', MSFT, 20, { totalCents: 400000 }),
        ],
        prices: [
          { isin: WORLD, date: '2025-12-30', price: 55, source: 'document' },
          { isin: WORLD, date: '2026-06-30', price: 72, source: 'document' },
          { isin: WORLD, date: '2026-06-30', price: 80, source: 'manual' },
          { isin: WORLD, date: '2026-12-01', price: 999, source: 'manual' },
          { isin: MSFT, date: '2025-12-31', price: 300, source: 'document' },
          { isin: MSFT, date: '2026-06-01', price: 330, source: 'ha' },
        ],
      }),
    );

    // Käufe im Jahr: 605 €; Verkaufserlös nach Gebühren: 1.040 €
    expect(overview.investedGrossCents).toBe(60500);
    expect(overview.investedNetCents).toBe(60500 - 104000);
    expect(overview.feesCents).toBe(1500);
    // FIFO: 10 × 50,50 + 5 × 60,50 = 807,50 € Einstand → 1.040 − 807,50 = 232,50 €
    expect(overview.realizedCents).toBe(23250);
    expect(overview.dividendsGrossCents).toBe(1000);
    expect(overview.dividendsNetCents).toBe(750);
    expect(overview.taxesCents).toBe(3250);
    expect(overview.exemptionUsedCents).toBe(24250);
    expect(overview.years).toEqual([2026, 2025, 2020]);

    const [msft, world] = overview.positions;
    expect(world).toMatchObject({
      quantity: 5,
      costCents: 30250,
      price: 80, // manueller Kurs schlägt den Dokumentkurs desselben Tages
      priceSource: 'manual',
      valueCents: 40000,
      gainCents: 9750,
      gainPct: 32.23,
      // 400 + 1.040 − (10 × 55 + 605) = 285 €
      ytdGainCents: 28500,
      realizedCents: 23250,
    });
    expect(msft).toMatchObject({
      quantity: 20,
      priceEntity: 'sensor.msft',
      priceSource: 'ha',
      valueCents: 660000,
      gainCents: 260000,
      gainPct: 65,
      ytdGainCents: 60000,
      ytdGainPct: 10,
      dividendsNetCents: 750,
    });
    expect(overview.valueCents).toBe(700000);
    expect(overview.gainCents).toBe(269750);
    expect(overview.ytdGainCents).toBe(88500);
    expect(overview.monthly[1]).toMatchObject({ month: 2, investedCents: 60500 });
    expect(overview.monthly[4]!.realizedCents).toBe(23250);
    expect(overview.monthly[5]!.dividendsNetCents).toBe(750);
    expect(overview.warnings).toEqual([]);
  });

  it('bewertet vergangene Jahre zum 31.12. und ignoriert spätere Buchungen', () => {
    const overview = computeOverview(
      input({
        year: 2025,
        transactions: [
          tx('buy', '2025-03-01', WORLD, 10, { grossCents: 50000 }),
          tx('buy', '2026-02-10', WORLD, 10, { grossCents: 60000 }),
        ],
        prices: [
          { isin: WORLD, date: '2025-12-30', price: 55, source: 'document' },
          { isin: WORLD, date: '2026-06-30', price: 72, source: 'document' },
        ],
      }),
    );
    expect(overview.asOf).toBe('2025-12-31');
    expect(overview.investedGrossCents).toBe(50000);
    expect(overview.positions[0]).toMatchObject({
      quantity: 10,
      valueCents: 55000,
      ytdGainCents: 5000,
    });
  });

  it('warnt bei fehlenden Kursen und rechnet ersatzweise mit dem Einstandswert', () => {
    const overview = computeOverview(
      input({ transactions: [tx('buy', '2025-03-01', WORLD, 10, { grossCents: 50000 })] }),
    );
    expect(overview.positions[0]).toMatchObject({
      price: null,
      valueCents: 50000,
      gainCents: 0,
      ytdGainCents: 0,
    });
    expect(overview.warnings).toEqual([
      expect.stringContaining('kein Kurs bekannt'),
      expect.stringContaining('fehlt ein Kurs zum 31.12.2025'),
    ]);
  });

  it('warnt bei Verkäufen ohne bekannten Kauf und zählt nur den gedeckten Teil', () => {
    const overview = computeOverview(
      input({
        transactions: [
          tx('buy', '2026-01-10', WORLD, 4, { grossCents: 40000 }),
          tx('sell', '2026-03-01', WORLD, 10, { grossCents: 150000 }),
        ],
      }),
    );
    // 4 von 10 Stück gedeckt: 600 € Erlös − 400 € Einstand
    expect(overview.realizedCents).toBe(20000);
    expect(overview.positions[0]).toMatchObject({ quantity: 0, valueCents: 0, costCents: 0 });
    expect(overview.warnings[0]).toMatch(/am 01\.03\.2026: Für 6 Stück fehlt der Kauf/);
  });

  it('blendet vollständig verkaufte Positionen aus Vorjahren aus', () => {
    const overview = computeOverview(
      input({
        transactions: [
          tx('buy', '2024-01-10', WORLD, 4, { grossCents: 40000 }),
          tx('sell', '2025-03-01', WORLD, 4, { grossCents: 50000 }),
        ],
      }),
    );
    expect(overview.positions).toEqual([]);
    expect(overview.realizedCents).toBe(0);
  });

  it('vergleicht den Bestand mit dem jüngsten Depotauszug', () => {
    const transactions = [
      tx('buy', '2025-03-01', WORLD, 10, { grossCents: 50000 }),
      tx('sell', '2025-06-01', WORLD, 2, { grossCents: 12000 }),
      tx('dividend', '2025-07-01', WORLD, 8, { grossCents: 100 }),
    ];
    const prices = [{ isin: WORLD, date: '2025-12-31', price: 55, source: 'document' as const }];
    const check = (statement: PortfolioInput['statement']) =>
      computeOverview(input({ transactions, prices, statement })).warnings;

    expect(check([{ date: '2025-12-31', isin: WORLD, quantity: 8 }])).toEqual([]);
    expect(check([{ date: '2027-12-31', isin: WORLD, quantity: 99 }])).toEqual([]);
    expect(check([{ date: '2025-12-31', isin: MSFT, quantity: 20 }])).toEqual([
      expect.stringContaining('20 Stück Microsoft, aus den Abrechnungen ergeben sich 0'),
    ]);
  });
});
