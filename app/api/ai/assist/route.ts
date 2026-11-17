import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/session';
import { handleApiError } from '@/lib/api/http';
import {
  assistDraftSupplierCommunication,
  assistExtractIncidentDocument,
  assistSummarizeHistory,
  checkAiRateLimit,
} from '@/lib/ai/provider';
import { checkEntitlement } from '@/lib/domain/billing';
import { formatCents } from '@/lib/domain/money';
import { COST_CATEGORY_LABELS, INCIDENT_TYPE_LABELS } from '@/lib/domain/workflow';
import { getRecoveryCaseDetail } from '@/lib/services/cases';

const AiRequestSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('extract_document'),
    rawText: z.string().min(10).max(20000),
  }),
  z.object({
    mode: z.literal('draft_communication'),
    caseId: z.string().uuid(),
  }),
  z.object({
    mode: z.literal('summarize_case'),
    caseId: z.string().uuid(),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireOrgContext('ai:assist');
    const body = AiRequestSchema.parse(await req.json());

    if (!checkAiRateLimit(ctx.organization.id, 20)) {
      return NextResponse.json(
        { error: 'AI assistance rate limit exceeded. Please wait a minute and try again.' },
        { status: 429 }
      );
    }

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
      action: 'ai_assist',
    });

    const useGemini = ctx.organization.aiProcessingEnabled && ent.allowed;

    let result;
    if (body.mode === 'extract_document') {
      result = await assistExtractIncidentDocument({
        rawText: body.rawText,
        aiEnabledInWorkspace: useGemini,
      });
    } else {
      const detail = getRecoveryCaseDetail(ctx.organization.id, body.caseId);
      if (!detail) {
        return NextResponse.json({ error: 'Recovery case not found' }, { status: 404 });
      }
      if (body.mode === 'draft_communication') {
        const costLinesSummary =
          detail.costItems
            .map(
              (ci) =>
                `- ${COST_CATEGORY_LABELS[ci.category] ?? ci.category}: ${ci.description} (${ci.formulaText}) = ${formatCents(ci.recoverableAmountCents, detail.currency)}`
            )
            .join('\n') || '- Cost breakdown pending finalization';
        const evidenceListSummary =
          detail.evidence.map((e) => `- ${e.title} (${e.fileName})`).join('\n') || '';

        result = await assistDraftSupplierCommunication({
          aiEnabledInWorkspace: useGemini,
          caseNumber: detail.caseNumber,
          organizationName: detail.organizationName,
          supplierName: detail.supplierName,
          contactName: detail.supplierContact?.name ?? null,
          poNumber: detail.poNumber,
          incidentTypeLabel: INCIDENT_TYPE_LABELS[detail.incidentType] ?? detail.incidentType,
          description: detail.description,
          claimBasis: detail.claimBasis,
          claimAmountFormatted: formatCents(
            detail.submittedAmountCents || detail.potentiallyRecoverableCents,
            detail.currency
          ),
          costLinesSummary,
          evidenceListSummary,
        });
      } else {
        result = await assistSummarizeHistory({
          aiEnabledInWorkspace: useGemini,
          caseNumber: detail.caseNumber,
          timelineText: detail.timeline.map((t) => `${t.createdAt}: ${t.summary}`).join('\n'),
          communicationsText: detail.communications
            .map((c) => `[${c.direction}] ${c.subject}: ${c.body}`)
            .join('\n'),
        });
      }
    }

    if (result.provider === 'gemini') {
      db.prepare(
        `INSERT INTO usage_records (id, organization_id, period_key, ai_requests)
         VALUES (?, ?, ?, 1)
         ON CONFLICT(organization_id, period_key) DO UPDATE SET ai_requests = ai_requests + 1`
      ).run(crypto.randomUUID(), ctx.organization.id, periodKey);
    }

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
