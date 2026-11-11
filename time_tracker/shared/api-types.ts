/** Gemeinsame DTOs von Frontend (src/) und Backend (server/). */

export interface HealthResponse {
  status: 'ok';
  version: string;
}

export interface ApiError {
  error: string;
  /** Maschinenlesbarer Code, z. B. `NOT_FOUND` */
  code?: string;
}

/** Datum im Format `YYYY-MM-DD` */
export type IsoDate = string;
/** Uhrzeit im Format `HH:MM` */
export type ClockTime = string;

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export type Location = 'home' | 'office';
export const LOCATIONS: readonly Location[] = ['home', 'office'];

/** work = Arbeitstag, vacation = Urlaub, sick = Krank, holiday = Feiertag, flex = Gleittag */
export type DayType = 'work' | 'vacation' | 'sick' | 'holiday' | 'flex';
export const DAY_TYPES: readonly DayType[] = ['work', 'vacation', 'sick', 'holiday', 'flex'];

// ---------- Benutzer & Einstellungen ----------

export interface UserSettings {
  /** Bundesland (ISO-3166-2 ohne Länderpräfix), z. B. `BY` */
  region: string;
  trackingStart: IsoDate;
  openingBalanceMinutes: number;
  autoBreak: boolean;
  defaultLocation: Location;
}

export interface User extends UserSettings {
  id: string;
  displayName: string;
}

export interface MeResponse {
  /** `null` = Benutzer muss die Ersteinrichtung durchlaufen */
  user: User | null;
  /** Name laut Home Assistant (Vorschlag für die Einrichtung) */
  haDisplayName: string;
  today: IsoDate;
}

export interface SetupInput extends UserSettings {
  weeklyMinutes: number;
  workdays: Weekday[];
}

export interface Schedule {
  id: number;
  validFrom: IsoDate;
  weeklyMinutes: number;
  workdays: Weekday[];
}

export type ScheduleInput = Omit<Schedule, 'id'>;

export interface Region {
  code: string;
  name: string;
}

// ---------- Tage, Stempel, Buchungen ----------

export interface TimeStamp {
  id: number;
  start: ClockTime;
  /** `null` = noch eingestempelt */
  end: ClockTime | null;
}

export interface StampInput {
  start: ClockTime;
  end: ClockTime | null;
}

export interface Booking {
  id: number;
  workPackageId: number;
  workPackageName: string;
  workPackageCode: string | null;
  projectId: number;
  projectName: string;
  projectCode: string | null;
  /** Anzahl Viertelstunden (1 = 0,25 h) */
  quarters: number;
  comment: string | null;
}

export interface BookingInput {
  workPackageId: number;
  quarters: number;
  comment?: string | null;
}

export type DayWarning =
  /** Gesetzliche Pause nicht eingehalten (nur ohne automatischen Abzug) */
  | 'BREAK_TOO_SHORT'
  /** Mehr als 10 h Nettoarbeitszeit */
  | 'OVER_10H'
  /** Vergangener Tag mit offenem Stempel */
  | 'MISSING_END';

export interface DayCalculation {
  /** Erstes Kommen bis letztes Gehen */
  grossMinutes: number;
  /** Summe der Lücken zwischen den Stempelpaaren */
  breakTakenMinutes: number;
  /** Gesetzlich vorgeschriebene Pause für diese Arbeitszeit */
  breakRequiredMinutes: number;
  /** Automatisch abgezogene (fehlende) Pause */
  breakDeductedMinutes: number;
  netMinutes: number;
  warnings: DayWarning[];
}

export interface DaySummary {
  date: IsoDate;
  weekday: Weekday;
  dayType: DayType;
  /** true = Tagesart manuell gesetzt (überschreibt die Automatik) */
  dayTypeManual: boolean;
  /** Name des gesetzlichen Feiertags im Bundesland des Benutzers */
  holidayName: string | null;
  location: Location | null;
  note: string | null;
  /** Tag liegt vor dem Startdatum oder vor dem ersten Arbeitszeitmodell */
  untracked: boolean;
  running: boolean;
  calc: DayCalculation;
  targetMinutes: number;
  /** Ist − Soll */
  diffMinutes: number;
  /** Nettozeit auf Viertelstunden gerundet */
  distributableQuarters: number;
  bookedQuarters: number;
}

export interface DayDetail extends DaySummary {
  stamps: TimeStamp[];
  bookings: Booking[];
}

export interface DayInput {
  /** `null` = automatisch (Feiertag laut Bundesland, sonst Arbeitstag) */
  dayType?: DayType | null;
  location?: Location | null;
  note?: string | null;
}

export interface Balance {
  /** Saldo inkl. Anfangssaldo bis einschließlich `asOf` */
  balanceMinutes: number;
  asOf: IsoDate;
}

export interface SummaryResponse {
  from: IsoDate;
  to: IsoDate;
  days: DaySummary[];
  totals: {
    targetMinutes: number;
    netMinutes: number;
    diffMinutes: number;
    homeDays: number;
    officeDays: number;
  };
}

// ---------- Projekte & Arbeitspakete ----------

export interface WorkPackage {
  id: number;
  projectId: number;
  code: string | null;
  name: string;
  active: boolean;
  budgetQuarters: number | null;
  bookedQuarters: number;
}

export interface Project {
  id: number;
  code: string | null;
  name: string;
  active: boolean;
  bookedQuarters: number;
  packages: WorkPackage[];
}

export interface ProjectInput {
  code?: string | null;
  name?: string;
  active?: boolean;
}

export interface WorkPackageInput extends ProjectInput {
  budgetQuarters?: number | null;
}
