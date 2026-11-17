import crypto from 'node:crypto';
import { getDb, runInTransaction } from '@/lib/db';
import { calculateCostLineCents, calculateOutstandingBalanceCents } from '@/lib/domain/money';
import {
  getChecklistForIncident,
  validateCaseTransition,
  type CaseStatus,
  type CostCategory,
  type IncidentType,
} from '@/lib/domain/workflow';
import { createSignedEvidenceToken } from '@/lib/storage/evidence-storage';

export function listRecoveryCases(
  orgId: string,
  filters: {
    search?: string;
    status?: string;
    supplierId?: string;
    incidentType?: string;
  } = {}
) {
  const db = getDb();
  const where = ['c.organization_id = ?'];
  const params: Array<string | number> = [orgId];

  if (filters.status && filters.status !== 'all') {
    where.push('c.status = ?');
    params.push(filters.status);
  }
  if (filters.supplierId && filters.supplierId !== 'all') {
    where.push('c.supplier_id = ?');
    params.push(filters.supplierId);
  }
  if (filters.incidentType && filters.incidentType !== 'all') {
    where.push('c.incident_type = ?');
    params.push(filters.incidentType);
  }
  if (filters.search) {
    where.push('(c.case_number LIKE ? OR c.title LIKE ? OR s.name LIKE ?)');
    const like = `%${filters.search}%`;
    params.push(like, like, like);
  }

  const rows = db
    .prepare(
      `SELECT c.*, s.name AS supplier_name, s.supplier_code, p.name AS plant_name,
              po.po_number, u.full_name AS owner_name
       FROM recovery_cases c
       JOIN suppliers s ON s.id = c.supplier_id AND s.organization_id = c.organization_id
       LEFT JOIN plants_or_locations p ON p.id = c.plant_id AND p.organization_id = c.organization_id
       LEFT JOIN purchase_orders po ON po.id = c.purchase_order_id AND po.organization_id = c.organization_id
       LEFT JOIN user_profiles u ON u.id = c.owner_user_id
       WHERE ${where.join(' AND ')}
       ORDER BY c.updated_at DESC, c.case_number DESC`
    )
    .all(...params) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: String(r.id),
    caseNumber: String(r.case_number),
    supplierId: String(r.supplier_id),
    supplierName: String(r.supplier_name),
    supplierCode: String(r.supplier_code),
    plantName: r.plant_name ? String(r.plant_name) : null,
    poNumber: r.po_number ? String(r.po_number) : null,
    incidentType: String(r.incident_type) as IncidentType,
    title: String(r.title),
    status: String(r.status) as CaseStatus,
    currency: String(r.currency),
    incidentDate: String(r.incident_date),
    submissionDate: r.submission_date ? String(r.submission_date) : null,
    responseDeadline: r.response_deadline ? String(r.response_deadline) : null,
    grossLossCents: Number(r.gross_loss_cents || 0),
    potentiallyRecoverableCents: Number(r.potentially_recoverable_cents || 0),
    submittedAmountCents: Number(r.submitted_amount_cents || 0),
    approvedAmountCents: Number(r.approved_amount_cents || 0),
    expectedCreditCents: Number(r.expected_credit_cents || 0),
    recoveredAmountCents: Number(r.recovered_amount_cents || 0),
    outstandingBalanceCents: calculateOutstandingBalanceCents({
      expectedCreditCents: Number(r.expected_credit_cents || 0),
      approvedAmountCents: Number(r.approved_amount_cents || 0),
      submittedAmountCents: Number(r.submitted_amount_cents || 0),
      potentiallyRecoverableCents: Number(r.potentially_recoverable_cents || 0),
      recoveredAmountCents: Number(r.recovered_amount_cents || 0),
    }),
    ownerName: r.owner_name ? String(r.owner_name) : 'Unassigned',
  }));
}

export function getRecoveryCaseDetail(orgId: string, caseId: string) {
  const db = getDb();
  const c = db
    .prepare(
      `SELECT c.*, s.name AS supplier_name, s.supplier_code, p.name AS plant_name,
              po.po_number, gr.receipt_number, inv.invoice_number,
              u.full_name AS owner_name, o.name AS organization_name, o.is_demo
       FROM recovery_cases c
       JOIN organizations o ON o.id = c.organization_id
       JOIN suppliers s ON s.id = c.supplier_id AND s.organization_id = c.organization_id
       LEFT JOIN plants_or_locations p ON p.id = c.plant_id AND p.organization_id = c.organization_id
       LEFT JOIN purchase_orders po ON po.id = c.purchase_order_id AND po.organization_id = c.organization_id
       LEFT JOIN goods_receipts gr ON gr.id = c.goods_receipt_id AND gr.organization_id = c.organization_id
       LEFT JOIN supplier_invoices inv ON inv.id = c.supplier_invoice_id AND inv.organization_id = c.organization_id
       LEFT JOIN user_profiles u ON u.id = c.owner_user_id
       WHERE c.organization_id = ? AND c.id = ?`
    )
    .get(orgId, caseId) as Record<string, unknown> | undefined;

  if (!c) return null;

  const supplierContact = db
    .prepare(
      `SELECT name, role, email, phone FROM supplier_contacts
       WHERE organization_id = ? AND supplier_id = ?
       ORDER BY is_primary DESC LIMIT 1`
    )
    .get(orgId, String(c.supplier_id)) as
    | { name: string; role: string; email: string; phone: string | null }
    | undefined;

  const supplierTerms = db
    .prepare(
      `SELECT * FROM supplier_terms WHERE organization_id = ? AND supplier_id = ? ORDER BY created_at DESC LIMIT 1`
    )
    .get(orgId, String(c.supplier_id)) as Record<string, unknown> | undefined;

  const costItems = db
    .prepare(
      `SELECT lci.*, u.full_name AS override_by_name
       FROM loss_cost_items lci
       LEFT JOIN user_profiles u ON u.id = lci.override_by
       WHERE lci.organization_id = ? AND lci.case_id = ?
       ORDER BY lci.created_at ASC`
    )
    .all(orgId, caseId) as Array<Record<string, unknown>>;

  const evidenceRows = db
    .prepare(
      `SELECT ev.*, u.full_name AS uploaded_by_name
       FROM recovery_evidence ev
       LEFT JOIN user_profiles u ON u.id = ev.uploaded_by
       WHERE ev.organization_id = ? AND ev.case_id = ?
       ORDER BY ev.created_at DESC`
    )
    .all(orgId, caseId) as Array<Record<string, unknown>>;

  const evidence = evidenceRows.map((ev) => {
    const token = createSignedEvidenceToken({
      evidenceId: String(ev.id),
      organizationId: orgId,
      expiresInSeconds: 600,
    });
    return {
      id: String(ev.id),
      checklistItemKey: ev.checklist_item_key ? String(ev.checklist_item_key) : null,
      title: String(ev.title),
      evidenceType: String(ev.evidence_type),
      fileName: String(ev.file_name),
      mimeType: String(ev.mime_type),
      fileSizeBytes: Number(ev.file_size_bytes),
      isCompleted: Number(ev.is_completed) === 1,
      uploadedByName: ev.uploaded_by_name ? String(ev.uploaded_by_name) : 'Team member',
      notes: ev.notes ? String(ev.notes) : null,
      createdAt: String(ev.created_at),
      signedDownloadUrl: `/api/evidence/${ev.id}/download?token=${encodeURIComponent(token)}`,
    };
  });

  const checklistTemplate = getChecklistForIncident(String(c.incident_type) as IncidentType);
  const completedKeys = new Set(
    evidence.filter((e) => e.isCompleted && e.checklistItemKey).map((e) => e.checklistItemKey!)
  );
  if (costItems.length > 0) completedKeys.add('cost_worksheet');
  if (c.purchase_order_id) completedKeys.add('purchase_order');

  const checklist = checklistTemplate.map((item) => ({
    ...item,
    completed: completedKeys.has(item.key),
  }));

  const communications = db
    .prepare(
      `SELECT sc.*, u.full_name AS approved_by_name
       FROM supplier_communications sc
       LEFT JOIN user_profiles u ON u.id = sc.approved_by
       WHERE sc.organization_id = ? AND sc.case_id = ?
       ORDER BY sc.created_at DESC`
    )
    .all(orgId, caseId) as Array<Record<string, unknown>>;

  const settlements = db
    .prepare(
      `SELECT * FROM recovery_settlements
       WHERE organization_id = ? AND case_id = ?
       ORDER BY created_at DESC`
    )
    .all(orgId, caseId) as Array<Record<string, unknown>>;

  const transactions = db
    .prepare(
      `SELECT rt.*, u.full_name AS recorded_by_name
       FROM recovery_transactions rt
       LEFT JOIN user_profiles u ON u.id = rt.recorded_by
       WHERE rt.organization_id = ? AND rt.case_id = ?
       ORDER BY rt.transaction_date DESC, rt.created_at DESC`
    )
    .all(orgId, caseId) as Array<Record<string, unknown>>;

  const tasks = db
    .prepare(
      `SELECT t.*, u.full_name AS assigned_to_name
       FROM recovery_tasks t
       LEFT JOIN user_profiles u ON u.id = t.assigned_to
       WHERE t.organization_id = ? AND t.case_id = ?
       ORDER BY t.is_completed ASC, t.due_date ASC`
    )
    .all(orgId, caseId) as Array<Record<string, unknown>>;

  const timeline = db
    .prepare(
      `SELECT e.*, u.full_name AS actor_name
       FROM claim_activity_events e
       LEFT JOIN user_profiles u ON u.id = e.actor_user_id
       WHERE e.organization_id = ? AND e.case_id = ?
       ORDER BY e.created_at DESC`
    )
    .all(orgId, caseId) as Array<Record<string, unknown>>;

  const outstandingBalanceCents = calculateOutstandingBalanceCents({
    expectedCreditCents: Number(c.expected_credit_cents || 0),
    approvedAmountCents: Number(c.approved_amount_cents || 0),
    submittedAmountCents: Number(c.submitted_amount_cents || 0),
    potentiallyRecoverableCents: Number(c.potentially_recoverable_cents || 0),
    recoveredAmountCents: Number(c.recovered_amount_cents || 0),
  });

  return {
    id: String(c.id),
    organizationId: String(c.organization_id),
    organizationName: String(c.organization_name),
    isDemo: Number(c.is_demo) === 1,
    caseNumber: String(c.case_number),
    supplierId: String(c.supplier_id),
    supplierName: String(c.supplier_name),
    supplierCode: String(c.supplier_code),
    supplierContact: supplierContact ?? null,
    supplierTerms: supplierTerms
      ? {
          agreementTitle: String(supplierTerms.agreement_title),
          warrantyWindowDays: Number(supplierTerms.warranty_window_days),
          claimNoticeDays: Number(supplierTerms.claim_notice_days),
          allowsSortingChargeback: Number(supplierTerms.allows_sorting_chargeback) === 1,
          allowsFreightRecovery: Number(supplierTerms.allows_freight_recovery) === 1,
          allowsDowntimeRecovery: Number(supplierTerms.allows_downtime_recovery) === 1,
          termsSummary: String(supplierTerms.terms_summary),
        }
      : null,
    plantName: c.plant_name ? String(c.plant_name) : null,
    poNumber: c.po_number ? String(c.po_number) : null,
    receiptNumber: c.receipt_number ? String(c.receipt_number) : null,
    invoiceNumber: c.invoice_number ? String(c.invoice_number) : null,
    incidentType: String(c.incident_type) as IncidentType,
    title: String(c.title),
    description: String(c.description),
    responsibilityAssessment: String(c.responsibility_assessment),
    claimBasis: c.claim_basis ? String(c.claim_basis) : null,
    incidentDate: String(c.incident_date),
    discoveryDate: String(c.discovery_date),
    submissionDate: c.submission_date ? String(c.submission_date) : null,
    responseDeadline: c.response_deadline ? String(c.response_deadline) : null,
    status: String(c.status) as CaseStatus,
    currency: String(c.currency),
    grossLossCents: Number(c.gross_loss_cents || 0),
    potentiallyRecoverableCents: Number(c.potentially_recoverable_cents || 0),
    submittedAmountCents: Number(c.submitted_amount_cents || 0),
    approvedAmountCents: Number(c.approved_amount_cents || 0),
    expectedCreditCents: Number(c.expected_credit_cents || 0),
    recoveredAmountCents: Number(c.recovered_amount_cents || 0),
    outstandingBalanceCents,
    ownerName: c.owner_name ? String(c.owner_name) : 'Unassigned',
    internalNotes: String(c.internal_notes ?? ''),
    creditReference: c.credit_reference ? String(c.credit_reference) : null,
    recoveredDate: c.recovered_date ? String(c.recovered_date) : null,
    costItems: costItems.map((ci) => ({
      id: String(ci.id),
      category: String(ci.category) as CostCategory,
      description: String(ci.description),
      quantityNumerator: Number(ci.quantity_numerator),
      quantityDenominator: Number(ci.quantity_denominator),
      unitLabel: String(ci.unit_label),
      unitRateCents: Number(ci.unit_rate_cents),
      calculatedAmountCents: Number(ci.calculated_amount_cents),
      recoverableAmountCents: Number(ci.recoverable_amount_cents),
      isManualOverride: Number(ci.is_manual_override) === 1,
      overrideReason: ci.override_reason ? String(ci.override_reason) : null,
      overrideByName: ci.override_by_name ? String(ci.override_by_name) : null,
      overrideAt: ci.override_at ? String(ci.override_at) : null,
      formulaText: String(ci.formula_text),
      currency: String(ci.currency),
    })),
    evidence,
    checklist,
    dossierIncomplete: checklist.some((item) => item.required && !item.completed),
    communications: communications.map((cm) => ({
      id: String(cm.id),
      direction: String(cm.direction),
      recipientEmail: cm.recipient_email ? String(cm.recipient_email) : null,
      subject: String(cm.subject),
      body: String(cm.body),
      isAiDrafted: Number(cm.is_ai_drafted) === 1,
      approvedByName: cm.approved_by_name ? String(cm.approved_by_name) : null,
      approvedAt: cm.approved_at ? String(cm.approved_at) : null,
      sentAt: cm.sent_at ? String(cm.sent_at) : null,
      createdAt: String(cm.created_at),
    })),
    settlements: settlements.map((s) => ({
      id: String(s.id),
      settlementType: String(s.settlement_type),
      referenceNumber: String(s.reference_number),
      approvedAmountCents: Number(s.approved_amount_cents),
      expectedDate: s.expected_date ? String(s.expected_date) : null,
      currency: String(s.currency),
      status: String(s.status),
      notes: s.notes ? String(s.notes) : null,
      createdAt: String(s.created_at),
    })),
    transactions: transactions.map((t) => ({
      id: String(t.id),
      transactionDate: String(t.transaction_date),
      amountReceivedCents: Number(t.amount_received_cents),
      currency: String(t.currency),
      referenceNumber: String(t.reference_number),
      notes: t.notes ? String(t.notes) : null,
      recordedByName: t.recorded_by_name ? String(t.recorded_by_name) : 'Team',
    })),
    tasks: tasks.map((t) => ({
      id: String(t.id),
      title: String(t.title),
      assignedToName: t.assigned_to_name ? String(t.assigned_to_name) : 'Unassigned',
      dueDate: t.due_date ? String(t.due_date) : null,
      isCompleted: Number(t.is_completed) === 1,
    })),
    timeline: timeline.map((ev) => ({
      id: String(ev.id),
      eventType: String(ev.event_type),
      summary: String(ev.summary),
      actorName: ev.actor_name ? String(ev.actor_name) : 'System',
      createdAt: String(ev.created_at),
    })),
  };
}

export function createRecoveryCase(
  orgId: string,
  userId: string,
  input: {
    supplierId: string;
    plantId?: string | null;
    purchaseOrderId?: string | null;
    goodsReceiptId?: string | null;
    supplierInvoiceId?: string | null;
    incidentType: IncidentType;
    title: string;
    description: string;
    responsibilityAssessment?: string;
    claimBasis?: string;
    incidentDate: string;
    discoveryDate: string;
    currency: string;
    initialCost?: {
      category: CostCategory;
      description: string;
      quantity: number;
      unitLabel: string;
      unitRateCents: number;
      recoverableCents?: number;
    };
    sourceProvenance?: Record<string, unknown>;
  }
): { id: string; caseNumber: string } {
  const db = getDb();
  // Verify supplier belongs to this organization
  const sup = db
    .prepare('SELECT id FROM suppliers WHERE id = ? AND organization_id = ?')
    .get(input.supplierId, orgId) as { id: string } | undefined;
  if (!sup) {
    throw new Error('Supplier does not belong to this organization');
  }

  return runInTransaction((tx) => {
    const countRow = tx
      .prepare('SELECT COUNT(*) AS cnt FROM recovery_cases WHERE organization_id = ?')
      .get(orgId) as { cnt: number };
    const seq = Number(countRow.cnt) + 1;
    const year = new Date().getFullYear();
    const caseNumber = `SRD-${year}-${String(seq).padStart(3, '0')}`;
    const caseId = crypto.randomUUID();

    let grossLossCents = 0;
    let recoverableCents = 0;

    if (input.initialCost) {
      const qtyNum = Math.round(input.initialCost.quantity * 100);
      const calc = calculateCostLineCents(qtyNum, 100, input.initialCost.unitRateCents);
      grossLossCents = calc;
      recoverableCents = input.initialCost.recoverableCents ?? calc;
    }

    tx.prepare(
      `INSERT INTO recovery_cases (
        id, organization_id, case_number, supplier_id, plant_id,
        purchase_order_id, goods_receipt_id, supplier_invoice_id,
        incident_type, title, description, responsibility_assessment, claim_basis,
        incident_date, discovery_date, status, currency,
        gross_loss_cents, potentially_recoverable_cents,
        owner_user_id, source_provenance, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`
    ).run(
      caseId,
      orgId,
      caseNumber,
      input.supplierId,
      input.plantId ?? null,
      input.purchaseOrderId ?? null,
      input.goodsReceiptId ?? null,
      input.supplierInvoiceId ?? null,
      input.incidentType,
      input.title.trim(),
      input.description.trim(),
      input.responsibilityAssessment ?? 'Under investigation',
      input.claimBasis ?? null,
      input.incidentDate,
      input.discoveryDate,
      input.currency.toUpperCase(),
      grossLossCents,
      recoverableCents,
      userId,
      JSON.stringify(input.sourceProvenance ?? { origin: 'manual' }),
      userId
    );

    if (input.initialCost) {
      const qtyNum = Math.round(input.initialCost.quantity * 100);
      const formula = `${input.initialCost.quantity} ${input.initialCost.unitLabel} × ${(
        input.initialCost.unitRateCents / 100
      ).toFixed(2)} ${input.currency.toUpperCase()}`;
      tx.prepare(
        `INSERT INTO loss_cost_items (
          id, organization_id, case_id, category, description,
          quantity_numerator, quantity_denominator, unit_label, unit_rate_cents,
          calculated_amount_cents, recoverable_amount_cents, formula_text, currency
        ) VALUES (?, ?, ?, ?, ?, ?, 100, ?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        orgId,
        caseId,
        input.initialCost.category,
        input.initialCost.description,
        qtyNum,
        input.initialCost.unitLabel,
        input.initialCost.unitRateCents,
        grossLossCents,
        recoverableCents,
        formula,
        input.currency.toUpperCase()
      );
    }

    tx.prepare(
      `INSERT INTO claim_activity_events (id, organization_id, case_id, actor_user_id, event_type, summary)
       VALUES (?, ?, ?, ?, 'case_created', ?)`
    ).run(crypto.randomUUID(), orgId, caseId, userId, `Created recovery case ${caseNumber}: ${input.title}`);

    tx.prepare(
      `INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, details)
       VALUES (?, ?, ?, 'case.created', 'recovery_case', ?, ?)`
    ).run(crypto.randomUUID(), orgId, userId, caseId, JSON.stringify({ caseNumber }));

    // Usage counter
    const periodKey = new Date().toISOString().slice(0, 7);
    tx.prepare(
      `INSERT INTO usage_records (id, organization_id, period_key, cases_created)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(organization_id, period_key) DO UPDATE SET cases_created = cases_created + 1`
    ).run(crypto.randomUUID(), orgId, periodKey);

    return { id: caseId, caseNumber };
  });
}

export function addCostItemToCase(
  orgId: string,
  userId: string,
  caseId: string,
  input: {
    category: CostCategory;
    description: string;
    quantity: number;
    unitLabel: string;
    unitRateCents: number;
    recoverableOverrideCents?: number;
    overrideReason?: string;
  }
) {
  return runInTransaction((tx) => {
    const existing = tx
      .prepare('SELECT id, currency, status FROM recovery_cases WHERE id = ? AND organization_id = ?')
      .get(caseId, orgId) as { id: string; currency: string; status: string } | undefined;
    if (!existing) {
      throw new Error('Recovery case not found');
    }

    const qtyNum = Math.round(input.quantity * 100);
    const calculatedCents = calculateCostLineCents(qtyNum, 100, input.unitRateCents);
    const isOverride =
      input.recoverableOverrideCents !== undefined &&
      input.recoverableOverrideCents !== calculatedCents;
    if (isOverride && !input.overrideReason?.trim()) {
      throw new Error('An audit reason is required when manually overriding the recoverable amount.');
    }
    const recoverableCents = input.recoverableOverrideCents ?? calculatedCents;
    const formulaText = `${input.quantity} ${input.unitLabel} × ${(input.unitRateCents / 100).toFixed(2)} ${existing.currency}${
      isOverride ? ' (manual recoverable override)' : ''
    }`;

    const itemId = crypto.randomUUID();
    tx.prepare(
      `INSERT INTO loss_cost_items (
        id, organization_id, case_id, category, description,
        quantity_numerator, quantity_denominator, unit_label, unit_rate_cents,
        calculated_amount_cents, recoverable_amount_cents,
        is_manual_override, override_reason, override_by, override_at, formula_text, currency
      ) VALUES (?, ?, ?, ?, ?, ?, 100, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      itemId,
      orgId,
      caseId,
      input.category,
      input.description.trim(),
      qtyNum,
      input.unitLabel.trim(),
      input.unitRateCents,
      calculatedCents,
      recoverableCents,
      isOverride ? 1 : 0,
      isOverride ? input.overrideReason!.trim() : null,
      isOverride ? userId : null,
      isOverride ? new Date().toISOString() : null,
      formulaText,
      existing.currency
    );

    const totals = tx
      .prepare(
        `SELECT COALESCE(SUM(calculated_amount_cents), 0) AS gross,
                COALESCE(SUM(recoverable_amount_cents), 0) AS recov
         FROM loss_cost_items WHERE organization_id = ? AND case_id = ?`
      )
      .get(orgId, caseId) as { gross: number; recov: number };

    tx.prepare(
      `UPDATE recovery_cases
       SET gross_loss_cents = ?, potentially_recoverable_cents = ?, updated_at = datetime('now')
       WHERE id = ? AND organization_id = ?`
    ).run(Number(totals.gross), Number(totals.recov), caseId, orgId);

    tx.prepare(
      `INSERT INTO claim_activity_events (id, organization_id, case_id, actor_user_id, event_type, summary)
       VALUES (?, ?, ?, ?, 'cost_item_added', ?)`
    ).run(
      crypto.randomUUID(),
      orgId,
      caseId,
      userId,
      `Added cost line "${input.description.trim()}" (${formulaText}).`
    );

    return { itemId, grossLossCents: Number(totals.gross), potentiallyRecoverableCents: Number(totals.recov) };
  });
}

export function transitionCaseStatus(
  orgId: string,
  userId: string,
  caseId: string,
  targetStatus: CaseStatus,
  options: {
    note?: string;
    submittedAmountCents?: number;
    approvedAmountCents?: number;
    expectedCreditCents?: number;
    customTransitions?: Partial<Record<CaseStatus, CaseStatus[]>>;
  } = {}
) {
  return runInTransaction((tx) => {
    const existing = tx
      .prepare(
        `SELECT c.*, o.default_response_days
         FROM recovery_cases c
         JOIN organizations o ON o.id = c.organization_id
         WHERE c.id = ? AND c.organization_id = ?`
      )
      .get(caseId, orgId) as Record<string, unknown> | undefined;

    if (!existing) {
      throw new Error('Recovery case not found');
    }

    const currentStatus = String(existing.status) as CaseStatus;
    const check = validateCaseTransition(currentStatus, targetStatus, options.customTransitions);
    if (!check.allowed) {
      throw new Error(check.reason ?? 'Invalid status transition');
    }

    const today = new Date().toISOString().slice(0, 10);
    let submissionDate = existing.submission_date ? String(existing.submission_date) : null;
    let responseDeadline = existing.response_deadline ? String(existing.response_deadline) : null;
    let submittedAmountCents = Number(existing.submitted_amount_cents || 0);
    let approvedAmountCents = Number(existing.approved_amount_cents || 0);
    let expectedCreditCents = Number(existing.expected_credit_cents || 0);

    if (targetStatus === 'submitted') {
      submissionDate = submissionDate ?? today;
      if (!responseDeadline) {
        const d = new Date();
        d.setDate(d.getDate() + Number(existing.default_response_days || 14));
        responseDeadline = d.toISOString().slice(0, 10);
      }
      submittedAmountCents =
        options.submittedAmountCents ??
        (submittedAmountCents > 0
          ? submittedAmountCents
          : Number(existing.potentially_recoverable_cents || 0));
    }

    if (targetStatus === 'approved' || targetStatus === 'partially_approved') {
      approvedAmountCents =
        options.approvedAmountCents ??
        (approvedAmountCents > 0 ? approvedAmountCents : submittedAmountCents);
      expectedCreditCents =
        options.expectedCreditCents ??
        (expectedCreditCents > 0 ? expectedCreditCents : approvedAmountCents);
    }

    if (targetStatus === 'credit_expected') {
      expectedCreditCents =
        options.expectedCreditCents ??
        (expectedCreditCents > 0
          ? expectedCreditCents
          : approvedAmountCents || submittedAmountCents);
    }

    tx.prepare(
      `UPDATE recovery_cases
       SET status = ?, submission_date = ?, response_deadline = ?,
           submitted_amount_cents = ?, approved_amount_cents = ?, expected_credit_cents = ?,
           updated_at = datetime('now')
       WHERE id = ? AND organization_id = ?`
    ).run(
      targetStatus,
      submissionDate,
      responseDeadline,
      submittedAmountCents,
      approvedAmountCents,
      expectedCreditCents,
      caseId,
      orgId
    );

    tx.prepare(
      `INSERT INTO claim_activity_events (id, organization_id, case_id, actor_user_id, event_type, summary)
       VALUES (?, ?, ?, ?, 'status_changed', ?)`
    ).run(
      crypto.randomUUID(),
      orgId,
      caseId,
      userId,
      `Status changed from ${currentStatus} to ${targetStatus}${options.note ? ` - ${options.note}` : ''}.`
    );

    tx.prepare(
      `INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, details)
       VALUES (?, ?, ?, 'case.transition', 'recovery_case', ?, ?)`
    ).run(
      crypto.randomUUID(),
      orgId,
      userId,
      caseId,
      JSON.stringify({ from: currentStatus, to: targetStatus })
    );

    return { status: targetStatus };
  });
}

export function recordSettlementOrTransaction(
  orgId: string,
  userId: string,
  caseId: string,
  input: {
    mode: 'promise_credit' | 'receive_payment';
    settlementType?: 'credit_memo' | 'bank_refund' | 'invoice_offset' | 'replacement_goods';
    referenceNumber: string;
    amountCents: number;
    date: string;
    notes?: string;
    settlementId?: string | null;
  }
) {
  if (input.amountCents <= 0) {
    throw new Error('Settlement or received amount must be greater than zero.');
  }

  return runInTransaction((tx) => {
    const c = tx
      .prepare('SELECT * FROM recovery_cases WHERE id = ? AND organization_id = ?')
      .get(caseId, orgId) as Record<string, unknown> | undefined;

    if (!c) {
      throw new Error('Recovery case not found');
    }

    const currency = String(c.currency);

    if (input.mode === 'promise_credit') {
      const settlementId = crypto.randomUUID();
      tx.prepare(
        `INSERT INTO recovery_settlements (
          id, organization_id, case_id, settlement_type, reference_number,
          approved_amount_cents, expected_date, currency, status, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'promised', ?, ?)`
      ).run(
        settlementId,
        orgId,
        caseId,
        input.settlementType ?? 'credit_memo',
        input.referenceNumber.trim(),
        input.amountCents,
        input.date,
        currency,
        input.notes ?? null,
        userId
      );

      const currentStatus = String(c.status);
      const nextStatus =
        currentStatus === 'submitted' ||
        currentStatus === 'supplier_responded' ||
        currentStatus === 'disputed' ||
        currentStatus === 'approved' ||
        currentStatus === 'partially_approved'
          ? 'credit_expected'
          : currentStatus;

      tx.prepare(
        `UPDATE recovery_cases
         SET approved_amount_cents = CASE WHEN approved_amount_cents > 0 THEN approved_amount_cents ELSE ? END,
             expected_credit_cents = ?,
             credit_reference = ?,
             status = ?,
             updated_at = datetime('now')
         WHERE id = ? AND organization_id = ?`
      ).run(input.amountCents, input.amountCents, input.referenceNumber.trim(), nextStatus, caseId, orgId);

      tx.prepare(
        `INSERT INTO claim_activity_events (id, organization_id, case_id, actor_user_id, event_type, summary)
         VALUES (?, ?, ?, ?, 'credit_promised', ?)`
      ).run(
        crypto.randomUUID(),
        orgId,
        caseId,
        userId,
        `Recorded promised credit/settlement ref ${input.referenceNumber.trim()} (expected ${input.date}). Note: not yet counted as cash recovered.`
      );

      return { settlementId, recoveredAmountCents: Number(c.recovered_amount_cents || 0) };
    }

    // mode === 'receive_payment' - records actual received cash / applied credit memo
    const txId = crypto.randomUUID();
    tx.prepare(
      `INSERT INTO recovery_transactions (
        id, organization_id, case_id, settlement_id, transaction_date,
        amount_received_cents, currency, reference_number, notes, recorded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      txId,
      orgId,
      caseId,
      input.settlementId ?? null,
      input.date,
      input.amountCents,
      currency,
      input.referenceNumber.trim(),
      input.notes ?? null,
      userId
    );

    const sumRow = tx
      .prepare(
        `SELECT COALESCE(SUM(amount_received_cents), 0) AS total_received
         FROM recovery_transactions WHERE organization_id = ? AND case_id = ?`
      )
      .get(orgId, caseId) as { total_received: number };

    const totalReceived = Number(sumRow.total_received);
    const targetCents =
      Number(c.expected_credit_cents || 0) ||
      Number(c.approved_amount_cents || 0) ||
      Number(c.submitted_amount_cents || 0) ||
      Number(c.potentially_recoverable_cents || 0);

    const isFullyRecovered = targetCents > 0 && totalReceived >= targetCents;
    const nextStatus: CaseStatus = isFullyRecovered ? 'recovered' : 'partially_recovered';

    tx.prepare(
      `UPDATE recovery_cases
       SET recovered_amount_cents = ?,
           status = ?,
           recovered_date = CASE WHEN ? = 'recovered' THEN ? ELSE recovered_date END,
           credit_reference = COALESCE(credit_reference, ?),
           updated_at = datetime('now')
       WHERE id = ? AND organization_id = ?`
    ).run(totalReceived, nextStatus, nextStatus, input.date, input.referenceNumber.trim(), caseId, orgId);

    tx.prepare(
      `INSERT INTO claim_activity_events (id, organization_id, case_id, actor_user_id, event_type, summary)
       VALUES (?, ?, ?, ?, 'settlement_received', ?)`
    ).run(
      crypto.randomUUID(),
      orgId,
      caseId,
      userId,
      `Reconciled actual receipt of ${(input.amountCents / 100).toFixed(2)} ${currency} (Ref: ${input.referenceNumber.trim()}).`
    );

    tx.prepare(
      `INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, details)
       VALUES (?, ?, ?, 'settlement.received', 'recovery_case', ?, ?)`
    ).run(
      crypto.randomUUID(),
      orgId,
      userId,
      caseId,
      JSON.stringify({ amountReceivedCents: input.amountCents, totalReceived, reference: input.referenceNumber.trim() })
    );

    return { transactionId: txId, recoveredAmountCents: totalReceived, status: nextStatus };
  });
}
