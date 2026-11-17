import { NextResponse } from 'next/server';
import { createRequire } from 'node:module';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

export async function GET() {
  const requireLocal = createRequire(import.meta.url);
  const g = (process as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
  const builtin = g?.('node:sqlite');
  let required: unknown = null;
  let requiredErr = '';
  try {
    required = requireLocal('node:sqlite');
  } catch (err) {
    requiredErr = err instanceof Error ? err.message : String(err);
  }
  const tmp = path.join(os.tmpdir(), 'srd-probe.txt');
  let tmpWrite = '';
  try {
    fs.writeFileSync(tmp, 'ok');
    tmpWrite = 'ok';
  } catch (err) {
    tmpWrite = err instanceof Error ? err.message : String(err);
  }
  return NextResponse.json({
    version: process.version,
    hasGetBuiltinModule: typeof g,
    hasBuiltinSqlite: Boolean(builtin),
    hasRequiredSqlite: Boolean(required),
    requiredErr,
    tmpWrite,
    cwd: process.cwd(),
  });
}
