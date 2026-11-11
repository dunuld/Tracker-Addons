import {
  DAY_TYPES,
  LOCATIONS,
  WEEKDAYS,
  type DayType,
  type IsoDate,
  type Location,
  type Weekday,
} from '../../shared/api-types.js';
import { isClockTime, isIsoDate } from '../../shared/time-calc.js';
import { badRequest } from './http-error.js';

export function date(value: unknown, name = 'Datum'): IsoDate {
  if (!isIsoDate(value)) throw badRequest(`${name} ungültig (erwartet JJJJ-MM-TT)`);
  return value;
}

export function clock(value: unknown, name = 'Uhrzeit'): string {
  if (!isClockTime(value)) throw badRequest(`${name} ungültig (erwartet HH:MM)`);
  return value;
}

export function bool(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw badRequest(`${name} muss true oder false sein`);
  return value;
}

export function int(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
    throw badRequest(`${name} muss eine Ganzzahl zwischen ${min} und ${max} sein`);
  return value;
}

export function text(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || !value.trim()) throw badRequest(`${name} ist erforderlich`);
  if (value.trim().length > max)
    throw badRequest(`${name} darf höchstens ${max} Zeichen lang sein`);
  return value.trim();
}

/** Optionaler Text: leer/`null` → `null`. */
export function optionalText(value: unknown, name: string, max: number): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw badRequest(`${name} muss Text sein`);
  return value.trim() ? text(value, name, max) : null;
}

export function location(value: unknown): Location {
  if (!LOCATIONS.includes(value as Location)) throw badRequest('Ort muss home oder office sein');
  return value as Location;
}

export function dayType(value: unknown): DayType {
  if (!DAY_TYPES.includes(value as DayType)) throw badRequest('Ungültige Tagesart');
  return value as DayType;
}

export function workdays(value: unknown): Weekday[] {
  if (!Array.isArray(value) || value.some((d) => !WEEKDAYS.includes(d as Weekday)))
    throw badRequest('Ungültige Arbeitstage');
  // sortiert und ohne Duplikate
  return WEEKDAYS.filter((d) => value.includes(d));
}
