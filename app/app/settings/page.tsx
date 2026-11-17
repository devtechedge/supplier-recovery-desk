import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { getActiveOrgContext } from '@/lib/auth/session';
import { isStripeConfigured } from '@/lib/billing/stripe';
import { SettingsClient } from '@/components/settings-client';
import type { OrgRole } from '@/lib/domain/permissions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const ctx = await getActiveOrgContext();
  if (!ctx) redirect('/auth/signin');

  const db = getDb();
  const members = db
    .prepare(
      `SELECT m.id, m.user_id, m.role, m.status, u.email, u.full_name, u.job_title
       FROM organization_memberships m
       JOIN user_profiles u ON u.id = m.user_id
       WHERE m.organization_id = ?
       ORDER BY m.created_at ASC`
    )
    .all(ctx.organization.id) as unknown as Array<{
    id: string;
    user_id: string;
    email: string;
    full_name: string;
    job_title: string | null;
    role: OrgRole;
    status: string;
  }>;

  const periodKey = new Date().toISOString().slice(0, 7);
  const usageRow = db
    .prepare('SELECT * FROM usage_records WHERE organization_id = ? AND period_key = ?')
    .get(ctx.organization.id, periodKey) as
    | { cases_created: number; import_rows_processed: number; ai_requests: number }
    | undefined;

  return (
    <SettingsClient
      organization={ctx.organization}
      currentRole={ctx.role}
      subscription={ctx.subscription}
      stripeConfigured={isStripeConfigured()}
      members={members}
      usage={{
        activeSeats: members.length,
        casesCreatedThisMonth: usageRow?.cases_created ?? 0,
        importRowsThisMonth: usageRow?.import_rows_processed ?? 0,
        aiRequestsThisMonth: usageRow?.ai_requests ?? 0,
      }}
    />
  );
}
