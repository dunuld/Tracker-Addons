/** Testdaten für die Frontend-Specs. */
import type { DayDetail, DaySummary, Project, SummaryResponse, User } from '../../shared/api-types';

export const USER: User = {
  id: 'alice',
  displayName: 'Alice',
  region: 'BY',
  trackingStart: '2026-11-02',
  openingBalanceMinutes: 90,
  autoBreak: true,
  defaultLocation: 'office',
};

export function summary(date: string, overrides: Partial<DaySummary> = {}): DaySummary {
  return {
    date,
    weekday: 'tue',
    dayType: 'work',
    dayTypeManual: false,
    holidayName: null,
    location: 'office',
    note: null,
    untracked: false,
    running: false,
    calc: {
      grossMinutes: 540,
      breakTakenMinutes: 30,
      breakRequiredMinutes: 30,
      breakDeductedMinutes: 0,
      netMinutes: 510,
      warnings: [],
    },
    targetMinutes: 480,
    diffMinutes: 30,
    distributableQuarters: 34,
    bookedQuarters: 30,
    ...overrides,
  };
}

export function day(date: string, overrides: Partial<DayDetail> = {}): DayDetail {
  return {
    ...summary(date),
    stamps: [
      { id: 1, start: '08:00', end: '12:00' },
      { id: 2, start: '12:30', end: '17:00' },
    ],
    bookings: [
      {
        id: 5,
        workPackageId: 11,
        workPackageName: 'Konzept',
        workPackageCode: 'AP-12',
        projectId: 10,
        projectName: 'Projekt Alpha',
        projectCode: 'P1',
        quarters: 30,
        comment: 'Abstimmung',
      },
    ],
    ...overrides,
  };
}

export const PROJECTS: Project[] = [
  {
    id: 10,
    code: 'P1',
    name: 'Projekt Alpha',
    active: true,
    bookedQuarters: 30,
    packages: [
      {
        id: 11,
        projectId: 10,
        code: 'AP-12',
        name: 'Konzept',
        active: true,
        budgetQuarters: 20,
        bookedQuarters: 30,
      },
      {
        id: 12,
        projectId: 10,
        code: null,
        name: 'Alt',
        active: false,
        budgetQuarters: null,
        bookedQuarters: 0,
      },
    ],
  },
  { id: 20, code: null, name: 'Archiv', active: false, bookedQuarters: 0, packages: [] },
];

export function monthSummary(): SummaryResponse {
  return {
    from: '2026-11-01',
    to: '2026-11-03',
    days: [
      summary('2026-11-01', {
        weekday: 'sun',
        dayType: 'holiday',
        holidayName: 'Allerheiligen',
        targetMinutes: 0,
        diffMinutes: 0,
        calc: { ...summary('x').calc, netMinutes: 0, warnings: [] },
        distributableQuarters: 0,
        bookedQuarters: 0,
        untracked: true,
      }),
      summary('2026-11-02', {
        weekday: 'mon',
        dayType: 'vacation',
        dayTypeManual: true,
        diffMinutes: -60,
        location: 'home',
        bookedQuarters: 40,
        calc: { ...summary('x').calc, warnings: ['OVER_10H', 'MISSING_END'] },
      }),
      summary('2026-11-03', { running: true, bookedQuarters: 34 }),
    ],
    totals: { targetMinutes: 960, netMinutes: 1020, diffMinutes: -30, homeDays: 1, officeDays: 3 },
  };
}

/** Setzt einen Wert wie per Tastatur/Auswahl und löst die passenden DOM-Events aus. */
export function enter(el: Element | null | undefined, value: string): void {
  const input = el as HTMLInputElement | HTMLSelectElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  input.dispatchEvent(new Event('change'));
  input.dispatchEvent(new Event('blur'));
}

/** Klickt den ersten Button, dessen Text `label` enthält. */
export function clickButton(root: HTMLElement, label: string): void {
  const button = [...root.querySelectorAll('button')].find((b) => b.textContent?.includes(label));
  if (!button) throw new Error(`Button „${label}“ nicht gefunden`);
  button.click();
}
