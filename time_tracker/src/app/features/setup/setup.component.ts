import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WEEKDAYS, type Location, type Region, type Weekday } from '../../../../shared/api-types';
import { apiErrorMessage } from '../../core/api-error';
import { ApiService } from '../../core/api.service';
import { localIsoDate, parseHours, WEEKDAY_LABELS } from '../../core/format';
import { SessionService } from '../../core/session.service';

/** Ersteinrichtung beim ersten Öffnen durch einen HA-Benutzer. */
@Component({
  selector: 'app-setup',
  imports: [FormsModule],
  template: `
    <h2>Willkommen, {{ session.haDisplayName() }}!</h2>
    <div class="app-card">
      <p>
        Bevor du loslegst, ein paar Angaben zu deiner Arbeitszeit. Alles lässt sich später unter
        <em>Einstellungen</em> ändern.
      </p>
      @if (error()) {
        <p class="alert error" role="alert">{{ error() }}</p>
      }
      <div class="form-row">
        <label class="field">
          Wochenstunden
          <input class="input" name="hours" inputmode="decimal" [(ngModel)]="weeklyHours" />
        </label>
        <label class="field">
          Bundesland (für Feiertage)
          <select class="input" name="region" [(ngModel)]="region">
            @for (r of regions(); track r.code) {
              <option [value]="r.code">{{ r.name }}</option>
            }
          </select>
        </label>
        <label class="field">
          Standard-Ort
          <select class="input" name="location" [(ngModel)]="defaultLocation">
            <option value="office">Office</option>
            <option value="home">Home Office</option>
          </select>
        </label>
      </div>
      <fieldset class="days">
        <legend>Arbeitstage</legend>
        @for (d of weekdays; track d) {
          <label
            ><input type="checkbox" [checked]="workdays().includes(d)" (change)="toggleDay(d)" />
            {{ labels[d] }}</label
          >
        }
      </fieldset>
      <div class="form-row">
        <label class="field">
          Zeiterfassung ab
          <input class="input" type="date" name="start" [(ngModel)]="trackingStart" />
        </label>
        <label class="field">
          Übertrag Überstunden (h)
          <input class="input" name="balance" inputmode="decimal" [(ngModel)]="openingHours" />
        </label>
      </div>
      <label class="check">
        <input type="checkbox" name="autoBreak" [(ngModel)]="autoBreak" />
        Fehlende gesetzliche Pause automatisch abziehen (über 6 h: 30 min, über 9 h: 45 min)
      </label>
      <button class="btn primary" type="button" (click)="save()" [disabled]="saving()">
        Einrichtung abschließen
      </button>
    </div>
  `,
  styles: `
    .days {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin: 1rem 0;
      border: none;
      padding: 0;
    }
    .days legend,
    .check {
      font-size: 0.85rem;
      color: var(--app-text-secondary);
    }
    .check {
      display: block;
      margin: 1rem 0;
    }
  `,
})
export default class SetupComponent {
  private readonly api = inject(ApiService);
  readonly session = inject(SessionService);

  readonly weekdays = WEEKDAYS;
  readonly labels = WEEKDAY_LABELS;
  readonly regions = signal<Region[]>([]);
  readonly workdays = signal<Weekday[]>(['mon', 'tue', 'wed', 'thu', 'fri']);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);

  weeklyHours = '40';
  region = 'BY';
  defaultLocation: Location = 'office';
  trackingStart = localIsoDate(new Date());
  openingHours = '0';
  autoBreak = true;

  constructor() {
    this.api.regions().subscribe((r) => this.regions.set(r));
  }

  toggleDay(day: Weekday): void {
    this.workdays.update((days) =>
      days.includes(day) ? days.filter((d) => d !== day) : [...days, day],
    );
  }

  save(): void {
    const weeklyMinutes = parseHours(this.weeklyHours);
    const openingBalanceMinutes = parseHours(this.openingHours) ?? 0;
    if (weeklyMinutes === null) {
      this.error.set('Bitte gültige Wochenstunden eingeben');
      return;
    }
    this.saving.set(true);
    this.api
      .setup({
        weeklyMinutes,
        workdays: this.workdays(),
        region: this.region,
        defaultLocation: this.defaultLocation,
        trackingStart: this.trackingStart,
        openingBalanceMinutes,
        autoBreak: this.autoBreak,
      })
      .subscribe({
        next: (user) => {
          this.saving.set(false);
          this.session.user.set(user);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.error.set(apiErrorMessage(err, 'Einrichtung fehlgeschlagen'));
        },
      });
  }
}
