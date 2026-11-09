import type { ApiError } from '../../shared/api-types.js';

/** Fehler mit HTTP-Status; Meldung wird dem Client angezeigt (deutsch). */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly details: Partial<Pick<ApiError, 'existing'>> = {},
  ) {
    super(message);
    this.name = 'HttpError';
  }

  toBody(): ApiError {
    return { error: this.message, ...(this.code ? { code: this.code } : {}), ...this.details };
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

/** Optionalen Query-Parameter als Ganzzahl in [min, max] lesen; sonst 400. */
export function intParam(
  value: unknown,
  name: string,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw badRequest(`Ungültiger Parameter ${name}`);
  return n;
}

/** Optionalen Query-Parameter `accountId` lesen. */
export const accountIdParam = (value: unknown): number | undefined =>
  intParam(value, 'accountId', 1, Number.MAX_SAFE_INTEGER);

/** SQLite-UNIQUE-Verletzung (z. B. doppelter Kategoriename) erkennen. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/.test(error.message);
}
