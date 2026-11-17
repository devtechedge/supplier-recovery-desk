import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ensureDemoDataSeeded } from '@/lib/db/seed';
import { isPostgresConfigured } from '@/lib/db/pg-client';
import { isStripeConfigured } from '@/lib/billing/stripe';
import { isEmailProviderConfigured } from '@/lib/email/provider';

export async function GET() {
  try {
    ensureDemoDataSeeded();
    const db = getDb();
    const row = db.prepare('SELECT COUNT(*) AS org_count FROM organizations').get() as {
      org_count: number;
    };

    return NextResponse.json({
      status: 'ok',
      service: 'supplier-recovery-desk',
      database: isPostgresConfigured() ? 'postgresql' : 'local_sqlite',
      organizationsCount: Number(row.org_count),
      integrations: {
        stripeConfigured: isStripeConfigured(),
        resendConfigured: isEmailProviderConfigured(),
        geminiConfigured: Boolean(
          process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
        ),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', error: err instanceof Error ? err.message : 'Health check failed' },
      { status: 500 }
    );
  }
}
