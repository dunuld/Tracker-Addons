import type { Overview } from '../../shared/api-types.js';
import type { DepotService } from './depot.service.js';

export type FetchFn = typeof fetch;

/** Zugriff auf die Home-Assistant-Core-API über den Supervisor-Proxy. */
export class HomeAssistantClient {
  constructor(
    private readonly token: string,
    private readonly baseUrl = 'http://supervisor/core/api',
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  private request(path: string, init: RequestInit = {}): Promise<Response> {
    return this.fetchFn(`${this.baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  }

  /** Zustand einer Entität als Zahl; `null`, wenn sie fehlt oder keinen Zahlenwert hat. */
  async numericState(entity: string): Promise<number | null> {
    const res = await this.request(`/states/${entity}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { state?: unknown };
    const value = Number(body.state);
    return body.state !== '' && Number.isFinite(value) ? value : null;
  }

  async setState(
    entity: string,
    state: number,
    attributes: Record<string, unknown>,
  ): Promise<void> {
    const res = await this.request(`/states/${entity}`, {
      method: 'POST',
      body: JSON.stringify({ state, attributes }),
    });
    if (!res.ok) throw new Error(`Home Assistant antwortet mit ${res.status} für ${entity}`);
  }
}

const euros = (cents: number): number => cents / 100;

interface SensorDefinition {
  id: string;
  name: string;
  icon: string;
  unit: '€' | '%';
  value: (overview: Overview) => number | null;
}

/** Sensoren, die das Add-on in Home Assistant bereitstellt (`sensor.ing_depot_<id>`). */
export const SENSORS: SensorDefinition[] = [
  { id: 'wert', name: 'Depotwert', icon: 'mdi:bank', unit: '€', value: (o) => euros(o.valueCents) },
  {
    id: 'investiert_jahr',
    name: 'Investiert im Jahr',
    icon: 'mdi:cash-plus',
    unit: '€',
    value: (o) => euros(o.investedGrossCents),
  },
  {
    id: 'investiert_netto_jahr',
    name: 'Netto investiert im Jahr',
    icon: 'mdi:cash-sync',
    unit: '€',
    value: (o) => euros(o.investedNetCents),
  },
  {
    id: 'realisierte_gewinne_jahr',
    name: 'Realisierte Gewinne im Jahr',
    icon: 'mdi:cash-check',
    unit: '€',
    value: (o) => euros(o.realizedCents),
  },
  {
    id: 'dividenden_jahr',
    name: 'Dividenden im Jahr (netto)',
    icon: 'mdi:cash-multiple',
    unit: '€',
    value: (o) => euros(o.dividendsNetCents),
  },
  {
    id: 'kursgewinn',
    name: 'Kursgewinn seit Kauf',
    icon: 'mdi:trending-up',
    unit: '€',
    value: (o) => euros(o.gainCents),
  },
  {
    id: 'kursgewinn_prozent',
    name: 'Kursgewinn seit Kauf (%)',
    icon: 'mdi:percent',
    unit: '%',
    value: (o) => o.gainPct,
  },
  {
    id: 'kursgewinn_jahr',
    name: 'Kursgewinn seit Jahresbeginn',
    icon: 'mdi:chart-line',
    unit: '€',
    value: (o) => euros(o.ytdGainCents),
  },
  {
    id: 'kursgewinn_jahr_prozent',
    name: 'Kursgewinn seit Jahresbeginn (%)',
    icon: 'mdi:percent',
    unit: '%',
    value: (o) => o.ytdGainPct,
  },
];

export interface HomeAssistantSyncOptions {
  publishSensors: boolean;
  log?: (message: string) => void;
}

/**
 * Hält Home Assistant und das Depot synchron: liest Kurse aus hinterlegten Entitäten und
 * veröffentlicht die Kennzahlen des laufenden Jahres als Sensoren.
 */
export class HomeAssistantSync {
  private readonly log: (message: string) => void;
  private publishing = false;

  constructor(
    private readonly depot: DepotService,
    private readonly client: HomeAssistantClient,
    private readonly options: HomeAssistantSyncOptions,
  ) {
    this.log = options.log ?? ((message) => console.warn(message));
  }

  /** Übernimmt die aktuellen Kurse aller Wertpapiere mit hinterlegter HA-Entität. */
  async refreshPrices(): Promise<number> {
    let updated = 0;
    for (const { isin, entity } of this.depot.priceEntities()) {
      try {
        const price = await this.client.numericState(entity);
        if (price === null || price <= 0) {
          this.log(`Kurs-Entität ${entity} liefert keinen gültigen Kurs.`);
          continue;
        }
        this.depot.addPrice(isin, { price }, 'ha');
        updated++;
      } catch (error) {
        this.log(`Kurs aus ${entity} konnte nicht gelesen werden: ${String(error)}`);
      }
    }
    return updated;
  }

  async publishSensors(): Promise<void> {
    if (!this.options.publishSensors || this.publishing) return;
    this.publishing = true;
    try {
      const overview = this.depot.overview();
      for (const sensor of SENSORS) {
        const value = sensor.value(overview);
        if (value === null) continue;
        await this.client.setState(`sensor.ing_depot_${sensor.id}`, value, {
          friendly_name: `ING Depot ${sensor.name}`,
          unit_of_measurement: sensor.unit,
          icon: sensor.icon,
          ...(sensor.unit === '€' ? { device_class: 'monetary' } : {}),
          stand: overview.asOf,
        });
      }
    } catch (error) {
      this.log(`Sensoren konnten nicht aktualisiert werden: ${String(error)}`);
    } finally {
      this.publishing = false;
    }
  }

  /** Kurse lesen, danach Sensoren veröffentlichen. */
  async sync(): Promise<void> {
    await this.refreshPrices();
    await this.publishSensors();
  }
}
