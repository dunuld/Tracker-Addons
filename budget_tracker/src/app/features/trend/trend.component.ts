import { Component, computed, signal, inject } from '@angular/core';
import { AccountService } from '../../core/account.service.js';
import { ApiService } from '../../core/api.service.js';
import { formatMonthYear as fmtMonthYear } from '../../core/format.js';
import AccountSelectComponent from '../../shared/account-select.component.js';
import ChartComponent from '../../shared/chart.component.js';
import type { TooltipItem } from 'chart.js';
import type { TrendMonth, TrendReport } from '../../../../shared/api-types';

@Component({
  selector: 'app-trend',
  standalone: true,
  imports: [ChartComponent, AccountSelectComponent],
  template: `
    <h2>Verlauf</h2>
    <div class="range-selector">
      <app-account-select />
      <label>
        Von
        <input type="month" [value]="fromMonth()" (change)="onFromChange($event)" />
      </label>
      <label>
        Bis
        <input type="month" [value]="toMonth()" (change)="onToChange($event)" />
      </label>
      <button class="btn-primary" (click)="load()" [disabled]="loading()">Anzeigen</button>
    </div>

    @if (loading()) {
      <p class="loading">Lade Daten …</p>
    } @else if (report()) {
      @if (chartDatasets().length > 0) {
        <div class="chart-section bt-card">
          <app-chart
            [type]="'bar'"
            [labels]="report()!.months.map((m) => formatMonthLabel(m.month))"
            [datasets]="chartDatasets()"
            [options]="chartOptions()"
          />
        </div>
      }

      <div class="trend-table bt-card table-scroll">
        <table>
          <thead>
            <tr>
              <th>Kategorie</th>
              @for (month of report()!.months; track month.month) {
                <th class="text-right">{{ formatMonthLabel(month.month) }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (cat of expenseCategories(); track cat.id) {
              <tr>
                <td>
                  <span class="color-dot" [style.background]="cat.color"></span>
                  {{ cat.name }}
                </td>
                @for (month of report()!.months; track month.month) {
                  <td class="text-right">{{ formatMonthCategoryTotal(month, cat.id) }}</td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <p class="empty">Wählen Sie einen Zeitraum aus.</p>
    }
  `,
  styles: `
    .range-selector {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
    }
    .range-selector label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.9rem;
    }
    .range-selector input {
      height: 36px;
      padding: 0 0.5rem;
      border: 1px solid var(--bt-border-input);
      border-radius: 8px;
      font-size: 0.9rem;
      color: var(--bt-text);
      background: var(--bt-surface);
    }
    .btn-primary {
      background: var(--bt-primary);
      color: var(--bt-text-on-primary);
      border: none;
      border-radius: 8px;
      height: 36px;
      padding: 0 1rem;
      font-weight: 500;
      cursor: pointer;
      font-size: 0.9rem;
    }
    .btn-primary:disabled {
      opacity: 0.5;
      cursor: default;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 600px;
    }
    th,
    td {
      padding: 0.6rem 0.8rem;
      text-align: left;
      border-bottom: 1px solid var(--bt-border);
    }
    th {
      font-size: 0.85rem;
      color: var(--bt-text-secondary);
      font-weight: 600;
      white-space: nowrap;
    }
    .text-right {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    td:first-child,
    th:first-child {
      position: sticky;
      left: 0;
      background: var(--bt-surface);
      white-space: nowrap;
    }
    .color-dot {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 0.5rem;
      vertical-align: middle;
    }

    .loading,
    .empty {
      color: var(--bt-text-muted);
      text-align: center;
      padding: 2rem;
    }

    @media (max-width: 600px) {
      .range-selector {
        gap: 0.5rem;
      }
      .range-selector label {
        flex: 1 1 140px;
      }
      .range-selector input {
        flex: 1;
        min-width: 0;
      }
      .btn-primary {
        flex: 1 1 100%;
      }
      th,
      td {
        padding: 0.5rem 0.6rem;
      }
    }
  `,
})
export default class TrendComponent {
  private readonly api = inject(ApiService);
  private readonly accounts = inject(AccountService);

  readonly fromMonth = signal(this.defaultFrom());
  readonly toMonth = signal(this.defaultTo());
  readonly loading = signal(false);
  readonly report = signal<TrendReport | null>(null);

  readonly expenseCategories = computed(() => {
    const r = this.report();
    if (!r) return [];
    return r.categories.filter((c) => c.kind === 'expense');
  });

  readonly chartDatasets = computed(() => {
    const cats = this.expenseCategories();
    const months = this.report()?.months ?? [];
    if (months.length === 0) return [];

    return cats.map((cat) => ({
      label: cat.name,
      data: months.map((m) => {
        const total = m.totals.find((t) => t.categoryId === cat.id);
        return total ? Math.abs(total.totalCents) : 0;
      }),
      backgroundColor: cat.color,
    }));
  });

  readonly chartOptions = computed(() => ({
    scales: {
      x: { stacked: true },
      y: { stacked: true, ticks: { callback: (value: number) => this.formatEuroTick(value) } },
    },
    plugins: {
      legend: { display: true, position: 'bottom' as const },
      tooltip: { callbacks: { label: (ctx: TooltipItem<'bar'>) => this.formatTooltip(ctx) } },
    },
  }));

  constructor() {
    this.load();
    this.accounts.onSelectionChange(() => this.load());
  }

  load() {
    const from = this.fromMonth();
    const to = this.toMonth();
    if (!from || !to) return;
    this.loading.set(true);
    this.api.trendReport(from, to, this.accounts.selectedId()).subscribe({
      next: (data) => {
        this.report.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.report.set(null);
        this.loading.set(false);
      },
    });
  }

  onFromChange(event: Event) {
    this.fromMonth.set((event.target as HTMLInputElement).value);
  }

  onToChange(event: Event) {
    this.toMonth.set((event.target as HTMLInputElement).value);
  }

  formatMonthLabel(monthStr: string): string {
    const [y, m] = monthStr.split('-').map(Number);
    return fmtMonthYear(y, m);
  }

  formatMonthCategoryTotal(month: TrendMonth, categoryId: number): string {
    const total = month.totals.find((t) => t.categoryId === categoryId);
    if (!total || total.totalCents === 0) return '—';
    return this.formatEuro(total.totalCents);
  }

  formatEuro(cents: number): string {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
      cents / 100,
    );
  }

  formatEuroTick(value: number): string {
    if (value === 0) return '0 €';
    if (value >= 100000) return `${(value / 100000).toFixed(1)}k €`;
    return `${(value / 100).toFixed(0)} €`;
  }

  formatTooltip(context: TooltipItem<'bar'>): string {
    const value = context.parsed.y ?? 0;
    return `${context.dataset.label}: ${this.formatEuro(value)}`;
  }

  private defaultFrom(): string {
    // Über Jahr/Monat rechnen: setMonth(-5) läuft am 29.–31. in den Folgemonat über.
    const now = new Date();
    const index = now.getFullYear() * 12 + now.getMonth() - 5;
    return yearMonth(Math.floor(index / 12), index % 12);
  }

  private defaultTo(): string {
    const now = new Date();
    return yearMonth(now.getFullYear(), now.getMonth());
  }
}

/** `YYYY-MM` aus Jahr und 0-basiertem Monat. */
function yearMonth(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}
