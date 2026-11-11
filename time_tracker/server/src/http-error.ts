import type { ApiError } from '../../shared/api-types.js';

/** Fehler mit HTTP-Status; Meldung wird dem Client angezeigt (deutsch). */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }

  toBody(): ApiError {
    return { error: this.message, ...(this.code ? { code: this.code } : {}) };
  }
}

export const badRequest = (message: string, code = 'BAD_REQUEST') =>
  new HttpError(400, message, code);
export const notFound = (message = 'Nicht gefunden') => new HttpError(404, message, 'NOT_FOUND');
export const conflict = (message: string, code = 'CONFLICT') => new HttpError(409, message, code);

/** Pfad-Parameter als positive Ganzzahl-ID lesen; sonst 400. */
export function parseId(value: unknown): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw badRequest('Ungültige ID');
  return id;
}

/** SQLite-UNIQUE-Verletzung (z. B. doppelter Projektcode) erkennen. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/.test(error.message);
}
