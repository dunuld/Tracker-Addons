import type { DayType, DayWarning, Location, Weekday } from '../../../shared/api-types';

export {
  formatDuration,
  formatQuarters,
  localClockTime,
  localIsoDate,
} from '../../../shared/time-calc';

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  work: 'Arbeitstag',
  vacation: 'Urlaub',
  sick: 'Krank',
  holiday: 'Feiertag',
  flex: 'Gleittag',
};

export const LOCATION_LABELS: Record<Location, string> = {
  home: '🏠 Home Office',
  office: '🏢 Office',
};

export const LOCATION_ICONS: Record<Location, string> = { home: '🏠', office: '🏢' };

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: 'Mo',
  tue: 'Di',
  wed: 'Mi',
  thu: 'Do',
  fri: 'Fr',
  sat: 'Sa',
  sun: 'So',
};

export const WARNING_LABELS: Record<DayWarning, string> = {
  BREAK_TOO_SHORT: 'Gesetzliche Pause nicht eingehalten',
  OVER_10H: 'Mehr als 10 Stunden gearbeitet',
  MISSING_END: 'Ausstempeln vergessen',
};

/** `2026-11-10` → `10.11.2026` */
export function formatDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}`;
}

/** `2026-11-10` → `Di, 10.11.2026` */
export function formatDateLong(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** `2026-11` → `November 2026` */
export function formatMonth(date: string): string {
  return new Date(`${date.slice(0, 7)}-15T12:00:00`).toLocaleDateString('de-DE', {
    month: 'long',
    year: 'numeric',
  });
}

/** Stunden (Dezimal, Komma oder Punkt) → Minuten, z. B. `38,5` → 2310; ungültig → `null` */
export function parseHours(value: string | number): number | null {
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.').trim());
  if (!Number.isFinite(n) || String(value).trim() === '') return null;
  return Math.round(n * 60);
}
