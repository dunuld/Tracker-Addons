import type {
  Balance,
  Booking,
  DayDetail,
  DaySummary,
  DayType,
  IsoDate,
  Location,
  Schedule,
  SummaryResponse,
  TimeStamp,
  User,
  Weekday,
} from '../../../shared/api-types.js';
import {
  addDays,
  baseTargetMinutes,
  calculateDay,
  dateRange,
  localClockTime,
  localIsoDate,
  minutesToQuarters,
  scheduleFor,
  targetMinutes,
  weekdayOf,
} from '../../../shared/time-calc.js';
import type { Database } from '../db/database.js';
import type { HolidayCalendar } from '../holidays.js';

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export function toUser(row: Row): User {
  return {
    id: String(row['id']),
    displayName: String(row['display_name']),
    region: String(row['region']),
    trackingStart: String(row['tracking_start']),
    openingBalanceMinutes: Number(row['opening_balance_min']),
    autoBreak: Number(row['auto_break']) === 1,
    defaultLocation: String(row['default_location']) as Location,
  };
}

export function toSchedule(row: Row): Schedule {
  return {
    id: Number(row['id']),
    validFrom: String(row['valid_from']),
    weeklyMinutes: Number(row['weekly_minutes']),
    workdays: String(row['workdays']).split(',').filter(Boolean) as Weekday[],
  };
}

export function toStamp(row: Row): TimeStamp {
  return { id: Number(row['id']), start: String(row['start_time']), end: str(row['end_time']) };
}

export function toBooking(row: Row): Booking {
  return {
    id: Number(row['id']),
    workPackageId: Number(row['work_package_id']),
    workPackageName: String(row['package_name']),
    workPackageCode: str(row['package_code']),
    projectId: Number(row['project_id']),
    projectName: String(row['project_name']),
    projectCode: str(row['project_code']),
    quarters: Number(row['quarters']),
    comment: str(row['comment']),
  };
}

export const BOOKING_SELECT = `
  SELECT b.*, wp.name AS package_name, wp.code AS package_code,
         p.id AS project_id, p.name AS project_name, p.code AS project_code
    FROM booking b
    JOIN work_package wp ON wp.id = b.work_package_id
    JOIN project p ON p.id = wp.project_id`;

/**
 * Berechnet Tages-Zusammenfassungen, Soll/Ist und das Überstundenkonto eines Benutzers.
 * `now` ist injizierbar, damit Tests ein festes „heute“ verwenden können.
 */
export class TimeService {
  constructor(
    private readonly db: Database,
    private readonly holidays: HolidayCalendar,
    private readonly now: () => Date = () => new Date(),
  ) {}

  today(): IsoDate {
    return localIsoDate(this.now());
  }

  findUser(id: string): User | null {
    const row = this.db.prepare('SELECT * FROM app_user WHERE id = ?').get(id);
    return row ? toUser(row) : null;
  }

  schedules(userId: string): Schedule[] {
    return this.db
      .prepare('SELECT * FROM work_schedule WHERE user_id = ? ORDER BY valid_from')
      .all(userId)
      .map(toSchedule);
  }

  summaries(user: User, from: IsoDate, to: IsoDate): DaySummary[] {
    const schedules = this.schedules(user.id);
    const days = new Map(
      this.db
        .prepare('SELECT * FROM work_day WHERE user_id = ? AND date BETWEEN ? AND ?')
        .all(user.id, from, to)
        .map((r) => [String(r['date']), r]),
    );
    const stamps = new Map<IsoDate, TimeStamp[]>();
    for (const r of this.db
      .prepare('SELECT * FROM time_stamp WHERE user_id = ? AND date BETWEEN ? AND ?')
      .all(user.id, from, to)) {
      const date = String(r['date']);
      stamps.set(date, [...(stamps.get(date) ?? []), toStamp(r)]);
    }
    const booked = new Map(
      this.db
        .prepare(
          `SELECT date, SUM(quarters) AS q FROM booking
            WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY date`,
        )
        .all(user.id, from, to)
        .map((r) => [String(r['date']), Number(r['q'])]),
    );

    const today = this.today();
    const nowClock = localClockTime(this.now());

    return dateRange(from, to).map((date): DaySummary => {
      const day = days.get(date);
      const dayStamps = stamps.get(date) ?? [];
      const holidayName = this.holidays.holidayName(user.region, date);
      const manualType = str(day?.['day_type']) as DayType | null;
      const dayType: DayType = manualType ?? (holidayName ? 'holiday' : 'work');
      const weekday = weekdayOf(date);
      const schedule = date >= user.trackingStart ? scheduleFor(schedules, date) : null;
      const untracked = schedule === null;
      const calc = calculateDay(dayStamps, {
        autoBreak: user.autoBreak,
        openEnd: date === today ? nowClock : null,
      });
      const target = schedule ? targetMinutes(dayType, baseTargetMinutes(schedule, weekday)) : 0;
      const counted = !untracked && date <= today;
      return {
        date,
        weekday,
        dayType,
        dayTypeManual: manualType !== null,
        holidayName,
        location: str(day?.['location']) as Location | null,
        note: str(day?.['note']),
        untracked,
        running: dayStamps.some((s) => s.end === null),
        calc,
        targetMinutes: target,
        diffMinutes: counted ? calc.netMinutes - target : 0,
        distributableQuarters: minutesToQuarters(calc.netMinutes),
        bookedQuarters: booked.get(date) ?? 0,
      };
    });
  }

  dayDetail(user: User, date: IsoDate): DayDetail {
    const summary = this.summaries(user, date, date)[0]!;
    const stamps = this.db
      .prepare('SELECT * FROM time_stamp WHERE user_id = ? AND date = ? ORDER BY start_time')
      .all(user.id, date)
      .map(toStamp);
    const bookings = this.db
      .prepare(`${BOOKING_SELECT} WHERE b.user_id = ? AND b.date = ? ORDER BY p.name, wp.name`)
      .all(user.id, date)
      .map(toBooking);
    return { ...summary, stamps, bookings };
  }

  summary(user: User, from: IsoDate, to: IsoDate): SummaryResponse {
    const days = this.summaries(user, from, to);
    const totals = { targetMinutes: 0, netMinutes: 0, diffMinutes: 0, homeDays: 0, officeDays: 0 };
    for (const d of days) {
      totals.targetMinutes += d.targetMinutes;
      totals.netMinutes += d.calc.netMinutes;
      totals.diffMinutes += d.diffMinutes;
      if (d.dayType === 'work' && d.calc.netMinutes > 0) {
        if (d.location === 'home') totals.homeDays++;
        if (d.location === 'office') totals.officeDays++;
      }
    }
    return { from, to, days, totals };
  }

  /** Saldo inkl. Anfangssaldo bis einschließlich `asOf` (Standard: gestern). */
  balance(user: User, asOf: IsoDate = addDays(this.today(), -1)): Balance {
    let balance = user.openingBalanceMinutes;
    if (asOf >= user.trackingStart) {
      for (const d of this.summaries(user, user.trackingStart, asOf)) balance += d.diffMinutes;
    }
    return { balanceMinutes: balance, asOf };
  }
}
