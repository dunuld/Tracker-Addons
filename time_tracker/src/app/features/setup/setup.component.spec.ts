import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { USER, clickButton, enter } from '../../../testing/fixtures';
import { SessionService } from '../../core/session.service';
import SetupComponent from './setup.component';

describe('SetupComponent', () => {
  let http: HttpTestingController;

  function create() {
    TestBed.configureTestingModule({
      imports: [SetupComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SetupComponent);
    fixture.detectChanges();
    http.expectOne('api/regions').flush([{ code: 'BY', name: 'Bayern' }]);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('legt den Benutzer mit den eingegebenen Werten an', () => {
    const fixture = create();
    const c = fixture.componentInstance;
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Bayern');
    c.weeklyHours = '38,5';
    c.openingHours = '-2,5';
    c.trackingStart = '2026-11-02';
    c.toggleDay('fri');
    c.toggleDay('sat');
    c.save();

    const req = http.expectOne('api/me');
    expect(req.request.body).toEqual({
      weeklyMinutes: 2310,
      workdays: ['mon', 'tue', 'wed', 'thu', 'sat'],
      region: 'BY',
      defaultLocation: 'office',
      trackingStart: '2026-11-02',
      openingBalanceMinutes: -150,
      autoBreak: true,
    });
    req.flush(USER);
    expect(TestBed.inject(SessionService).user()).toEqual(USER);
  });

  it('prüft die Wochenstunden und zeigt Serverfehler', () => {
    const fixture = create();
    const c = fixture.componentInstance;
    c.weeklyHours = 'viel';
    c.save();
    expect(c.error()).toContain('Wochenstunden');

    c.weeklyHours = '40';
    c.openingHours = '';
    c.save();
    const req = http.expectOne('api/me');
    expect(req.request.body.openingBalanceMinutes).toBe(0);
    req.flush({ error: 'Unbekanntes Bundesland' }, { status: 400, statusText: 'x' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Unbekanntes Bundesland');
    expect(c.saving()).toBe(false);
  });

  it('lässt sich vollständig über das Formular bedienen', async () => {
    const fixture = create();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    enter(el.querySelector('[name=hours]'), '20');
    enter(el.querySelector('[name=region]'), 'BY');
    enter(el.querySelector('[name=location]'), 'home');
    enter(el.querySelector('[name=start]'), '2026-12-01');
    enter(el.querySelector('[name=balance]'), '4');
    (el.querySelector('[name=autoBreak]') as HTMLInputElement).click();
    (el.querySelectorAll('.days input')[4] as HTMLInputElement).click();
    clickButton(el, 'Einrichtung abschließen');
    const req = http.expectOne('api/me');
    expect(req.request.body).toEqual({
      weeklyMinutes: 1200,
      workdays: ['mon', 'tue', 'wed', 'thu'],
      region: 'BY',
      defaultLocation: 'home',
      trackingStart: '2026-12-01',
      openingBalanceMinutes: 240,
      autoBreak: false,
    });
    req.flush(USER);
  });
});
