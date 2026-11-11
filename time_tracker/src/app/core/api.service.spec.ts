import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Observable } from 'rxjs';
import { ApiService } from './api.service';

describe('ApiService', () => {
  let api: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('ruft den Health-Check relativ zum Ingress-Pfad ab', () => {
    let version: string | undefined;
    api.health().subscribe((res) => (version = res.version));

    const req = http.expectOne('api/health');
    expect(req.request.method).toBe('GET');
    req.flush({ status: 'ok', version: '0.1.0' });
    expect(version).toBe('0.1.0');
  });

  it('nutzt die richtigen Methoden, Pfade und Bodies', () => {
    const cases: [Observable<unknown>, string, string, unknown?][] = [
      [api.regions(), 'GET', 'api/regions'],
      [api.me(), 'GET', 'api/me'],
      [api.setup({} as never), 'POST', 'api/me', {}],
      [api.updateSettings({ autoBreak: false }), 'PATCH', 'api/me', { autoBreak: false }],
      [api.balance(), 'GET', 'api/me/balance'],
      [api.schedules(), 'GET', 'api/me/schedules'],
      [api.saveSchedule({} as never), 'POST', 'api/me/schedules', {}],
      [api.deleteSchedule(3), 'DELETE', 'api/me/schedules/3'],
      [api.summary('2026-11-01', '2026-11-30'), 'GET', 'api/summary?from=2026-11-01&to=2026-11-30'],
      [api.day('2026-11-10'), 'GET', 'api/days/2026-11-10'],
      [api.updateDay('2026-11-10', { location: 'home' }), 'PATCH', 'api/days/2026-11-10'],
      [api.stamp('2026-11-10', '08:00'), 'POST', 'api/days/2026-11-10/stamp', { time: '08:00' }],
      [
        api.addStamp('2026-11-10', { start: '08:00', end: null }),
        'POST',
        'api/days/2026-11-10/stamps',
      ],
      [api.updateStamp(4, { start: '08:00', end: '09:00' }), 'PUT', 'api/stamps/4'],
      [api.deleteStamp(4), 'DELETE', 'api/stamps/4'],
      [
        api.addBooking('2026-11-10', { workPackageId: 1, quarters: 2 }),
        'POST',
        'api/days/2026-11-10/bookings',
      ],
      [api.updateBooking(5, { quarters: 3 }), 'PUT', 'api/bookings/5', { quarters: 3 }],
      [api.deleteBooking(5), 'DELETE', 'api/bookings/5'],
      [api.projects(), 'GET', 'api/projects'],
      [api.createProject({ name: 'A' }), 'POST', 'api/projects', { name: 'A' }],
      [api.updateProject(1, { active: false }), 'PATCH', 'api/projects/1'],
      [api.deleteProject(1), 'DELETE', 'api/projects/1'],
      [api.createPackage(1, { name: 'B' }), 'POST', 'api/projects/1/packages'],
      [api.updatePackage(2, { name: 'C' }), 'PATCH', 'api/packages/2'],
      [api.deletePackage(2), 'DELETE', 'api/packages/2'],
    ];
    for (const [request, method, url, body] of cases) {
      request.subscribe();
      const req = http.expectOne((r) => r.urlWithParams === url);
      expect(req.request.method).toBe(method);
      if (body !== undefined) expect(req.request.body).toEqual(body);
      req.flush(null);
    }
  });
});
