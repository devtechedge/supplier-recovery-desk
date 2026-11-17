import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/session';
import { handleApiError } from '@/lib/api/http';
import { IMPORT_TYPES, parseCsvText } from '@/lib/domain/csv';
import { checkEntitlement } from '@/lib/domain/billing';
import { commitCsvImportBatch } from '@/lib/services/imports';

const CommitSchema = z.object({
  importType: z.enum(IMPORT_TYPES),
  filename: z.string().min(1),
  csvText: z.string().min(1),
  columnMapping: z.record(z.string(), z.string()).default({}),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireOrgContext('imports:commit');
    const body = CommitSchema.parse(await req.json());

    const { rows } = parseCsvText(body.csvText);
    const db = getDb();
    const periodKey = new Date().toISOString().slice(0, 7);
    const usage = db
      .prepare('SELECT * FROM usage_records WHERE organization_id = ? AND period_key = ?')
      .get(ctx.organization.id, periodKey) as
      | { cases_created: number; import_rows_processed: number; ai_requests: number }
      | undefined;

    const ent = checkEntitlement({
      planTier: ctx.subscription.planTier,
      subscriptionStatus: ctx.subscription.status,
      usage: {
        activeSeats: 1,
        casesCreatedThisMonth: usage?.cases_created ?? 0,
        importRowsThisMonth: usage?.import_rows_processed ?? 0,
        aiRequestsThisMonth: usage?.ai_requests ?? 0,
      },
      action: 'import_rows',
      increment: rows.length,
    });
    if (!ent.allowed) {
      return NextResponse.json({ error: ent.reason }, { status: 403 });
    }

    const result = commitCsvImportBatch({
      orgId: ctx.organization.id,
      userId: ctx.user.id,
      importType: body.importType,
      filename: body.filename,
      csvText: body.csvText,
      columnMapping: body.columnMapping,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET() {
  try {
    const ctx = await requireOrgContext();
    const db = getDb();
    const batches = db
      .prepare(
        `SELECT b.*, u.full_name AS uploaded_by_name
         FROM import_batches b
         LEFT JOIN user_profiles u ON u.id = b.uploaded_by
         WHERE b.organization_id = ?
         ORDER BY b.created_at DESC
         LIMIT 50`
      )
      .all(ctx.organization.id);
    return NextResponse.json({ batches });
  } catch (err) {
    return handleApiError(err);
  }
}
