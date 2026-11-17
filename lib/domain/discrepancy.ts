import { formatCents } from './money';
import type { IncidentType } from './workflow';

export interface DetectedDiscrepancy {
  ruleCode: string;
  ruleName: string;
  incidentType: IncidentType;
  sourceKey: string;
  expectedValueText: string;
  actualValueText: string;
  varianceText: string;
  toleranceText: string;
  estimatedAmountCents: number;
  currency: string;
  matchConfidence: 'exact' | 'high' | 'review_needed';
  reviewReason: string;
  suggestedAction: string;
}

export function detectPriceVariance(params: {
  sourceKey: string;
  partNumber: string;
  poUnitPriceCents: number;
  invoiceUnitPriceCents: number;
  invoicedQty: number;
  currency: string;
  tolerancePctBps: number;
  toleranceAbsCents: number;
}): DetectedDiscrepancy | null {
  const unitDiffCents = params.invoiceUnitPriceCents - params.poUnitPriceCents;
  if (unitDiffCents <= 0 || params.invoicedQty <= 0) {
    return null;
  }

  const totalOverchargeCents = unitDiffCents * params.invoicedQty;
  const pctVarianceBps =
    params.poUnitPriceCents > 0
      ? Math.round((unitDiffCents * 10000) / params.poUnitPriceCents)
      : 10000;

  // Trigger only if BOTH percentage and absolute tolerance thresholds are exceeded (or if abs tolerance is 0)
  const exceedsPct = pctVarianceBps > params.tolerancePctBps;
  const exceedsAbs = totalOverchargeCents > params.toleranceAbsCents;

  if (!exceedsPct || !exceedsAbs) {
    return null;
  }

  return {
    ruleCode: 'RULE_PRICE_EXCEEDS_PO',
    ruleName: 'Invoice unit price exceeds PO unit price',
    incidentType: 'price_variance',
    sourceKey: params.sourceKey,
    expectedValueText: `${formatCents(params.poUnitPriceCents, params.currency)} / unit (PO)`,
    actualValueText: `${formatCents(params.invoiceUnitPriceCents, params.currency)} / unit (Inv × ${params.invoicedQty})`,
    varianceText: `+${formatCents(totalOverchargeCents, params.currency)} (+${(pctVarianceBps / 100).toFixed(2)}%)`,
    toleranceText: `${(params.tolerancePctBps / 100).toFixed(2)}% / ${formatCents(params.toleranceAbsCents, params.currency)}`,
    estimatedAmountCents: totalOverchargeCents,
    currency: params.currency,
    matchConfidence: 'exact',
    reviewReason: `Part ${params.partNumber} was billed above the purchase order unit price beyond organization tolerance. Confirm whether an approved price amendment or surcharge exists before raising a debit claim.`,
    suggestedAction: 'Compare PO revision history against supplier invoice and raise a price-variance recovery case if unapproved.',
  };
}

export function detectInvoiceQtyExceedsReceipt(params: {
  sourceKey: string;
  partNumber: string;
  invoicedQty: number;
  receivedQty: number;
  unitPriceCents: number;
  currency: string;
  toleranceQtyAbs: number;
  toleranceQtyPctBps: number;
}): DetectedDiscrepancy | null {
  const excessQty = params.invoicedQty - params.receivedQty;
  if (excessQty <= 0) {
    return null;
  }

  const pctBps = params.receivedQty > 0 ? Math.round((excessQty * 10000) / params.receivedQty) : 10000;
  if (excessQty <= params.toleranceQtyAbs && pctBps <= params.toleranceQtyPctBps) {
    return null;
  }

  const estimatedAmountCents = excessQty * params.unitPriceCents;
  return {
    ruleCode: 'RULE_INV_QTY_GT_GR',
    ruleName: 'Invoiced quantity exceeds recorded goods receipt',
    incidentType: 'overbilling',
    sourceKey: params.sourceKey,
    expectedValueText: `${params.receivedQty} units received`,
    actualValueText: `${params.invoicedQty} units invoiced`,
    varianceText: `+${excessQty} units (${formatCents(estimatedAmountCents, params.currency)})`,
    toleranceText: `${params.toleranceQtyAbs} units / ${(params.toleranceQtyPctBps / 100).toFixed(2)}%`,
    estimatedAmountCents,
    currency: params.currency,
    matchConfidence: 'exact',
    reviewReason: `Supplier billed ${excessQty} more units of ${params.partNumber} than recorded in receiving. Verify if a split shipment is still in transit before claiming.`,
    suggestedAction: 'Check open ASN/packing slips; if delivery is complete, create an overbilling recovery claim.',
  };
}

export function detectShortShipment(params: {
  sourceKey: string;
  partNumber: string;
  orderedQty: number;
  receivedQty: number;
  unitPriceCents: number;
  currency: string;
  toleranceQtyAbs: number;
  toleranceQtyPctBps: number;
}): DetectedDiscrepancy | null {
  const shortQty = params.orderedQty - params.receivedQty;
  if (shortQty <= 0) {
    return null;
  }
  const pctBps = params.orderedQty > 0 ? Math.round((shortQty * 10000) / params.orderedQty) : 0;
  if (shortQty <= params.toleranceQtyAbs && pctBps <= params.toleranceQtyPctBps) {
    return null;
  }

  const estimatedAmountCents = shortQty * params.unitPriceCents;
  return {
    ruleCode: 'RULE_GR_SHORT_OF_PO',
    ruleName: 'Goods received short against ordered quantity',
    incidentType: 'short_shipment',
    sourceKey: params.sourceKey,
    expectedValueText: `${params.orderedQty} units ordered`,
    actualValueText: `${params.receivedQty} units received`,
    varianceText: `-${shortQty} units (${formatCents(estimatedAmountCents, params.currency)})`,
    toleranceText: `${params.toleranceQtyAbs} units / ${(params.toleranceQtyPctBps / 100).toFixed(2)}%`,
    estimatedAmountCents,
    currency: params.currency,
    matchConfidence: 'high',
    reviewReason: `Receiving recorded ${shortQty} fewer units of ${params.partNumber} than ordered. Confirm whether the PO line remains open for backorder or was billed in full.`,
    suggestedAction: 'Confirm with receiving dock and raise a short-shipment recovery case if billed or closed short.',
  };
}

export function detectQualityOrDamageLoss(params: {
  sourceKey: string;
  partNumber: string;
  rejectedQty: number;
  damagedQty: number;
  unitPriceCents: number;
  currency: string;
}): DetectedDiscrepancy | null {
  const affectedQty = params.rejectedQty + params.damagedQty;
  if (affectedQty <= 0) {
    return null;
  }
  const incidentType: IncidentType =
    params.damagedQty > params.rejectedQty ? 'damaged_goods' : 'quality_rejection';
  const estimatedAmountCents = affectedQty * params.unitPriceCents;

  return {
    ruleCode: 'RULE_QUALITY_OR_DAMAGE',
    ruleName: incidentType === 'damaged_goods' ? 'Incoming damaged quantity recorded' : 'Quality rejection quantity recorded',
    incidentType,
    sourceKey: params.sourceKey,
    expectedValueText: '0 rejected / damaged units',
    actualValueText: `${params.rejectedQty} rejected, ${params.damagedQty} damaged (${params.partNumber})`,
    varianceText: `${affectedQty} non-conforming units (${formatCents(estimatedAmountCents, params.currency)} material value)`,
    toleranceText: 'Zero-defect expectation',
    estimatedAmountCents,
    currency: params.currency,
    matchConfidence: 'exact',
    reviewReason: 'Non-conforming material requires human root-cause assignment (supplier manufacturing defect vs. carrier transit damage vs. internal handling) and sorting labour quantification.',
    suggestedAction: 'Open recovery case, attach NCR/photos, and add sorting or rework labour costs if applicable.',
  };
}

export function detectLateDelivery(params: {
  sourceKey: string;
  poNumber: string;
  promisedDate: string;
  actualDate: string;
  currency: string;
}): DetectedDiscrepancy | null {
  const promised = Date.parse(params.promisedDate);
  const actual = Date.parse(params.actualDate);
  if (Number.isNaN(promised) || Number.isNaN(actual)) {
    return null;
  }
  const daysLate = Math.round((actual - promised) / (1000 * 60 * 60 * 24));
  if (daysLate <= 1) {
    return null;
  }

  return {
    ruleCode: 'RULE_LATE_DELIVERY',
    ruleName: 'Delivery received past promised PO date',
    incidentType: 'late_delivery',
    sourceKey: params.sourceKey,
    expectedValueText: `Promised ${params.promisedDate}`,
    actualValueText: `Received ${params.actualDate}`,
    varianceText: `+${daysLate} calendar days late`,
    toleranceText: '1 day grace window',
    estimatedAmountCents: 0,
    currency: params.currency,
    matchConfidence: 'review_needed',
    reviewReason: `PO ${params.poNumber} arrived ${daysLate} days late. Late delivery alone does not establish recoverable damages unless expedite freight, downtime, or contractual liquidated damages apply.`,
    suggestedAction: 'Review whether premium freight or overtime was incurred due to this delay before opening a claim.',
  };
}

export interface InvoiceDuplicateCandidate {
  id: string;
  supplierId: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmountCents: number;
  currency: string;
}

export function detectDuplicateInvoices(invoices: InvoiceDuplicateCandidate[]): DetectedDiscrepancy[] {
  const results: DetectedDiscrepancy[] = [];
  const seen = new Map<string, InvoiceDuplicateCandidate>();

  for (const inv of invoices) {
    const normalizedNum = inv.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const signature = `${inv.supplierId}|${inv.totalAmountCents}|${inv.currency}|${inv.invoiceDate}`;
    const existingByNumber = Array.from(seen.values()).find(
      (other) =>
        other.supplierId === inv.supplierId &&
        other.id !== inv.id &&
        other.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() === normalizedNum
    );
    const existingByAmountDate = seen.get(signature);
    const match = existingByNumber ?? (existingByAmountDate && existingByAmountDate.id !== inv.id ? existingByAmountDate : undefined);

    if (match) {
      results.push({
        ruleCode: 'RULE_DUPLICATE_INVOICE',
        ruleName: 'Potential duplicate supplier invoice',
        incidentType: 'overbilling',
        sourceKey: `dup:${inv.supplierId}:${match.id}:${inv.id}`,
        expectedValueText: `Single invoice (${match.invoiceNumber} on ${match.invoiceDate})`,
        actualValueText: `Second invoice ${inv.invoiceNumber} (${formatCents(inv.totalAmountCents, inv.currency)})`,
        varianceText: `Potential double-billing of ${formatCents(inv.totalAmountCents, inv.currency)}`,
        toleranceText: 'Exact uniqueness check',
        estimatedAmountCents: Math.max(0, inv.totalAmountCents),
        currency: inv.currency,
        matchConfidence: existingByNumber ? 'exact' : 'review_needed',
        reviewReason: existingByNumber
          ? 'Normalized invoice identifiers match after punctuation removal. Verify if a credit/rebill occurred.'
          : 'Same supplier, date, and exact total amount with different invoice identifier. Requires AP verification.',
        suggestedAction: 'Confirm payment ledger before submitting a duplicate-payment recovery claim.',
      });
    } else {
      seen.set(signature, inv);
    }
  }
  return results;
}
