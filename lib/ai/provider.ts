import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import { INCIDENT_TYPES, type IncidentType } from '@/lib/domain/workflow';

export const ExtractedDocumentSchema = z.object({
  supplierName: z.string().nullable(),
  poNumber: z.string().nullable(),
  invoiceOrReportNumber: z.string().nullable(),
  incidentDate: z.string().nullable(),
  suggestedIncidentType: z.enum(INCIDENT_TYPES).nullable(),
  affectedQty: z.number().int().nonnegative().nullable(),
  currency: z.string().length(3).nullable(),
  mentionedAmount: z.string().nullable(),
  summary: z.string(),
  missingEvidenceSuggestions: z.array(z.string()),
});

export type ExtractedDocumentResult = z.infer<typeof ExtractedDocumentSchema>;

export const DraftedEmailSchema = z.object({
  subject: z.string().min(3),
  body: z.string().min(20),
});

export interface AiAssistResponse {
  provider: 'gemini' | 'deterministic_fallback';
  requiresHumanReview: true;
  extracted?: ExtractedDocumentResult;
  draftEmail?: { subject: string; body: string };
  summaryText?: string;
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Simple in-memory sliding window rate limiter for AI endpoints
const aiRateLimitWindow = new Map<string, number[]>();

export function checkAiRateLimit(organizationId: string, maxPerMinute = 20): boolean {
  const now = Date.now();
  const recent = (aiRateLimitWindow.get(organizationId) ?? []).filter((ts) => now - ts < 60_000);
  if (recent.length >= maxPerMinute) {
    return false;
  }
  recent.push(now);
  aiRateLimitWindow.set(organizationId, recent);
  return true;
}

export async function assistExtractIncidentDocument(params: {
  rawText: string;
  aiEnabledInWorkspace: boolean;
}): Promise<AiAssistResponse> {
  const ai = params.aiEnabledInWorkspace ? getGeminiClient() : null;

  if (!ai) {
    // Deterministic fallback when Gemini key is absent or workspace AI is disabled
    const poMatch = params.rawText.match(/\bPO[-\s]?\d{4}[-–]?\d+\b/i)?.[0] ?? null;
    const dateMatch = params.rawText.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ?? null;
    const lower = params.rawText.toLowerCase();
    let suggestedIncidentType: IncidentType | null = null;
    if (lower.includes('short') || lower.includes('missing')) suggestedIncidentType = 'short_shipment';
    else if (lower.includes('damage') || lower.includes('crush') || lower.includes('bent'))
      suggestedIncidentType = 'damaged_goods';
    else if (lower.includes('reject') || lower.includes('ncr') || lower.includes('hardness'))
      suggestedIncidentType = 'quality_rejection';
    else if (lower.includes('price') || lower.includes('overcharge'))
      suggestedIncidentType = 'price_variance';

    return {
      provider: 'deterministic_fallback',
      requiresHumanReview: true,
      extracted: {
        supplierName: null,
        poNumber: poMatch,
        invoiceOrReportNumber: null,
        incidentDate: dateMatch,
        suggestedIncidentType,
        affectedQty: null,
        currency: null,
        mentionedAmount: null,
        summary: params.rawText.slice(0, 260).trim() || 'Manual entry required.',
        missingEvidenceSuggestions: [
          'Purchase order baseline confirmation',
          'Signed goods receipt or receiving inspection note',
        ],
      },
    };
  }

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Extract structured supplier recovery fields from the following operational document text. CRITICAL: If any field is not explicitly stated in the text, return null. Never invent PO numbers, quantities, dates, or monetary amounts.\n\nDOCUMENT TEXT:\n${params.rawText.slice(0, 12000)}`,
    config: {
      systemInstruction:
        'You are a careful industrial procurement & supplier quality analyst. Return strictly grounded JSON matching the schema. Return null for any unstated field.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          supplierName: { type: Type.STRING, nullable: true },
          poNumber: { type: Type.STRING, nullable: true },
          invoiceOrReportNumber: { type: Type.STRING, nullable: true },
          incidentDate: { type: Type.STRING, nullable: true },
          suggestedIncidentType: { type: Type.STRING, nullable: true },
          affectedQty: { type: Type.INTEGER, nullable: true },
          currency: { type: Type.STRING, nullable: true },
          mentionedAmount: { type: Type.STRING, nullable: true },
          summary: { type: Type.STRING },
          missingEvidenceSuggestions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ['summary', 'missingEvidenceSuggestions'],
      },
    },
  });

  const parsedJson = JSON.parse(response.text ?? '{}');
  const validated = ExtractedDocumentSchema.parse(parsedJson);

  return {
    provider: 'gemini',
    requiresHumanReview: true,
    extracted: validated,
  };
}

export async function assistDraftSupplierCommunication(params: {
  aiEnabledInWorkspace: boolean;
  caseNumber: string;
  organizationName: string;
  supplierName: string;
  contactName: string | null;
  poNumber: string | null;
  incidentTypeLabel: string;
  description: string;
  claimBasis: string | null;
  claimAmountFormatted: string;
  costLinesSummary: string;
  evidenceListSummary: string;
}): Promise<AiAssistResponse> {
  const deterministicSubject = `Recovery Claim ${params.caseNumber} - ${params.incidentTypeLabel}${params.poNumber ? ` (${params.poNumber})` : ''}`;
  const greeting = params.contactName ? `Dear ${params.contactName},` : `Dear ${params.supplierName} Accounts & Quality Team,`;
  const deterministicBody = `${greeting}

${params.organizationName} is submitting a documented supplier cost-recovery claim (${params.caseNumber}) regarding ${params.incidentTypeLabel.toLowerCase()}${params.poNumber ? ` under Purchase Order ${params.poNumber}` : ''}.

Incident Summary:
${params.description}

Claim Basis:
${params.claimBasis || 'Recorded receiving inspection and purchase order baseline variance.'}

Itemized Cost Breakdown (Total Claim: ${params.claimAmountFormatted}):
${params.costLinesSummary}

Supporting Evidence Attached / Indexed:
${params.evidenceListSummary || 'Supporting inspection and receiving documentation available on request.'}

Please review and confirm credit memo issuance or respond with any questions within 14 calendar days.

Sincerely,
Procurement & Supplier Recovery Team
${params.organizationName}`;

  const ai = params.aiEnabledInWorkspace ? getGeminiClient() : null;
  if (!ai) {
    return {
      provider: 'deterministic_fallback',
      requiresHumanReview: true,
      draftEmail: {
        subject: deterministicSubject,
        body: deterministicBody,
      },
    };
  }

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Draft a professional, factual, neutral supplier recovery claim email using ONLY the verified facts below. Do not invent any PO numbers, contract clauses, or monetary amounts.\n\nFacts:\nCase: ${params.caseNumber}\nOrganization: ${params.organizationName}\nSupplier: ${params.supplierName}\nContact: ${params.contactName ?? 'Accounts & Quality Team'}\nPO: ${params.poNumber ?? 'Not linked'}\nIncident: ${params.incidentTypeLabel}\nDescription: ${params.description}\nBasis: ${params.claimBasis ?? 'Standard PO/inspection variance'}\nClaim Amount: ${params.claimAmountFormatted}\nCost Lines:\n${params.costLinesSummary}\nEvidence:\n${params.evidenceListSummary}`,
    config: {
      systemInstruction:
        'Draft a concise, neutral B2B procurement recovery email for human approval. Never fabricate facts.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          subject: { type: Type.STRING },
          body: { type: Type.STRING },
        },
        required: ['subject', 'body'],
      },
    },
  });

  const validated = DraftedEmailSchema.parse(JSON.parse(response.text ?? '{}'));
  return {
    provider: 'gemini',
    requiresHumanReview: true,
    draftEmail: validated,
  };
}

export async function assistSummarizeHistory(params: {
  aiEnabledInWorkspace: boolean;
  caseNumber: string;
  timelineText: string;
  communicationsText: string;
}): Promise<AiAssistResponse> {
  const ai = params.aiEnabledInWorkspace ? getGeminiClient() : null;
  if (!ai) {
    return {
      provider: 'deterministic_fallback',
      requiresHumanReview: true,
      summaryText: `Deterministic summary for ${params.caseNumber}: ${params.timelineText.slice(0, 320) || 'No timeline events recorded yet.'}`,
    };
  }

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Summarize this supplier recovery case history and correspondence concisely in 3-5 factual bullet points without inventing dates or dollar values.\n\nTimeline:\n${params.timelineText}\n\nCorrespondence:\n${params.communicationsText}`,
  });

  return {
    provider: 'gemini',
    requiresHumanReview: true,
    summaryText: response.text ?? 'No summary generated.',
  };
}
