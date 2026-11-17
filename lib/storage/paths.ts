import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Resolves a writable data directory for a named store. Prefers a folder under
 * the process working directory and falls back to the OS temp directory on
 * read-only filesystems (for example serverless runtimes).
 */
export function resolveWritableDir(storeName: string): string {
  const cwdDir = path.join(process.cwd(), '.data', storeName);
  try {
    fs.mkdirSync(cwdDir, { recursive: true });
    return cwdDir;
  } catch {
    return path.join(os.tmpdir(), `srd-${storeName}`);
  }
}
