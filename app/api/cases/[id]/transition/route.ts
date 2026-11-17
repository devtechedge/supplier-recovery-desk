import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOrgContext } from '@/lib/auth/session';
import { handleApiError } from '@/lib/api/http';
import { parseDecimalToCents } from '@/lib/domain/money';
import { CASE_STATUSES, type CaseStatus } from '@/lib/domain/workflow';
import { transitionCaseStatus } from '@/lib/services/cases';

const TransitionSchema = z.object({
  targetStatus: z.enum(CASE_STATUSES),
  note: z.string().optional(),
  submittedAmount: z.string().optional(),
  approvedAmount: z.string().optional(),
  expectedCredit: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const body = TransitionSchema.parse(await req.json());
    const perm = body.targetStatus === 'submitted' ? 'cases:submit' : 'cases:transition';
    const ctx = await requireOrgContext(perm);
    const { id } = await context.params;

    const result = transitionCaseStatus(ctx.organization.id, ctx.user.id, id, body.targetStatus, {
      note: body.note,
      submittedAmountCents: body.submittedAmount?.trim()
        ? parseDecimalToCents(body.submittedAmount)
        : undefined,
      approvedAmountCents: body.approvedAmount?.trim()
        ? parseDecimalToCents(body.approvedAmount)
        : undefined,
      expectedCreditCents: body.expectedCredit?.trim()
        ? parseDecimalToCents(body.expectedCredit)
        : undefined,
      customTransitions: ctx.organization.workflowConfig as Partial<Record<CaseStatus, CaseStatus[]>>,
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
