import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/session';
import { handleApiError } from '@/lib/api/http';
import { parseDecimalToCents } from '@/lib/domain/money';
import { COST_CATEGORIES, INCIDENT_TYPES } from '@/lib/domain/workflow';
import { checkEntitlement } from '@/lib/domain/billing';
import { createRecoveryCase, listRecoveryCases } from '@/lib/services/cases';

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireOrgContext();
    const sp = req.nextUrl.searchParams;
    const cases = listRecoveryCases(ctx.organization.id, {
      search: sp.get('search') ?? undefined,
      status: sp.get('status') ?? undefined,
      supplierId: sp.get('supplierId') ?? undefined,
      incidentType: sp.get('incidentType') ?? undefined,
    });
    return NextResponse.json({ cases });
  } catch (err) {
    return handleApiError(err);
  }
}

const CreateCaseSchema = z.object({
  supplierId: z.string().uuid(),
  plantId: z.string().uuid().optional().nullable(),
  incidentType: z.enum(INCIDENT_TYPES),
  title: z.string().min(4),
  description: z.string().min(5),
  responsibilityAssessment: z.string().optional(),
  claimBasis: z.string().optional(),
  incidentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  discoveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().length(3).default('USD'),
  initialCost: z
    .object({
      category: z.enum(COST_CATEGORIES),
      description: z.string().min(2),
      quantity: z.coerce.number().positive(),
      unitLabel: z.string().min(1),
      unitRate: z.string(),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireOrgContext('cases:create');
    const body = CreateCaseSchema.parse(await req.json());

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
      action: 'create_case',
    });
    if (!ent.allowed) {
      return NextResponse.json({ error: ent.reason }, { status: 403 });
    }

    const created = createRecoveryCase(ctx.organization.id, ctx.user.id, {
      ...body,
      initialCost: body.initialCost
        ? {
            category: body.initialCost.category,
            description: body.initialCost.description,
            quantity: body.initialCost.quantity,
            unitLabel: body.initialCost.unitLabel,
            unitRateCents: parseDecimalToCents(body.initialCost.unitRate),
          }
        : undefined,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
