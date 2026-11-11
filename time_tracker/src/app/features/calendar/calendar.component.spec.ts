import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { monthSummary, summary } from '../../../testing/fixtures';
import { endOfMonth, startOfMonth } from '../../../../shared/time-calc';
import { localIsoDate } from '../../core/format';
import CalendarComponent from './calendar.component';

describe('CalendarComponent', () => {
  let http: HttpTestingController;
  const month = startOfMonth(localIsoDate(new Date()));

  function create() {
    TestBed.configureTestingModule({
      imports: [CalendarComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CalendarComponent);
    fixture.detectChanges();
    http.expectOne(`api/summary?from=${month}&to=${endOfMonth(month)}`).flush(monthSummary());
    http.expectOne('api/me/balance').flush({ balanceMinutes: -45, asOf: '2026-11-10' });
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('zeigt Tage mit Wochensummen, Kennzahlen und Status', () => {
    const fixture = create();
    const c = fixture.componentInstance;
    const t = ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
    expect(c.weeks().map((w) => w.days.length)).toEqual([1, 2]);
    expect(c.weeks()[1]).toMatchObject({ netMinutes: 1020, diffMinutes: -30 });
    expect(t).toContain('Allerheiligen');
    expect(t).toContain('Urlaub');
    expect(t).toContain('1 von 4 Tagen (25 %)');
    expect(t).toContain('-0:45');
    expect(t).toContain('1,50 h zu viel');
    expect(t).toContain('läuft');
    expect(t).toContain('✓');
    expect(c.warnings(monthSummary().days[1]!)).toBe(
      'Mehr als 10 Stunden gearbeitet, Ausstempeln vergessen',
    );
    expect(c.remaining(summary('x'))).toBe(4);
    expect(c.signClass(0)).toBe('');
  });

  it('wechselt den Monat und öffnet Tage', () => {
    const fixture = create();
    const c = fixture.componentInstance;
    c.month.set('2026-11-01');
    c.shiftMonth(1);
    http
      .expectOne('api/summary?from=2026-12-01&to=2026-12-31')
      .flush({ error: 'Fehler' }, { status: 500, statusText: 'x' });
    expect(c.error()).toBe('Fehler');
    c.shiftMonth(-1);
    http.expectOne('api/summary?from=2026-11-01&to=2026-11-30').flush(monthSummary());
    expect(c.error()).toBeNull();
    expect(c.title()).toBe('November 2026');

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    c.open(summary('2026-11-02'));
    expect(navigate).toHaveBeenCalledWith(['day', '2026-11-02']);
    c.open(summary(c.today));
    expect(navigate).toHaveBeenLastCalledWith(['']);
  });

  it('zeigt keine Quote ohne erfasste Tage', () => {
    const fixture = create();
    const c = fixture.componentInstance;
    c.summary.set({
      ...monthSummary(),
      totals: { ...monthSummary().totals, homeDays: 0, officeDays: 0 },
    });
    expect(c.homeOfficeQuote()).toBeNull();
  });

  it('reagiert auf Klicks und Tastatur', () => {
    const fixture = create();
    const el = fixture.nativeElement as HTMLElement;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const rows = el.querySelectorAll<HTMLTableRowElement>('tr.day');
    rows[1]!.click();
    rows[2]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(navigate).toHaveBeenCalledTimes(2);

    const c = fixture.componentInstance;
    c.month.set('2026-11-01');
    el.querySelector<HTMLButtonElement>('[aria-label="Nächster Monat"]')!.click();
    http.expectOne('api/summary?from=2026-12-01&to=2026-12-31').flush(monthSummary());
    el.querySelector<HTMLButtonElement>('[aria-label="Vorheriger Monat"]')!.click();
    http.expectOne('api/summary?from=2026-11-01&to=2026-11-30').flush(monthSummary());
  });
});
