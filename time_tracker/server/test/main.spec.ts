import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const projectRoot = resolve(import.meta.dirname, '../..');
const tsxCli = join(projectRoot, 'node_modules/tsx/dist/cli.mjs');

let child: ChildProcess | undefined;
let dataDir: string | undefined;

afterEach(() => {
  child?.kill('SIGTERM');
  child = undefined;
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  dataDir = undefined;
});

function waitForPort(proc: ChildProcess): Promise<number> {
  return new Promise((resolvePort, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Timeout, Ausgabe:\n${output}`)), 15_000);
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const match = /läuft auf http:\/\/[^:]+:(\d+)/.exec(output);
      if (match) {
        clearTimeout(timer);
        resolvePort(Number(match[1]));
      }
    };
    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);
    proc.on('exit', (code) => reject(new Error(`Server beendet (${code}):\n${output}`)));
  });
}

describe('Server-Start (main.ts)', () => {
  it('startet, legt das Datenverzeichnis an und beantwortet den Health-Check', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'time-tracker-main-'));
    dataDir = tmp;
    const target = join(tmp, 'data');
    child = spawn(process.execPath, [tsxCli, 'server/src/main.ts'], {
      cwd: projectRoot,
      env: { ...process.env, ADDON_MODE: '', DATA_DIR: target, PORT: '0', HOST: '127.0.0.1' },
    });
    const port = await waitForPort(child);

    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok' });
    expect(existsSync(target)).toBe(true);
  }, 20_000);
});
