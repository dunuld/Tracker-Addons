import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type Database } from '../src/db/database.js';
import { DepotService } from '../src/depot.service.js';
import {
  HomeAssistantClient,
  HomeAssistantSync,
  SENSORS,
  type FetchFn,
} from '../src/home-assistant.js';
import { BUY_LINES, fakePdf, textReader } from './fixtures.js';

const ISIN = 'IE00B4L5Y983';

let db: Database;
let depot: DepotService;

beforeEach(async () => {
  db = openDatabase(':memory:');
  depot = new DepotService(db, { today: () => '2026-07-01', readPdf: textReader });
  await depot.importPdf(fakePdf(BUY_LINES), 'kauf.pdf');
});

afterEach(() => db.close());

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

describe('HomeAssistantClient', () => {
  it('liest Zahlenwerte und sendet das Token mit', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => json({ state: '61.5' }));
    const client = new HomeAssistantClient('geheim', 'http://ha/api', fetchFn);
    expect(await client.numericState('sensor.kurs')).toBe(61.5);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://ha/api/states/sensor.kurs');
    expect((init!.headers as Record<string, string>)['Authorization']).toBe('Bearer geheim');
  });

  it('liefert null für fehlende oder nicht numerische Zustände', async () => {
    const states = [json({}, 404), json({ state: 'unavailable' }), json({ state: '' })];
    const client = new HomeAssistantClient('t', 'http://ha/api', async () => states.shift()!);
    expect(await client.numericState('sensor.a')).toBeNull();
    expect(await client.numericState('sensor.b')).toBeNull();
    expect(await client.numericState('sensor.c')).toBeNull();
  });

  it('meldet Fehler beim Setzen eines Zustands', async () => {
    const client = new HomeAssistantClient('t', undefined, async () => json({}, 401));
    await expect(client.setState('sensor.x', 1, {})).rejects.toThrow(/401/);
  });
});

describe('HomeAssistantSync', () => {
  it('übernimmt Kurse aus Entitäten und veröffentlicht die Sensoren', async () => {
    depot.setPriceEntity(ISIN, 'sensor.msci_world');
    const posted = new Map<string, { state: number; attributes: Record<string, unknown> }>();
    const fetchFn: FetchFn = async (url, init) => {
      if (init?.method === 'POST') {
        posted.set(String(url).split('/').at(-1)!, JSON.parse(String(init.body)));
        return json({});
      }
      return json({ state: '60' });
    };
    const sync = new HomeAssistantSync(depot, new HomeAssistantClient('t', 'http://ha', fetchFn), {
      publishSensors: true,
    });

    await sync.sync();

    expect(depot.overview().positions[0]).toMatchObject({ price: 60, priceSource: 'ha' });
    expect(posted.size).toBe(SENSORS.length);
    expect(posted.get('sensor.ing_depot_wert')).toEqual({
      state: 180,
      attributes: {
        friendly_name: 'ING Depot Depotwert',
        unit_of_measurement: '€',
        icon: 'mdi:bank',
        device_class: 'monetary',
        stand: '2026-07-01',
      },
    });
    expect(posted.get('sensor.ing_depot_investiert_jahr')!.state).toBe(173.28);
    expect(posted.get('sensor.ing_depot_kursgewinn')!.state).toBe(6.72);
    expect(posted.get('sensor.ing_depot_kursgewinn_prozent')).toMatchObject({
      state: 3.88,
      attributes: { unit_of_measurement: '%' },
    });
  });

  it('lässt Sensoren ohne Wert aus und veröffentlicht nichts, wenn abgeschaltet', async () => {
    const empty = new DepotService(openDatabase(':memory:'), { today: () => '2026-07-01' });
    const fetchFn = vi.fn<FetchFn>(async () => json({}));
    const client = new HomeAssistantClient('t', 'http://ha', fetchFn);

    await new HomeAssistantSync(empty, client, { publishSensors: true }).publishSensors();
    // Prozentwerte sind bei leerem Depot nicht definiert
    expect(fetchFn).toHaveBeenCalledTimes(SENSORS.length - 2);

    fetchFn.mockClear();
    await new HomeAssistantSync(depot, client, { publishSensors: false }).sync();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('protokolliert Fehler, statt abzustürzen', async () => {
    depot.setPriceEntity(ISIN, 'sensor.msci_world');
    const log = vi.fn();
    let mode: 'invalid' | 'throw' = 'invalid';
    const fetchFn: FetchFn = async (_url, init) => {
      if (init?.method === 'POST') return json({}, 500);
      if (mode === 'throw') throw new Error('offline');
      return json({ state: 'unknown' });
    };
    const sync = new HomeAssistantSync(depot, new HomeAssistantClient('t', 'http://ha', fetchFn), {
      publishSensors: true,
      log,
    });

    expect(await sync.refreshPrices()).toBe(0);
    mode = 'throw';
    expect(await sync.refreshPrices()).toBe(0);
    await sync.publishSensors();

    expect(log.mock.calls.map(([message]) => message as string)).toEqual([
      expect.stringContaining('keinen gültigen Kurs'),
      expect.stringContaining('offline'),
      expect.stringContaining('Sensoren konnten nicht aktualisiert werden'),
    ]);
  });

  it('nutzt console.warn als Standard-Log und überspringt parallele Läufe', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchFn = vi.fn<FetchFn>(async () => json({}, 500));
    const sync = new HomeAssistantSync(depot, new HomeAssistantClient('t', 'http://ha', fetchFn), {
      publishSensors: true,
    });
    await Promise.all([sync.publishSensors(), sync.publishSensors()]);
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
