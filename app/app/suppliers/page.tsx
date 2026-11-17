import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { getActiveOrgContext } from '@/lib/auth/session';
import { SuppliersClient, type SupplierDirectoryRow } from '@/components/suppliers-client';

export const dynamic = 'force-dynamic';

export default async function SuppliersPage() {
  const ctx = await getActiveOrgContext();
  if (!ctx) redirect('/auth/signin');

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT s.*,
              (SELECT COUNT(*) FROM recovery_cases rc WHERE rc.supplier_id = s.id AND rc.organization_id = s.organization_id) AS case_count,
              (SELECT COALESCE(SUM(submitted_amount_cents), 0) FROM recovery_cases rc WHERE rc.supplier_id = s.id AND rc.organization_id = s.organization_id AND rc.status != 'cancelled') AS submitted_cents,
              (SELECT COALESCE(SUM(approved_amount_cents), 0) FROM recovery_cases rc WHERE rc.supplier_id = s.id AND rc.organization_id = s.organization_id AND rc.status != 'cancelled') AS approved_cents,
              (SELECT COALESCE(SUM(recovered_amount_cents), 0) FROM recovery_cases rc WHERE rc.supplier_id = s.id AND rc.organization_id = s.organization_id AND rc.status != 'cancelled') AS recovered_cents,
              (SELECT email FROM supplier_contacts sc WHERE sc.supplier_id = s.id AND sc.organization_id = s.organization_id ORDER BY sc.is_primary DESC LIMIT 1) AS primary_email
       FROM suppliers s
       WHERE s.organization_id = ?
       ORDER BY s.name ASC`
    )
    .all(ctx.organization.id) as unknown as SupplierDirectoryRow[];

  return <SuppliersClient initialSuppliers={rows} />;
}
