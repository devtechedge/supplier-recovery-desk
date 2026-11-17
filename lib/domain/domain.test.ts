import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDecimalToCents,
  formatCents,
  calculateCostLineCents,
  calculateOutstandingBalanceCents,
  groupMonetaryTotalsByCurrency,
  calculateRecoveryRateBps,
} from './money';
import { validateCaseTransition, getChecklistForIncident } from './workflow';
import {
  detectPriceVariance,
  detectInvoiceQtyExceedsReceipt,
  detectShortShipment,
  detectQualityOrDamageLoss,
  detectDuplicateInvoices,
} from './discrepancy';
import { parseCsvText, validateMappedCsvRows, CSV_TEMPLATES } from './csv';
import { hasPermission } from './permissions';
import { checkEntitlement } from './billing';

test('money: decimal-safe parsing avoids IEEE 754 float drift', () => {
  assert.equal(parseDecimalToCents('19.99'), 1999);
  assert.equal(parseDecimalToCents('1,234.567'), 123457);
  assert.equal(parseDecimalToCents('$48.50'), 4850);
  assert.equal(parseDecimalToCents('0.10') + parseDecimalToCents('0.20'), 30);
  assert.throws(() => parseDecimalToCents('-10.00'), /Negative/);
  assert.equal(parseDecimalToCents('-10.00', true), -1000);
});

test('money: cost breakdown, currency grouping, and outstanding settlement balance', () => {
  assert.equal(calculateCostLineCents(14, 1, 4800), 67200);
  assert.equal(calculateCostLineCents(3, 2, 1001), 1502); // 1.5 * 1001 = 1501.5 -> 1502

  // Approved credit is NOT recovered until settlement transactions are recorded
  const outstanding = calculateOutstandingBalanceCents({
    expectedCreditCents: 240000,
    approvedAmountCents: 240000,
    submittedAmountCents: 280000,
    potentiallyRecoverableCents: 300000,
    recoveredAmountCents: 100000,
  });
  assert.equal(outstanding, 140000);

  const grouped = groupMonetaryTotalsByCurrency(
    [
      { currency: 'USD', amt: 1000 },
      { currency: 'EUR', amt: 2500 },
      { currency: 'USD', amt: 500 },
    ],
    (x) => x.amt
  );
  assert.deepEqual(grouped, [
    { currency: 'EUR', totalCents: 2500 },
    { currency: 'USD', totalCents: 1500 },
  ]);
  assert.equal(formatCents(123456, 'EUR'), '€1,234.56');
  assert.equal(calculateRecoveryRateBps(150000, 200000), 7500);
});

test('workflow: state machine prevents nonsensical transitions and tailors checklists', () => {
  assert.equal(validateCaseTransition('draft', 'ready_for_review').allowed, true);
  assert.equal(validateCaseTransition('draft', 'recovered').allowed, false);
  assert.equal(validateCaseTransition('cancelled', 'submitted').allowed, false);
  assert.equal(validateCaseTransition('credit_expected', 'partially_recovered').allowed, true);

  const checklist = getChecklistForIncident('quality_rejection');
  assert.ok(checklist.some((i) => i.key === 'inspection_report' && i.required));
});

test('discrepancy: deterministic price, quantity, short-shipment, quality, and duplicate rules', () => {
  // Within tolerance ($10 < $25 abs threshold) -> null
  assert.equal(
    detectPriceVariance({
      sourceKey: 'k1',
      partNumber: 'AX-1',
      poUnitPriceCents: 1000,
      invoiceUnitPriceCents: 1100,
      invoicedQty: 10,
      currency: 'USD',
      tolerancePctBps: 200,
      toleranceAbsCents: 2500,
    }),
    null
  );

  // Exceeds both 2% and $25 -> detected
  const pv = detectPriceVariance({
    sourceKey: 'k2',
    partNumber: 'AX-9021-B',
    poUnitPriceCents: 1850,
    invoiceUnitPriceCents: 2125,
    invoicedQty: 500,
    currency: 'USD',
    tolerancePctBps: 200,
    toleranceAbsCents: 2500,
  });
  assert.ok(pv);
  assert.equal(pv.estimatedAmountCents, 137500);

  const invGtGr = detectInvoiceQtyExceedsReceipt({
    sourceKey: 'k3',
    partNumber: 'AX-9021-B',
    invoicedQty: 500,
    receivedQty: 440,
    unitPriceCents: 1850,
    currency: 'USD',
    toleranceQtyAbs: 1,
    toleranceQtyPctBps: 100,
  });
  assert.ok(invGtGr);
  assert.equal(invGtGr.estimatedAmountCents, 111000);

  const short = detectShortShipment({
    sourceKey: 'k4',
    partNumber: 'AX-9021-B',
    orderedQty: 500,
    receivedQty: 440,
    unitPriceCents: 1850,
    currency: 'USD',
    toleranceQtyAbs: 1,
    toleranceQtyPctBps: 100,
  });
  assert.ok(short);
  assert.equal(short.incidentType, 'short_shipment');

  const qual = detectQualityOrDamageLoss({
    sourceKey: 'k5',
    partNumber: 'AX-9021-B',
    rejectedQty: 25,
    damagedQty: 10,
    unitPriceCents: 1850,
    currency: 'USD',
  });
  assert.ok(qual);
  assert.equal(qual.estimatedAmountCents, 64750);

  const dups = detectDuplicateInvoices([
    {
      id: '1',
      supplierId: 'sup-1',
      invoiceNumber: 'INV-100',
      invoiceDate: '2026-10-01',
      totalAmountCents: 50000,
      currency: 'USD',
    },
    {
      id: '2',
      supplierId: 'sup-1',
      invoiceNumber: 'INV 100',
      invoiceDate: '2026-10-01',
      totalAmountCents: 50000,
      currency: 'USD',
    },
  ]);
  assert.equal(dups.length, 1);
  assert.equal(dups[0].ruleCode, 'RULE_DUPLICATE_INVOICE');
});

test('csv: parses RFC-4180 CSV and validates errors, duplicates, and unmatched references', () => {
  const { headers, rows } = parseCsvText(CSV_TEMPLATES.purchase_orders.sampleCsv);
  assert.equal(headers.length, 11);
  assert.equal(rows.length, 2);

  const badCsv = [
    'po_number,supplier_code,order_date,line_number,part_number,ordered_qty,unit_price,currency',
    'PO-1,SUP-1042,2026-10-01,1,PART-1,10,12.50,USD',
    'PO-1,SUP-1042,2026-10-01,1,PART-1,10,12.50,USD',
    'PO-2,SUP-UNKNOWN,bad-date,1,PART-2,5,not-a-price,USD',
    'PO-3,SUP-9999,2026-10-02,1,PART-3,5,20.00,USD',
  ].join('\n');

  const parsedBad = parseCsvText(badCsv);
  const validation = validateMappedCsvRows({
    importType: 'purchase_orders',
    headers: parsedBad.headers,
    rows: parsedBad.rows,
    columnMapping: {},
    existingSupplierCodes: new Set(['SUP-1042']),
  });

  assert.equal(validation[0].status, 'valid');
  assert.equal(validation[1].status, 'duplicate');
  assert.equal(validation[2].status, 'error');
  assert.equal(validation[3].status, 'unmatched_warning');
});

test('permissions & billing: RBAC and plan entitlement checks enforce boundaries', () => {
  assert.equal(hasPermission('viewer', 'cases:create'), false);
  assert.equal(hasPermission('viewer', 'evidence:read'), true);
  assert.equal(hasPermission('contributor', 'settlements:record'), false);
  assert.equal(hasPermission('analyst', 'settlements:record'), true);
  assert.equal(hasPermission('admin', 'members:manage'), true);

  const starterAi = checkEntitlement({
    planTier: 'starter',
    subscriptionStatus: 'active',
    usage: { activeSeats: 2, casesCreatedThisMonth: 5, importRowsThisMonth: 100, aiRequestsThisMonth: 0 },
    action: 'ai_assist',
  });
  assert.equal(starterAi.allowed, false);

  const canceled = checkEntitlement({
    planTier: 'growth',
    subscriptionStatus: 'canceled',
    usage: { activeSeats: 2, casesCreatedThisMonth: 5, importRowsThisMonth: 100, aiRequestsThisMonth: 0 },
    action: 'create_case',
  });
  assert.equal(canceled.allowed, false);
});
