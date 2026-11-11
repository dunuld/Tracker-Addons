import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, errorHandler, ipFilter, normalizeIp } from '../src/app.js';
import { INGRESS_PROXY_IP, loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db/database.js';
import {
  badRequest,
  conflict,
  HttpError,
  isUniqueViolation,
  notFound,
  parseId,
} from '../src/http-error.js';

const memoryDb = () => openDatabase(':memory:');

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'time-tracker-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
  vi.restoreAllMocks();
});

describe('Konfiguration', () => {
  it('nutzt im Addon-Modus /data und den Ingress-IP-Filter', () => {
    const config = loadConfig({ ADDON_MODE: '1' });
    expect(config.addonMode).toBe(true);
    expect(config.dataDir).toBe('/data');
    expect(config.dbPath).toBe('/data/time_tracker.db');
    expect(config.fallbackUser).toBeNull();
    expect(config.port).toBe(8099);
    expect(config.host).toBe('0.0.0.0');
    expect(config.allowedIps).toContain(INGRESS_PROXY_IP);
  });

  it('ist lokal ohne IP-Filter und per Env überschreibbar', () => {
    expect(loadConfig({}).allowedIps).toBeNull();
    expect(loadConfig({}).fallbackUser).toEqual({ id: 'dev', displayName: 'Entwickler' });
    expect(loadConfig({ DEV_USER: '' }).fallbackUser).toBeNull();
    expect(loadConfig({}).host).toBe('127.0.0.1');
    const config = loadConfig({
      DATA_DIR: '/tmp/time-tracker',
      ALLOWED_IPS: '10.0.0.1, 10.0.0.2',
      PORT: '9000',
    });
    expect(config.dataDir).toBe('/tmp/time-tracker');
    expect(config.allowedIps).toEqual(['10.0.0.1', '10.0.0.2']);
    expect(config.port).toBe(9000);
  });

  it('liest die Version aus package.json', () => {
    expect(loadConfig({}).version).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('HttpError', () => {
  it('liefert Status, Meldung und Code', () => {
    expect(badRequest('Falsch').toBody()).toEqual({ error: 'Falsch', code: 'BAD_REQUEST' });
    expect(notFound().status).toBe(404);
    expect(new HttpError(418, 'Teekanne').toBody()).toEqual({ error: 'Teekanne' });
    expect(conflict('Doppelt').status).toBe(409);
    expect(parseId('7')).toBe(7);
    expect(() => parseId('x')).toThrow(HttpError);
    expect(isUniqueViolation(new Error('UNIQUE constraint failed: x'))).toBe(true);
    expect(isUniqueViolation('nein')).toBe(false);
  });
});

describe('HTTP-Server', () => {
  it('liefert Health-Check und JSON-404 unter /api', async () => {
    const app = createApp(memoryDb(), { version: '1.2.3' });
    await request(app).get('/api/health').expect(200, { status: 'ok', version: '1.2.3' });
    const res = await request(app).get('/api/unknown').set('X-Remote-User-Id', 'u1').expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('antwortet auf ungültiges JSON mit 400', async () => {
    await request(createApp(memoryDb()))
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{kaputt')
      .expect(400);
  });

  it('wandelt HttpError und unerwartete Fehler in JSON-Antworten um', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const appThrowing = (error: unknown) =>
      express()
        .get('/fail', () => {
          throw error;
        })
        .use(errorHandler);

    const httpErr = await request(appThrowing(notFound('Gibt es nicht')))
      .get('/fail')
      .expect(404);
    expect(httpErr.body).toEqual({ error: 'Gibt es nicht', code: 'NOT_FOUND' });

    const internal = await request(appThrowing(new Error('geheim')))
      .get('/fail')
      .expect(500);
    expect(internal.body).toEqual({ error: 'Interner Serverfehler' });
    expect(console.error).toHaveBeenCalled();
  });

  it('liefert die Angular-App statisch aus (SPA-Fallback)', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'index.html'), '<html><base href="./"></html>');
    writeFileSync(join(dir, 'main-ABCDEFGH.js'), 'console.log(1)');
    const app = createApp(memoryDb(), { staticDir: dir });

    const index = await request(app).get('/').expect(200);
    expect(index.text).toContain('base href="./"');
    expect(index.headers['cache-control']).toBe('no-cache');

    const asset = await request(app).get('/main-ABCDEFGH.js').expect(200);
    expect(asset.headers['cache-control']).toContain('immutable');

    await request(app).get('/irgendwas').expect(200);
    await request(app).post('/irgendwas').expect(404);
  });

  it('blockiert im Addon-Modus Anfragen, die nicht vom Ingress-Proxy kommen', async () => {
    // supertest verbindet über Loopback
    const blocked = createApp(memoryDb(), { allowedIps: [INGRESS_PROXY_IP] });
    await request(blocked).get('/api/health').set('X-Forwarded-For', INGRESS_PROXY_IP).expect(403);

    const allowed = createApp(memoryDb(), { allowedIps: [INGRESS_PROXY_IP, '127.0.0.1', '::1'] });
    await request(allowed).get('/api/health').expect(200);
  });

  it('normalisiert IPv4-mapped-Adressen', () => {
    expect(normalizeIp('::ffff:172.30.32.2')).toBe(INGRESS_PROXY_IP);
    expect(normalizeIp(undefined)).toBe('');
    let passed = false;
    ipFilter([INGRESS_PROXY_IP])(
      { socket: { remoteAddress: '::ffff:172.30.32.2' } } as never,
      {} as never,
      () => (passed = true),
    );
    expect(passed).toBe(true);
  });
});
