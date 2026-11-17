import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';

let pgPool: ReturnType<typeof postgres> | null = null;

export function isPostgresConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('your-project-ref'));
}

export function getPgDb() {
  if (!isPostgresConfigured()) {
    return null;
  }
  if (!pgPool) {
    pgPool = postgres(process.env.DATABASE_URL!, {
      max: 10,
      prepare: false,
    });
  }
  return drizzle(pgPool, { schema });
}
