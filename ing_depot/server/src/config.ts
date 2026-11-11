import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** IP des Home-Assistant-Ingress-Proxys (Supervisor-Netz). */
export const INGRESS_PROXY_IP = '172.30.32.2';

export interface ServerConfig {
  port: number;
  host: string;
  addonMode: boolean;
  /** Persistentes Datenverzeichnis (im Add-on: /data) */
  dataDir: string;
  staticDir: string;
  /** `null` = kein IP-Filter (lokale Entwicklung) */
  allowedIps: string[] | null;
  version: string;
  /** Eingangsordner für PDFs; `null` = keine Überwachung */
  inboxDir: string | null;
  /** Kennzahlen als Sensoren an Home Assistant melden */
  publishSensors: boolean;
  /** Freistellungsauftrag in Cent (0 = nicht gesetzt) */
  exemptionCents: number;
  /** Token für die Supervisor-API; fehlt außerhalb von Home Assistant */
  supervisorToken: string | null;
}

/** Vom Nutzer im Tab „Konfiguration“ gesetzte Add-on-Optionen (`/data/options.json`). */
export interface AddonOptions {
  inbox_folder?: string;
  publish_sensors?: boolean;
  exemption_order?: number;
}

export function readAddonOptions(dataDir: string): AddonOptions {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(dataDir, 'options.json'), 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as AddonOptions) : {};
  } catch {
    return {};
  }
}

const isTrue = (value: string | undefined): boolean =>
  value !== undefined && ['1', 'true', 'yes'].includes(value.toLowerCase());

function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Konfiguration aus Umgebungsvariablen:
 * ADDON_MODE, PORT, HOST, DATA_DIR, STATIC_DIR, ALLOWED_IPS (Komma-getrennt), INBOX_DIR,
 * SUPERVISOR_TOKEN. Im Addon-Modus sind nur der Ingress-Proxy und Loopback erlaubt;
 * Eingangsordner, Sensoren und Freistellungsauftrag kommen dort aus den Add-on-Optionen.
 */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  options?: AddonOptions,
): ServerConfig {
  const addonMode = isTrue(env['ADDON_MODE']);
  const explicitIps = env['ALLOWED_IPS']
    ?.split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);

  const dataDir = resolve(env['DATA_DIR'] ?? (addonMode ? '/data' : '.data'));
  const addon = options ?? (addonMode ? readAddonOptions(dataDir) : {});
  const inbox = (env['INBOX_DIR'] ?? addon.inbox_folder ?? '').trim();
  const exemption = Number(addon.exemption_order ?? 0);
  const supervisorToken = env['SUPERVISOR_TOKEN']?.trim() || null;

  return {
    port: Number(env['PORT'] ?? 8099),
    host: env['HOST'] ?? (addonMode ? '0.0.0.0' : '127.0.0.1'),
    addonMode,
    dataDir,
    staticDir: resolve(env['STATIC_DIR'] ?? 'dist/IngDepot/browser'),
    allowedIps: explicitIps?.length
      ? explicitIps
      : addonMode
        ? [INGRESS_PROXY_IP, '127.0.0.1', '::1']
        : null,
    version: readVersion(),
    inboxDir: inbox ? resolve(inbox) : null,
    publishSensors: supervisorToken !== null && addon.publish_sensors !== false,
    exemptionCents: Number.isFinite(exemption) && exemption > 0 ? Math.round(exemption * 100) : 0,
    supervisorToken,
  };
}
