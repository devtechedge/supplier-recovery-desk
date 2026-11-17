import { NextResponse } from 'next/server';
import { createRequire } from 'node:module';

export async function GET() {
  const requireLocal = createRequire(import.meta.url);
  const g = (process as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
  let requireSqlite: string | boolean = false;
  try {
    requireSqlite = Boolean(requireLocal('node:sqlite'));
  } catch (err) {
    requireSqlite = `err:${err instanceof Error ? err.message : String(err)}`;
  }
  return NextResponse.json({
    version: process.version,
    hasGetBuiltinModule: typeof g,
    hasSqlite: Boolean(g?.('node:sqlite')),
    requireSqlite,
  });
}
