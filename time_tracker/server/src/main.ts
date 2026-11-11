import { mkdirSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/database.js';

const config = loadConfig();
mkdirSync(config.dataDir, { recursive: true });
const db = openDatabase(config.dbPath);

const app = createApp(db, {
  staticDir: config.staticDir,
  allowedIps: config.allowedIps,
  version: config.version,
  fallbackUser: config.fallbackUser,
});

const server = app.listen(config.port, config.host, () => {
  const { port } = server.address() as AddressInfo;
  console.log(
    `Zeiterfassung v${config.version} läuft auf http://${config.host}:${port} ` +
      `(DB: ${config.dbPath}, Addon-Modus: ${config.addonMode ? 'ja' : 'nein'}, ` +
      `IP-Filter: ${config.allowedIps?.join(', ') ?? 'aus'})`,
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
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
