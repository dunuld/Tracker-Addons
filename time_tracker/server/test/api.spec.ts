import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  Balance,
  DayDetail,
  MeResponse,
  Project,
  Region,
  Schedule,
  SummaryResponse,
  User,
  WorkPackage,
} from '../../shared/api-types.js';
import { createApp } from '../src/app.js';
import { openDatabase, type Database } from '../src/db/database.js';
import { HolidayCalendar } from '../src/holidays.js';

// „Heute“ ist Mittwoch, 11.11.2026, 10:00 Uhr
const NOW = new Date(2026, 10, 11, 10, 0);

let db: Database;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  db = openDatabase(':memory:');
  app = createApp(db, { now: () => NOW });
});
afterEach(() => db.close());

/** Anfragen als HA-Benutzer `user` (Ingress-Header). */
function as(user: string) {
  const set = <T extends request.Test>(t: T) =>
    t.set('X-Remote-User-Id', user).set('X-Remote-User-Display-Name', `Name ${user}`);
  const agent = request(app);
  return {
    get: (url: string) => set(agent.get(url)),
    post: (url: string, body: object = {}) => set(agent.post(url)).send(body),
    put: (url: string, body: object) => set(agent.put(url)).send(body),
    patch: (url: string, body: object) => set(agent.patch(url)).send(body),
    delete: (url: string) => set(agent.delete(url)),
  };
}

const SETUP = {
  region: 'BY',
  trackingStart: '2026-11-02',
  openingBalanceMinutes: 60,
  autoBreak: true,
  defaultLocation: 'office',
  weeklyMinutes: 2400,
  workdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
};

async function setup(user = 'alice', overrides: object = {}) {
  return (
    await as(user)
      .post('/api/me', { ...SETUP, ...overrides })
      .expect(201)
  ).body as User;
}

async function createPackage(user = 'alice') {
  const project = (
    await as(user).post('/api/projects', { code: 'P1', name: 'Projekt Alpha' }).expect(201)
  ).body as Project;
  return (
    await as(user)
      .post(`/api/projects/${project.id}/packages`, { code: 'AP-12', name: 'Konzept' })
      .expect(201)
  ).body as WorkPackage;
}

describe('Benutzer & Einrichtung', () => {
  it('verlangt einen HA-Benutzer', async () => {
    const res = await request(app).get('/api/me').expect(401);
    expect(res.body.code).toBe('NO_USER');
  });

  it('nutzt lokal den Fallback-Benutzer', async () => {
    const dev = createApp(db, { fallbackUser: { id: 'dev', displayName: 'Dev' } });
    const res = await request(dev).get('/api/me').expect(200);
    expect(res.body).toMatchObject({ user: null, haDisplayName: 'Dev' });
  });

  it('führt durch die Einrichtung und verlangt sie vor allem anderen', async () => {
    const me = (await as('alice').get('/api/me').expect(200)).body as MeResponse;
    expect(me).toEqual({ user: null, haDisplayName: 'Name alice', today: '2026-11-11' });
    const blocked = await as('alice').get('/api/projects').expect(409);
    expect(blocked.body.code).toBe('SETUP_REQUIRED');

    const user = await setup();
    expect(user).toMatchObject({ id: 'alice', displayName: 'Name alice', region: 'BY' });
    await as('alice').post('/api/me', SETUP).expect(409);
    const schedules = (await as('alice').get('/api/me/schedules').expect(200)).body as Schedule[];
    expect(schedules).toEqual([
      expect.objectContaining({ validFrom: '2026-11-02', weeklyMinutes: 2400 }),
    ]);
  });

  it('validiert die Einrichtung', async () => {
    await as('alice')
      .post('/api/me', { ...SETUP, region: 'XX' })
      .expect(400);
    await as('alice')
      .post('/api/me', { ...SETUP, trackingStart: '2026-02-30' })
      .expect(400);
    await as('alice')
      .post('/api/me', { ...SETUP, workdays: ['mo'] })
      .expect(400);
    await as('alice')
      .post('/api/me', { ...SETUP, weeklyMinutes: 99999 })
      .expect(400);
    await as('alice')
      .post('/api/me', { ...SETUP, autoBreak: 'ja' })
      .expect(400);
    await as('alice')
      .post('/api/me', { ...SETUP, defaultLocation: 'mars' })
      .expect(400);
    await as('alice')
      .post('/api/me', { ...SETUP, openingBalanceMinutes: 1.5 })
      .expect(400);
  });

  it('ändert Einstellungen und Arbeitszeitmodelle', async () => {
    await setup();
    const patched = (await as('alice').patch('/api/me', { region: 'NW', autoBreak: false }))
      .body as User;
    expect(patched).toMatchObject({ region: 'NW', autoBreak: false, trackingStart: '2026-11-02' });

    let list = (
      await as('alice')
        .post('/api/me/schedules', {
          validFrom: '2027-01-01',
          weeklyMinutes: 1920,
          workdays: ['fri', 'mon', 'mon'],
        })
        .expect(201)
    ).body as Schedule[];
    expect(list.at(-1)).toMatchObject({ weeklyMinutes: 1920, workdays: ['mon', 'fri'] });
    // gleiches Datum überschreibt
    list = (
      await as('alice').post('/api/me/schedules', {
        validFrom: '2027-01-01',
        weeklyMinutes: 1800,
        workdays: ['mon'],
      })
    ).body as Schedule[];
    expect(list).toHaveLength(2);

    await as('alice').delete(`/api/me/schedules/${list[1]!.id}`).expect(204);
    await as('alice').delete(`/api/me/schedules/${list[0]!.id}`).expect(409);
    await as('alice').delete('/api/me/schedules/9999').expect(404);
  });

  it('listet die Bundesländer', async () => {
    const regions = (await request(app).get('/api/regions').expect(200)).body as Region[];
    expect(regions).toHaveLength(16);
    expect(regions).toContainEqual({ code: 'BY', name: 'Bayern' });
  });
});

describe('Stempeln', () => {
  beforeEach(() => setup());

  it('stempelt ein und aus und rechnet live', async () => {
    let day = (await as('alice').post('/api/days/2026-11-11/stamp', { time: '08:00' }).expect(200))
      .body as DayDetail;
    expect(day).toMatchObject({ running: true, location: 'office', targetMinutes: 480 });
    expect(day.calc.netMinutes).toBe(120); // bis „jetzt“ 10:00

    await as('alice').post('/api/days/2026-11-11/stamp', { time: '07:00' }).expect(400);
    day = (await as('alice').post('/api/days/2026-11-11/stamp', { time: '12:00' })).body;
    expect(day.running).toBe(false);
    day = (await as('alice').post('/api/days/2026-11-11/stamp', { time: '12:30' })).body;
    expect(day.running).toBe(true);
    day = (await as('alice').post('/api/days/2026-11-11/stamp', { time: '17:00' })).body;
    expect(day.stamps.map((s) => `${s.start}-${s.end}`)).toEqual(['08:00-12:00', '12:30-17:00']);
    expect(day.calc).toMatchObject({ netMinutes: 510, breakTakenMinutes: 30 });
    expect(day).toMatchObject({ diffMinutes: 30, distributableQuarters: 34 });
  });

  it('lehnt Stempel in einem belegten Zeitraum ab', async () => {
    await as('alice').post('/api/days/2026-11-10/stamps', { start: '08:00', end: '12:00' });
    const res = await as('alice').post('/api/days/2026-11-10/stamp', { time: '09:00' }).expect(409);
    expect(res.body.code).toBe('OVERLAP');
  });

  it('erkennt offene Stempel an anderen Tagen', async () => {
    await as('alice').post('/api/days/2026-11-10/stamp', { time: '08:00' });
    const res = await as('alice').post('/api/days/2026-11-11/stamp', { time: '08:00' }).expect(409);
    expect(res.body.code).toBe('OPEN_STAMP');
    const day = (await as('alice').get('/api/days/2026-11-10')).body as DayDetail;
    expect(day.calc.warnings).toContain('MISSING_END');
    // zweiter offener Stempel per Formular ebenfalls nicht erlaubt
    await as('alice')
      .post('/api/days/2026-11-11/stamps', { start: '08:00', end: null })
      .expect(409);
  });

  it('bearbeitet und löscht Stempel', async () => {
    const day = (
      await as('alice')
        .post('/api/days/2026-11-09/stamps', { start: '08:00', end: '12:00' })
        .expect(201)
    ).body as DayDetail;
    const id = day.stamps[0]!.id;
    await as('alice')
      .post('/api/days/2026-11-09/stamps', { start: '13:00', end: '12:00' })
      .expect(400);
    await as('alice').post('/api/days/2026-11-09/stamps', { start: '8:00' }).expect(400);
    await as('alice').post('/api/days/2026-11-09/stamps', { start: '13:00', end: '16:00' });
    await as('alice').put(`/api/stamps/${id}`, { start: '08:00', end: '13:30' }).expect(409);
    const edited = (await as('alice').put(`/api/stamps/${id}`, { start: '07:30', end: '12:00' }))
      .body as DayDetail;
    expect(edited.calc.netMinutes).toBe(270 + 180);
    // offener Stempel reicht bis Tagesende und überschneidet sich daher mit 13:00–16:00
    await as('alice').put(`/api/stamps/${id}`, { start: '07:30', end: null }).expect(409);
    await as('alice').delete(`/api/stamps/${id}`).expect(200);
    await as('alice').delete(`/api/stamps/${id}`).expect(404);
  });
});

describe('Tage, Feiertage & Saldo', () => {
  beforeEach(() => setup());

  it('erkennt Feiertage automatisch und erlaubt manuelles Überschreiben', async () => {
    // 01.11. ist Sonntag; 2027-01-06 (Heilige Drei Könige) ist in Bayern Feiertag
    let day = (await as('alice').get('/api/days/2027-01-06')).body as DayDetail;
    expect(day).toMatchObject({
      dayType: 'holiday',
      dayTypeManual: false,
      holidayName: 'Heilige Drei Könige',
      targetMinutes: 0,
    });
    day = (await as('alice').patch('/api/days/2027-01-06', { dayType: 'work' })).body;
    expect(day).toMatchObject({ dayType: 'work', dayTypeManual: true, targetMinutes: 480 });
    day = (await as('alice').patch('/api/days/2027-01-06', { dayType: null })).body;
    expect(day).toMatchObject({ dayType: 'holiday', dayTypeManual: false });

    // In NRW ist der 06.01. kein Feiertag
    await as('alice').patch('/api/me', { region: 'NW' });
    day = (await as('alice').get('/api/days/2027-01-06')).body;
    expect(day).toMatchObject({ dayType: 'work', holidayName: null });
  });

  it('setzt Ort, Notiz und validiert', async () => {
    const day = (
      await as('alice').patch('/api/days/2026-11-10', { location: 'home', note: ' Zahnarzt ' })
    ).body as DayDetail;
    expect(day).toMatchObject({ location: 'home', note: 'Zahnarzt' });
    const cleared = (await as('alice').patch('/api/days/2026-11-10', { location: null, note: '' }))
      .body as DayDetail;
    expect(cleared).toMatchObject({ location: null, note: null });
    await as('alice').patch('/api/days/2026-11-10', { dayType: 'party' }).expect(400);
    await as('alice').patch('/api/days/2026-11-10', { location: 'mars' }).expect(400);
    await as('alice').get('/api/days/gestern').expect(400);
  });

  it('berechnet Zusammenfassung und Überstundenkonto', async () => {
    // Mo 02.11.: 9 h netto (+1 h), Di 03.11.: Urlaub, Mi 04.11.: Gleittag, Do 05.11.: 8 h
    await as('alice').post('/api/days/2026-11-02/stamps', { start: '07:00', end: '16:45' });
    await as('alice').patch('/api/days/2026-11-02', { location: 'home' });
    await as('alice').patch('/api/days/2026-11-03', { dayType: 'vacation' });
    await as('alice').patch('/api/days/2026-11-04', { dayType: 'flex' });
    await as('alice').post('/api/days/2026-11-05/stamps', { start: '08:00', end: '16:30' });

    const summary = (
      await as('alice').get('/api/summary?from=2026-11-01&to=2026-11-08').expect(200)
    ).body as SummaryResponse;
    const byDate = Object.fromEntries(summary.days.map((d) => [d.date, d]));
    expect(byDate['2026-11-01']).toMatchObject({ untracked: true, diffMinutes: 0 });
    expect(byDate['2026-11-02']).toMatchObject({ diffMinutes: 60, location: 'home' });
    expect(byDate['2026-11-03']).toMatchObject({ dayType: 'vacation', diffMinutes: 0 });
    expect(byDate['2026-11-04']).toMatchObject({ dayType: 'flex', diffMinutes: -480 });
    expect(byDate['2026-11-05']).toMatchObject({ diffMinutes: 0, location: 'office' });
    expect(byDate['2026-11-06']).toMatchObject({ diffMinutes: -480 });
    expect(byDate['2026-11-07']).toMatchObject({ targetMinutes: 0, weekday: 'sat' });
    expect(summary.totals).toMatchObject({ homeDays: 1, officeDays: 1, diffMinutes: -900 });

    // Saldo bis gestern (10.11.): +60 Anfangssaldo, -900 Woche 1, Mo/Di 09./10. je -480
    const balance = (await as('alice').get('/api/me/balance').expect(200)).body as Balance;
    expect(balance).toEqual({ balanceMinutes: 60 - 900 - 960, asOf: '2026-11-10' });
    const early = (await as('alice').get('/api/me/balance?asOf=2026-10-01')).body as Balance;
    expect(early.balanceMinutes).toBe(60);
    // Zukunft zählt nicht ins Soll
    const future = (await as('alice').get('/api/summary?from=2026-11-12&to=2026-11-12')).body;
    expect(future.days[0]).toMatchObject({ targetMinutes: 480, diffMinutes: 0 });
  });

  it('validiert den Zeitraum der Zusammenfassung', async () => {
    await as('alice').get('/api/summary?from=2026-11-10&to=2026-11-01').expect(400);
    await as('alice').get('/api/summary?from=2025-01-01&to=2026-12-31').expect(400);
    await as('alice').get('/api/summary?from=x&to=2026-12-31').expect(400);
    await as('alice').get('/api/me/balance?asOf=x').expect(400);
  });
});

describe('Projekte, Arbeitspakete & Buchungen', () => {
  beforeEach(() => setup());

  it('verwaltet Projekte und Arbeitspakete', async () => {
    const pkg = await createPackage();
    await as('alice').post('/api/projects', { code: 'P1', name: 'Doppelt' }).expect(409);
    await as('alice').post('/api/projects', { name: '  ' }).expect(400);
    await as('alice').post('/api/projects', {}).expect(400);
    await as('alice')
      .post(`/api/projects/${pkg.projectId}/packages`, { code: 'AP-12', name: 'X' })
      .expect(409);

    const patched = (
      await as('alice').patch(`/api/packages/${pkg.id}`, { budgetQuarters: 40, code: '' })
    ).body as WorkPackage;
    expect(patched).toMatchObject({ budgetQuarters: 40, code: null, name: 'Konzept' });
    await as('alice').patch(`/api/packages/${pkg.id}`, { budgetQuarters: 0 }).expect(400);
    await as('alice').patch(`/api/packages/${pkg.id}`, { budgetQuarters: null }).expect(200);
    const project = (
      await as('alice').patch(`/api/projects/${pkg.projectId}`, { name: 'Alpha', active: false })
    ).body as Project;
    expect(project).toMatchObject({ name: 'Alpha', active: false, packages: [{ id: pkg.id }] });

    const other = (await as('alice').post('/api/projects', { code: 'P2', name: 'Beta' })).body;
    await as('alice').patch(`/api/projects/${other.id}`, { code: 'P1' }).expect(409);
    await as('alice').delete(`/api/packages/${pkg.id}`).expect(204);
    await as('alice').delete(`/api/projects/${pkg.projectId}`).expect(204);
    await as('alice').delete(`/api/projects/${pkg.projectId}`).expect(404);
  });

  it('bucht in Viertelstunden und addiert gleiche Pakete', async () => {
    const pkg = await createPackage();
    await as('alice').post('/api/days/2026-11-10/stamps', { start: '08:00', end: '16:30' });
    let day = (
      await as('alice')
        .post('/api/days/2026-11-10/bookings', { workPackageId: pkg.id, quarters: 14 })
        .expect(201)
    ).body as DayDetail;
    expect(day.bookedQuarters).toBe(14);
    day = (
      await as('alice').post('/api/days/2026-11-10/bookings', {
        workPackageId: pkg.id,
        quarters: 2,
        comment: 'Abstimmung',
      })
    ).body;
    expect(day.bookings).toEqual([
      expect.objectContaining({
        quarters: 16,
        comment: 'Abstimmung',
        projectName: 'Projekt Alpha',
      }),
    ]);
    expect(day).toMatchObject({ bookedQuarters: 16, distributableQuarters: 32 });

    const id = day.bookings[0]!.id;
    day = (await as('alice').put(`/api/bookings/${id}`, { quarters: 32 }).expect(200)).body;
    expect(day.bookings[0]).toMatchObject({ quarters: 32, comment: 'Abstimmung' });
    await as('alice').put(`/api/bookings/${id}`, { quarters: 0 }).expect(400);
    await as('alice').put(`/api/bookings/${id}`, { quarters: 1.5 }).expect(400);
    await as('alice')
      .post('/api/days/2026-11-10/bookings', { workPackageId: pkg.id, quarters: 90 })
      .expect(400);

    const projects = (await as('alice').get('/api/projects')).body as Project[];
    expect(projects[0]).toMatchObject({ bookedQuarters: 32 });
    await as('alice').delete(`/api/packages/${pkg.id}`).expect(409);
    await as('alice').delete(`/api/projects/${pkg.projectId}`).expect(409);

    // archivierte Pakete sind nicht mehr buchbar
    await as('alice').patch(`/api/packages/${pkg.id}`, { active: false });
    await as('alice')
      .post('/api/days/2026-11-11/bookings', { workPackageId: pkg.id, quarters: 1 })
      .expect(400);

    await as('alice').delete(`/api/bookings/${id}`).expect(200);
    await as('alice').delete(`/api/bookings/${id}`).expect(404);
    await as('alice').put(`/api/bookings/${id}`, { quarters: 1 }).expect(404);
  });
});

describe('Trennung der Benutzer', () => {
  it('sieht und ändert keine Daten anderer Benutzer', async () => {
    await setup('alice');
    await setup('bob', { region: 'NW' });
    const pkg = await createPackage('alice');
    const day = (
      await as('alice').post('/api/days/2026-11-10/stamps', { start: '08:00', end: '12:00' })
    ).body as DayDetail;
    const booked = (
      await as('alice').post('/api/days/2026-11-10/bookings', {
        workPackageId: pkg.id,
        quarters: 4,
      })
    ).body as DayDetail;
    const stampId = day.stamps[0]!.id;
    const bookingId = booked.bookings[0]!.id;

    expect((await as('bob').get('/api/projects')).body).toEqual([]);
    const bobDay = (await as('bob').get('/api/days/2026-11-10')).body as DayDetail;
    expect(bobDay).toMatchObject({ stamps: [], bookings: [], bookedQuarters: 0 });

    await as('bob').put(`/api/stamps/${stampId}`, { start: '09:00', end: '10:00' }).expect(404);
    await as('bob').delete(`/api/stamps/${stampId}`).expect(404);
    await as('bob').put(`/api/bookings/${bookingId}`, { quarters: 1 }).expect(404);
    await as('bob').delete(`/api/bookings/${bookingId}`).expect(404);
    await as('bob').patch(`/api/projects/${pkg.projectId}`, { name: 'x' }).expect(404);
    await as('bob').patch(`/api/packages/${pkg.id}`, { name: 'x' }).expect(404);
    await as('bob').post(`/api/projects/${pkg.projectId}/packages`, { name: 'x' }).expect(404);
    await as('bob')
      .post('/api/days/2026-11-10/bookings', { workPackageId: pkg.id, quarters: 1 })
      .expect(404);

    // Bob kann denselben Projektcode verwenden
    await as('bob').post('/api/projects', { code: 'P1', name: 'Bobs Projekt' }).expect(201);
    expect((await as('alice').get('/api/days/2026-11-10')).body.stamps).toHaveLength(1);
  });
});

describe('HolidayCalendar', () => {
  it('liefert Feiertage je Bundesland und Jahr', () => {
    const h = new HolidayCalendar();
    expect(h.holidayName('BY', '2026-11-01')).toBe('Allerheiligen');
    expect(h.holidayName('BE', '2026-11-01')).toBeNull();
    expect(h.holidayName('SN', '2026-11-18')).toBe('Buß- und Bettag');
    expect(h.holidayName('BY', '2026-12-24')).toBeNull(); // kein gesetzlicher Feiertag
    expect(h.isValidRegion('HH')).toBe(true);
    expect(h.isValidRegion('DE')).toBe(false);
  });
});
