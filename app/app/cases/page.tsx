import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { getActiveOrgContext } from '@/lib/auth/session';
import { listRecoveryCases } from '@/lib/services/cases';
import { CasesClient } from '@/components/cases-client';

export const dynamic = 'force-dynamic';

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; new?: string }>;
}) {
  const ctx = await getActiveOrgContext();
  if (!ctx) redirect('/auth/signin');

  const sp = await searchParams;
  const cases = listRecoveryCases(ctx.organization.id);
  const db = getDb();
  const suppliers = db
    .prepare(
      'SELECT id, name, supplier_code, default_currency FROM suppliers WHERE organization_id = ? ORDER BY name ASC'
    )
    .all(ctx.organization.id) as Array<{
    id: string;
    name: string;
    supplier_code: string;
    default_currency: string;
  }>;

  return (
    <CasesClient
      initialCases={cases}
      suppliers={suppliers}
      defaultStatusFilter={sp.status ?? 'all'}
      openCreateByDefault={sp.new === '1'}
    />
  );
}
