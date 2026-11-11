import type { RequestHandler, Response } from 'express';
import type { User } from '../../shared/api-types.js';
import { HttpError } from './http-error.js';
import type { TimeService } from './services/time.service.js';

/** Header, mit denen der HA-Ingress-Proxy den angemeldeten Benutzer übermittelt. */
export const USER_ID_HEADER = 'x-remote-user-id';
export const USER_NAME_HEADER = 'x-remote-user-display-name';

export interface HaUser {
  id: string;
  displayName: string;
}

/**
 * Ermittelt den HA-Benutzer aus den Ingress-Headern. Da der IP-Filter nur den
 * Ingress-Proxy durchlässt, sind die Header vertrauenswürdig. Ohne Header (lokale
 * Entwicklung) wird `fallback` verwendet; ist keiner gesetzt, gibt es 401.
 */
export function identifyUser(fallback: HaUser | null): RequestHandler {
  return (req, res, next) => {
    const id = req.get(USER_ID_HEADER)?.trim();
    if (id && id.length <= 128) {
      const name = req.get(USER_NAME_HEADER)?.trim();
      res.locals['haUser'] = { id, displayName: name || 'Benutzer' } satisfies HaUser;
      return next();
    }
    if (fallback) {
      res.locals['haUser'] = fallback;
      return next();
    }
    next(new HttpError(401, 'Kein Home-Assistant-Benutzer erkannt', 'NO_USER'));
  };
}

export function haUserOf(res: Response): HaUser {
  return res.locals['haUser'] as HaUser;
}

/** Eingerichteter Benutzer der Anfrage; sonst 409 `SETUP_REQUIRED`. */
export function userOf(res: Response, time: TimeService): User {
  const user = time.findUser(haUserOf(res).id);
  if (!user) throw new HttpError(409, 'Bitte zuerst die Einrichtung abschließen', 'SETUP_REQUIRED');
  return user;
}
