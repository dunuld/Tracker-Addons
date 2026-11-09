import { Component, computed, signal, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccountService } from '../../core/account.service.js';
import { ApiService } from '../../core/api.service.js';
import { formatEuro as fmtEuro, formatMonthYear as fmtMonthYear } from '../../core/format.js';
import AccountSelectComponent from '../../shared/account-select.component.js';
import ChartComponent from '../../shared/chart.component.js';
import type { MonthlyReport } from '../../../../shared/api-types';

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [RouterLink, ChartComponent, AccountSelectComponent],
  template: `
    <div class="page-header">
      <h2>Monatsübersicht</h2>
      <app-account-select />
      <div class="month-nav">
        <button
          class="btn-icon"
          (click)="prevMonth()"
          [disabled]="loading()"
          aria-label="Vorheriger Monat"
        >
          ‹
        </button>
        <span class="month-label">{{ formatMonthYear(currentYear(), currentMonth()) }}</span>
        <button
          class="btn-icon"
          (click)="nextMonth()"
          [disabled]="loading()"
          aria-label="Nächster Monat"
        >
          ›
        </button>
      </div>
    </div>

    @if (loading()) {
      <p class="loading">Lade Daten …</p>
    } @else if (report()) {
      <div class="summary-cards">
        <div class="card income">
          <span class="card-label">Einnahmen</span>
          <span class="card-value">{{ formatEuro(report()!.incomeCents) }}</span>
        </div>
        <div class="card expense">
          <span class="card-label">Ausgaben</span>
          <span class="card-value">{{ formatEuro(report()!.expenseCents) }}</span>
        </div>
        <div class="card balance">
          <span class="card-label">Saldo</span>
          <span class="card-value">{{ formatEuro(report()!.balanceCents) }}</span>
        </div>
      </div>

      @if (report()!.accountBalances?.length) {
        <div class="balances bt-card">
          <h3>Kontostände zum Monatsende</h3>
          <ul>
            @for (b of report()!.accountBalances; track b.accountId) {
              <li>
                <span class="color-dot" [style.background]="b.color"></span>
                <span class="balance-name">
                  {{ b.name }}
                  @if (b.asOf !== currentYearMonth()) {
                    <span class="as-of">Stand {{ formatYearMonth(b.asOf) }}</span>
                  }
                </span>
                <span class="balance-value" [class.negative]="b.balanceCents < 0">{{
                  formatEuro(b.balanceCents)
                }}</span>
              </li>
            }
            @if (report()!.accountBalances.length > 1) {
              <li class="total">
                <span class="balance-name">Gesamt</span>
                <span class="balance-value" [class.negative]="report()!.totalBalanceCents! < 0">{{
                  formatEuro(report()!.totalBalanceCents!)
                }}</span>
              </li>
            }
          </ul>
        </div>
      }

      @if (expenseCategories().length > 0) {
        <div class="chart-section bt-card">
          <h3>Ausgaben nach Kategorie</h3>
          <div class="chart-container">
            <app-chart
              [type]="'doughnut'"
              [labels]="expenseCategories().map((c) => c.name)"
              [datasets]="[
                {
                  label: 'Ausgaben',
                  data: expenseCategories().map((c) => abs(c.totalCents)),
                  backgroundColor: expenseCategories().map((c) => c.color),
                },
              ]"
            />
          </div>
        </div>

        <div class="category-table bt-card table-scroll">
          <table>
            <thead>
              <tr>
                <th>Kategorie</th>
                <th class="text-right">Betrag</th>
                <th class="text-right">Buchungen</th>
              </tr>
            </thead>
            <tbody>
              @for (cat of expenseCategories(); track cat.categoryId) {
                <tr
                  class="clickable"
                  routerLink="transactions"
                  [queryParams]="{
                    year: currentYear(),
                    month: currentMonth(),
                    categoryId: cat.categoryId,
                  }"
                >
                  <td>
                    <span class="color-dot" [style.background]="cat.color"></span>
                    {{ cat.name }}
                  </td>
                  <td class="text-right">{{ formatEuro(cat.totalCents) }}</td>
                  <td class="text-right">{{ cat.count }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <p class="empty">Keine Ausgaben für diesen Monat.</p>
      }
    } @else {
      <p class="empty">Keine Daten verfügbar. Laden Sie einen Kontoauszug hoch.</p>
    }
  `,
  styles: `
    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .page-header h2 {
      margin: 0;
    }
    .month-nav {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .month-label {
      font-size: 1.1rem;
      font-weight: 500;
      min-width: 160px;
      text-align: center;
    }
    .btn-icon {
      width: 36px;
      height: 36px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      border-radius: 50%;
      font-size: 1.4rem;
      line-height: 1;
      cursor: pointer;
      color: var(--bt-text);
    }
    .btn-icon:hover:not(:disabled) {
      background: var(--bt-hover-btn);
    }
    .btn-icon:disabled {
      opacity: 0.4;
      cursor: default;
    }

    .summary-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 1rem;
      margin-bottom: 1rem;
    }
    .card {
      padding: 1rem;
      border-radius: var(--bt-radius);
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .card.income {
      background: var(--bt-card-income-bg);
    }
    .card.expense {
      background: var(--bt-card-expense-bg);
    }
    .card.balance {
      background: var(--bt-card-balance-bg);
    }
    .card-label {
      font-size: 0.85rem;
      color: var(--bt-text-secondary);
    }
    .card-value {
      font-size: 1.4rem;
      font-weight: 600;
      color: var(--bt-text);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .chart-section h3,
    .balances h3 {
      margin: 0 0 1rem;
    }
    .balances ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .balances li {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0;
      border-bottom: 1px solid var(--bt-border);
    }
    .balances li:last-child {
      border-bottom: none;
    }
    .balances .color-dot {
      margin-right: 0;
      flex: none;
    }
    .balance-name {
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .as-of {
      display: block;
      font-size: 0.75rem;
      color: var(--bt-text-muted);
    }
    .balance-value {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .balance-value.negative {
      color: var(--bt-error-text);
    }
    .balances li.total {
      font-weight: 600;
    }
    .chart-container {
      max-width: 400px;
      margin: 0 auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
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
    }
    .text-right {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .clickable {
      cursor: pointer;
    }
    .clickable:hover {
      background: var(--bt-row-hover);
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
      .page-header {
        margin-bottom: 1rem;
      }
      .month-nav {
        width: 100%;
        justify-content: space-between;
      }
      .month-label {
        min-width: 0;
      }
      .summary-cards {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.5rem;
      }
      .card {
        padding: 0.75rem 0.5rem;
        text-align: center;
      }
      .card-label {
        font-size: 0.75rem;
      }
      .card-value {
        font-size: 0.95rem;
        white-space: normal;
        overflow-wrap: anywhere;
      }
      th,
      td {
        padding: 0.5rem 0.6rem;
      }
    }
  `,
})
export default class OverviewComponent {
  private readonly api = inject(ApiService);
  private readonly accounts = inject(AccountService);

  readonly currentYear = signal(new Date().getFullYear());
  readonly currentMonth = signal(new Date().getMonth() + 1);
  readonly loading = signal(false);
  readonly report = signal<MonthlyReport | null>(null);

  readonly expenseCategories = computed(() => {
    const r = this.report();
    if (!r) return [];
    return r.categories.filter((c) => c.kind === 'expense' && c.totalCents !== 0);
  });

  readonly abs = Math.abs;

  readonly currentYearMonth = computed(
    () => `${this.currentYear()}-${String(this.currentMonth()).padStart(2, '0')}`,
  );

  formatYearMonth(yearMonth: string): string {
    const [year, month] = yearMonth.split('-').map(Number);
    return fmtMonthYear(year!, month!);
  }

  formatEuro(cents: number): string {
    return fmtEuro(cents);
  }

  formatMonthYear(year: number, month: number): string {
    return fmtMonthYear(year, month);
  }

  constructor() {
    this.load();
    this.accounts.onSelectionChange(() => this.load());
  }

  load() {
    this.loading.set(true);
    const accountId = this.accounts.selectedId();
    this.api.monthlyReport(this.currentYear(), this.currentMonth(), accountId).subscribe({
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

  prevMonth() {
    let m = this.currentMonth() - 1;
    let y = this.currentYear();
    if (m < 1) {
      m = 12;
      y--;
    }
    this.currentMonth.set(m);
    this.currentYear.set(y);
    this.load();
  }

  nextMonth() {
    let m = this.currentMonth() + 1;
    let y = this.currentYear();
    if (m > 12) {
      m = 1;
      y++;
    }
    this.currentMonth.set(m);
    this.currentYear.set(y);
    this.load();
  }
}
