import { Injectable, signal } from '@angular/core';
import { applyHaTheme, clearHaTheme, getHaDocument, watchHaTheme } from './ha-theme.js';

export type ThemeMode = 'light' | 'dark' | 'auto';

const STORAGE_KEY = 'ing-depot-theme';

/** Wird auf `window` ausgelöst, sobald sich das effektive Theme ändert (z. B. für Charts). */
export const THEME_CHANGE_EVENT = 'app-theme-change';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly _mode = signal<ThemeMode>(this.load());

  readonly mode = this._mode.asReadonly();

  /** true, wenn die App in Home Assistant (Ingress-iframe) eingebettet ist. */
  readonly embedded = getHaDocument() !== null;

  private lastSignature = '';

  constructor() {
    document.documentElement.classList.toggle('ha-embedded', this.embedded);
    this.apply(this._mode());
    // React to system preference changes when in auto mode
    if (typeof window.matchMedia === 'function') {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (this._mode() === 'auto') {
          this.apply('auto');
        }
      });
    }
    // Im "Auto"-Modus dem HA-Theme folgen, auch wenn es zur Laufzeit gewechselt wird
    watchHaTheme(() => {
      if (this._mode() === 'auto') this.apply('auto');
    });
  }

  setMode(mode: ThemeMode) {
    this._mode.set(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* Speicher nicht verfügbar – Auswahl gilt nur für diese Sitzung */
    }
    this.apply(mode);
  }

  // Cycle: light → dark → auto → light
  toggle() {
    const current = this._mode();
    const next: ThemeMode = current === 'light' ? 'dark' : current === 'dark' ? 'auto' : 'light';
    this.setMode(next);
  }

  private load(): ThemeMode {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    if (stored === 'light' || stored === 'dark' || stored === 'auto') {
      return stored;
    }
    return 'auto';
  }

  private apply(mode: ThemeMode) {
    const html = document.documentElement;
    let resolved: 'light' | 'dark';

    if (mode === 'auto') {
      // Eingebettet in HA: Farben und Hell/Dunkel vom HA-Theme übernehmen
      const ha = applyHaTheme(html);
      if (ha) {
        resolved = ha.dark ? 'dark' : 'light';
      } else if (typeof window.matchMedia === 'function') {
        resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      } else {
        resolved = 'light';
      }
    } else {
      // Explizite Auswahl hat Vorrang vor dem HA-Theme
      clearHaTheme(html);
      resolved = mode;
    }

    html.setAttribute('data-theme', resolved);
    html.style.colorScheme = resolved;

    // Nur bei echter Änderung benachrichtigen (HA ändert seinen Inline-Style häufig)
    const signature = `${resolved}|${html.style.cssText}`;
    if (signature !== this.lastSignature) {
      this.lastSignature = signature;
      window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    }
  }
}
