import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express, { type ErrorRequestHandler, type Express, type RequestHandler } from 'express';
import type { ApiError, HealthResponse } from '../../shared/api-types.js';
import type { DepotService } from './depot.service.js';
import { HttpError } from './http-error.js';
import { depotRouter } from './routes.js';

export interface AppOptions {
  /** Verzeichnis des Angular-Builds; fehlt es, wird nur die API bereitgestellt. */
  staticDir?: string;
  /** Erlaubte Client-IPs; `null`/leer = kein Filter. */
  allowedIps?: string[] | null;
  version?: string;
  /** Depot-Logik; fehlt sie, gibt es nur den Health-Check. */
  depot?: DepotService;
  /** Wird nach einem Upload aufgerufen, z. B. um den Eingangsordner erneut zu prüfen. */
  scanInbox?: () => Promise<unknown>;
}

/** Entfernt das IPv4-mapped-Präfix (`::ffff:172.30.32.2` → `172.30.32.2`). */
export function normalizeIp(ip: string | undefined): string {
  if (!ip) return '';
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

/**
 * Lässt nur Anfragen von erlaubten IPs zu (z. B. HA-Ingress-Proxy).
 * Bewertet wird die Socket-Adresse – X-Forwarded-For wird bewusst ignoriert.
 */
export function ipFilter(allowedIps: string[]): RequestHandler {
  const allowed = new Set(allowedIps.map(normalizeIp));
  return (req, res, next) => {
    if (allowed.has(normalizeIp(req.socket.remoteAddress))) return next();
    res.status(403).type('text/plain').send('Forbidden: Zugriff nur über Home Assistant Ingress');
  };
}

/** Wandelt Fehler in JSON-Antworten um; Details interner Fehler landen nur im Log. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json(err.toBody());
    return;
  }
  const status = typeof err?.status === 'number' ? err.status : 500;
  if (status >= 500) console.error(err);
  const body: ApiError = {
    error: status >= 500 ? 'Interner Serverfehler' : String(err?.message ?? 'Fehlerhafte Anfrage'),
  };
  res.status(status).json(body);
};

export function createApp(options: AppOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);

  if (options.allowedIps?.length) app.use(ipFilter(options.allowedIps));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  const api = express.Router();
  api.use(express.json({ limit: '1mb' }));
  api.get('/health', (_req, res) => {
    const body: HealthResponse = { status: 'ok', version: options.version ?? '0.0.0' };
    res.json(body);
  });

  if (options.depot) api.use(depotRouter(options.depot, options.scanInbox));

  api.use((_req, res) => {
    const body: ApiError = { error: 'Nicht gefunden', code: 'NOT_FOUND' };
    res.status(404).json(body);
  });
  app.use('/api', api);

  const staticDir = options.staticDir;
  const indexFile = staticDir ? join(staticDir, 'index.html') : undefined;
  if (staticDir && indexFile && existsSync(indexFile)) {
    app.use(
      express.static(staticDir, {
        index: false,
        setHeaders: (res, filePath) => {
          // Gehashte Bundles dauerhaft cachen, index.html nie (neue Versionen nach Update).
          if (/-[A-Z0-9]{8,}\.(js|css)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    // Hash-Routing: alle übrigen GET-Anfragen liefern die App-Shell.
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexFile);
    });
  }

  app.use(errorHandler);

  return app;
}
