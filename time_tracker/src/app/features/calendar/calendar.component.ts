import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { Balance, DaySummary, SummaryResponse } from '../../../../shared/api-types';
import { addDays, endOfMonth, startOfMonth, startOfWeek } from '../../../../shared/time-calc';
import { apiErrorMessage } from '../../core/api-error';
import { ApiService } from '../../core/api.service';
import {
  DAY_TYPE_LABELS,
  LOCATION_ICONS,
  WARNING_LABELS,
  WEEKDAY_LABELS,
  formatDate,
  formatDuration,
  formatMonth,
  formatQuarters,
  localIsoDate,
} from '../../core/format';

interface Week {
  start: string;
  days: DaySummary[];
  netMinutes: number;
  targetMinutes: number;
  diffMinutes: number;
}

/** Monatsübersicht mit Wochensummen, Soll/Ist, Home-Office-Quote und Saldo. */
@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.css',
})
export default class CalendarComponent {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly dayTypeLabels = DAY_TYPE_LABELS;
  readonly locationIcons = LOCATION_ICONS;
  readonly weekdayLabels = WEEKDAY_LABELS;
  readonly fmtDate = formatDate;
  readonly fmtDuration = formatDuration;
  readonly fmtQuarters = formatQuarters;

  readonly today = localIsoDate(new Date());
  readonly month = signal(startOfMonth(this.today));
  readonly summary = signal<SummaryResponse | null>(null);
  readonly balance = signal<Balance | null>(null);
  readonly error = signal<string | null>(null);

  readonly title = computed(() => formatMonth(this.month()));
  readonly weeks = computed<Week[]>(() => {
    const weeks: Week[] = [];
    for (const d of this.summary()?.days ?? []) {
      const start = startOfWeek(d.date);
      let week = weeks.at(-1);
      if (week?.start !== start) {
        week = { start, days: [], netMinutes: 0, targetMinutes: 0, diffMinutes: 0 };
        weeks.push(week);
      }
      week.days.push(d);
      week.netMinutes += d.calc.netMinutes;
      week.targetMinutes += d.targetMinutes;
      week.diffMinutes += d.diffMinutes;
    }
    return weeks;
  });
  readonly homeOfficeQuote = computed(() => {
    const t = this.summary()?.totals;
    const days = t ? t.homeDays + t.officeDays : 0;
    return t && days ? Math.round((t.homeDays / days) * 100) : null;
  });

  constructor() {
    this.load();
    this.api.balance().subscribe((b) => this.balance.set(b));
  }

  load(): void {
    const from = this.month();
    this.api.summary(from, endOfMonth(from)).subscribe({
      next: (s) => {
        this.summary.set(s);
        this.error.set(null);
      },
      error: (err: unknown) =>
        this.error.set(apiErrorMessage(err, 'Übersicht konnte nicht geladen werden')),
    });
  }

  shiftMonth(offset: number): void {
    const anchor = offset < 0 ? addDays(this.month(), -1) : addDays(endOfMonth(this.month()), 1);
    this.month.set(startOfMonth(anchor));
    this.load();
  }

  open(day: DaySummary): void {
    void this.router.navigate(day.date === this.today ? [''] : ['day', day.date]);
  }

  warnings(day: DaySummary): string {
    return day.calc.warnings.map((w) => WARNING_LABELS[w]).join(', ');
  }

  remaining(day: DaySummary): number {
    return day.distributableQuarters - day.bookedQuarters;
  }

  signClass(minutes: number): string {
    if (minutes > 0) return 'positive';
    return minutes < 0 ? 'negative' : '';
  }
}
