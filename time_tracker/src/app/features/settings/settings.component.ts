import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  WEEKDAYS,
  type Location,
  type Region,
  type Schedule,
  type Weekday,
} from '../../../../shared/api-types';
import { apiErrorMessage } from '../../core/api-error';
import { ApiService } from '../../core/api.service';
import {
  WEEKDAY_LABELS,
  formatDate,
  formatDuration,
  localIsoDate,
  parseHours,
} from '../../core/format';
import { SessionService } from '../../core/session.service';

/** Persönliche Einstellungen und Arbeitszeitmodelle (Wochenstunden mit Gültigkeit ab Datum). */
@Component({
  selector: 'app-settings',
  imports: [FormsModule],
  templateUrl: './settings.component.html',
  styles: `
    .days {
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem;
      border: none;
      padding: 0;
      margin: 0;
      font-size: 0.85rem;
    }
    .check {
      display: block;
      margin: 1rem 0;
      font-size: 0.9rem;
    }
    .saved {
      margin-left: 0.75rem;
      color: var(--app-success-text);
      font-size: 0.9rem;
    }
  `,
})
export default class SettingsComponent {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);

  readonly weekdays = WEEKDAYS;
  readonly weekdayLabels = WEEKDAY_LABELS;
  readonly fmtDate = formatDate;
  readonly fmtDuration = formatDuration;

  readonly regions = signal<Region[]>([]);
  readonly schedules = signal<Schedule[]>([]);
  readonly error = signal<string | null>(null);
  readonly saved = signal(false);

  // Persönliche Einstellungen
  region = '';
  trackingStart = '';
  openingHours = '0';
  autoBreak = true;
  defaultLocation: Location = 'office';

  // Neues Arbeitszeitmodell
  validFrom = localIsoDate(new Date());
  weeklyHours = '40';
  readonly workdays = signal<Weekday[]>(['mon', 'tue', 'wed', 'thu', 'fri']);

  constructor() {
    const user = this.session.user();
    if (user) {
      this.region = user.region;
      this.trackingStart = user.trackingStart;
      this.openingHours = String(user.openingBalanceMinutes / 60).replace('.', ',');
      this.autoBreak = user.autoBreak;
      this.defaultLocation = user.defaultLocation;
    }
    this.api.regions().subscribe((r) => this.regions.set(r));
    this.api.schedules().subscribe((s) => {
      this.schedules.set(s);
      const latest = s.at(-1);
      if (latest) {
        this.weeklyHours = String(latest.weeklyMinutes / 60).replace('.', ',');
        this.workdays.set([...latest.workdays]);
      }
    });
  }

  private fail(err: unknown): void {
    this.error.set(apiErrorMessage(err, 'Speichern fehlgeschlagen'));
  }

  saveSettings(): void {
    const openingBalanceMinutes = parseHours(this.openingHours);
    if (openingBalanceMinutes === null) {
      this.error.set('Bitte einen gültigen Übertrag eingeben');
      return;
    }
    this.error.set(null);
    this.api
      .updateSettings({
        region: this.region,
        trackingStart: this.trackingStart,
        openingBalanceMinutes,
        autoBreak: this.autoBreak,
        defaultLocation: this.defaultLocation,
      })
      .subscribe({
        next: (user) => {
          this.session.user.set(user);
          this.saved.set(true);
          setTimeout(() => this.saved.set(false), 2500);
        },
        error: (err: unknown) => this.fail(err),
      });
  }

  toggleDay(day: Weekday): void {
    this.workdays.update((days) =>
      days.includes(day) ? days.filter((d) => d !== day) : [...days, day],
    );
  }

  addSchedule(): void {
    const weeklyMinutes = parseHours(this.weeklyHours);
    if (weeklyMinutes === null) {
      this.error.set('Bitte gültige Wochenstunden eingeben');
      return;
    }
    this.error.set(null);
    this.api
      .saveSchedule({ validFrom: this.validFrom, weeklyMinutes, workdays: this.workdays() })
      .subscribe({ next: (s) => this.schedules.set(s), error: (err: unknown) => this.fail(err) });
  }

  deleteSchedule(schedule: Schedule): void {
    if (!confirm(`Arbeitszeitmodell ab ${formatDate(schedule.validFrom)} löschen?`)) return;
    this.api.deleteSchedule(schedule.id).subscribe({
      next: () => this.schedules.update((list) => list.filter((s) => s.id !== schedule.id)),
      error: (err: unknown) => this.fail(err),
    });
  }

  dailyMinutes(s: Schedule): number {
    return s.workdays.length ? Math.round(s.weeklyMinutes / s.workdays.length) : 0;
  }

  dayList(s: Schedule): string {
    return s.workdays.map((d) => WEEKDAY_LABELS[d]).join(', ');
  }
}
