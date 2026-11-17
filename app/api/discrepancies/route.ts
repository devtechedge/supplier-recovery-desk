import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/session';
import { handleApiError } from '@/lib/api/http';
import { convertDiscrepancyLeadToCase, runDeterministicDiscrepancyScan } from '@/lib/services/imports';

export async function GET() {
  try {
    const ctx = await requireOrgContext();
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
      .all(ctx.organization.id);

    return NextResponse.json({ leads });
  } catch (err) {
    return handleApiError(err);
  }
}

const LeadActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('rescan') }),
  z.object({ action: z.literal('raise_case'), leadId: z.string().uuid() }),
  z.object({ action: z.literal('dismiss'), leadId: z.string().uuid() }),
]);

export async function POST(req: NextRequest) {
  try {
    const body = LeadActionSchema.parse(await req.json());
    if (body.action === 'rescan') {
      const ctx = await requireOrgContext('imports:commit');
      const newLeads = runDeterministicDiscrepancyScan(ctx.organization.id);
      return NextResponse.json({ ok: true, newLeads });
    }
    if (body.action === 'raise_case') {
      const ctx = await requireOrgContext('cases:create');
      const created = convertDiscrepancyLeadToCase(ctx.organization.id, ctx.user.id, body.leadId);
      return NextResponse.json({ ok: true, caseId: created.id, caseNumber: created.caseNumber }, { status: 201 });
    }
    const ctx = await requireOrgContext('cases:edit');
    const db = getDb();
    db.prepare(
      `UPDATE discrepancy_leads SET status = 'dismissed' WHERE id = ? AND organization_id = ?`
    ).run(body.leadId, ctx.organization.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
