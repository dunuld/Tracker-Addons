import { HttpErrorResponse } from '@angular/common/http';

/**
 * Lesbare Fehlermeldung aus einem API-Fehler.
 * `HttpErrorResponse` ist kein `Error` – die Server-Meldung steht in `error.error`.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse) {
    const body: unknown = err.error;
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
      return body.error;
    }
    return fallback;
  }
  return err instanceof Error && err.message ? err.message : fallback;
}
