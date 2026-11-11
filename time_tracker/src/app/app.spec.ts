import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { USER } from '../testing/fixtures';
import { App } from './app';
import { ThemeService } from './core/theme.service';

describe('App', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterTestingModule, App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  function meResponse(user: typeof USER | null) {
    http.expectOne('api/me').flush({ user, haDisplayName: 'Alice', today: '2026-11-11' });
  }

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render navigation brand', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.nav-brand')?.textContent).toContain('Zeiterfassung');
  });

  it('zeigt die Navigation für eingerichtete Benutzer', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Lade');
    meResponse(USER);
    fixture.detectChanges();
    const links = compiled.querySelectorAll('nav a');
    expect([...links].map((link) => link.textContent?.trim())).toEqual([
      'Heute',
      'Kalender',
      'Projekte',
      'Einstellungen',
    ]);
  });

  it('zeigt die Einrichtung für neue Benutzer', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    meResponse(null);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-setup')).not.toBeNull();
    expect(compiled.querySelectorAll('nav a')).toHaveLength(0);
    http.expectOne('api/regions').flush([]);
  });

  it('zeigt Verbindungsfehler', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    http.expectOne('api/me').flush({ error: 'Kaputt' }, { status: 500, statusText: 'x' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.alert')?.textContent).toContain(
      'Kaputt',
    );
  });

  describe('Theme-Schalter', () => {
    beforeEach(() => {
      localStorage.clear();
      vi.stubGlobal('matchMedia', undefined);
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      localStorage.clear();
    });

    it('wechselt per Klick hell → dunkel → System und passt Symbol und Titel an', () => {
      localStorage.setItem('time-tracker-theme', 'light');
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        '.theme-toggle',
      )!;

      const states = [0, 1, 2].map(() => {
        const state = [
          button.textContent?.trim(),
          button.title,
          document.documentElement.dataset['theme'],
        ];
        button.click();
        fixture.detectChanges();
        return state;
      });

      expect(states).toEqual([
        ['☀️', 'Hell (nächster Klick: Dunkel)', 'light'],
        ['🌙', 'Dunkel (nächster Klick: System)', 'dark'],
        ['💻', 'System (nächster Klick: Hell)', 'light'],
      ]);
    });

    it('nutzt die ThemeService-Instanz aus der Dependency Injection', () => {
      const fixture = TestBed.createComponent(App);
      expect(fixture.componentInstance.themeService).toBe(TestBed.inject(ThemeService));
    });
  });
});
