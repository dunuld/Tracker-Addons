import type {
  MonthlyFigures,
  Overview,
  Position,
  PriceSource,
  Transaction,
} from '../../shared/api-types.js';

export interface PriceRow {
  isin: string;
  date: string;
  price: number;
  source: PriceSource;
}

export interface SecurityRow {
  isin: string;
  name: string;
  priceEntity: string | null;
}

/** Bestand laut Depotauszug – dient nur zur Plausibilitätsprüfung. */
export interface StatementRow {
  date: string;
  isin: string;
  quantity: number;
}

export interface PortfolioInput {
  year: number;
  /** ISO-Datum von „heute“ */
  today: string;
  transactions: Transaction[];
  prices: PriceRow[];
  securities: SecurityRow[];
  /** Positionen des jüngsten Depotauszugs */
  statement: StatementRow[];
  exemptionCents: number;
}

interface Lot {
  quantity: number;
  costCents: number;
}

interface State {
  lots: Lot[];
  buysCents: number;
  sellsCents: number;
  realizedCents: number;
  dividendsNetCents: number;
  startQuantity: number;
  startCostCents: number;
}

const EPSILON = 1e-9;
const SOURCE_RANK: Record<PriceSource, number> = { document: 0, ha: 1, manual: 2 };

const pct = (gain: number, base: number): number | null =>
  base > 0 ? Math.round((gain / base) * 10000) / 100 : null;

const quantityOf = (lots: Lot[]): number => lots.reduce((sum, lot) => sum + lot.quantity, 0);
const costOf = (lots: Lot[]): number => lots.reduce((sum, lot) => sum + lot.costCents, 0);

const formatQuantity = (quantity: number): string =>
  quantity.toLocaleString('de-DE', { maximumFractionDigits: 6 });

/** `2026-03-15` → `15.03.2026` */
const formatDate = (iso: string): string => iso.split('-').reverse().join('.');

/** Stückzahl einer ISIN zum Datum (einschließlich), allein aus den Buchungen. */
function quantityAt(transactions: Transaction[], isin: string, date: string): number {
  let quantity = 0;
  for (const tx of transactions) {
    if (tx.isin !== isin || tx.date > date) continue;
    if (tx.type === 'buy' || tx.type === 'opening') quantity += tx.quantity;
    else if (tx.type === 'sell') quantity -= tx.quantity;
  }
  return quantity;
}

/**
 * Berechnet die Jahresübersicht: Bestände und Einstandswerte nach FIFO, realisierte Gewinne,
 * Dividenden sowie Kursgewinne seit Kauf und seit Jahresbeginn.
 */
export function computeOverview(input: PortfolioInput): Overview {
  const currentYear = Number(input.today.slice(0, 4));
  const year = input.year;
  const start = `${year}-01-01`;
  const previousEnd = `${year - 1}-12-31`;
  const asOf = year < currentYear ? `${year}-12-31` : input.today;
  const warnings: string[] = [];

  const names = new Map(input.securities.map((s) => [s.isin, s]));
  const nameOf = (isin: string): string => names.get(isin)?.name ?? isin;

  const prices = [...input.prices].sort(
    (a, b) => a.date.localeCompare(b.date) || SOURCE_RANK[a.source] - SOURCE_RANK[b.source],
  );
  const priceAt = (isin: string, date: string): PriceRow | null => {
    let found: PriceRow | null = null;
    for (const price of prices) {
      if (price.date > date) break;
      if (price.isin === isin) found = price;
    }
    return found;
  };

  const transactions = [...input.transactions]
    .filter((tx) => tx.date <= asOf)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

  const states = new Map<string, State>();
  const stateOf = (isin: string): State => {
    let state = states.get(isin);
    if (!state) {
      state = {
        lots: [],
        buysCents: 0,
        sellsCents: 0,
        realizedCents: 0,
        dividendsNetCents: 0,
        startQuantity: 0,
        startCostCents: 0,
      };
      states.set(isin, state);
    }
    return state;
  };

  const monthly: MonthlyFigures[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    investedCents: 0,
    dividendsNetCents: 0,
    realizedCents: 0,
  }));
  const monthOf = (date: string): MonthlyFigures => monthly[Number(date.slice(5, 7)) - 1]!;

  const totals = {
    investedGrossCents: 0,
    investedNetCents: 0,
    feesCents: 0,
    realizedCents: 0,
    dividendsGrossCents: 0,
    dividendsNetCents: 0,
    taxesCents: 0,
  };

  let snapshotTaken = false;
  const takeSnapshot = (): void => {
    snapshotTaken = true;
    for (const state of states.values()) {
      state.startQuantity = quantityOf(state.lots);
      state.startCostCents = costOf(state.lots);
    }
  };

  for (const tx of transactions) {
    const inYear = tx.date >= start;
    if (inYear && !snapshotTaken) takeSnapshot();
    const state = stateOf(tx.isin);

    if (tx.type === 'buy' || tx.type === 'opening') {
      state.lots.push({ quantity: tx.quantity, costCents: tx.totalCents });
      if (inYear) {
        state.buysCents += tx.totalCents;
        totals.investedGrossCents += tx.totalCents;
        totals.investedNetCents += tx.totalCents;
        totals.feesCents += tx.feeCents;
        monthOf(tx.date).investedCents += tx.totalCents;
      }
    } else if (tx.type === 'sell') {
      const proceedsCents = tx.grossCents - tx.feeCents;
      let remaining = tx.quantity;
      let costCents = 0;
      while (remaining > EPSILON && state.lots.length > 0) {
        const lot = state.lots[0]!;
        if (lot.quantity <= remaining + EPSILON) {
          costCents += lot.costCents;
          remaining -= lot.quantity;
          state.lots.shift();
        } else {
          const part = Math.round(lot.costCents * (remaining / lot.quantity));
          costCents += part;
          lot.costCents -= part;
          lot.quantity -= remaining;
          remaining = 0;
        }
      }
      const covered = remaining > EPSILON ? (tx.quantity - remaining) / tx.quantity : 1;
      if (remaining > EPSILON) {
        warnings.push(
          `Verkauf von ${nameOf(tx.isin)} am ${formatDate(tx.date)}: Für ${formatQuantity(remaining)} Stück ` +
            'fehlt der Kauf. Bitte ältere Kaufabrechnungen importieren oder einen Startbestand ' +
            'erfassen – der Gewinn dieser Stücke ist nicht berücksichtigt.',
        );
      }
      const realizedCents = Math.round(proceedsCents * covered) - costCents;
      if (inYear) {
        state.sellsCents += proceedsCents;
        state.realizedCents += realizedCents;
        totals.realizedCents += realizedCents;
        totals.investedNetCents -= proceedsCents;
        totals.feesCents += tx.feeCents;
        totals.taxesCents += tx.taxCents;
        monthOf(tx.date).realizedCents += realizedCents;
      }
    } else if (inYear) {
      state.dividendsNetCents += tx.totalCents;
      totals.dividendsGrossCents += tx.grossCents;
      totals.dividendsNetCents += tx.totalCents;
      totals.taxesCents += tx.taxCents;
      monthOf(tx.date).dividendsNetCents += tx.totalCents;
    }
  }
  // Keine Buchung im Jahr: der Bestand zum Stichtag ist zugleich der Anfangsbestand
  if (!snapshotTaken) takeSnapshot();

  const positions: Position[] = [];
  for (const [isin, state] of states) {
    const quantity = quantityOf(state.lots);
    const held = quantity > EPSILON;
    const costCents = held ? costOf(state.lots) : 0;
    const price = held ? priceAt(isin, asOf) : null;
    if (held && !price) {
      warnings.push(`Für ${nameOf(isin)} ist kein Kurs bekannt – bewertet zum Einstandswert.`);
    }
    const valueCents = price ? Math.round(quantity * price.price * 100) : costCents;

    let startValueCents = 0;
    if (state.startQuantity > EPSILON) {
      const startPrice = priceAt(isin, previousEnd);
      if (startPrice) {
        startValueCents = Math.round(state.startQuantity * startPrice.price * 100);
      } else {
        startValueCents = state.startCostCents;
        warnings.push(
          `Für ${nameOf(isin)} fehlt ein Kurs zum ${formatDate(previousEnd)} – der Kursgewinn seit ` +
            'Jahresbeginn rechnet ersatzweise mit dem Einstandswert. Der Jahresdepotauszug ' +
            'liefert diesen Kurs.',
        );
      }
    }
    const ytdBase = startValueCents + state.buysCents;
    const ytdGainCents = valueCents + state.sellsCents - ytdBase;
    const active =
      held || state.realizedCents !== 0 || state.dividendsNetCents !== 0 || state.sellsCents !== 0;
    if (!active) continue;

    positions.push({
      isin,
      name: nameOf(isin),
      quantity: held ? Math.round(quantity * 1e6) / 1e6 : 0,
      costCents,
      price: price?.price ?? null,
      priceDate: price?.date ?? null,
      priceSource: price?.source ?? null,
      priceEntity: names.get(isin)?.priceEntity ?? null,
      valueCents,
      gainCents: valueCents - costCents,
      gainPct: pct(valueCents - costCents, costCents),
      ytdGainCents,
      ytdGainPct: pct(ytdGainCents, ytdBase),
      realizedCents: state.realizedCents,
      dividendsNetCents: state.dividendsNetCents,
    });
  }
  positions.sort((a, b) => b.valueCents - a.valueCents || a.name.localeCompare(b.name, 'de'));

  for (const row of input.statement) {
    if (row.date > asOf) continue;
    const computed = quantityAt(input.transactions, row.isin, row.date);
    if (Math.abs(computed - row.quantity) > 1e-4) {
      warnings.push(
        `Depotauszug vom ${formatDate(row.date)}: ${formatQuantity(row.quantity)} Stück ${nameOf(row.isin)}, ` +
          `aus den Abrechnungen ergeben sich ${formatQuantity(computed)}. Es fehlen Abrechnungen ` +
          'oder ein Startbestand.',
      );
    }
  }

  const sum = (pick: (p: Position) => number): number =>
    positions.reduce((total, p) => total + pick(p), 0);
  const valueCents = sum((p) => p.valueCents);
  const costCents = sum((p) => p.costCents);
  const ytdGainCents = sum((p) => p.ytdGainCents);
  const ytdBaseCents =
    sum((p) => p.valueCents - p.ytdGainCents) +
    [...states.values()].reduce((t, s) => t + s.sellsCents, 0);

  const years = new Set(input.transactions.map((tx) => Number(tx.date.slice(0, 4))));
  years.add(currentYear);

  return {
    year,
    years: [...years].sort((a, b) => b - a),
    asOf,
    ...totals,
    valueCents,
    costCents,
    gainCents: valueCents - costCents,
    gainPct: pct(valueCents - costCents, costCents),
    ytdGainCents,
    ytdGainPct: pct(ytdGainCents, ytdBaseCents),
    exemptionCents: input.exemptionCents,
    exemptionUsedCents: Math.max(0, totals.dividendsGrossCents + totals.realizedCents),
    positions,
    monthly,
    warnings: [...new Set(warnings)],
  };
}
