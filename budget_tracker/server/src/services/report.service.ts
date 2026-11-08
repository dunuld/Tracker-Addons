import type { DatabaseSync } from 'node:sqlite';
import { accountScope } from '../accounts.js';
import { monthStart, nextMonthStart } from '../month.js';
import type {
  CategoryKind,
  CategoryTotal,
  MonthlyReport,
  TrendMonth,
  TrendReport,
} from '../../../shared/api-types.js';

/**
 * Berechnet Monats- und Trendberichte aus den gespeicherten Transaktionen.
 * Umbuchungen (kind = 'transfer') werden ausgeschlossen.
 * Ohne `accountId` fließen alle Konten mit `include_in_reports = 1` ein.
 */
export class ReportService {
  constructor(private readonly db: DatabaseSync) {}

  /** Monatsübersicht: Einnahmen, Ausgaben, Saldo und Summen je Kategorie. */
  monthly(year: number, month: number, accountId?: number): MonthlyReport {
    const scope = accountScope(accountId);
    const categories = this.db
      .prepare(
        `SELECT c.id, c.name, c.color, c.kind,
                COALESCE(SUM(t.amount_cents), 0) AS total_cents,
                COUNT(t.id) AS count
         FROM categories c
         LEFT JOIN transactions t ON t.category_id = c.id
           AND t.booking_date >= ? AND t.booking_date < ?
           AND ${scope.sql}
         WHERE c.kind != 'transfer'
         GROUP BY c.id
         ORDER BY c.sort, c.name`,
      )
      .all(monthStart(year, month), nextMonthStart(year, month), ...scope.params) as {
      id: number;
      name: string;
      color: string;
      kind: CategoryKind;
      total_cents: number;
      count: number;
    }[];

    let incomeCents = 0;
    let expenseCents = 0;
    const categoryTotals: CategoryTotal[] = categories.map((row) => {
      const totalCents = Number(row['total_cents']);
      if (row.kind === 'income') incomeCents += totalCents;
      else if (row.kind === 'expense') expenseCents += totalCents;
      return {
        categoryId: Number(row['id']),
        name: row.name,
        color: row.color,
        kind: row.kind,
        totalCents,
        count: Number(row['count']),
      };
    });

    return {
      year,
      month,
      incomeCents,
      expenseCents,
      balanceCents: incomeCents + expenseCents,
      categories: categoryTotals,
    };
  }

  /**
   * Trend über mehrere Monate: gestapelte Ausgaben je Kategorie.
   * from/to im Format `YYYY-MM`.
   */
  trend(from: string, to: string, accountId?: number): TrendReport {
    const scope = accountScope(accountId);
    // Kategorien laden (ohne Umbuchungen)
    const categories = this.db
      .prepare(
        "SELECT id, name, color, kind FROM categories WHERE kind != 'transfer' ORDER BY sort, name",
      )
      .all() as { id: number; name: string; color: string; kind: CategoryKind }[];

    // Statement einmal vorbereiten statt je Monat
    const totalsStmt = this.db.prepare(
      `SELECT t.category_id, SUM(t.amount_cents) AS total_cents
       FROM transactions t
       WHERE t.booking_date >= ? AND t.booking_date < ?
         AND ${scope.sql}
       GROUP BY t.category_id
       HAVING total_cents != 0`,
    );

    const months: TrendMonth[] = [];
    let [year, month] = from.split('-').map(Number);
    for (let current = from; current <= to;) {
      const next = nextMonthStart(year, month);
      const totals = totalsStmt.all(monthStart(year, month), next, ...scope.params) as {
        category_id: number;
        total_cents: number;
      }[];
      months.push({
        month: current,
        totals: totals.map((t) => ({
          categoryId: Number(t.category_id),
          totalCents: Number(t.total_cents),
        })),
      });
      current = next.slice(0, 7);
      [year, month] = current.split('-').map(Number);
    }

    return { from, to, categories, months };
  }
}
