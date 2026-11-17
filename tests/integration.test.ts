import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { closeDbForTests, getDb } from '../lib/db';
import {
  authenticateWithPassword,
  getActiveOrgContext,
  registerUserWithOrganization,
} from '../lib/auth/session';
import { commitCsvImportBatch, convertDiscrepancyLeadToCase } from '../lib/services/imports';
import {
  addCostItemToCase,
  getRecoveryCaseDetail,
  listRecoveryCases,
  recordSettlementOrTransaction,
  transitionCaseStatus,
} from '../lib/services/cases';
import { getOverviewDashboardData } from '../lib/services/dashboard';
import {
  createSignedEvidenceToken,
  storeEvidencePrivate,
  verifySignedEvidenceToken,
} from '../lib/storage/evidence-storage';

const tmpDbPath = path.join(os.tmpdir(), `srd-integration-${Date.now()}.db`);

test.before(() => {
  process.env.SRD_SQLITE_PATH = tmpDbPath;
  closeDbForTests();
});

test.after(() => {
  closeDbForTests();
  if (fs.existsSync(tmpDbPath)) {
    fs.unlinkSync(tmpDbPath);
  }
});

test('integration: multi-tenant isolation, CSV import, discrepancy detection, case lifecycle, evidence, and partial settlements', async () => {
  // 1. Register Org A & Org B
  const orgARes = registerUserWithOrganization({
    email: 'controller@orga.example',
    password: 'StrongPassword123!',
    fullName: 'Alice Controller',
    organizationName: 'Org A Manufacturing',
  });
  const orgBRes = registerUserWithOrganization({
    email: 'buyer@orgb.example',
    password: 'StrongPassword123!',
    fullName: 'Bob Buyer',
    organizationName: 'Org B Industrial',
  });

  const authCheck = authenticateWithPassword('controller@orga.example', 'StrongPassword123!');
  assert.equal(authCheck.userId, orgARes.userId);

  // Verify Org B cannot assume Org A context even if requested explicitly
  const orgBCtxSpoof = await getActiveOrgContext(orgBRes.userId, orgARes.organizationId);
  assert.ok(orgBCtxSpoof);
  assert.equal(orgBCtxSpoof.organization.id, orgBRes.organizationId);

  // 2. Import Suppliers, PO, GR, and over-priced Invoice into Org A (with an invalid row & duplicate row)
  const supImport = commitCsvImportBatch({
    orgId: orgARes.organizationId,
    userId: orgARes.userId,
    importType: 'suppliers',
    filename: 'suppliers.csv',
    columnMapping: {},
    csvText: [
      'supplier_code,name,category,country,default_currency,payment_terms_days,contact_name,contact_email',
      'SUP-A1,Alpha Castings Ltd,Castings,US,USD,30,Sam Lee,sam@alphacastings.example',
      'SUP-A1,Alpha Castings Ltd,Castings,US,USD,30,Sam Lee,sam@alphacastings.example',
      ',Missing Code Supplier,Castings,US,USD,30,,',
    ].join('\n'),
  });
  assert.equal(supImport.importedCount, 1);
  assert.equal(supImport.duplicateCount, 1);
  assert.equal(supImport.errorCount, 1);

  commitCsvImportBatch({
    orgId: orgARes.organizationId,
    userId: orgARes.userId,
    importType: 'purchase_orders',
    filename: 'pos.csv',
    columnMapping: {},
    csvText: [
      'po_number,supplier_code,order_date,promised_date,line_number,part_number,description,ordered_qty,unit_price,currency',
      'PO-A-100,SUP-A1,2026-10-01,2026-10-10,1,PART-100,Pump Housing,100,20.00,USD',
    ].join('\n'),
  });

  commitCsvImportBatch({
    orgId: orgARes.organizationId,
    userId: orgARes.userId,
    importType: 'goods_receipts',
    filename: 'grs.csv',
    columnMapping: {},
    csvText: [
      'receipt_number,po_number,supplier_code,received_date,part_number,received_qty,rejected_qty,damaged_qty,inspection_notes',
      'GR-A-100,PO-A-100,SUP-A1,2026-10-12,PART-100,90,5,0,10 short and 5 porosity rejects',
    ].join('\n'),
  });

  const invImport = commitCsvImportBatch({
    orgId: orgARes.organizationId,
    userId: orgARes.userId,
    importType: 'supplier_invoices',
    filename: 'invs.csv',
    columnMapping: {},
    csvText: [
      'invoice_number,supplier_code,po_number,invoice_date,part_number,invoiced_qty,unit_price,currency',
      'INV-A-501,SUP-A1,PO-A-100,2026-10-13,PART-100,100,23.00,USD',
    ].join('\n'),
  });
  assert.ok(invImport.newLeadsDetected >= 1);

  const db = getDb();
  const leads = db
    .prepare('SELECT * FROM discrepancy_leads WHERE organization_id = ? AND status = ?')
    .all(orgARes.organizationId, 'open') as Array<{ id: string; rule_code: string }>;
  assert.ok(leads.some((l) => l.rule_code === 'RULE_PRICE_EXCEEDS_PO'));
  assert.ok(leads.some((l) => l.rule_code === 'RULE_INV_QTY_GT_GR'));

  const pvLead = leads.find((l) => l.rule_code === 'RULE_PRICE_EXCEEDS_PO')!;
  const createdCase = convertDiscrepancyLeadToCase(orgARes.organizationId, orgARes.userId, pvLead.id);
  assert.ok(createdCase.id);

  // Duplicate case creation from same lead must fail
  assert.throws(
    () => convertDiscrepancyLeadToCase(orgARes.organizationId, orgARes.userId, pvLead.id),
    /already converted/
  );

  // Tenant isolation check: Org B cannot list or inspect Org A's case
  assert.equal(listRecoveryCases(orgBRes.organizationId).length, 0);
  assert.equal(getRecoveryCaseDetail(orgBRes.organizationId, createdCase.id), null);

  // 3. Add cost item & store private evidence
  addCostItemToCase(orgARes.organizationId, orgARes.userId, createdCase.id, {
    category: 'sorting_labour',
    description: 'Incoming audit hours',
    quantity: 5,
    unitLabel: 'hour',
    unitRateCents: 4800,
  });

  const evStored = await storeEvidencePrivate({
    organizationId: orgARes.organizationId,
    fileName: '../evil/../../audit-report.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Verified price variance audit'),
  });
  assert.ok(!evStored.safeName.includes('..'));

  const evId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO recovery_evidence (id, organization_id, case_id, checklist_item_key, title, evidence_type, file_name, mime_type, file_size_bytes, storage_path, uploaded_by)
     VALUES (?, ?, ?, 'supplier_invoice', 'Audit Report', 'supplier_invoice', ?, 'text/plain', 29, ?, ?)`
  ).run(evId, orgARes.organizationId, createdCase.id, evStored.safeName, evStored.storagePath, orgARes.userId);

  const token = createSignedEvidenceToken({
    evidenceId: evId,
    organizationId: orgARes.organizationId,
    expiresInSeconds: 120,
  });
  const verified = verifySignedEvidenceToken(token);
  assert.equal(verified?.organizationId, orgARes.organizationId);

  // 4. Case lifecycle & partial settlement -> dashboard totals update
  transitionCaseStatus(orgARes.organizationId, orgARes.userId, createdCase.id, 'ready_for_review');
  transitionCaseStatus(orgARes.organizationId, orgARes.userId, createdCase.id, 'submitted');
  transitionCaseStatus(orgARes.organizationId, orgARes.userId, createdCase.id, 'approved');

  // Promised credit does NOT increment recovered amount
  recordSettlementOrTransaction(orgARes.organizationId, orgARes.userId, createdCase.id, {
    mode: 'promise_credit',
    settlementType: 'credit_memo',
    referenceNumber: 'CM-A-100',
    amountCents: 54000,
    date: '2026-11-20',
  });

  let detail = getRecoveryCaseDetail(orgARes.organizationId, createdCase.id)!;
  assert.equal(detail.recoveredAmountCents, 0);
  assert.equal(detail.outstandingBalanceCents, 54000);

  // Record partial receipt ($200.00 of $540.00)
  recordSettlementOrTransaction(orgARes.organizationId, orgARes.userId, createdCase.id, {
    mode: 'receive_payment',
    referenceNumber: 'CM-A-100-PART1',
    amountCents: 20000,
    date: '2026-11-15',
  });

  detail = getRecoveryCaseDetail(orgARes.organizationId, createdCase.id)!;
  assert.equal(detail.status, 'partially_recovered');
  assert.equal(detail.recoveredAmountCents, 20000);
  assert.equal(detail.outstandingBalanceCents, 34000);

  const dash = getOverviewDashboardData(orgARes.organizationId);
  assert.equal(dash.currencySummaries[0].actualRecoveredCents, 20000);
  assert.equal(dash.currencySummaries[0].outstandingCents, 34000);
});
