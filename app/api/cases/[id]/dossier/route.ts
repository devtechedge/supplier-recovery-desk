import { NextRequest, NextResponse } from 'next/server';
import { requireOrgContext } from '@/lib/auth/session';
import { handleApiError } from '@/lib/api/http';
import { getRecoveryCaseDetail } from '@/lib/services/cases';
import { generateClaimDossierPdf } from '@/lib/pdf/dossier';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireOrgContext('evidence:read');
    const { id } = await context.params;
    const detail = getRecoveryCaseDetail(ctx.organization.id, id);
    if (!detail) {
      return NextResponse.json({ error: 'Recovery case not found' }, { status: 404 });
    }

    const pdfBytes = await generateClaimDossierPdf({
      organizationName: detail.organizationName,
      isDemo: detail.isDemo,
      caseNumber: detail.caseNumber,
      title: detail.title,
      status: detail.status,
      incidentType: detail.incidentType,
      supplierName: detail.supplierName,
      supplierCode: detail.supplierCode,
      supplierContactEmail: detail.supplierContact?.email ?? null,
      plantName: detail.plantName,
      poNumber: detail.poNumber,
      receiptNumber: detail.receiptNumber,
      invoiceNumber: detail.invoiceNumber,
      incidentDate: detail.incidentDate,
      discoveryDate: detail.discoveryDate,
      submissionDate: detail.submissionDate,
      responseDeadline: detail.responseDeadline,
      description: detail.description,
      responsibilityAssessment: detail.responsibilityAssessment,
      claimBasis: detail.claimBasis,
      currency: detail.currency,
      grossLossCents: detail.grossLossCents,
      potentiallyRecoverableCents: detail.potentiallyRecoverableCents,
      submittedAmountCents: detail.submittedAmountCents,
      approvedAmountCents: detail.approvedAmountCents,
      expectedCreditCents: detail.expectedCreditCents,
      recoveredAmountCents: detail.recoveredAmountCents,
      outstandingBalanceCents: detail.outstandingBalanceCents,
      costItems: detail.costItems.map((ci) => ({
        category: ci.category,
        description: ci.description,
        formulaText: ci.formulaText,
        calculatedAmountCents: ci.calculatedAmountCents,
        recoverableAmountCents: ci.recoverableAmountCents,
      })),
      evidenceItems: detail.evidence.map((ev) => ({
        title: ev.title,
        fileName: ev.fileName,
        evidenceType: ev.evidenceType,
        createdAt: ev.createdAt,
      })),
    });

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${detail.caseNumber}-claim-dossier.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
