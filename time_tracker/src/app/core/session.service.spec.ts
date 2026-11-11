import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { USER } from '../../testing/fixtures';
import { SessionService } from './session.service';

describe('SessionService', () => {
  let http: HttpTestingController;
  let session: SessionService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
  });

  afterEach(() => http.verify());

  it('lädt den angemeldeten Benutzer', () => {
    session.load();
    expect(session.loaded()).toBe(false);
    http.expectOne('api/me').flush({ user: USER, haDisplayName: 'Alice', today: '2026-11-11' });
    expect(session.user()).toEqual(USER);
    expect(session.haDisplayName()).toBe('Alice');
    expect(session.loaded()).toBe(true);
  });

  it('merkt sich Fehler', () => {
    session.load();
    http.expectOne('api/me').flush({ error: 'Kein Benutzer' }, { status: 401, statusText: 'x' });
    expect(session.error()).toBe('Kein Benutzer');
    expect(session.loaded()).toBe(true);
  });
});
