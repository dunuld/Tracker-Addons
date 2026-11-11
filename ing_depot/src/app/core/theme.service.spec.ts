import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

const STORAGE_KEY = 'ing-depot-theme';

/** Steuerbare Attrappe für `prefers-color-scheme` (jsdom kennt kein matchMedia). */
function fakeMatchMedia(initialDark: boolean) {
  let dark = initialDark;
  const listeners: (() => void)[] = [];
  const matchMedia = vi.fn(() => ({
    get matches() {
      return dark;
    },
    addEventListener: (_type: string, listener: () => void) => listeners.push(listener),
  }));
  return {
    matchMedia,
    /** Systemeinstellung ändern und den change-Event auslösen. */
    setDark(value: boolean) {
      dark = value;
      listeners.forEach((l) => l());
    },
  };
}

describe('ThemeService', () => {
  const theme = () => document.documentElement.getAttribute('data-theme');
  const create = () => TestBed.inject(ThemeService);

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  describe('ohne matchMedia', () => {
    beforeEach(() => vi.stubGlobal('matchMedia', undefined));

    it('startet im Modus auto und fällt auf hell zurück', () => {
      expect(create().mode()).toBe('auto');
      expect(theme()).toBe('light');
    });

    it('übernimmt den gespeicherten Modus', () => {
      localStorage.setItem(STORAGE_KEY, 'dark');
      expect(create().mode()).toBe('dark');
      expect(theme()).toBe('dark');
    });

    it('ignoriert ungültige gespeicherte Werte', () => {
      localStorage.setItem(STORAGE_KEY, 'neon');
      expect(create().mode()).toBe('auto');
    });

    it('setMode setzt Signal, Attribut und localStorage', () => {
      const service = create();
      service.setMode('dark');
      expect(service.mode()).toBe('dark');
      expect(theme()).toBe('dark');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
    });

    it('toggle wechselt hell → dunkel → auto → hell', () => {
      localStorage.setItem(STORAGE_KEY, 'light');
      const service = create();
      const seen = [1, 2, 3].map(() => {
        service.toggle();
        return service.mode();
      });
      expect(seen).toEqual(['dark', 'auto', 'light']);
    });
  });

  describe('mit matchMedia', () => {
    it('folgt im Modus auto der Systemeinstellung', () => {
      const media = fakeMatchMedia(true);
      vi.stubGlobal('matchMedia', media.matchMedia);
      create();
      expect(media.matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
      expect(theme()).toBe('dark');

      media.setDark(false);
      expect(theme()).toBe('light');
    });

    it('ignoriert Systemänderungen bei fest gewähltem Modus', () => {
      const media = fakeMatchMedia(false);
      vi.stubGlobal('matchMedia', media.matchMedia);
      create().setMode('light');

      media.setDark(true);
      expect(theme()).toBe('light');
    });
  });
});
