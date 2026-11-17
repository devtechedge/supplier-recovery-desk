import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { getActiveOrgContext } from '@/lib/auth/session';
import { getOverviewDashboardData } from '@/lib/services/dashboard';
import { ReportsClient } from '@/components/reports-client';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const ctx = await getActiveOrgContext();
  if (!ctx) redirect('/auth/signin');

  const data = getOverviewDashboardData(ctx.organization.id);
  const db = getDb();
  const suppliers = db
    .prepare('SELECT id, name FROM suppliers WHERE organization_id = ? ORDER BY name ASC')
    .all(ctx.organization.id) as Array<{ id: string; name: string }>;
  const plants = db
    .prepare('SELECT id, name FROM plants_or_locations WHERE organization_id = ? ORDER BY name ASC')
    .all(ctx.organization.id) as Array<{ id: string; name: string }>;

  return <ReportsClient initialData={data} suppliers={suppliers} plants={plants} />;
}
