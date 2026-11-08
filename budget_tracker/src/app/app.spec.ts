import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { App } from './app';
import { ThemeService } from './core/theme.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterTestingModule, App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

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
    expect(compiled.querySelector('.nav-brand')?.textContent).toContain('Haushaltsbuch');
  });

  it('should render all navigation links', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const links = compiled.querySelectorAll('nav a');
    expect(links.length).toBe(5);
    expect(links[0]?.textContent).toBe('Übersicht');
    expect(links[1]?.textContent).toBe('Transaktionen');
    expect(links[2]?.textContent).toBe('Verlauf');
    expect(links[3]?.textContent).toBe('Upload');
    expect(links[4]?.textContent).toBe('Einstellungen');
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
      localStorage.setItem('budget-tracker-theme', 'light');
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

  it('lädt die Konten beim Start und ignoriert Ladefehler', async () => {
    const fixture = TestBed.createComponent(App);
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne('api/accounts').error(new ProgressEvent('error'));
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
    httpMock.verify();
  });
});
