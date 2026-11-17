import crypto from 'node:crypto';
import { getDb, runInTransaction } from '@/lib/db';
import { parseCsvText, validateMappedCsvRows, type ImportType } from '@/lib/domain/csv';
import {
  detectDuplicateInvoices,
  detectInvoiceQtyExceedsReceipt,
  detectLateDelivery,
  detectPriceVariance,
  detectQualityOrDamageLoss,
  detectShortShipment,
} from '@/lib/domain/discrepancy';
import { parseDecimalToCents } from '@/lib/domain/money';
import type { CostCategory, IncidentType } from '@/lib/domain/workflow';
import { createRecoveryCase } from './cases';

export function previewCsvImport(
  orgId: string,
  importType: ImportType,
  csvText: string,
  columnMapping: Record<string, string>
) {
  const db = getDb();
  const { headers, rows } = parseCsvText(csvText);

  const supRows = db
    .prepare('SELECT supplier_code FROM suppliers WHERE organization_id = ?')
    .all(orgId) as Array<{ supplier_code: string }>;
  const poRows = db
    .prepare('SELECT po_number FROM purchase_orders WHERE organization_id = ?')
    .all(orgId) as Array<{ po_number: string }>;

  const existingKeys = new Set<string>();
  if (importType === 'suppliers') {
    for (const s of supRows) existingKeys.add(`sup:${s.supplier_code}`);
  } else if (importType === 'purchase_orders') {
    const pol = db
      .prepare(
        `SELECT po.po_number, pol.line_number FROM purchase_order_lines pol
         JOIN purchase_orders po ON po.id = pol.purchase_order_id
         WHERE pol.organization_id = ?`
      )
      .all(orgId) as Array<{ po_number: string; line_number: number }>;
    for (const row of pol) existingKeys.add(`po:${row.po_number}:${row.line_number}`);
  } else if (importType === 'goods_receipts') {
    const grl = db
      .prepare(
        `SELECT gr.receipt_number, grl.part_number FROM goods_receipt_lines grl
         JOIN goods_receipts gr ON gr.id = grl.goods_receipt_id
         WHERE grl.organization_id = ?`
      )
      .all(orgId) as Array<{ receipt_number: string; part_number: string }>;
    for (const row of grl) existingKeys.add(`gr:${row.receipt_number}:${row.part_number}`);
  } else if (importType === 'supplier_invoices') {
    const invl = db
      .prepare(
        `SELECT s.supplier_code, inv.invoice_number, il.part_number
         FROM supplier_invoice_lines il
         JOIN supplier_invoices inv ON inv.id = il.supplier_invoice_id
         JOIN suppliers s ON s.id = inv.supplier_id
         WHERE il.organization_id = ?`
      )
      .all(orgId) as Array<{ supplier_code: string; invoice_number: string; part_number: string }>;
    for (const row of invl) {
      existingKeys.add(`inv:${row.supplier_code}:${row.invoice_number}:${row.part_number}`);
    }
  }

  const validation = validateMappedCsvRows({
    importType,
    headers,
    rows,
    columnMapping,
    existingSupplierCodes: new Set(supRows.map((s) => s.supplier_code)),
    existingPoNumbers: new Set(poRows.map((p) => p.po_number)),
    existingKeys,
  });

  return {
    headers,
    totalRows: rows.length,
    validCount: validation.filter((v) => v.status === 'valid' || v.status === 'unmatched_warning').length,
    errorCount: validation.filter((v) => v.status === 'error').length,
    duplicateCount: validation.filter((v) => v.status === 'duplicate').length,
    unmatchedCount: validation.filter((v) => v.status === 'unmatched_warning').length,
    rows: validation,
  };
}

export function commitCsvImportBatch(params: {
  orgId: string;
  userId: string;
  importType: ImportType;
  filename: string;
  csvText: string;
  columnMapping: Record<string, string>;
}) {
  const preview = previewCsvImport(
    params.orgId,
    params.importType,
    params.csvText,
    params.columnMapping
  );
  const fileHash = crypto.createHash('sha256').update(params.csvText).digest('hex');

  const batchResult = runInTransaction((tx) => {
    const batchId = crypto.randomUUID();
    tx.prepare(
      `INSERT INTO import_batches (
        id, organization_id, uploaded_by, import_type, filename, file_hash,
        status, total_rows, valid_rows, error_rows, duplicate_rows, column_mapping
      ) VALUES (?, ?, ?, ?, ?, ?, 'committed', ?, ?, ?, ?, ?)`
    ).run(
      batchId,
      params.orgId,
      params.userId,
      params.importType,
      params.filename,
      fileHash,
      preview.totalRows,
      preview.validCount,
      preview.errorCount,
      preview.duplicateCount,
      JSON.stringify(params.columnMapping)
    );

    const findSupplierByCode = tx.prepare(
      'SELECT id, default_currency FROM suppliers WHERE organization_id = ? AND supplier_code = ?'
    );
    const findPlantByCode = tx.prepare(
      'SELECT id FROM plants_or_locations WHERE organization_id = ? AND code = ?'
    );
    const findPoByNum = tx.prepare(
      'SELECT id, currency FROM purchase_orders WHERE organization_id = ? AND po_number = ?'
    );

    let importedCount = 0;

    for (const row of preview.rows) {
      if (row.status === 'error' || row.status === 'duplicate') {
        tx.prepare(
          `INSERT INTO import_rows (id, organization_id, batch_id, row_number, status, raw_payload, error_message)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          crypto.randomUUID(),
          params.orgId,
          batchId,
          row.rowNumber,
          row.status === 'error' ? 'error' : 'duplicate',
          JSON.stringify(row.raw),
          row.errorMessage ?? row.warningMessage ?? null
        );
        continue;
      }

      const m = row.mapped;
      let createdEntityId: string | null = null;

      if (params.importType === 'suppliers') {
        const supId = crypto.randomUUID();
        tx.prepare(
          `INSERT INTO suppliers (id, organization_id, supplier_code, name, category, country, default_currency, payment_terms_days)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          supId,
          params.orgId,
          m.supplier_code,
          m.name,
          m.category || 'Mechanical Components',
          m.country || 'US',
          m.default_currency.toUpperCase(),
          m.payment_terms_days ? Number.parseInt(m.payment_terms_days, 10) || 30 : 30
        );
        if (m.contact_name && m.contact_email) {
          tx.prepare(
            `INSERT INTO supplier_contacts (id, organization_id, supplier_id, name, role, email, is_primary)
             VALUES (?, ?, ?, ?, 'Primary Contact', ?, 1)`
          ).run(crypto.randomUUID(), params.orgId, supId, m.contact_name, m.contact_email);
        }
        createdEntityId = supId;
      } else {
        // Ensure supplier lookup (if unmatched, create placeholder unverified supplier only if missing? Better: mark unmatched_warning if missing so financial integrity isn't polluted, OR skip if no supplier exists)
        const sup = findSupplierByCode.get(params.orgId, m.supplier_code) as
          | { id: string; default_currency: string }
          | undefined;
        if (!sup) {
          tx.prepare(
            `INSERT INTO import_rows (id, organization_id, batch_id, row_number, status, raw_payload, error_message)
             VALUES (?, ?, ?, ?, 'unmatched_warning', ?, ?)`
          ).run(
            crypto.randomUUID(),
            params.orgId,
            batchId,
            row.rowNumber,
            JSON.stringify(row.raw),
            `Unmatched supplier_code "${m.supplier_code}". Import supplier master first.`
          );
          continue;
        }

        const plant = m.plant_code
          ? (findPlantByCode.get(params.orgId, m.plant_code) as { id: string } | undefined)
          : undefined;

        if (params.importType === 'purchase_orders') {
          let po = findPoByNum.get(params.orgId, m.po_number) as { id: string } | undefined;
          if (!po) {
            const poId = crypto.randomUUID();
            tx.prepare(
              `INSERT INTO purchase_orders (id, organization_id, supplier_id, plant_id, po_number, order_date, promised_date, currency, source_batch_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              poId,
              params.orgId,
              sup.id,
              plant?.id ?? null,
              m.po_number,
              m.order_date,
              m.promised_date || null,
              m.currency.toUpperCase(),
              batchId
            );
            po = { id: poId };
          }
          const lineId = crypto.randomUUID();
          tx.prepare(
            `INSERT INTO purchase_order_lines (id, organization_id, purchase_order_id, line_number, part_number, description, ordered_qty, unit_price_cents, currency)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            lineId,
            params.orgId,
            po.id,
            Number.parseInt(m.line_number, 10),
            m.part_number,
            m.description || m.part_number,
            Number.parseInt(m.ordered_qty, 10),
            parseDecimalToCents(m.unit_price),
            m.currency.toUpperCase()
          );
          createdEntityId = po.id;
        } else if (params.importType === 'goods_receipts') {
          const po = m.po_number
            ? (findPoByNum.get(params.orgId, m.po_number) as { id: string } | undefined)
            : undefined;
          let gr = tx
            .prepare('SELECT id FROM goods_receipts WHERE organization_id = ? AND receipt_number = ?')
            .get(params.orgId, m.receipt_number) as { id: string } | undefined;
          if (!gr) {
            const grId = crypto.randomUUID();
            tx.prepare(
              `INSERT INTO goods_receipts (id, organization_id, supplier_id, purchase_order_id, plant_id, receipt_number, received_date, source_batch_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              grId,
              params.orgId,
              sup.id,
              po?.id ?? null,
              plant?.id ?? null,
              m.receipt_number,
              m.received_date,
              batchId
            );
            gr = { id: grId };
          }
          const poLine = po
            ? (tx
                .prepare(
                  'SELECT id FROM purchase_order_lines WHERE organization_id = ? AND purchase_order_id = ? AND part_number = ? LIMIT 1'
                )
                .get(params.orgId, po.id, m.part_number) as { id: string } | undefined)
            : undefined;
          tx.prepare(
            `INSERT INTO goods_receipt_lines (id, organization_id, goods_receipt_id, po_line_id, part_number, received_qty, rejected_qty, damaged_qty, inspection_notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            crypto.randomUUID(),
            params.orgId,
            gr.id,
            poLine?.id ?? null,
            m.part_number,
            Number.parseInt(m.received_qty, 10),
            m.rejected_qty ? Number.parseInt(m.rejected_qty, 10) : 0,
            m.damaged_qty ? Number.parseInt(m.damaged_qty, 10) : 0,
            m.inspection_notes || null
          );
          createdEntityId = gr.id;
        } else if (params.importType === 'supplier_invoices') {
          const po = m.po_number
            ? (findPoByNum.get(params.orgId, m.po_number) as { id: string } | undefined)
            : undefined;
          let inv = tx
            .prepare(
              'SELECT id FROM supplier_invoices WHERE organization_id = ? AND supplier_id = ? AND invoice_number = ?'
            )
            .get(params.orgId, sup.id, m.invoice_number) as { id: string } | undefined;
          const unitCents = parseDecimalToCents(m.unit_price);
          const qty = Number.parseInt(m.invoiced_qty, 10);
          const lineTotal = unitCents * qty;
          if (!inv) {
            const invId = crypto.randomUUID();
            tx.prepare(
              `INSERT INTO supplier_invoices (id, organization_id, supplier_id, purchase_order_id, invoice_number, invoice_date, total_amount_cents, currency, source_batch_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              invId,
              params.orgId,
              sup.id,
              po?.id ?? null,
              m.invoice_number,
              m.invoice_date,
              lineTotal,
              m.currency.toUpperCase(),
              batchId
            );
            inv = { id: invId };
          } else {
            tx.prepare(
              'UPDATE supplier_invoices SET total_amount_cents = total_amount_cents + ? WHERE id = ? AND organization_id = ?'
            ).run(lineTotal, inv.id, params.orgId);
          }
          const poLine = po
            ? (tx
                .prepare(
                  'SELECT id FROM purchase_order_lines WHERE organization_id = ? AND purchase_order_id = ? AND part_number = ? LIMIT 1'
                )
                .get(params.orgId, po.id, m.part_number) as { id: string } | undefined)
            : undefined;
          tx.prepare(
            `INSERT INTO supplier_invoice_lines (id, organization_id, supplier_invoice_id, po_line_id, part_number, invoiced_qty, unit_price_cents, line_total_cents, currency)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            crypto.randomUUID(),
            params.orgId,
            inv.id,
            poLine?.id ?? null,
            m.part_number,
            qty,
            unitCents,
            lineTotal,
            m.currency.toUpperCase()
          );
          createdEntityId = inv.id;
        } else if (params.importType === 'quality_incidents') {
          const po = m.po_number
            ? (findPoByNum.get(params.orgId, m.po_number) as { id: string } | undefined)
            : undefined;
          const lossId = crypto.randomUUID();
          const estCents = parseDecimalToCents(m.estimated_loss);
          tx.prepare(
            `INSERT INTO loss_events (
              id, organization_id, supplier_id, plant_id, purchase_order_id,
              incident_type, part_number, incident_date, discovery_date,
              affected_qty, gross_loss_cents, currency, summary, source_type, source_batch_id, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'csv_import', ?, ?)`
          ).run(
            lossId,
            params.orgId,
            sup.id,
            plant?.id ?? null,
            po?.id ?? null,
            m.incident_type,
            m.part_number,
            m.incident_date,
            m.discovery_date || m.incident_date,
            Number.parseInt(m.affected_qty, 10),
            estCents,
            m.currency.toUpperCase(),
            m.summary,
            batchId,
            params.userId
          );

          tx.prepare(
            `INSERT OR IGNORE INTO discrepancy_leads (
              id, organization_id, supplier_id, rule_code, rule_name, incident_type, source_key,
              purchase_order_id, loss_event_id, expected_value_text, actual_value_text, variance_text,
              tolerance_text, estimated_amount_cents, currency, match_confidence, review_reason, suggested_action, status
            ) VALUES (?, ?, ?, 'RULE_QUALITY_INCIDENT', 'Imported quality incident / NCR', ?, ?, ?, ?, 'Conforming lot', ?, ?, 'Zero-defect expectation', ?, ?, 'exact', ?, 'Review NCR documentation and raise recovery case.', 'open')`
          ).run(
            crypto.randomUUID(),
            params.orgId,
            sup.id,
            m.incident_type,
            `loss:${lossId}`,
            po?.id ?? null,
            lossId,
            `${m.affected_qty} affected units (${m.part_number})`,
            m.summary.slice(0, 120),
            estCents,
            m.currency.toUpperCase(),
            'Imported quality incident requires human liability verification before submitting claim.'
          );
          createdEntityId = lossId;
        } else if (params.importType === 'additional_costs') {
          const po = m.po_number
            ? (findPoByNum.get(params.orgId, m.po_number) as { id: string } | undefined)
            : undefined;
          const unitRate = parseDecimalToCents(m.unit_rate);
          const qty = Number(m.quantity);
          const calcCents = Math.round(qty * unitRate);
          const lossId = crypto.randomUUID();
          tx.prepare(
            `INSERT INTO loss_events (
              id, organization_id, supplier_id, purchase_order_id,
              incident_type, incident_date, discovery_date,
              affected_qty, gross_loss_cents, currency, summary, source_type, source_batch_id, created_by
            ) VALUES (?, ?, ?, ?, 'sorting_rework', ?, ?, 1, ?, ?, ?, 'csv_import', ?, ?)`
          ).run(
            lossId,
            params.orgId,
            sup.id,
            po?.id ?? null,
            m.incident_date,
            m.incident_date,
            calcCents,
            m.currency.toUpperCase(),
            `${m.category}: ${m.description}`,
            batchId,
            params.userId
          );

          tx.prepare(
            `INSERT OR IGNORE INTO discrepancy_leads (
              id, organization_id, supplier_id, rule_code, rule_name, incident_type, source_key,
              purchase_order_id, loss_event_id, expected_value_text, actual_value_text, variance_text,
              tolerance_text, estimated_amount_cents, currency, match_confidence, review_reason, suggested_action, status
            ) VALUES (?, ?, ?, 'RULE_RECORDED_LOSS_COST', 'Documented sorting/rework/freight cost', ?, ?, ?, ?, '$0.00 incidental cost', ?, ?, 'Review required', ?, ?, 'high', 'Additional operational cost imported; verify contractual recoverability against supplier terms.', 'Attach cost log and link to recovery case.', 'open')`
          ).run(
            crypto.randomUUID(),
            params.orgId,
            sup.id,
            m.category === 'premium_freight' ? 'freight_expedite' : 'sorting_rework',
            `cost:${lossId}`,
            po?.id ?? null,
            lossId,
            `${qty} ${m.unit_label} (${m.description})`,
            `+${(calcCents / 100).toFixed(2)} ${m.currency.toUpperCase()}`,
            calcCents,
            m.currency.toUpperCase()
          );
          createdEntityId = lossId;
        }
      }

      importedCount += 1;
      tx.prepare(
        `INSERT INTO import_rows (id, organization_id, batch_id, row_number, status, raw_payload, error_message, created_entity_id)
         VALUES (?, ?, ?, ?, 'imported', ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        params.orgId,
        batchId,
        row.rowNumber,
        JSON.stringify(row.raw),
        row.warningMessage ?? null,
        createdEntityId
      );
    }

    const periodKey = new Date().toISOString().slice(0, 7);
    tx.prepare(
      `INSERT INTO usage_records (id, organization_id, period_key, import_rows_processed)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(organization_id, period_key) DO UPDATE SET import_rows_processed = import_rows_processed + excluded.import_rows_processed`
    ).run(crypto.randomUUID(), params.orgId, periodKey, importedCount);

    tx.prepare(
      `INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, details)
       VALUES (?, ?, ?, 'import.committed', 'import_batch', ?, ?)`
    ).run(
      crypto.randomUUID(),
      params.orgId,
      params.userId,
      batchId,
      JSON.stringify({ importType: params.importType, importedCount, errorCount: preview.errorCount })
    );

    return { batchId, importedCount };
  });

  const newLeadsCount = runDeterministicDiscrepancyScan(params.orgId);

  return {
    ...batchResult,
    totalRows: preview.totalRows,
    errorCount: preview.errorCount,
    duplicateCount: preview.duplicateCount,
    newLeadsDetected: newLeadsCount,
  };
}

export function runDeterministicDiscrepancyScan(orgId: string): number {
  const db = getDb();
  const org = db
    .prepare('SELECT * FROM organizations WHERE id = ?')
    .get(orgId) as Record<string, unknown> | undefined;
  if (!org) return 0;

  const priceTolPct = Number(org.price_tolerance_pct_bps ?? 200);
  const priceTolAbs = Number(org.price_tolerance_abs_cents ?? 2500);
  const qtyTolPct = Number(org.qty_tolerance_pct_bps ?? 100);
  const qtyTolAbs = Number(org.qty_tolerance_abs ?? 1);

  let inserted = 0;

  const insertLead = db.prepare(`
    INSERT OR IGNORE INTO discrepancy_leads (
      id, organization_id, supplier_id, rule_code, rule_name, incident_type, source_key,
      purchase_order_id, goods_receipt_id, supplier_invoice_id,
      expected_value_text, actual_value_text, variance_text, tolerance_text,
      estimated_amount_cents, currency, match_confidence, review_reason, suggested_action, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
  `);

  // 1. Invoice price & qty vs PO & GR
  const invLines = db
    .prepare(
      `SELECT il.*, inv.supplier_id, inv.purchase_order_id, inv.invoice_number,
              pol.unit_price_cents AS po_unit_price_cents, pol.ordered_qty AS po_ordered_qty
       FROM supplier_invoice_lines il
       JOIN supplier_invoices inv ON inv.id = il.supplier_invoice_id
       LEFT JOIN purchase_order_lines pol ON pol.id = il.po_line_id
       WHERE il.organization_id = ?`
    )
    .all(orgId) as Array<Record<string, unknown>>;

  for (const il of invLines) {
    if (il.po_unit_price_cents !== null && il.po_unit_price_cents !== undefined) {
      const pv = detectPriceVariance({
        sourceKey: `pv:${il.id}`,
        partNumber: String(il.part_number),
        poUnitPriceCents: Number(il.po_unit_price_cents),
        invoiceUnitPriceCents: Number(il.unit_price_cents),
        invoicedQty: Number(il.invoiced_qty),
        currency: String(il.currency),
        tolerancePctBps: priceTolPct,
        toleranceAbsCents: priceTolAbs,
      });
      if (pv) {
        const res = insertLead.run(
          crypto.randomUUID(),
          orgId,
          String(il.supplier_id),
          pv.ruleCode,
          pv.ruleName,
          pv.incidentType,
          pv.sourceKey,
          il.purchase_order_id ? String(il.purchase_order_id) : null,
          null,
          String(il.supplier_invoice_id),
          pv.expectedValueText,
          pv.actualValueText,
          pv.varianceText,
          pv.toleranceText,
          pv.estimatedAmountCents,
          pv.currency,
          pv.matchConfidence,
          pv.reviewReason,
          pv.suggestedAction
        );
        if (res.changes > 0) inserted += 1;
      }
    }

    if (il.purchase_order_id) {
      const grAgg = db
        .prepare(
          `SELECT COALESCE(SUM(grl.received_qty), 0) AS received_sum, MAX(gr.id) AS gr_id
           FROM goods_receipt_lines grl
           JOIN goods_receipts gr ON gr.id = grl.goods_receipt_id
           WHERE grl.organization_id = ? AND gr.purchase_order_id = ? AND grl.part_number = ?`
        )
        .get(orgId, String(il.purchase_order_id), String(il.part_number)) as
        | { received_sum: number; gr_id: string | null }
        | undefined;

      if (grAgg && grAgg.gr_id) {
        const invGtGr = detectInvoiceQtyExceedsReceipt({
          sourceKey: `invgtgr:${il.id}`,
          partNumber: String(il.part_number),
          invoicedQty: Number(il.invoiced_qty),
          receivedQty: Number(grAgg.received_sum),
          unitPriceCents: Number(il.po_unit_price_cents ?? il.unit_price_cents),
          currency: String(il.currency),
          toleranceQtyAbs: qtyTolAbs,
          toleranceQtyPctBps: qtyTolPct,
        });
        if (invGtGr) {
          const res = insertLead.run(
            crypto.randomUUID(),
            orgId,
            String(il.supplier_id),
            invGtGr.ruleCode,
            invGtGr.ruleName,
            invGtGr.incidentType,
            invGtGr.sourceKey,
            String(il.purchase_order_id),
            grAgg.gr_id,
            String(il.supplier_invoice_id),
            invGtGr.expectedValueText,
            invGtGr.actualValueText,
            invGtGr.varianceText,
            invGtGr.toleranceText,
            invGtGr.estimatedAmountCents,
            invGtGr.currency,
            invGtGr.matchConfidence,
            invGtGr.reviewReason,
            invGtGr.suggestedAction
          );
          if (res.changes > 0) inserted += 1;
        }
      }
    }
  }

  // 2. Goods receipt short shipments, rejections, damages, late deliveries
  const grLines = db
    .prepare(
      `SELECT grl.*, gr.supplier_id, gr.purchase_order_id, gr.received_date,
              po.po_number, po.promised_date, pol.ordered_qty, pol.unit_price_cents, pol.currency
       FROM goods_receipt_lines grl
       JOIN goods_receipts gr ON gr.id = grl.goods_receipt_id
       LEFT JOIN purchase_orders po ON po.id = gr.purchase_order_id
       LEFT JOIN purchase_order_lines pol ON pol.id = grl.po_line_id
       WHERE grl.organization_id = ?`
    )
    .all(orgId) as Array<Record<string, unknown>>;

  for (const grl of grLines) {
    const unitPrice = Number(grl.unit_price_cents ?? 0);
    const currency = String(grl.currency ?? 'USD');

    if (grl.ordered_qty !== null && grl.ordered_qty !== undefined) {
      const short = detectShortShipment({
        sourceKey: `short:${grl.id}`,
        partNumber: String(grl.part_number),
        orderedQty: Number(grl.ordered_qty),
        receivedQty: Number(grl.received_qty),
        unitPriceCents: unitPrice,
        currency,
        toleranceQtyAbs: qtyTolAbs,
        toleranceQtyPctBps: qtyTolPct,
      });
      if (short) {
        const res = insertLead.run(
          crypto.randomUUID(),
          orgId,
          String(grl.supplier_id),
          short.ruleCode,
          short.ruleName,
          short.incidentType,
          short.sourceKey,
          grl.purchase_order_id ? String(grl.purchase_order_id) : null,
          String(grl.goods_receipt_id),
          null,
          short.expectedValueText,
          short.actualValueText,
          short.varianceText,
          short.toleranceText,
          short.estimatedAmountCents,
          short.currency,
          short.matchConfidence,
          short.reviewReason,
          short.suggestedAction
        );
        if (res.changes > 0) inserted += 1;
      }
    }

    const qual = detectQualityOrDamageLoss({
      sourceKey: `qual:${grl.id}`,
      partNumber: String(grl.part_number),
      rejectedQty: Number(grl.rejected_qty || 0),
      damagedQty: Number(grl.damaged_qty || 0),
      unitPriceCents: unitPrice,
      currency,
    });
    if (qual) {
      const res = insertLead.run(
        crypto.randomUUID(),
        orgId,
        String(grl.supplier_id),
        qual.ruleCode,
        qual.ruleName,
        qual.incidentType,
        qual.sourceKey,
        grl.purchase_order_id ? String(grl.purchase_order_id) : null,
        String(grl.goods_receipt_id),
        null,
        qual.expectedValueText,
        qual.actualValueText,
        qual.varianceText,
        qual.toleranceText,
        qual.estimatedAmountCents,
        qual.currency,
        qual.matchConfidence,
        qual.reviewReason,
        qual.suggestedAction
      );
      if (res.changes > 0) inserted += 1;
    }

    if (grl.promised_date && grl.received_date && grl.po_number) {
      const late = detectLateDelivery({
        sourceKey: `late:${grl.goods_receipt_id}`,
        poNumber: String(grl.po_number),
        promisedDate: String(grl.promised_date),
        actualDate: String(grl.received_date),
        currency,
      });
      if (late) {
        const res = insertLead.run(
          crypto.randomUUID(),
          orgId,
          String(grl.supplier_id),
          late.ruleCode,
          late.ruleName,
          late.incidentType,
          late.sourceKey,
          grl.purchase_order_id ? String(grl.purchase_order_id) : null,
          String(grl.goods_receipt_id),
          null,
          late.expectedValueText,
          late.actualValueText,
          late.varianceText,
          late.toleranceText,
          late.estimatedAmountCents,
          late.currency,
          late.matchConfidence,
          late.reviewReason,
          late.suggestedAction
        );
        if (res.changes > 0) inserted += 1;
      }
    }
  }

  // 3. Duplicate invoice check
  const allInvoices = db
    .prepare(
      'SELECT id, supplier_id, invoice_number, invoice_date, total_amount_cents, currency FROM supplier_invoices WHERE organization_id = ?'
    )
    .all(orgId) as Array<{
    id: string;
    supplier_id: string;
    invoice_number: string;
    invoice_date: string;
    total_amount_cents: number;
    currency: string;
  }>;
  const dupLeads = detectDuplicateInvoices(
    allInvoices.map((i) => ({
      id: i.id,
      supplierId: i.supplier_id,
      invoiceNumber: i.invoice_number,
      invoiceDate: i.invoice_date,
      totalAmountCents: Number(i.total_amount_cents),
      currency: i.currency,
    }))
  );
  for (const d of dupLeads) {
    const supId = allInvoices.find((i) => d.sourceKey.includes(i.id))?.supplier_id;
    if (!supId) continue;
    const res = insertLead.run(
      crypto.randomUUID(),
      orgId,
      supId,
      d.ruleCode,
      d.ruleName,
      d.incidentType,
      d.sourceKey,
      null,
      null,
      null,
      d.expectedValueText,
      d.actualValueText,
      d.varianceText,
      d.toleranceText,
      d.estimatedAmountCents,
      d.currency,
      d.matchConfidence,
      d.reviewReason,
      d.suggestedAction
    );
    if (res.changes > 0) inserted += 1;
  }

  return inserted;
}

export function convertDiscrepancyLeadToCase(orgId: string, userId: string, leadId: string) {
  const db = getDb();
  const lead = db
    .prepare('SELECT * FROM discrepancy_leads WHERE id = ? AND organization_id = ?')
    .get(leadId, orgId) as Record<string, unknown> | undefined;

  if (!lead) {
    throw new Error('Discrepancy lead not found');
  }
  if (lead.status === 'converted' && lead.linked_case_id) {
    throw new Error(`Lead already converted to case (${lead.linked_case_id}). Duplicate claims are blocked.`);
  }

  const estCents = Number(lead.estimated_amount_cents || 0);
  const incidentType = String(lead.incident_type) as IncidentType;
  const category: CostCategory =
    incidentType === 'freight_expedite'
      ? 'premium_freight'
      : incidentType === 'sorting_rework'
        ? 'sorting_labour'
        : 'material_loss';

  const today = new Date().toISOString().slice(0, 10);
  const created = createRecoveryCase(orgId, userId, {
    supplierId: String(lead.supplier_id),
    purchaseOrderId: lead.purchase_order_id ? String(lead.purchase_order_id) : null,
    goodsReceiptId: lead.goods_receipt_id ? String(lead.goods_receipt_id) : null,
    supplierInvoiceId: lead.supplier_invoice_id ? String(lead.supplier_invoice_id) : null,
    incidentType,
    title: `${lead.rule_name} - ${lead.variance_text}`,
    description: `${lead.review_reason}\n\nExpected: ${lead.expected_value_text} | Observed: ${lead.actual_value_text}`,
    responsibilityAssessment: 'Human review initiated from discrepancy detection rule.',
    claimBasis: `Deterministic check ${lead.rule_code} (tolerance: ${lead.tolerance_text}).`,
    incidentDate: today,
    discoveryDate: today,
    currency: String(lead.currency),
    initialCost:
      estCents > 0
        ? {
            category,
            description: `${lead.rule_name} (${lead.variance_text})`,
            quantity: 1,
            unitLabel: 'event',
            unitRateCents: estCents,
          }
        : undefined,
    sourceProvenance: {
      origin: 'discrepancy_lead',
      leadId,
      ruleCode: lead.rule_code,
      sourceKey: lead.source_key,
    },
  });

  db.prepare(
    `UPDATE discrepancy_leads SET status = 'converted', linked_case_id = ? WHERE id = ? AND organization_id = ?`
  ).run(created.id, leadId, orgId);

  return created;
}
