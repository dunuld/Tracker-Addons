import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { PROJECTS, clickButton, day, enter } from '../../../testing/fixtures';
import { localIsoDate } from '../../core/format';
import DayComponent from './day.component';

const DATE = '2026-11-10';

describe('DayComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<DayComponent>;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => {
    fixture.detectChanges();
    return el().textContent ?? '';
  };
  const button = (label: string) =>
    [...el().querySelectorAll('button')].find((b) => b.textContent?.includes(label))!;

  function create(date: string | null = DATE, detail = day(DATE)) {
    params = new BehaviorSubject(convertToParamMap(date ? { date } : {}));
    TestBed.configureTestingModule({
      imports: [DayComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: params } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DayComponent);
    fixture.detectChanges();
    http.expectOne(`api/days/${date ?? localIsoDate(new Date())}`).flush(detail);
    http.expectOne('api/me/balance').flush({ balanceMinutes: 120, asOf: '2026-11-09' });
    http.expectOne('api/projects').flush(PROJECTS);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  /** Erwartet eine Änderungsanfrage, beantwortet sie und den folgenden Saldo-Abruf. */
  function expectChange(method: string, url: string, body?: unknown, response = day(DATE)) {
    const req = http.expectOne(url);
    expect(req.request.method).toBe(method);
    if (body !== undefined) expect(req.request.body).toEqual(body);
    req.flush(response);
    http.expectOne('api/me/balance').flush({ balanceMinutes: 120, asOf: '2026-11-09' });
    fixture.detectChanges();
  }

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('zeigt Stempel, Summen, Saldo und Buchungen', () => {
    const c = create();
    const t = text();
    expect(t).toContain('10.11.2026');
    expect(t).toContain('KOMMEN');
    expect(t).toContain('8:30'); // Netto
    expect(t).toContain('+0:30');
    expect(t).toContain('Saldo');
    expect(t).toContain('+2:30 h'); // 120 + 30
    expect(t).toContain('Projekt Alpha');
    expect(t).toContain('noch zu verteilen 1,00 h');
    expect(c.activeProjects()).toHaveLength(1);
    expect(c.activeProjects()[0]!.packages.map((p) => p.id)).toEqual([11]);
    expect(c.distributionClass()).toBe('warn');
    expect(el().querySelectorAll('.stamps li')).toHaveLength(2);
  });

  it('zeigt Warnungen, laufende Stempel, Überbuchung und Pausenabzug', () => {
    const c = create(
      DATE,
      day(DATE, {
        running: true,
        bookedQuarters: 40,
        stamps: [{ id: 1, start: '08:00', end: null }],
        calc: { ...day(DATE).calc, breakDeductedMinutes: 15, warnings: ['OVER_10H'] },
        untracked: true,
      }),
    );
    const t = text();
    expect(t).toContain('GEHEN');
    expect(t).toContain('läuft');
    expect(t).toContain('Mehr als 10 Stunden');
    expect(t).toContain('15 min automatisch');
    expect(t).toContain('1,50 h überbucht');
    expect(t).toContain('vor dem Beginn');
    expect(c.distributionClass()).toBe('error');
  });

  it('stempelt mit der eingegebenen Uhrzeit', () => {
    const c = create();
    c.stampTime = '07:45';
    c.onStampTimeChange();
    c.tick(); // überschreibt die manuell geänderte Zeit nicht
    expect(c.stampTime).toBe('07:45');
    button('KOMMEN').click();
    expectChange('POST', `api/days/${DATE}/stamp`, { time: '07:45' });
    expect(c.stampTime).not.toBe('07:45');
  });

  it('zeigt Fehler beim Speichern', () => {
    const c = create();
    c.stamp();
    http
      .expectOne(`api/days/${DATE}/stamp`)
      .flush({ error: 'Überschneidung' }, { status: 409, statusText: 'Conflict' });
    expect(text()).toContain('Überschneidung');
    expect(c.busy()).toBe(false);
  });

  it('bearbeitet, löscht und ergänzt Stempel', () => {
    const c = create();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const [start, end] = el().querySelectorAll<HTMLInputElement>('.stamps li input');
    start!.value = '07:30';
    end!.value = '';
    button('Speichern').click();
    expectChange('PUT', 'api/stamps/1', { start: '07:30', end: null });

    c.deleteStamp({ id: 2, start: '12:30', end: null });
    expect(confirm).toHaveBeenCalledWith('Stempel 12:30 – läuft löschen?');
    expectChange('DELETE', 'api/stamps/2');
    confirm.mockReturnValue(false);
    c.deleteStamp({ id: 2, start: '12:30', end: '13:00' });

    c.newStart = '13:00';
    c.newEnd = '14:00';
    c.addStamp();
    expectChange('POST', `api/days/${DATE}/stamps`, { start: '13:00', end: '14:00' });
    expect(c.newStart).toBe('');
  });

  it('setzt Ort, Tagesart und Notiz', () => {
    const c = create();
    button('Home Office').click();
    expectChange('PATCH', `api/days/${DATE}`, { location: 'home' });

    const select = el().querySelector<HTMLSelectElement>('.day-type')!;
    select.value = 'vacation';
    select.dispatchEvent(new Event('change'));
    expectChange('PATCH', `api/days/${DATE}`, { dayType: 'vacation' });
    c.setDayType('');
    expectChange('PATCH', `api/days/${DATE}`, { dayType: null });

    c.saveNote(''); // unverändert → keine Anfrage
    c.saveNote('Arzt');
    expectChange('PATCH', `api/days/${DATE}`, { note: 'Arzt' });
  });

  it('bucht in Viertelstunden mit Schnellwahl und Rest', () => {
    const c = create();
    c.addBooking();
    expect(c.error()).toContain('Arbeitspaket');

    c.bookingPackageId = 11;
    c.setQuarters(0);
    expect(c.bookingQuarters()).toBe(1);
    c.setQuarters(200);
    expect(c.bookingQuarters()).toBe(96);
    [...el().querySelectorAll<HTMLButtonElement>('.chip')]
      .find((b) => b.textContent?.trim() === '0,50')!
      .click();
    expect(c.bookingQuarters()).toBe(2);
    c.fillRemaining();
    expect(c.bookingQuarters()).toBe(4);
    c.bookingComment = 'Review';
    button('Buchen').click();
    expectChange('POST', `api/days/${DATE}/bookings`, {
      workPackageId: 11,
      quarters: 4,
      comment: 'Review',
    });
    expect(c.bookingComment).toBe('');

    el().querySelector<HTMLButtonElement>('.bookings [aria-label="0,25 h mehr"]')!.click();
    expectChange('PUT', 'api/bookings/5', { quarters: 31 });
    c.changeBooking(5, 0); // ungültig → keine Anfrage
    el().querySelector<HTMLButtonElement>('[aria-label="Buchung löschen"]')!.click();
    expectChange('DELETE', 'api/bookings/5');
  });

  it('füllt keinen Rest, wenn alles verteilt ist', () => {
    const c = create(DATE, day(DATE, { bookedQuarters: 34 }));
    c.setQuarters(3);
    c.fillRemaining();
    expect(c.bookingQuarters()).toBe(3);
    expect(c.distributionClass()).toBe('ok');
    expect(text()).toContain('alles verteilt');
  });

  it('weist ohne Arbeitspakete auf die Projekte hin', () => {
    params = new BehaviorSubject(convertToParamMap({ date: DATE }));
    create();
    fixture.componentInstance.projects.set([]);
    expect(text()).toContain('Noch keine Arbeitspakete');
  });

  it('navigiert zwischen Tagen', () => {
    const c = create();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    c.go(-1);
    expect(navigate).toHaveBeenCalledWith(['day', '2026-11-09']);
    c.navigate(localIsoDate(new Date()));
    expect(navigate).toHaveBeenLastCalledWith(['']);
    c.navigate('');
    expect(navigate).toHaveBeenCalledTimes(2);

    params.next(convertToParamMap({ date: '2026-11-09' }));
    http.expectOne('api/days/2026-11-09').flush(day('2026-11-09'));
    http.expectOne('api/me/balance').flush({ balanceMinutes: 0, asOf: '2026-11-08' });
    expect(c.date()).toBe('2026-11-09');
    expect(c.signClass(0)).toBe('');
    expect(c.signClass(-1)).toBe('negative');
  });

  it('lädt laufende Tage minütlich neu und zeigt Ladefehler', () => {
    const today = localIsoDate(new Date());
    const c = create(null, day(today, { running: true }));
    expect(c.isToday()).toBe(true);
    c.tick();
    http.expectOne(`api/days/${today}`).flush({ error: 'Weg' }, { status: 500, statusText: 'x' });
    http.expectOne('api/me/balance').flush({ balanceMinutes: 0, asOf: today });
    expect(text()).toContain('Weg');
    // Saldo enthält den heutigen Tag nicht doppelt, wenn asOf schon heute ist
    expect(c.balanceToday()).toBe(0);
  });

  it('lässt sich vollständig über die Oberfläche bedienen', async () => {
    const c = create();
    await fixture.whenStable();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const root = el();

    root.querySelector<HTMLButtonElement>('[aria-label="Vorheriger Tag"]')!.click();
    root.querySelector<HTMLButtonElement>('[aria-label="Nächster Tag"]')!.click();
    enter(root.querySelector('[aria-label="Datum wählen"]'), '2026-10-01');
    expect(navigate).toHaveBeenCalledWith(['day', '2026-10-01']);

    enter(root.querySelector('.stamp-row input'), '06:30');
    expect(c.stampTime).toBe('06:30');

    enter(root.querySelector('.field.grow input[maxlength="500"]'), 'Notiz');
    expectChange('PATCH', `api/days/${DATE}`, { note: 'Notiz' });

    const add = root.querySelectorAll<HTMLInputElement>('details input');
    enter(add[0], '18:00');
    enter(add[1], '19:00');
    fixture.detectChanges();
    clickButton(root, 'Hinzufügen');
    expectChange('POST', `api/days/${DATE}/stamps`, { start: '18:00', end: '19:00' });

    root.querySelector<HTMLButtonElement>('[aria-label="Stempel löschen"]')!.click();

    const select = root.querySelector<HTMLSelectElement>('.booking-form select')!;
    select.value = select.options[1]!.value;
    select.dispatchEvent(new Event('change'));
    expect(c.bookingPackageId).toBe(11);
    const stepper = root.querySelectorAll<HTMLButtonElement>('.booking-form .stepper button');
    stepper[1]!.click();
    stepper[0]!.click();
    stepper[0]!.click();
    expect(c.bookingQuarters()).toBe(3);
    clickButton(root, 'Rest');
    expect(c.bookingQuarters()).toBe(4);
    enter(root.querySelector('[placeholder="Kommentar (optional)"]'), 'Meeting');
    clickButton(root, 'Buchen');
    expectChange('POST', `api/days/${DATE}/bookings`, {
      workPackageId: 11,
      quarters: 4,
      comment: 'Meeting',
    });

    root.querySelector<HTMLButtonElement>('.bookings [aria-label="0,25 h weniger"]')!.click();
    expectChange('PUT', 'api/bookings/5', { quarters: 29 });
  });
});
