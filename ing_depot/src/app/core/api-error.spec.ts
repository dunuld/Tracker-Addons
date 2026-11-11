import { HttpErrorResponse } from '@angular/common/http';
import { apiErrorMessage } from './api-error';

describe('apiErrorMessage', () => {
  it('liefert die Server-Meldung aus dem API-Fehlerformat', () => {
    const err = new HttpErrorResponse({
      status: 409,
      error: { error: 'Schon vorhanden', code: 'X' },
    });
    expect(apiErrorMessage(err, 'Fallback')).toBe('Schon vorhanden');
  });

  it.each([
    ['Netzwerkfehler', new HttpErrorResponse({ status: 0, error: new ProgressEvent('error') })],
    ['Text-Body', new HttpErrorResponse({ status: 502, error: 'Bad Gateway' })],
    ['leerer Body', new HttpErrorResponse({ status: 500 })],
  ])('nutzt den Fallback bei %s', (_label, err) => {
    expect(apiErrorMessage(err, 'Fallback')).toBe('Fallback');
  });

  it('nutzt die Meldung normaler Fehler', () => {
    expect(apiErrorMessage(new Error('kaputt'), 'Fallback')).toBe('kaputt');
    expect(apiErrorMessage('irgendwas', 'Fallback')).toBe('Fallback');
  });
});
