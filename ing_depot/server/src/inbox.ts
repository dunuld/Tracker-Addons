import { mkdirSync, readdirSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { ImportResult } from '../../shared/api-types.js';
import type { DepotService } from './depot.service.js';

export const IMPORTED_DIR = 'importiert';
export const FAILED_DIR = 'fehler';

/** Verschiebt eine Datei, ohne eine vorhandene gleichen Namens zu überschreiben. */
function moveTo(dir: string, folder: string, name: string): void {
  const targetDir = join(dir, folder);
  mkdirSync(targetDir, { recursive: true });
  const taken = new Set(readdirSync(targetDir));
  let target = name;
  for (let i = 1; taken.has(target); i++) target = name.replace(/(\.pdf)?$/i, `-${i}$1`);
  renameSync(join(dir, name), join(targetDir, target));
}

/**
 * Importiert alle PDFs aus dem Eingangsordner. Verarbeitete Dateien wandern nach
 * `importiert/`, nicht erkannte nach `fehler/` (und in die Liste „Nicht erkannt“).
 */
export async function scanInbox(depot: DepotService, dir: string): Promise<ImportResult[]> {
  let names: string[];
  try {
    names = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.pdf$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return []; // Ordner existiert (noch) nicht
  }

  const results: ImportResult[] = [];
  for (const name of names) {
    const result = await depot.importPdf(readFileSync(join(dir, name)), name, 'inbox');
    if (result.status === 'failed') depot.addFailure(result.fileName, result.message);
    moveTo(dir, result.status === 'failed' ? FAILED_DIR : IMPORTED_DIR, name);
    results.push(result);
  }
  return results;
}
