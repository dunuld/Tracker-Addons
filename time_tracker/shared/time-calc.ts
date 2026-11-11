/**
 * Reine Rechenlogik der Zeiterfassung (ohne Datenbank, ohne Datum-Bibliotheken).
 * Wird vom Backend genutzt und vom Frontend für Anzeige und Formatierung.
 */
import type {
  ClockTime,
  DayCalculation,
  DayType,
  DayWarning,
  IsoDate,
  Weekday,
} from './api-types.js';
import { WEEKDAYS } from './api-types.js';

export const QUARTER_MINUTES = 15;
/** Höchstgrenze der täglichen Arbeitszeit nach § 3 ArbZG */
export const MAX_DAILY_MINUTES = 10 * 60;

/** Pausenstufen nach § 4 ArbZG, absteigend: über `overMinutes` Arbeit → `breakMinutes` Pause */
export const BREAK_RULES: readonly { overMinutes: number; breakMinutes: number }[] = [
  { overMinutes: 9 * 60, breakMinutes: 45 },
  { overMinutes: 6 * 60, breakMinutes: 30 },
];

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isClockTime(value: unknown): value is ClockTime {
  return typeof value === 'string' && CLOCK.test(value);
}

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string') return false;
  const m = DATE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1;
}

/** `'08:15'` → 495 */
export function clockToMinutes(time: ClockTime): number {
  const [h, m] = time.split(':');
  return Number(h) * 60 + Number(m);
}

/** 495 → `'08:15'` */
export function minutesToClock(minutes: number): ClockTime {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Dauer als `h:mm`, mit Vorzeichen bei `signed` (z. B. `+1:05`, `-0:30`). */
export function formatDuration(minutes: number, signed = false): string {
  const abs = Math.abs(Math.round(minutes));
  const text = `${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
  if (minutes < 0 && abs > 0) return `-${text}`;
  return signed ? `+${text}` : text;
}

/** Viertelstunden als Dezimalstunden, z. B. 7 → `'1,75'` */
export function formatQuarters(quarters: number): string {
  return (quarters / 4).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Minuten → auf Viertelstunden gerundet (kaufmännisch). */
export function minutesToQuarters(minutes: number): number {
  return Math.round(Math.max(0, minutes) / QUARTER_MINUTES);
}

// ---------- Datum ----------

function parseDate(date: IsoDate): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function formatDate(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = parseDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d);
}

export function weekdayOf(date: IsoDate): Weekday {
  // getUTCDay: 0 = Sonntag
  return WEEKDAYS[(parseDate(date).getUTCDay() + 6) % 7]!;
}

/** Montag der Woche, in der `date` liegt. */
export function startOfWeek(date: IsoDate): IsoDate {
  return addDays(date, -WEEKDAYS.indexOf(weekdayOf(date)));
}

export function startOfMonth(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: IsoDate): IsoDate {
  const d = parseDate(startOfMonth(date));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return formatDate(d);
}

/** Alle Tage von `from` bis `to` (jeweils einschließlich). */
export function dateRange(from: IsoDate, to: IsoDate): IsoDate[] {
  const days: IsoDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

/** Lokales Datum eines `Date` als `YYYY-MM-DD`. */
export function localIsoDate(d: Date): IsoDate {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export function localClockTime(d: Date): ClockTime {
  return minutesToClock(d.getHours() * 60 + d.getMinutes());
}

// ---------- Tagesberechnung ----------

export interface StampPair {
  start: ClockTime;
  end: ClockTime | null;
}

export interface DayCalcOptions {
  /** Fehlende gesetzliche Pause automatisch abziehen */
  autoBreak: boolean;
  /** Ende für einen laufenden Stempel (aktuelle Uhrzeit, nur für heute) */
  openEnd?: ClockTime | null;
}

/** Gesetzlich vorgeschriebene Pause für eine Arbeitszeit (ohne Pausen). */
export function requiredBreak(workMinutes: number): number {
  return BREAK_RULES.find((rule) => workMinutes > rule.overMinutes)?.breakMinutes ?? 0;
}

/**
 * Berechnet Brutto-, Pausen- und Nettozeit eines Tages.
 *
 * Fehlt Pause, wird höchstens so viel abgezogen, dass die jeweilige Schwelle nicht
 * unterschritten wird (6:10 h ohne Pause → 6:00 h, nicht 5:40 h). Die Stufen werden
 * absteigend geprüft, damit z. B. 9:10 h ohne Pause korrekt auf 8:40 h kommen.
 */
export function calculateDay(
  stamps: readonly StampPair[],
  options: DayCalcOptions,
): DayCalculation {
  const warnings: DayWarning[] = [];
  const intervals = stamps
    .map((s) => {
      const end = s.end ?? options.openEnd ?? null;
      if (s.end === null && !options.openEnd) warnings.push('MISSING_END');
      return end === null
        ? null
        : {
            start: clockToMinutes(s.start),
            end: Math.max(clockToMinutes(s.start), clockToMinutes(end)),
          };
    })
    .filter((i): i is { start: number; end: number } => i !== null)
    .sort((a, b) => a.start - b.start);

  if (intervals.length === 0) {
    return {
      grossMinutes: 0,
      breakTakenMinutes: 0,
      breakRequiredMinutes: 0,
      breakDeductedMinutes: 0,
      netMinutes: 0,
      warnings: [...new Set(warnings)],
    };
  }

  const worked = intervals.reduce((sum, i) => sum + (i.end - i.start), 0);
  const gross = intervals.at(-1)!.end - intervals[0]!.start;
  const taken = Math.max(0, gross - worked);

  let net = worked;
  let deducted = 0;
  for (const rule of BREAK_RULES) {
    if (net <= rule.overMinutes) continue;
    const missing = rule.breakMinutes - (taken + deducted);
    if (missing <= 0) continue;
    const deduction = Math.min(missing, net - rule.overMinutes);
    deducted += deduction;
    net -= deduction;
  }

  const required = requiredBreak(net);
  if (!options.autoBreak) {
    if (deducted > 0) warnings.push('BREAK_TOO_SHORT');
    net = worked;
    deducted = 0;
  }
  if (net > MAX_DAILY_MINUTES) warnings.push('OVER_10H');

  return {
    grossMinutes: gross,
    breakTakenMinutes: taken,
    breakRequiredMinutes: options.autoBreak ? required : requiredBreak(worked),
    breakDeductedMinutes: deducted,
    netMinutes: net,
    warnings: [...new Set(warnings)],
  };
}

// ---------- Soll ----------

export interface ScheduleLike {
  validFrom: IsoDate;
  weeklyMinutes: number;
  workdays: readonly Weekday[];
}

/** Gültiges Arbeitszeitmodell für ein Datum (jüngstes mit `validFrom <= date`). */
export function scheduleFor<T extends ScheduleLike>(
  schedules: readonly T[],
  date: IsoDate,
): T | null {
  let found: T | null = null;
  for (const s of schedules) {
    if (s.validFrom <= date && (!found || s.validFrom > found.validFrom)) found = s;
  }
  return found;
}

/** Regelarbeitszeit eines Wochentags laut Modell (ohne Tagesart). */
export function baseTargetMinutes(schedule: ScheduleLike, weekday: Weekday): number {
  if (!schedule.workdays.includes(weekday) || schedule.workdays.length === 0) return 0;
  return Math.round(schedule.weeklyMinutes / schedule.workdays.length);
}

/**
 * Soll eines Tages: Urlaub, Krank und Feiertag haben Soll 0 (keine Minusstunden),
 * ein Gleittag behält sein Soll und baut so Überstunden ab.
 */
export function targetMinutes(dayType: DayType, baseTarget: number): number {
  return dayType === 'work' || dayType === 'flex' ? baseTarget : 0;
}
