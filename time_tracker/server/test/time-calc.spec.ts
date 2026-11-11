import { describe, expect, it } from 'vitest';
import {
  addDays,
  baseTargetMinutes,
  calculateDay,
  clockToMinutes,
  dateRange,
  endOfMonth,
  formatDuration,
  formatQuarters,
  isClockTime,
  isIsoDate,
  localClockTime,
  localIsoDate,
  minutesToClock,
  minutesToQuarters,
  requiredBreak,
  scheduleFor,
  startOfMonth,
  startOfWeek,
  targetMinutes,
  weekdayOf,
} from '../../shared/time-calc.js';

const auto = { autoBreak: true };

describe('Formatierung und Parsing', () => {
  it('prüft Uhrzeiten und Datumswerte', () => {
    expect(isClockTime('08:15')).toBe(true);
    expect(isClockTime('24:00')).toBe(false);
    expect(isClockTime('8:15')).toBe(false);
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate(20260101)).toBe(false);
  });

  it('rechnet Uhrzeiten und Dauern um', () => {
    expect(clockToMinutes('08:15')).toBe(495);
    expect(minutesToClock(495)).toBe('08:15');
    expect(minutesToClock(5000)).toBe('23:59');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(65, true)).toBe('+1:05');
    expect(formatDuration(-30, true)).toBe('-0:30');
    expect(formatDuration(0, true)).toBe('+0:00');
    expect(formatQuarters(7)).toBe('1,75');
    expect(minutesToQuarters(487)).toBe(32); // 8:07 → 8,00 h
    expect(minutesToQuarters(488)).toBe(33); // 8:08 → 8,25 h
    expect(minutesToQuarters(-5)).toBe(0);
  });

  it('rechnet mit Kalendertagen', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(weekdayOf('2026-11-11')).toBe('wed');
    expect(weekdayOf('2026-11-15')).toBe('sun');
    expect(startOfWeek('2026-11-15')).toBe('2026-11-09');
    expect(startOfMonth('2026-02-17')).toBe('2026-02-01');
    expect(endOfMonth('2028-02-03')).toBe('2028-02-29');
    expect(dateRange('2026-11-29', '2026-12-02')).toHaveLength(4);
    const d = new Date(2026, 0, 5, 7, 3);
    expect(localIsoDate(d)).toBe('2026-01-05');
    expect(localClockTime(d)).toBe('07:03');
  });
});

describe('calculateDay – Pausen nach ArbZG', () => {
  it('liefert 0 ohne Stempel', () => {
    expect(calculateDay([], auto)).toMatchObject({ netMinutes: 0, grossMinutes: 0, warnings: [] });
  });

  it('zieht bis 6 h keine Pause ab', () => {
    const r = calculateDay([{ start: '08:00', end: '14:00' }], auto);
    expect(r).toMatchObject({ netMinutes: 360, breakDeductedMinutes: 0, breakRequiredMinutes: 0 });
  });

  it('kappt den Abzug an der 6-h-Schwelle', () => {
    const r = calculateDay([{ start: '08:00', end: '14:10' }], auto);
    expect(r).toMatchObject({ netMinutes: 360, breakDeductedMinutes: 10 });
  });

  it('zieht über 6 h fehlende Pause bis 30 min ab', () => {
    const r = calculateDay([{ start: '08:00', end: '16:00' }], auto);
    expect(r).toMatchObject({ grossMinutes: 480, netMinutes: 450, breakDeductedMinutes: 30 });
  });

  it('rechnet genommene Pausen (Lücken) an', () => {
    const r = calculateDay(
      [
        { start: '12:35', end: '17:00' },
        { start: '08:00', end: '12:15' },
      ],
      auto,
    );
    expect(r).toMatchObject({
      grossMinutes: 540,
      breakTakenMinutes: 20,
      breakDeductedMinutes: 10,
      netMinutes: 510,
      breakRequiredMinutes: 30,
    });
  });

  it('verlangt über 9 h 45 min und berechnet 9:10 h ohne Pause korrekt', () => {
    expect(calculateDay([{ start: '07:00', end: '16:10' }], auto).netMinutes).toBe(520);
    const r = calculateDay(
      [
        { start: '07:00', end: '12:00' },
        { start: '12:30', end: '16:45' },
      ],
      auto,
    );
    expect(r).toMatchObject({ netMinutes: 540, breakDeductedMinutes: 15, breakTakenMinutes: 30 });
  });

  it('warnt ohne automatischen Abzug nur', () => {
    const r = calculateDay([{ start: '08:00', end: '16:00' }], { autoBreak: false });
    expect(r).toMatchObject({ netMinutes: 480, breakDeductedMinutes: 0, breakRequiredMinutes: 30 });
    expect(r.warnings).toEqual(['BREAK_TOO_SHORT']);
  });

  it('warnt über 10 h Nettoarbeitszeit', () => {
    const r = calculateDay([{ start: '06:00', end: '17:00' }], auto);
    expect(r.netMinutes).toBe(615);
    expect(r.warnings).toContain('OVER_10H');
  });

  it('nutzt für laufende Stempel die aktuelle Uhrzeit, sonst Warnung', () => {
    const stamps = [{ start: '08:00', end: null }];
    expect(calculateDay(stamps, { autoBreak: true, openEnd: '10:00' }).netMinutes).toBe(120);
    const past = calculateDay(stamps, auto);
    expect(past.netMinutes).toBe(0);
    expect(past.warnings).toEqual(['MISSING_END']);
  });

  it('liefert die Pausenstufen', () => {
    expect([360, 361, 540, 541].map(requiredBreak)).toEqual([0, 30, 30, 45]);
  });
});

describe('Soll', () => {
  const schedules = [
    { validFrom: '2026-01-01', weeklyMinutes: 2400, workdays: ['mon', 'tue', 'wed', 'thu', 'fri'] },
    { validFrom: '2026-07-01', weeklyMinutes: 1920, workdays: ['mon', 'tue', 'wed', 'thu'] },
  ] as const;

  it('wählt das gültige Arbeitszeitmodell', () => {
    expect(scheduleFor(schedules, '2025-12-31')).toBeNull();
    expect(scheduleFor(schedules, '2026-06-30')?.weeklyMinutes).toBe(2400);
    expect(scheduleFor(schedules, '2026-07-01')?.weeklyMinutes).toBe(1920);
  });

  it('verteilt die Wochenstunden auf die Arbeitstage', () => {
    expect(baseTargetMinutes(schedules[0], 'fri')).toBe(480);
    expect(baseTargetMinutes(schedules[1], 'fri')).toBe(0);
    expect(baseTargetMinutes(schedules[1], 'mon')).toBe(480);
    expect(baseTargetMinutes({ ...schedules[0], workdays: [] }, 'mon')).toBe(0);
  });

  it('setzt Soll je Tagesart', () => {
    expect(targetMinutes('work', 480)).toBe(480);
    expect(targetMinutes('flex', 480)).toBe(480);
    expect(targetMinutes('vacation', 480)).toBe(0);
    expect(targetMinutes('sick', 480)).toBe(0);
    expect(targetMinutes('holiday', 480)).toBe(0);
  });
});
