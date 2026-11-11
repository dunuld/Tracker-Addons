import Holidays from 'date-holidays';
import type { IsoDate, Region } from '../../shared/api-types.js';

const COUNTRY = 'DE';

/**
 * Gesetzliche Feiertage je Bundesland (offline über `date-holidays`).
 * Ergebnisse werden pro Bundesland und Jahr zwischengespeichert.
 */
export class HolidayCalendar {
  private readonly cache = new Map<string, Map<IsoDate, string>>();

  regions(): Region[] {
    const states = new Holidays().getStates(COUNTRY, 'de') ?? {};
    return Object.entries(states)
      .map(([code, name]) => ({ code, name: String(name) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  isValidRegion(region: string): boolean {
    return this.regions().some((r) => r.code === region);
  }

  /** Name des gesetzlichen Feiertags oder `null`. */
  holidayName(region: string, date: IsoDate): string | null {
    return this.forYear(region, Number(date.slice(0, 4))).get(date) ?? null;
  }

  private forYear(region: string, year: number): Map<IsoDate, string> {
    const key = `${region}:${year}`;
    let map = this.cache.get(key);
    if (!map) {
      map = new Map();
      const hd = new Holidays(COUNTRY, region, { types: ['public'] });
      for (const h of hd.getHolidays(year, 'de')) {
        if (h.type === 'public') map.set(h.date.slice(0, 10), h.name);
      }
      this.cache.set(key, map);
    }
    return map;
  }
}
