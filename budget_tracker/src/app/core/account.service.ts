import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Account } from '../../../shared/api-types';
import { ApiService } from './api.service';

const STORAGE_KEY = 'bt-account';

/**
 * Kontenliste und global gewähltes Konto (`null` = „Alle Konten“).
 * Die Auswahl gilt für Übersicht, Transaktionen und Verlauf und bleibt im Browser gespeichert.
 */
@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly api = inject(ApiService);

  readonly accounts = signal<Account[]>([]);
  readonly selectedId = signal<number | null>(readStoredId());
  /** Auswahl nur anbieten, wenn es mehr als ein Konto gibt. */
  readonly hasMultiple = computed(() => this.accounts().length > 1);

  /** Lädt die Konten neu; eine Auswahl, deren Konto nicht mehr existiert, wird zurückgesetzt. */
  async refresh(): Promise<Account[]> {
    const accounts = await firstValueFrom(this.api.listAccounts());
    this.accounts.set(accounts);
    const id = this.selectedId();
    if (id !== null && (accounts.length < 2 || !accounts.some((a) => a.id === id))) {
      this.select(null);
    }
    return accounts;
  }

  select(id: number | null): void {
    this.selectedId.set(id);
    try {
      if (id === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, String(id));
    } catch {
      // Speicher nicht verfügbar (z. B. privater Modus) – Auswahl gilt dann nur für die Sitzung.
    }
  }

  byId(id: number | null | undefined): Account | undefined {
    return this.accounts().find((a) => a.id === id);
  }

  /**
   * Ruft `callback` auf, sobald sich das gewählte Konto ändert (nicht beim ersten Lauf).
   * Muss im Injection-Kontext (z. B. Konstruktor) aufgerufen werden.
   */
  onSelectionChange(callback: () => void): void {
    let first = true;
    effect(() => {
      this.selectedId();
      if (first) {
        first = false;
        return;
      }
      callback();
    });
  }
}

function readStoredId(): number | null {
  try {
    const id = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}
