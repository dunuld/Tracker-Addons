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

/** Liest eine positive Ganzzahl aus einem Pfad- oder Query-Parameter. */
export function parseId(value: unknown, label = 'ID'): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest(`Ungültige ${label}.`, 'INVALID_ID');
  return id;
}
