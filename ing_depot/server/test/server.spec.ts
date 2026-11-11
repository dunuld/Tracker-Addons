import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, errorHandler, ipFilter, normalizeIp } from '../src/app.js';
import { INGRESS_PROXY_IP, loadConfig, readAddonOptions } from '../src/config.js';
import { badRequest, HttpError, notFound, parseId } from '../src/http-error.js';

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ing-depot-test-'));
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
    expect(config.port).toBe(8099);
    expect(config.host).toBe('0.0.0.0');
    expect(config.allowedIps).toContain(INGRESS_PROXY_IP);
  });

  it('ist lokal ohne IP-Filter und per Env überschreibbar', () => {
    expect(loadConfig({}).allowedIps).toBeNull();
    expect(loadConfig({}).host).toBe('127.0.0.1');
    const config = loadConfig({
      DATA_DIR: '/tmp/ing-depot',
      ALLOWED_IPS: '10.0.0.1, 10.0.0.2',
      PORT: '9000',
    });
    expect(config.dataDir).toBe('/tmp/ing-depot');
    expect(config.allowedIps).toEqual(['10.0.0.1', '10.0.0.2']);
    expect(config.port).toBe(9000);
  });

  it('übernimmt Eingangsordner, Sensoren und Freistellungsauftrag aus den Add-on-Optionen', () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, 'options.json'),
      JSON.stringify({
        inbox_folder: '/share/ing_depot',
        publish_sensors: true,
        exemption_order: 1000,
      }),
    );
    const config = loadConfig({ ADDON_MODE: '1', DATA_DIR: dir, SUPERVISOR_TOKEN: 'abc' });
    expect(config).toMatchObject({
      inboxDir: '/share/ing_depot',
      publishSensors: true,
      exemptionCents: 100000,
      supervisorToken: 'abc',
    });

    // Ohne Supervisor-Token gibt es keine Sensoren; leerer Ordner schaltet die Überwachung ab
    const off = loadConfig({}, { inbox_folder: ' ', publish_sensors: true, exemption_order: -5 });
    expect(off).toMatchObject({ inboxDir: null, publishSensors: false, exemptionCents: 0 });
    expect(loadConfig({ SUPERVISOR_TOKEN: 'abc' }, { publish_sensors: false }).publishSensors).toBe(
      false,
    );
    expect(loadConfig({ INBOX_DIR: '/tmp/eingang' }).inboxDir).toBe('/tmp/eingang');
  });

  it('ignoriert fehlende oder kaputte Add-on-Optionen', () => {
    const dir = tempDir();
    expect(readAddonOptions(dir)).toEqual({});
    writeFileSync(join(dir, 'options.json'), '"text"');
    expect(readAddonOptions(dir)).toEqual({});
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
    expect(parseId('7')).toBe(7);
    expect(() => parseId('0')).toThrow('Ungültige ID.');
  });
});

describe('HTTP-Server', () => {
  it('liefert Health-Check und JSON-404 unter /api', async () => {
    const app = createApp({ version: '1.2.3' });
    await request(app).get('/api/health').expect(200, { status: 'ok', version: '1.2.3' });
    const res = await request(app).get('/api/unknown').expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('antwortet auf ungültiges JSON mit 400', async () => {
    await request(createApp())
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
    const app = createApp({ staticDir: dir });

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
    const blocked = createApp({ allowedIps: [INGRESS_PROXY_IP] });
    await request(blocked).get('/api/health').set('X-Forwarded-For', INGRESS_PROXY_IP).expect(403);

    const allowed = createApp({ allowedIps: [INGRESS_PROXY_IP, '127.0.0.1', '::1'] });
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
