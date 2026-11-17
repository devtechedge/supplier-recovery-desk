import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { formatCents } from '@/lib/domain/money';
import { COST_CATEGORY_LABELS, INCIDENT_TYPE_LABELS, STATUS_META, type CaseStatus, type CostCategory, type IncidentType } from '@/lib/domain/workflow';

export interface DossierPayload {
  organizationName: string;
  isDemo: boolean;
  caseNumber: string;
  title: string;
  status: CaseStatus;
  incidentType: IncidentType;
  supplierName: string;
  supplierCode: string;
  supplierContactEmail: string | null;
  plantName: string | null;
  poNumber: string | null;
  receiptNumber: string | null;
  invoiceNumber: string | null;
  incidentDate: string;
  discoveryDate: string;
  submissionDate: string | null;
  responseDeadline: string | null;
  description: string;
  responsibilityAssessment: string;
  claimBasis: string | null;
  currency: string;
  grossLossCents: number;
  potentiallyRecoverableCents: number;
  submittedAmountCents: number;
  approvedAmountCents: number;
  expectedCreditCents: number;
  recoveredAmountCents: number;
  outstandingBalanceCents: number;
  costItems: Array<{
    category: CostCategory;
    description: string;
    formulaText: string;
    calculatedAmountCents: number;
    recoverableAmountCents: number;
  }>;
  evidenceItems: Array<{
    title: string;
    fileName: string;
    evidenceType: string;
    createdAt: string;
  }>;
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.replace(/\r?\n/g, ' ').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length > maxChars) {
      if (current) lines.push(current);
      current = w;
    } else {
      current = (current + ' ' + w).trim();
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : ['-'];
}

export async function generateClaimDossierPdf(data: DossierPayload): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([612, 792]); // US Letter
  const margin = 48;
  let y = 744;

  const ensureSpace = (needed: number) => {
    if (y - needed < 56) {
      page = pdfDoc.addPage([612, 792]);
      y = 744;
    }
  };

  const drawText = (
    text: string,
    x: number,
    size = 10,
    bold = false,
    color = rgb(0.06, 0.09, 0.16)
  ) => {
    page.drawText(text, {
      x,
      y,
      size,
      font: bold ? fontBold : fontRegular,
      color,
    });
  };

  // Header
  drawText('SUPPLIER RECOVERY CLAIM DOSSIER', margin, 16, true, rgb(0.05, 0.1, 0.25));
  y -= 18;
  drawText(
    `${data.organizationName}  |  Case: ${data.caseNumber}  |  Status: ${STATUS_META[data.status]?.label ?? data.status}`,
    margin,
    10,
    false,
    rgb(0.28, 0.33, 0.41)
  );
  if (data.isDemo) {
    y -= 14;
    drawText('NOTICE: GENERATED FROM SYNTHETIC DEMO DATA', margin, 9, true, rgb(0.72, 0.28, 0.04));
  }
  y -= 14;
  page.drawLine({
    start: { x: margin, y },
    end: { x: 612 - margin, y },
    thickness: 1,
    color: rgb(0.82, 0.85, 0.9),
  });
  y -= 20;

  // Title & Incident Info
  for (const line of wrapText(data.title, 76)) {
    drawText(line, margin, 12, true);
    y -= 16;
  }
  y -= 6;

  const metaPairs: Array<[string, string]> = [
    ['Supplier', `${data.supplierName} (${data.supplierCode})`],
    ['Incident Type', INCIDENT_TYPE_LABELS[data.incidentType] ?? data.incidentType],
    ['Plant / Facility', data.plantName ?? 'Unassigned'],
    ['Purchase Order', data.poNumber ?? 'Not linked'],
    ['Goods Receipt', data.receiptNumber ?? 'Not linked'],
    ['Supplier Invoice', data.invoiceNumber ?? 'Not linked'],
    ['Incident / Discovery', `${data.incidentDate} / ${data.discoveryDate}`],
    ['Submitted / Deadline', `${data.submissionDate ?? 'Not submitted'} / ${data.responseDeadline ?? '-'}`],
  ];

  for (const [label, val] of metaPairs) {
    ensureSpace(16);
    drawText(`${label}:`, margin, 9, true, rgb(0.28, 0.33, 0.41));
    drawText(val, margin + 125, 9, false);
    y -= 14;
  }

  y -= 10;
  ensureSpace(40);
  drawText('Incident Description & Responsibility Assessment', margin, 11, true);
  y -= 14;
  for (const line of wrapText(data.description, 88)) {
    ensureSpace(14);
    drawText(line, margin, 9.5, false);
    y -= 13;
  }
  y -= 4;
  for (const line of wrapText(`Responsibility: ${data.responsibilityAssessment}`, 88)) {
    ensureSpace(14);
    drawText(line, margin, 9, false, rgb(0.28, 0.33, 0.41));
    y -= 13;
  }
  if (data.claimBasis) {
    for (const line of wrapText(`Claim Basis: ${data.claimBasis}`, 88)) {
      ensureSpace(14);
      drawText(line, margin, 9, false, rgb(0.28, 0.33, 0.41));
      y -= 13;
    }
  }

  // Financial Summary
  y -= 12;
  ensureSpace(90);
  drawText(`Financial Recovery Summary (${data.currency})`, margin, 11, true);
  y -= 16;
  const finRows: Array<[string, number]> = [
    ['Gross Operational Loss', data.grossLossCents],
    ['Potentially Recoverable Claim', data.potentiallyRecoverableCents],
    ['Submitted to Supplier', data.submittedAmountCents],
    ['Supplier Approved Amount', data.approvedAmountCents],
    ['Expected Credit / Refund', data.expectedCreditCents],
    ['Actual Cash / Credit Received', data.recoveredAmountCents],
    ['Remaining Unrecovered Balance', data.outstandingBalanceCents],
  ];
  for (const [label, cents] of finRows) {
    ensureSpace(15);
    drawText(label, margin, 9.5, false);
    drawText(formatCents(cents, data.currency), margin + 260, 9.5, true);
    y -= 14;
  }

  // Itemized Cost Breakdown
  y -= 12;
  ensureSpace(40);
  drawText('Itemized Cost Breakdown', margin, 11, true);
  y -= 16;
  if (data.costItems.length === 0) {
    drawText('No itemized cost lines recorded.', margin, 9, false, rgb(0.4, 0.45, 0.52));
    y -= 14;
  } else {
    for (const item of data.costItems) {
      ensureSpace(32);
      const catLabel = COST_CATEGORY_LABELS[item.category] ?? item.category;
      drawText(`${catLabel} - ${item.description.slice(0, 62)}`, margin, 9, true);
      drawText(formatCents(item.recoverableAmountCents, data.currency), 490, 9, true);
      y -= 12;
      drawText(
        `Formula: ${item.formulaText}  (Gross: ${formatCents(item.calculatedAmountCents, data.currency)})`,
        margin + 10,
        8.5,
        false,
        rgb(0.35, 0.4, 0.48)
      );
      y -= 15;
    }
  }

  // Supporting Evidence Index
  y -= 10;
  ensureSpace(40);
  drawText('Supporting Evidence Index', margin, 11, true);
  y -= 15;
  if (data.evidenceItems.length === 0) {
    drawText('No evidence documents attached yet.', margin, 9, false, rgb(0.4, 0.45, 0.52));
    y -= 14;
  } else {
    for (const ev of data.evidenceItems) {
      ensureSpace(16);
      drawText(`• ${ev.title} (${ev.fileName}) [${ev.evidenceType}]`, margin, 9, false);
      y -= 14;
    }
  }

  // Disclaimer Footer
  y -= 14;
  ensureSpace(36);
  page.drawLine({
    start: { x: margin, y },
    end: { x: 612 - margin, y },
    thickness: 0.75,
    color: rgb(0.85, 0.88, 0.92),
  });
  y -= 14;
  const disclaimer =
    'Prepared for commercial supplier cost recovery reconciliation. Operational loss estimates do not constitute legal advice or automatic admission of liability until reviewed and agreed by both parties.';
  for (const line of wrapText(disclaimer, 95)) {
    drawText(line, margin, 8, false, rgb(0.42, 0.47, 0.55));
    y -= 11;
  }

  return pdfDoc.save();
}
