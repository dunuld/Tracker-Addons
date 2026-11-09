import { Component, signal, computed, effect, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { AccountService } from '../../core/account.service';
import { apiErrorMessage } from '../../core/api-error';
import { ApiService } from '../../core/api.service';
import { formatEuro, formatMonthYear } from '../../core/format';
import AccountSelectComponent from '../../shared/account-select.component';
import type { Category, Transaction, TransactionQuery } from '../../../../shared/api-types';

@Component({
  selector: 'app-transactions',
  imports: [DatePipe, AccountSelectComponent],
  templateUrl: './transactions.component.html',
  styleUrl: './transactions.component.css',
})
export default class TransactionsComponent {
  private api = inject(ApiService);
  readonly accounts = inject(AccountService);

  transactions = signal<Transaction[]>([]);
  categories = signal<Category[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  year = signal(new Date().getFullYear());
  month = signal(new Date().getMonth() + 1);
  categoryId = signal<number | null>(null);
  search = signal('');

  monthLabel = computed(() => formatMonthYear(this.year(), this.month()));

  /** Konto-Spalte nur bei „Alle Konten“ und mehreren Konten */
  showAccount = computed(() => this.accounts.hasMultiple() && this.accounts.selectedId() === null);

  query = computed<TransactionQuery>(() => ({
    accountId: this.accounts.selectedId() ?? undefined,
    year: this.year(),
    month: this.month(),
    categoryId: this.categoryId() ?? undefined,
    q: this.search() || undefined,
  }));

  constructor() {
    effect(() => {
      this.load();
    });
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [txs, cats] = await Promise.all([
        firstValueFrom(this.api.listTransactions(this.query())),
        firstValueFrom(this.api.listCategories()),
      ]);
      this.transactions.set(txs);
      this.categories.set(cats);
    } catch (err: unknown) {
      this.error.set(apiErrorMessage(err, 'Fehler beim Laden'));
    } finally {
      this.loading.set(false);
    }
  }

  categoryName(id: number | null): string {
    if (id === null) return '—';
    return this.categories().find((c) => c.id === id)?.name ?? '—';
  }

  onCategoryChange(tx: Transaction, event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    if (!value) return;
    const newCategoryId = Number(value);
    this.changeCategory(tx, newCategoryId);
  }

  async changeCategory(tx: Transaction, newCategoryId: number) {
    try {
      await firstValueFrom(this.api.patchTransaction(tx.id, { categoryId: newCategoryId }));
      await this.load();
    } catch (err: unknown) {
      this.error.set(apiErrorMessage(err, 'Kategorie konnte nicht geändert werden'));
    }
  }

  onFilterCategoryChange(event: Event) {
    const val = (event.target as HTMLSelectElement).value;
    this.categoryId.set(val ? Number(val) : null);
  }

  onSearchChange(event: Event) {
    this.search.set((event.target as HTMLInputElement).value);
  }

  prevMonth() {
    let m = this.month() - 1;
    let y = this.year();
    if (m < 1) {
      m = 12;
      y--;
    }
    this.month.set(m);
    this.year.set(y);
  }

  nextMonth() {
    let m = this.month() + 1;
    let y = this.year();
    if (m > 12) {
      m = 1;
      y++;
    }
    this.month.set(m);
    this.year.set(y);
  }

  formatEuro = formatEuro;
}
