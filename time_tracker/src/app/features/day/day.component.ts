import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { Observable } from 'rxjs';
import {
  DAY_TYPES,
  type Balance,
  type DayDetail,
  type DayType,
  type Location,
  type Project,
  type TimeStamp,
} from '../../../../shared/api-types';
import { addDays } from '../../../../shared/time-calc';
import { apiErrorMessage } from '../../core/api-error';
import { ApiService } from '../../core/api.service';
import {
  DAY_TYPE_LABELS,
  LOCATION_LABELS,
  WARNING_LABELS,
  formatDateLong,
  formatDuration,
  formatQuarters,
  localClockTime,
  localIsoDate,
} from '../../core/format';

/** Schnellwahl für Buchungen in Viertelstunden (0,25 / 0,5 / 1 / 2 h) */
const QUICK_QUARTERS = [1, 2, 4, 8];

/** Tagesansicht: Stempeln, Ort, Tagesart und Buchungen auf Arbeitspakete. */
@Component({
  selector: 'app-day',
  imports: [FormsModule, RouterLink],
  templateUrl: './day.component.html',
  styleUrl: './day.component.css',
})
export default class DayComponent {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly dayTypes = DAY_TYPES;
  readonly dayTypeLabels = DAY_TYPE_LABELS;
  readonly locationLabels = LOCATION_LABELS;
  readonly warningLabels = WARNING_LABELS;
  readonly quick = QUICK_QUARTERS;
  readonly fmtDuration = formatDuration;
  readonly fmtQuarters = formatQuarters;

  readonly date = signal(localIsoDate(new Date()));
  readonly day = signal<DayDetail | null>(null);
  readonly projects = signal<Project[]>([]);
  readonly balance = signal<Balance | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  /** Uhrzeit für Kommen/Gehen (vorbelegt mit „jetzt“, änderbar) */
  stampTime = localClockTime(new Date());
  private stampTimeEdited = false;

  // Formular „Stempel nachtragen“
  newStart = '';
  newEnd = '';

  // Formular „Buchung“
  bookingPackageId: number | null = null;
  readonly bookingQuarters = signal(4);
  bookingComment = '';

  readonly isToday = computed(() => this.date() === localIsoDate(new Date()));
  readonly title = computed(() => formatDateLong(this.date()));
  readonly remainingQuarters = computed(() => {
    const d = this.day();
    return d ? d.distributableQuarters - d.bookedQuarters : 0;
  });
  readonly activeProjects = computed(() =>
    this.projects()
      .filter((p) => p.active)
      .map((p) => ({ ...p, packages: p.packages.filter((wp) => wp.active) }))
      .filter((p) => p.packages.length > 0),
  );
  /** Saldo bis gestern plus heutige Differenz (nur in der Heute-Ansicht sinnvoll) */
  readonly balanceToday = computed(() => {
    const b = this.balance();
    const d = this.day();
    if (!b || !d) return null;
    return b.balanceMinutes + (d.date > b.asOf ? d.diffMinutes : 0);
  });

  constructor() {
    const route = inject(ActivatedRoute);
    route.paramMap.subscribe((params) => {
      this.date.set(params.get('date') ?? localIsoDate(new Date()));
      this.load();
    });
    this.api.projects().subscribe((p) => this.projects.set(p));

    // Laufende Zeit und vorgeschlagene Uhrzeit jede Minute aktualisieren
    const timer = setInterval(() => this.tick(), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  tick(): void {
    if (!this.stampTimeEdited) this.stampTime = localClockTime(new Date());
    if (this.day()?.running && this.isToday()) this.load();
  }

  load(): void {
    this.api.day(this.date()).subscribe({
      next: (d) => this.day.set(d),
      error: (err: unknown) =>
        this.error.set(apiErrorMessage(err, 'Tag konnte nicht geladen werden')),
    });
    this.api.balance().subscribe((b) => this.balance.set(b));
  }

  go(offset: number): void {
    this.navigate(addDays(this.date(), offset));
  }

  navigate(date: string): void {
    if (!date) return;
    void this.router.navigate(date === localIsoDate(new Date()) ? [''] : ['day', date]);
  }

  onStampTimeChange(): void {
    this.stampTimeEdited = true;
  }

  /** Führt eine Änderung aus, übernimmt den neuen Tag und zeigt Fehler an. */
  private run(request: Observable<DayDetail>, done?: () => void): void {
    this.busy.set(true);
    this.error.set(null);
    request.subscribe({
      next: (d) => {
        this.busy.set(false);
        this.day.set(d);
        done?.();
        this.api.balance().subscribe((b) => this.balance.set(b));
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err, 'Speichern fehlgeschlagen'));
      },
    });
  }

  // --- Stempeln ---

  stamp(): void {
    this.run(this.api.stamp(this.date(), this.stampTime), () => {
      this.stampTimeEdited = false;
      this.stampTime = localClockTime(new Date());
    });
  }

  saveStamp(stamp: TimeStamp, start: string, end: string): void {
    this.run(this.api.updateStamp(stamp.id, { start, end: end || null }));
  }

  deleteStamp(stamp: TimeStamp): void {
    if (!confirm(`Stempel ${stamp.start} – ${stamp.end ?? 'läuft'} löschen?`)) return;
    this.run(this.api.deleteStamp(stamp.id));
  }

  addStamp(): void {
    this.run(
      this.api.addStamp(this.date(), { start: this.newStart, end: this.newEnd || null }),
      () => {
        this.newStart = '';
        this.newEnd = '';
      },
    );
  }

  // --- Tag ---

  setLocation(location: Location): void {
    this.run(this.api.updateDay(this.date(), { location }));
  }

  setDayType(value: string): void {
    this.run(this.api.updateDay(this.date(), { dayType: value ? (value as DayType) : null }));
  }

  saveNote(note: string): void {
    if ((this.day()?.note ?? '') === note.trim()) return;
    this.run(this.api.updateDay(this.date(), { note }));
  }

  // --- Buchungen ---

  setQuarters(quarters: number): void {
    this.bookingQuarters.set(Math.max(1, Math.min(96, quarters)));
  }

  fillRemaining(): void {
    if (this.remainingQuarters() > 0) this.bookingQuarters.set(this.remainingQuarters());
  }

  addBooking(): void {
    if (!this.bookingPackageId) {
      this.error.set('Bitte ein Arbeitspaket wählen');
      return;
    }
    this.run(
      this.api.addBooking(this.date(), {
        workPackageId: Number(this.bookingPackageId),
        quarters: this.bookingQuarters(),
        comment: this.bookingComment || null,
      }),
      () => {
        this.bookingComment = '';
        this.bookingQuarters.set(4);
      },
    );
  }

  changeBooking(id: number, quarters: number): void {
    if (quarters < 1) return;
    this.run(this.api.updateBooking(id, { quarters }));
  }

  deleteBooking(id: number): void {
    this.run(this.api.deleteBooking(id));
  }

  /** Klasse der Verteil-Ampel */
  distributionClass(): string {
    const r = this.remainingQuarters();
    if (r === 0) return 'ok';
    return r > 0 ? 'warn' : 'error';
  }

  signClass(minutes: number): string {
    if (minutes > 0) return 'positive';
    return minutes < 0 ? 'negative' : '';
  }
}
