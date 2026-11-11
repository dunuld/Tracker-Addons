import { Injectable, inject, signal } from '@angular/core';
import type { User } from '../../../shared/api-types';
import { apiErrorMessage } from './api-error';
import { ApiService } from './api.service';

/** Angemeldeter Benutzer und Ersteinrichtungs-Status. */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly api = inject(ApiService);

  readonly loaded = signal(false);
  readonly user = signal<User | null>(null);
  readonly haDisplayName = signal('');
  readonly error = signal<string | null>(null);

  load(): void {
    this.api.me().subscribe({
      next: (me) => {
        this.user.set(me.user);
        this.haDisplayName.set(me.haDisplayName);
        this.error.set(null);
        this.loaded.set(true);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err, 'Backend nicht erreichbar'));
        this.loaded.set(true);
      },
    });
  }
}
