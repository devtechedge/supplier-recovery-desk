const drizzleConfig = {
  schema: './db/schema.ts',
  out: './supabase/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
};

export default drizzleConfig;
