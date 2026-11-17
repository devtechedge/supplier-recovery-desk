import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/session';
import { handleApiError } from '@/lib/api/http';
import { getRecoveryCaseDetail } from '@/lib/services/cases';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireOrgContext();
    const { id } = await context.params;
    const detail = getRecoveryCaseDetail(ctx.organization.id, id);
    if (!detail) {
      return NextResponse.json({ error: 'Recovery case not found' }, { status: 404 });
    }
    return NextResponse.json({ caseDetail: detail });
  } catch (err) {
    return handleApiError(err);
  }
}

const UpdateCaseSchema = z.object({
  responsibilityAssessment: z.string().min(2).optional(),
  claimBasis: z.string().optional(),
  internalNotes: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireOrgContext('cases:edit');
    const { id } = await context.params;
    const body = UpdateCaseSchema.parse(await req.json());
    const db = getDb();

    const existing = db
      .prepare('SELECT id FROM recovery_cases WHERE id = ? AND organization_id = ?')
      .get(id, ctx.organization.id);
    if (!existing) {
      return NextResponse.json({ error: 'Recovery case not found' }, { status: 404 });
    }

    db.prepare(
      `UPDATE recovery_cases
       SET responsibility_assessment = COALESCE(?, responsibility_assessment),
           claim_basis = COALESCE(?, claim_basis),
           internal_notes = COALESCE(?, internal_notes),
           updated_at = datetime('now')
       WHERE id = ? AND organization_id = ?`
    ).run(
      body.responsibilityAssessment ?? null,
      body.claimBasis ?? null,
      body.internalNotes ?? null,
      id,
      ctx.organization.id
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
