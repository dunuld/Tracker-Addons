import { Router } from 'express';
import type { DayInput, IsoDate, StampInput, User } from '../../../shared/api-types.js';
import { clockToMinutes, dateRange } from '../../../shared/time-calc.js';
import { transaction, type Database } from '../db/database.js';
import { badRequest, conflict, isUniqueViolation, notFound, parseId } from '../http-error.js';
import { BOOKING_SELECT, toBooking, toStamp, type TimeService } from '../services/time.service.js';
import { userOf } from '../user-context.js';
import * as v from '../validate.js';

/** Längster abfragbarer Zeitraum für /summary (gut ein Jahr). */
export const MAX_SUMMARY_DAYS = 400;
const MAX_QUARTERS_PER_BOOKING = 24 * 4;
const END_OF_DAY = 24 * 60;

/** Legt den Tag mit Standard-Ort an, falls er noch nicht existiert. */
function ensureDay(db: Database, user: User, date: IsoDate): void {
  db.prepare(
    `INSERT INTO work_day (user_id, date, location) VALUES (?, ?, ?)
     ON CONFLICT (user_id, date) DO UPDATE SET location = COALESCE(work_day.location, excluded.location)`,
  ).run(user.id, date, user.defaultLocation);
}

/** Prüft, dass ein Stempelpaar sich mit keinem anderen des Tages überschneidet. */
function assertNoOverlap(db: Database, user: User, date: IsoDate, s: StampInput, ignoreId = 0) {
  const start = clockToMinutes(s.start);
  const end = s.end === null ? END_OF_DAY : clockToMinutes(s.end);
  if (s.end !== null && end <= start) throw badRequest('Gehen muss nach Kommen liegen');
  const others = db
    .prepare('SELECT * FROM time_stamp WHERE user_id = ? AND date = ? AND id <> ?')
    .all(user.id, date, ignoreId)
    .map(toStamp);
  for (const o of others) {
    const oStart = clockToMinutes(o.start);
    const oEnd = o.end === null ? END_OF_DAY : clockToMinutes(o.end);
    if (start < oEnd && oStart < end)
      throw conflict(`Überschneidung mit ${o.start} – ${o.end ?? 'läuft'}`, 'OVERLAP');
  }
}

function stampInput(body: unknown): StampInput {
  const input = (body ?? {}) as Partial<StampInput>;
  return {
    start: v.clock(input.start, 'Kommen'),
    end: input.end === null || input.end === undefined ? null : v.clock(input.end, 'Gehen'),
  };
}

function openStampConflict(error: unknown): never {
  if (isUniqueViolation(error))
    throw conflict(
      'Es gibt bereits einen offenen Stempel – bitte zuerst ausstempeln',
      'OPEN_STAMP',
    );
  throw error;
}

/** Tage, Stempel und Buchungen des angemeldeten Benutzers. */
export function daysRouter(db: Database, time: TimeService): Router {
  const router = Router();

  const stampOf = (user: User, id: number) => {
    const row = db
      .prepare('SELECT * FROM time_stamp WHERE id = ? AND user_id = ?')
      .get(id, user.id);
    if (!row) throw notFound('Stempel nicht gefunden');
    return { ...toStamp(row), date: String(row['date']) };
  };

  const activePackage = (user: User, id: unknown) => {
    const row = db
      .prepare(
        `SELECT wp.id, wp.active AND p.active AS active FROM work_package wp
           JOIN project p ON p.id = wp.project_id WHERE wp.id = ? AND p.user_id = ?`,
      )
      .get(v.int(id, 'Arbeitspaket', 1, Number.MAX_SAFE_INTEGER), user.id);
    if (!row) throw notFound('Arbeitspaket nicht gefunden');
    if (Number(row['active']) !== 1) throw badRequest('Arbeitspaket ist archiviert');
    return Number(row['id']);
  };

  router.get('/summary', (req, res) => {
    const user = userOf(res, time);
    const from = v.date(req.query['from'], 'from');
    const to = v.date(req.query['to'], 'to');
    if (to < from) throw badRequest('to muss nach from liegen');
    if (dateRange(from, to).length > MAX_SUMMARY_DAYS) throw badRequest('Zeitraum zu lang');
    res.json(time.summary(user, from, to));
  });

  router.get('/days/:date', (req, res) => {
    const user = userOf(res, time);
    res.json(time.dayDetail(user, v.date(req.params['date'])));
  });

  router.patch('/days/:date', (req, res) => {
    const user = userOf(res, time);
    const date = v.date(req.params['date']);
    const input = (req.body ?? {}) as DayInput;
    const current = db
      .prepare('SELECT * FROM work_day WHERE user_id = ? AND date = ?')
      .get(user.id, date);
    const next = {
      dayType:
        input.dayType === undefined
          ? (current?.['day_type'] ?? null)
          : input.dayType === null
            ? null
            : v.dayType(input.dayType),
      location:
        input.location === undefined
          ? (current?.['location'] ?? null)
          : input.location === null
            ? null
            : v.location(input.location),
      note:
        input.note === undefined
          ? (current?.['note'] ?? null)
          : v.optionalText(input.note, 'Notiz', 500),
    };
    db.prepare(
      `INSERT INTO work_day (user_id, date, day_type, location, note) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id, date)
       DO UPDATE SET day_type = excluded.day_type, location = excluded.location, note = excluded.note`,
    ).run(user.id, date, next.dayType, next.location, next.note);
    res.json(time.dayDetail(user, date));
  });

  /** Kommen/Gehen: schließt den offenen Stempel des Tages oder öffnet einen neuen. */
  router.post('/days/:date/stamp', (req, res) => {
    const user = userOf(res, time);
    const date = v.date(req.params['date']);
    const at = v.clock((req.body ?? {}).time);
    const open = db
      .prepare('SELECT * FROM time_stamp WHERE user_id = ? AND end_time IS NULL')
      .get(user.id);
    transaction(db, () => {
      if (open) {
        if (String(open['date']) !== date)
          throw conflict(
            `Offener Stempel vom ${String(open['date'])} – bitte dort zuerst ausstempeln`,
            'OPEN_STAMP',
          );
        const stamp = toStamp(open);
        if (clockToMinutes(at) <= clockToMinutes(stamp.start))
          throw badRequest('Gehen muss nach Kommen liegen');
        db.prepare('UPDATE time_stamp SET end_time = ? WHERE id = ?').run(at, stamp.id);
      } else {
        assertNoOverlap(db, user, date, { start: at, end: null });
        db.prepare('INSERT INTO time_stamp (user_id, date, start_time) VALUES (?, ?, ?)').run(
          user.id,
          date,
          at,
        );
        ensureDay(db, user, date);
      }
    });
    res.json(time.dayDetail(user, date));
  });

  router.post('/days/:date/stamps', (req, res) => {
    const user = userOf(res, time);
    const date = v.date(req.params['date']);
    const input = stampInput(req.body);
    assertNoOverlap(db, user, date, input);
    try {
      transaction(db, () => {
        db.prepare(
          'INSERT INTO time_stamp (user_id, date, start_time, end_time) VALUES (?, ?, ?, ?)',
        ).run(user.id, date, input.start, input.end);
        ensureDay(db, user, date);
      });
    } catch (error) {
      openStampConflict(error);
    }
    res.status(201).json(time.dayDetail(user, date));
  });

  router.put('/stamps/:id', (req, res) => {
    const user = userOf(res, time);
    const stamp = stampOf(user, parseId(req.params['id']));
    const input = stampInput(req.body);
    assertNoOverlap(db, user, stamp.date, input, stamp.id);
    try {
      db.prepare('UPDATE time_stamp SET start_time = ?, end_time = ? WHERE id = ?').run(
        input.start,
        input.end,
        stamp.id,
      );
    } catch (error) {
      openStampConflict(error);
    }
    res.json(time.dayDetail(user, stamp.date));
  });

  router.delete('/stamps/:id', (req, res) => {
    const user = userOf(res, time);
    const stamp = stampOf(user, parseId(req.params['id']));
    db.prepare('DELETE FROM time_stamp WHERE id = ?').run(stamp.id);
    res.json(time.dayDetail(user, stamp.date));
  });

  // Gleiches Arbeitspaket am selben Tag → Viertelstunden werden addiert.
  router.post('/days/:date/bookings', (req, res) => {
    const user = userOf(res, time);
    const date = v.date(req.params['date']);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const packageId = activePackage(user, body['workPackageId']);
    const quarters = v.int(body['quarters'], 'Viertelstunden', 1, MAX_QUARTERS_PER_BOOKING);
    const comment = v.optionalText(body['comment'], 'Kommentar', 500);
    const result = db
      .prepare(
        `INSERT INTO booking (user_id, date, work_package_id, quarters, comment)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id, date, work_package_id) DO UPDATE SET
           quarters = booking.quarters + excluded.quarters,
           comment = COALESCE(excluded.comment, booking.comment)
         WHERE booking.quarters + excluded.quarters <= ?`,
      )
      .run(user.id, date, packageId, quarters, comment, MAX_QUARTERS_PER_BOOKING);
    if (result.changes === 0) throw badRequest('Höchstens 24 Stunden pro Arbeitspaket und Tag');
    res.status(201).json(time.dayDetail(user, date));
  });

  router.put('/bookings/:id', (req, res) => {
    const user = userOf(res, time);
    const id = parseId(req.params['id']);
    const row = db.prepare(`${BOOKING_SELECT} WHERE b.id = ? AND b.user_id = ?`).get(id, user.id);
    if (!row) throw notFound('Buchung nicht gefunden');
    const booking = toBooking(row);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const quarters =
      body['quarters'] === undefined
        ? booking.quarters
        : v.int(body['quarters'], 'Viertelstunden', 1, MAX_QUARTERS_PER_BOOKING);
    const comment =
      body['comment'] === undefined
        ? booking.comment
        : v.optionalText(body['comment'], 'Kommentar', 500);
    db.prepare('UPDATE booking SET quarters = ?, comment = ? WHERE id = ?').run(
      quarters,
      comment,
      id,
    );
    res.json(time.dayDetail(user, String(row['date'])));
  });

  router.delete('/bookings/:id', (req, res) => {
    const user = userOf(res, time);
    const id = parseId(req.params['id']);
    const row = db
      .prepare('SELECT date FROM booking WHERE id = ? AND user_id = ?')
      .get(id, user.id);
    if (!row) throw notFound('Buchung nicht gefunden');
    db.prepare('DELETE FROM booking WHERE id = ?').run(id);
    res.json(time.dayDetail(user, String(row['date'])));
  });

  return router;
}
