import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOrgContext } from '@/lib/auth/session';
import { handleApiError } from '@/lib/api/http';
import { parseDecimalToCents } from '@/lib/domain/money';
import { COST_CATEGORIES } from '@/lib/domain/workflow';
import { addCostItemToCase } from '@/lib/services/cases';

const AddCostSchema = z.object({
  category: z.enum(COST_CATEGORIES),
  description: z.string().min(2),
  quantity: z.coerce.number().positive(),
  unitLabel: z.string().min(1),
  unitRate: z.string(),
  recoverableOverride: z.string().optional(),
  overrideReason: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireOrgContext('cases:edit');
    const { id } = await context.params;
    const body = AddCostSchema.parse(await req.json());

    const result = addCostItemToCase(ctx.organization.id, ctx.user.id, id, {
      category: body.category,
      description: body.description,
      quantity: body.quantity,
      unitLabel: body.unitLabel,
      unitRateCents: parseDecimalToCents(body.unitRate),
      recoverableOverrideCents: body.recoverableOverride?.trim()
        ? parseDecimalToCents(body.recoverableOverride)
        : undefined,
      overrideReason: body.overrideReason,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
