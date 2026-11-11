import { mkdirSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/database.js';
import { DepotService } from './depot.service.js';
import { HomeAssistantClient, HomeAssistantSync } from './home-assistant.js';
import { scanInbox } from './inbox.js';

const INBOX_INTERVAL_MS = 60_000;
const HA_SYNC_INTERVAL_MS = 15 * 60_000;

const config = loadConfig();
mkdirSync(config.dataDir, { recursive: true });

const db = openDatabase(join(config.dataDir, 'depot.db'));
const depot = new DepotService(db, {
  documentsDir: join(config.dataDir, 'documents'),
  exemptionCents: config.exemptionCents,
});

// ---- Eingangsordner: neue PDFs automatisch importieren ----
let scanning: Promise<unknown> | null = null;
const runInboxScan = (): Promise<unknown> => {
  const dir = config.inboxDir;
  if (!dir) return Promise.resolve([]);
  scanning ??= scanInbox(depot, dir)
    .then((results) => {
      for (const result of results) {
        console.log(`Eingangsordner: ${result.fileName} – ${result.status} (${result.message})`);
      }
      return results;
    })
    .catch((error: unknown) => {
      console.error('Eingangsordner konnte nicht verarbeitet werden:', error);
      return [];
    })
    .finally(() => (scanning = null));
  return scanning;
};
const timers: NodeJS.Timeout[] = [];
if (config.inboxDir) {
  try {
    mkdirSync(config.inboxDir, { recursive: true });
  } catch (error) {
    console.warn(`Eingangsordner ${config.inboxDir} kann nicht angelegt werden:`, error);
  }
  void runInboxScan();
  timers.push(setInterval(() => void runInboxScan(), INBOX_INTERVAL_MS));
}

// ---- Home Assistant: Kurse lesen, Sensoren veröffentlichen ----
if (config.supervisorToken) {
  const sync = new HomeAssistantSync(depot, new HomeAssistantClient(config.supervisorToken), {
    publishSensors: config.publishSensors,
  });
  let pending: NodeJS.Timeout | null = null;
  depot.onChange(() => {
    // Mehrere Änderungen (z. B. Sammel-Upload) zu einer Aktualisierung bündeln
    pending ??= setTimeout(() => {
      pending = null;
      void sync.publishSensors();
    }, 2000);
  });
  void sync.sync();
  timers.push(setInterval(() => void sync.sync(), HA_SYNC_INTERVAL_MS));
}

const app = createApp({
  staticDir: config.staticDir,
  allowedIps: config.allowedIps,
  version: config.version,
  depot,
  scanInbox: runInboxScan,
});

const server = app.listen(config.port, config.host, () => {
  const { port } = server.address() as AddressInfo;
  console.log(
    `ING Depot v${config.version} läuft auf http://${config.host}:${port} ` +
      `(Daten: ${config.dataDir}, Addon-Modus: ${config.addonMode ? 'ja' : 'nein'}, ` +
      `IP-Filter: ${config.allowedIps?.join(', ') ?? 'aus'}, ` +
      `Eingangsordner: ${config.inboxDir ?? 'aus'}, ` +
      `HA-Sensoren: ${config.publishSensors ? 'an' : 'aus'})`,
  );
});
server.on('error', (error) => {
  console.error('Server konnte nicht gestartet werden:', error);
  process.exit(1);
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} empfangen, beende …`);
  timers.forEach((timer) => clearInterval(timer));
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
