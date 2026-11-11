import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Schedule } from '../../../../shared/api-types';
import { USER, clickButton, enter } from '../../../testing/fixtures';
import { SessionService } from '../../core/session.service';
import SettingsComponent from './settings.component';

const SCHEDULES: Schedule[] = [
  {
    id: 1,
    validFrom: '2026-11-02',
    weeklyMinutes: 2400,
    workdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  },
  { id: 2, validFrom: '2027-01-01', weeklyMinutes: 1890, workdays: ['mon', 'tue', 'wed', 'thu'] },
];

describe('SettingsComponent', () => {
  let http: HttpTestingController;

  function create(schedules = SCHEDULES, user: typeof USER | null = USER) {
    TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(SessionService).user.set(user);
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
    http.expectOne('api/regions').flush([{ code: 'BY', name: 'Bayern' }]);
    http.expectOne('api/me/schedules').flush(schedules);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('zeigt Einstellungen und Arbeitszeitmodelle', () => {
    const fixture = create();
    const c = fixture.componentInstance;
    const t = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(c.openingHours).toBe('1,5');
    expect(c.weeklyHours).toBe('31,5');
    expect(c.workdays()).toEqual(['mon', 'tue', 'wed', 'thu']);
    expect(t).toContain('01.01.2027');
    expect(t).toContain('31:30 h');
    expect(t).toContain('7:53 h');
    expect(c.dailyMinutes({ ...SCHEDULES[0]!, workdays: [] })).toBe(0);
    expect(c.dayList(SCHEDULES[1]!)).toBe('Mo, Di, Mi, Do');
  });

  it('funktioniert ohne Benutzer und Modelle', () => {
    const fixture = create([], null);
    expect(fixture.componentInstance.weeklyHours).toBe('40');
  });

  it('speichert persönliche Einstellungen', () => {
    vi.useFakeTimers();
    const fixture = create();
    const c = fixture.componentInstance;
    c.openingHours = 'x';
    c.saveSettings();
    expect(c.error()).toContain('Übertrag');

    c.openingHours = '-3';
    c.autoBreak = false;
    c.saveSettings();
    const req = http.expectOne('api/me');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({
      region: 'BY',
      trackingStart: '2026-11-02',
      openingBalanceMinutes: -180,
      autoBreak: false,
      defaultLocation: 'office',
    });
    req.flush({ ...USER, autoBreak: false });
    expect(TestBed.inject(SessionService).user()?.autoBreak).toBe(false);
    expect(c.saved()).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(c.saved()).toBe(false);

    c.saveSettings();
    http
      .expectOne('api/me')
      .flush({ error: 'Unbekanntes Bundesland' }, { status: 400, statusText: 'x' });
    expect(c.error()).toBe('Unbekanntes Bundesland');
  });

  it('legt Arbeitszeitmodelle an und löscht sie', () => {
    const fixture = create();
    const c = fixture.componentInstance;
    c.weeklyHours = '';
    c.addSchedule();
    expect(c.error()).toContain('Wochenstunden');

    c.weeklyHours = '32';
    c.validFrom = '2027-03-01';
    c.toggleDay('thu');
    c.toggleDay('fri');
    c.addSchedule();
    const req = http.expectOne('api/me/schedules');
    expect(req.request.body).toEqual({
      validFrom: '2027-03-01',
      weeklyMinutes: 1920,
      workdays: ['mon', 'tue', 'wed', 'fri'],
    });
    req.flush([
      ...SCHEDULES,
      { id: 3, validFrom: '2027-03-01', weeklyMinutes: 1920, workdays: [] },
    ]);
    expect(c.schedules()).toHaveLength(3);

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    c.deleteSchedule(SCHEDULES[1]!);
    confirm.mockReturnValue(true);
    c.deleteSchedule(SCHEDULES[1]!);
    http.expectOne('api/me/schedules/2').flush(null);
    expect(c.schedules().map((s) => s.id)).toEqual([1, 3]);

    c.deleteSchedule(SCHEDULES[0]!);
    http
      .expectOne('api/me/schedules/1')
      .flush({ error: 'Das letzte Modell' }, { status: 409, statusText: 'x' });
    expect(c.error()).toBe('Das letzte Modell');
  });

  it('lässt sich vollständig über die Formulare bedienen', async () => {
    const fixture = create();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const [region, location] = el.querySelectorAll('select');
    const inputs = el.querySelectorAll<HTMLInputElement>('input:not([type=checkbox])');
    enter(region, 'BY');
    enter(location, 'home');
    enter(inputs[0], '2026-12-01');
    enter(inputs[1], '2');
    el.querySelector<HTMLInputElement>('.check input')!.click();
    clickButton(el, 'Speichern');
    expect(http.expectOne('api/me').request.body).toEqual({
      region: 'BY',
      trackingStart: '2026-12-01',
      openingBalanceMinutes: 120,
      autoBreak: false,
      defaultLocation: 'home',
    });

    enter(inputs[2], '2027-02-01');
    enter(inputs[3], '30');
    el.querySelectorAll<HTMLInputElement>('.days input')[0]!.click();
    clickButton(el, 'Übernehmen');
    expect(http.expectOne('api/me/schedules').request.body).toEqual({
      validFrom: '2027-02-01',
      weeklyMinutes: 1800,
      workdays: ['tue', 'wed', 'thu'],
    });

    vi.spyOn(window, 'confirm').mockReturnValue(false);
    clickButton(el, 'Löschen');
    expect(window.confirm).toHaveBeenCalled();
  });
});
