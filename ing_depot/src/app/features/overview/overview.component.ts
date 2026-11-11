import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { Overview, Position } from '../../../../shared/api-types';
import { apiErrorMessage } from '../../core/api-error';
import { ApiService } from '../../core/api.service';
import {
  MONTHS,
  formatDate,
  formatEuro,
  formatPercent,
  formatPrice,
  formatQuantity,
  formatSignedEuro,
  parseNumber,
  signClass,
} from '../../core/format';

const SOURCE_LABEL = { document: 'aus Dokument', manual: 'manuell', ha: 'Home Assistant' } as const;

/** Jahresübersicht: Kennzahlen, Monatsverlauf und Positionen. */
@Component({
  selector: 'app-overview',
  imports: [FormsModule, RouterLink],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.css',
})
export default class OverviewComponent {
  private readonly api = inject(ApiService);

  readonly overview = signal<Overview | null>(null);
  readonly error = signal<string | null>(null);
  /** ISIN der Position, deren Kurs gerade bearbeitet wird */
  readonly editing = signal<string | null>(null);
  readonly editError = signal<string | null>(null);
  priceInput = '';
  entityInput = '';

  readonly months = MONTHS;
  readonly euro = formatEuro;
  readonly signedEuro = formatSignedEuro;
  readonly percent = formatPercent;
  readonly price = formatPrice;
  readonly quantity = formatQuantity;
  readonly date = formatDate;
  readonly sign = signClass;

  /** Höchster Monatswert – Maßstab für die Balken */
  readonly monthlyMax = computed(() =>
    Math.max(
      1,
      ...(this.overview()?.monthly ?? []).flatMap((m) => [m.investedCents, m.dividendsNetCents]),
    ),
  );
  readonly hasMonthlyData = computed(() =>
    (this.overview()?.monthly ?? []).some((m) => m.investedCents > 0 || m.dividendsNetCents > 0),
  );
  readonly isEmpty = computed(() => {
    const o = this.overview();
    return !!o && o.positions.length === 0 && o.years.length === 1 && o.investedGrossCents === 0;
  });

  constructor() {
    this.load();
  }

  load(year?: number): void {
    this.api.overview(year).subscribe({
      next: (overview) => {
        this.overview.set(overview);
        this.error.set(null);
      },
      error: (err: unknown) =>
        this.error.set(apiErrorMessage(err, 'Die Übersicht konnte nicht geladen werden')),
    });
  }

  selectYear(value: string): void {
    this.load(Number(value));
  }

  barHeight(cents: number): number {
    return Math.max(0, Math.round((cents / this.monthlyMax()) * 100));
  }

  sourceLabel(position: Position): string {
    return position.priceSource ? SOURCE_LABEL[position.priceSource] : '';
  }

  edit(position: Position): void {
    this.editing.set(position.isin);
    this.editError.set(null);
    this.priceInput = '';
    this.entityInput = position.priceEntity ?? '';
  }

  cancelEdit(): void {
    this.editing.set(null);
  }

  save(position: Position): void {
    const price = parseNumber(this.priceInput);
    if (this.priceInput.trim() && (price === null || price <= 0)) {
      this.editError.set('Bitte einen gültigen Kurs eingeben, z. B. 123,45.');
      return;
    }
    const entity = this.entityInput.trim() || null;
    const fail = (err: unknown) =>
      this.editError.set(apiErrorMessage(err, 'Speichern fehlgeschlagen'));
    const done = () => {
      this.editing.set(null);
      this.load(this.overview()?.year);
    };
    const savePrice = () => {
      if (price === null) return done();
      this.api.addPrice(position.isin, { price }).subscribe({ next: done, error: fail });
    };
    if (entity !== position.priceEntity) {
      this.api
        .updateSecurity(position.isin, { priceEntity: entity })
        .subscribe({ next: savePrice, error: fail });
    } else {
      savePrice();
    }
  }
}
