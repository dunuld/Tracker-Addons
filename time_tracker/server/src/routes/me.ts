import { Router } from 'express';
import type {
  MeResponse,
  ScheduleInput,
  SetupInput,
  UserSettings,
} from '../../../shared/api-types.js';
import { transaction, type Database } from '../db/database.js';
import type { HolidayCalendar } from '../holidays.js';
import { badRequest, conflict, notFound, parseId } from '../http-error.js';
import type { TimeService } from '../services/time.service.js';
import { haUserOf, userOf } from '../user-context.js';
import * as v from '../validate.js';

const MAX_BALANCE = 10_000 * 60;

function settings(input: Partial<UserSettings>, holidays: HolidayCalendar, partial: boolean) {
  const has = (key: keyof UserSettings) => !partial || input[key] !== undefined;
  const out: Partial<UserSettings> = {};
  if (has('region')) {
    if (typeof input.region !== 'string' || !holidays.isValidRegion(input.region))
      throw badRequest('Unbekanntes Bundesland');
    out.region = input.region;
  }
  if (has('trackingStart')) out.trackingStart = v.date(input.trackingStart, 'Startdatum');
  if (has('openingBalanceMinutes'))
    out.openingBalanceMinutes = v.int(
      input.openingBalanceMinutes,
      'Anfangssaldo',
      -MAX_BALANCE,
      MAX_BALANCE,
    );
  if (has('autoBreak')) out.autoBreak = v.bool(input.autoBreak, 'autoBreak');
  if (has('defaultLocation')) out.defaultLocation = v.location(input.defaultLocation);
  return out;
}

function schedule(input: Partial<ScheduleInput>): ScheduleInput {
  return {
    validFrom: v.date(input.validFrom, 'Gültig ab'),
    weeklyMinutes: v.int(input.weeklyMinutes, 'Wochenstunden (Minuten)', 0, 80 * 60),
    workdays: v.workdays(input.workdays),
  };
}

/** Eigener Benutzer: Einrichtung, Einstellungen, Arbeitszeitmodelle, Saldo. */
export function meRouter(db: Database, time: TimeService, holidays: HolidayCalendar): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const ha = haUserOf(res);
    const body: MeResponse = {
      user: time.findUser(ha.id),
      haDisplayName: ha.displayName,
      today: time.today(),
    };
    res.json(body);
  });

  router.post('/', (req, res) => {
    const ha = haUserOf(res);
    if (time.findUser(ha.id)) throw conflict('Benutzer ist bereits eingerichtet');
    const input = (req.body ?? {}) as Partial<SetupInput>;
    const s = settings(input, holidays, false) as UserSettings;
    const sched = schedule({ ...input, validFrom: s.trackingStart });
    transaction(db, () => {
      db.prepare(
        `INSERT INTO app_user (id, display_name, region, tracking_start, opening_balance_min,
                               auto_break, default_location) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        ha.id,
        ha.displayName,
        s.region,
        s.trackingStart,
        s.openingBalanceMinutes,
        s.autoBreak ? 1 : 0,
        s.defaultLocation,
      );
      db.prepare(
        'INSERT INTO work_schedule (user_id, valid_from, weekly_minutes, workdays) VALUES (?, ?, ?, ?)',
      ).run(ha.id, sched.validFrom, sched.weeklyMinutes, sched.workdays.join(','));
    });
    res.status(201).json(time.findUser(ha.id));
  });

  router.patch('/', (req, res) => {
    const user = userOf(res, time);
    const s = { ...user, ...settings(req.body ?? {}, holidays, true) };
    db.prepare(
      `UPDATE app_user SET display_name = ?, region = ?, tracking_start = ?, opening_balance_min = ?,
              auto_break = ?, default_location = ? WHERE id = ?`,
    ).run(
      haUserOf(res).displayName,
      s.region,
      s.trackingStart,
      s.openingBalanceMinutes,
      s.autoBreak ? 1 : 0,
      s.defaultLocation,
      user.id,
    );
    res.json(time.findUser(user.id));
  });

  router.get('/balance', (req, res) => {
    const user = userOf(res, time);
    const asOf = req.query['asOf'] === undefined ? undefined : v.date(req.query['asOf'], 'asOf');
    res.json(time.balance(user, asOf));
  });

  router.get('/schedules', (_req, res) => {
    res.json(time.schedules(userOf(res, time).id));
  });

  // Ein Modell pro Stichtag: erneutes Speichern mit gleichem Datum überschreibt es.
  router.post('/schedules', (req, res) => {
    const user = userOf(res, time);
    const s = schedule(req.body ?? {});
    db.prepare(
      `INSERT INTO work_schedule (user_id, valid_from, weekly_minutes, workdays) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, valid_from)
       DO UPDATE SET weekly_minutes = excluded.weekly_minutes, workdays = excluded.workdays`,
    ).run(user.id, s.validFrom, s.weeklyMinutes, s.workdays.join(','));
    res.status(201).json(time.schedules(user.id));
  });

  router.delete('/schedules/:id', (req, res) => {
    const user = userOf(res, time);
    const id = parseId(req.params['id']);
    const all = time.schedules(user.id);
    if (!all.some((s) => s.id === id)) throw notFound('Arbeitszeitmodell nicht gefunden');
    if (all.length === 1) throw conflict('Das letzte Arbeitszeitmodell kann nicht gelöscht werden');
    db.prepare('DELETE FROM work_schedule WHERE id = ? AND user_id = ?').run(id, user.id);
    res.status(204).end();
  });

  return router;
}
