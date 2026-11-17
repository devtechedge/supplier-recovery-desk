import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb, runInTransaction } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/session';
import { handleApiError } from '@/lib/api/http';

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireOrgContext();
    const db = getDb();
    const search = req.nextUrl.searchParams.get('search')?.trim() ?? '';

    const where = ['s.organization_id = ?'];
    const params: Array<string> = [ctx.organization.id];
    if (search) {
      where.push('(s.name LIKE ? OR s.supplier_code LIKE ? OR s.category LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const rows = db
      .prepare(
        `SELECT s.*,
                (SELECT COUNT(*) FROM recovery_cases rc WHERE rc.supplier_id = s.id AND rc.organization_id = s.organization_id) AS case_count,
                (SELECT COALESCE(SUM(submitted_amount_cents), 0) FROM recovery_cases rc WHERE rc.supplier_id = s.id AND rc.organization_id = s.organization_id AND rc.status != 'cancelled') AS submitted_cents,
                (SELECT COALESCE(SUM(approved_amount_cents), 0) FROM recovery_cases rc WHERE rc.supplier_id = s.id AND rc.organization_id = s.organization_id AND rc.status != 'cancelled') AS approved_cents,
                (SELECT COALESCE(SUM(recovered_amount_cents), 0) FROM recovery_cases rc WHERE rc.supplier_id = s.id AND rc.organization_id = s.organization_id AND rc.status != 'cancelled') AS recovered_cents,
                (SELECT email FROM supplier_contacts sc WHERE sc.supplier_id = s.id AND sc.organization_id = s.organization_id ORDER BY sc.is_primary DESC LIMIT 1) AS primary_email
         FROM suppliers s
         WHERE ${where.join(' AND ')}
         ORDER BY s.name ASC`
      )
      .all(...params);

    return NextResponse.json({ suppliers: rows });
  } catch (err) {
    return handleApiError(err);
  }
}

const CreateSupplierSchema = z.object({
  supplierCode: z.string().min(1),
  name: z.string().min(2),
  category: z.string().min(2).default('Mechanical Components'),
  country: z.string().min(2).default('US'),
  defaultCurrency: z.string().length(3).default('USD'),
  paymentTermsDays: z.coerce.number().int().min(0).max(180).default(30),
  contactName: z.string().optional(),
  contactRole: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  termsSummary: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireOrgContext('suppliers:write');
    const body = CreateSupplierSchema.parse(await req.json());
    const supId = crypto.randomUUID();

    runInTransaction((tx) => {
      tx.prepare(
        `INSERT INTO suppliers (id, organization_id, supplier_code, name, category, country, default_currency, payment_terms_days)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        supId,
        ctx.organization.id,
        body.supplierCode.trim().toUpperCase(),
        body.name.trim(),
        body.category.trim(),
        body.country.trim().toUpperCase(),
        body.defaultCurrency.toUpperCase(),
        body.paymentTermsDays
      );

      if (body.contactName && body.contactEmail) {
        tx.prepare(
          `INSERT INTO supplier_contacts (id, organization_id, supplier_id, name, role, email, is_primary)
           VALUES (?, ?, ?, ?, ?, ?, 1)`
        ).run(
          crypto.randomUUID(),
          ctx.organization.id,
          supId,
          body.contactName.trim(),
          body.contactRole?.trim() || 'Claims & Quality Contact',
          body.contactEmail.trim()
        );
      }

      if (body.termsSummary?.trim()) {
        tx.prepare(
          `INSERT INTO supplier_terms (id, organization_id, supplier_id, agreement_title, terms_summary)
           VALUES (?, ?, ?, 'Standard Supply Terms', ?)`
        ).run(crypto.randomUUID(), ctx.organization.id, supId, body.termsSummary.trim());
      }
    });

    return NextResponse.json({ id: supId }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
