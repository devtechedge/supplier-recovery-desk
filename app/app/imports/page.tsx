import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { getActiveOrgContext } from '@/lib/auth/session';
import { ImportsClient } from '@/components/imports-client';

export const dynamic = 'force-dynamic';

export default async function ImportsPage() {
  const ctx = await getActiveOrgContext();
  if (!ctx) redirect('/auth/signin');

  const db = getDb();
  const leads = db
    .prepare(
      `SELECT d.*, s.name AS supplier_name, s.supplier_code,
              po.po_number, gr.receipt_number, inv.invoice_number
       FROM discrepancy_leads d
       JOIN suppliers s ON s.id = d.supplier_id AND s.organization_id = d.organization_id
       LEFT JOIN purchase_orders po ON po.id = d.purchase_order_id
       LEFT JOIN goods_receipts gr ON gr.id = d.goods_receipt_id
       LEFT JOIN supplier_invoices inv ON inv.id = d.supplier_invoice_id
       WHERE d.organization_id = ?
       ORDER BY CASE d.status WHEN 'open' THEN 0 WHEN 'converted' THEN 1 ELSE 2 END, d.created_at DESC`
    )
    .all(ctx.organization.id) as unknown as Parameters<typeof ImportsClient>[0]['initialLeads'];

  const batches = db
    .prepare(
      `SELECT b.*, u.full_name AS uploaded_by_name
       FROM import_batches b
       LEFT JOIN user_profiles u ON u.id = b.uploaded_by
       WHERE b.organization_id = ?
       ORDER BY b.created_at DESC
       LIMIT 30`
    )
    .all(ctx.organization.id) as unknown as Parameters<typeof ImportsClient>[0]['initialBatches'];

  return (
    <ImportsClient
      initialLeads={leads}
      initialBatches={batches}
      aiEnabledInOrg={ctx.organization.aiProcessingEnabled}
    />
  );
}
