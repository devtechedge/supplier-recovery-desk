import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOrgContext } from '@/lib/auth/session';
import { handleApiError } from '@/lib/api/http';
import { parseDecimalToCents } from '@/lib/domain/money';
import { recordSettlementOrTransaction } from '@/lib/services/cases';

const SettlementSchema = z.object({
  mode: z.enum(['promise_credit', 'receive_payment']),
  settlementType: z
    .enum(['credit_memo', 'bank_refund', 'invoice_offset', 'replacement_goods'])
    .optional(),
  referenceNumber: z.string().min(2),
  amount: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
  settlementId: z.string().uuid().optional().nullable(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireOrgContext('settlements:record');
    const { id } = await context.params;
    const body = SettlementSchema.parse(await req.json());

    const result = recordSettlementOrTransaction(ctx.organization.id, ctx.user.id, id, {
      mode: body.mode,
      settlementType: body.settlementType,
      referenceNumber: body.referenceNumber,
      amountCents: parseDecimalToCents(body.amount),
      date: body.date,
      notes: body.notes,
      settlementId: body.settlementId,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
