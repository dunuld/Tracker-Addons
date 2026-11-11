import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Transaction, TransactionType } from '../../../../shared/api-types';
import { apiErrorMessage } from '../../core/api-error';
import { ApiService } from '../../core/api.service';
import {
  formatDate,
  formatEuro,
  formatPrice,
  formatQuantity,
  parseNumber,
} from '../../core/format';

const TYPE_LABEL: Record<TransactionType, string> = {
  buy: 'Kauf',
  sell: 'Verkauf',
  dividend: 'Ertrag',
  opening: 'Startbestand',
};

/** Alle Buchungen sowie das Erfassen eines Startbestands. */
@Component({
  selector: 'app-transactions',
  imports: [FormsModule],
  templateUrl: './transactions.component.html',
})
export default class TransactionsComponent {
  private readonly api = inject(ApiService);

  readonly transactions = signal<Transaction[]>([]);
  readonly error = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  readonly year = signal<number | null>(null);

  readonly years = computed(() =>
    [...new Set(this.transactions().map((t) => Number(t.date.slice(0, 4))))].sort((a, b) => b - a),
  );
  readonly visible = computed(() => {
    const year = this.year();
    return year === null
      ? this.transactions()
      : this.transactions().filter((t) => t.date.startsWith(`${year}-`));
  });

  form = { isin: '', name: '', date: '', quantity: '', cost: '' };

  readonly euro = formatEuro;
  readonly price = formatPrice;
  readonly quantity = formatQuantity;
  readonly date = formatDate;
  readonly typeLabel = (type: TransactionType): string => TYPE_LABEL[type];
  readonly documentUrl = (id: number): string => this.api.documentUrl(id);

  constructor() {
    this.load();
  }

  load(): void {
    this.api.transactions().subscribe({
      next: (transactions) => {
        this.transactions.set(transactions);
        this.error.set(null);
      },
      error: (err: unknown) =>
        this.error.set(apiErrorMessage(err, 'Die Buchungen konnten nicht geladen werden')),
    });
  }

  selectYear(value: string): void {
    this.year.set(value ? Number(value) : null);
  }

  addOpening(): void {
    const quantity = parseNumber(this.form.quantity);
    const cost = parseNumber(this.form.cost);
    if (!this.form.isin.trim() || !this.form.date) {
      this.formError.set('Bitte ISIN und Kaufdatum angeben.');
      return;
    }
    if (quantity === null || quantity <= 0 || cost === null || cost < 0) {
      this.formError.set('Bitte Stückzahl und Einstandswert als Zahl angeben.');
      return;
    }
    this.api
      .addOpening({
        isin: this.form.isin.trim().toUpperCase(),
        name: this.form.name.trim(),
        date: this.form.date,
        quantity,
        costCents: Math.round(cost * 100),
      })
      .subscribe({
        next: () => {
          this.form = { isin: '', name: '', date: '', quantity: '', cost: '' };
          this.formError.set(null);
          this.load();
        },
        error: (err: unknown) =>
          this.formError.set(apiErrorMessage(err, 'Speichern fehlgeschlagen')),
      });
  }

  remove(transaction: Transaction): void {
    this.api.deleteTransaction(transaction.id).subscribe({
      next: () => this.load(),
      error: (err: unknown) => this.error.set(apiErrorMessage(err, 'Löschen fehlgeschlagen')),
    });
  }
}
