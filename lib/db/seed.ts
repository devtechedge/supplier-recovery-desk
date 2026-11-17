import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getDb, runInTransaction } from './index';
import { resolveWritableDir } from '@/lib/storage/paths';

export const DEMO_ORG_ID = '11111111-1111-4111-8111-111111111111';
export const DEMO_OWNER_ID = '22222222-2222-4222-8222-222222222221';
export const DEMO_ANALYST_ID = '22222222-2222-4222-8222-222222222222';
export const DEMO_BUYER_ID = '22222222-2222-4222-8222-222222222223';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string | null): boolean {
  if (!storedHash) return false;
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
}

export function ensureDemoDataSeeded(forceReset = false): void {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM organizations WHERE id = ?').get(DEMO_ORG_ID) as
    | { id: string }
    | undefined;

  if (existing && !forceReset) {
    return;
  }

  runInTransaction((tx) => {
    if (forceReset && existing) {
      tx.prepare('DELETE FROM organizations WHERE id = ?').run(DEMO_ORG_ID);
    }

    // Ensure demo evidence files exist in private storage
    const evidenceDir = path.join(resolveWritableDir('evidence'), DEMO_ORG_ID);
    if (!fs.existsSync(evidenceDir)) {
      fs.mkdirSync(evidenceDir, { recursive: true });
    }
    const sampleEvFiles: Array<{ name: string; content: string }> = [
      {
        name: 'ncr-1042-hardness-report.txt',
        content:
          'NON-CONFORMANCE REPORT NCR-2026-1042\nPart: AX-9021-B Hardened Steel Flange\nSpec: 58-62 HRC | Measured: 44-47 HRC (25 units rejected)\nInspector: P. Nair, Chicago Receiving Lab\n',
      },
      {
        name: 'receiving-pod-gr88190.txt',
        content:
          'RECEIVING DOCK EXCEPTION\nReceipt: GR-88190 | Supplier: Boreal Aluminum Extrusions\nNote: Pallet 2 crushed on arrival; 18 anodized rails bent beyond straightness tolerance.\n',
      },
      {
        name: 'credit-memo-88412.txt',
        content:
          'CREDIT MEMO CM-88412\nSupplier: Cobalt Elastomers & Seals Inc.\nAmount Credited: USD 3,420.00\nApplied to AP Statement Oct 2026.\n',
      },
    ];
    for (const f of sampleEvFiles) {
      fs.writeFileSync(path.join(evidenceDir, f.name), f.content, 'utf8');
    }

    // 1. Organization
    tx.prepare(`
      INSERT INTO organizations (
        id, name, slug, is_demo, default_currency,
        price_tolerance_pct_bps, price_tolerance_abs_cents,
        qty_tolerance_pct_bps, qty_tolerance_abs,
        default_sorting_hourly_cents, default_rework_hourly_cents,
        default_downtime_hourly_cents, default_overtime_hourly_cents,
        default_response_days, ai_processing_enabled
      ) VALUES (?, ?, ?, 1, 'USD', 200, 2500, 100, 1, 4800, 6500, 28000, 7200, 14, 1)
    `).run(DEMO_ORG_ID, 'Apex Precision Components LLC (DEMO DATA)', 'apex-precision-demo');

    // 2. Demo Users (idempotent upserts)
    const demoPassHash = hashPassword('DemoRecovery2026!');
    const users = [
      [DEMO_OWNER_ID, 'demo@supplierrecoverydesk.example', 'Jordan Mercer', 'VP Finance & Procurement'],
      [DEMO_ANALYST_ID, 'qa.lead@supplierrecoverydesk.example', 'Priya Nair', 'Supplier Quality Manager'],
      [DEMO_BUYER_ID, 'buyer@supplierrecoverydesk.example', 'Marcus Vance', 'Senior Buyer'],
    ];
    for (const [id, email, fullName, jobTitle] of users) {
      tx.prepare(`
        INSERT INTO user_profiles (id, email, full_name, password_hash, job_title)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET full_name = excluded.full_name, job_title = excluded.job_title
      `).run(id, email, fullName, demoPassHash, jobTitle);
    }

    const memberships = [
      ['33333333-3333-4333-8333-333333333301', DEMO_OWNER_ID, 'owner'],
      ['33333333-3333-4333-8333-333333333302', DEMO_ANALYST_ID, 'analyst'],
      ['33333333-3333-4333-8333-333333333303', DEMO_BUYER_ID, 'contributor'],
    ];
    for (const [id, userId, role] of memberships) {
      tx.prepare(`
        INSERT INTO organization_memberships (id, organization_id, user_id, role, status)
        VALUES (?, ?, ?, ?, 'active')
      `).run(id, DEMO_ORG_ID, userId, role);
    }

    // 3. Subscription (Growth Dev Mode)
    tx.prepare(`
      INSERT INTO subscriptions (id, organization_id, plan_tier, status)
      VALUES ('44444444-4444-4444-8444-444444444401', ?, 'growth', 'development_mode')
    `).run(DEMO_ORG_ID);

    tx.prepare(`
      INSERT INTO usage_records (id, organization_id, period_key, cases_created, import_rows_processed, ai_requests)
      VALUES ('44444444-4444-4444-8444-444444444402', ?, '2026-11', 8, 28, 3)
    `).run(DEMO_ORG_ID);

    // 4. Plants
    const pltChi = '55555555-5555-4555-8555-555555555501';
    const pltOh = '55555555-5555-4555-8555-555555555502';
    tx.prepare(`INSERT INTO plants_or_locations (id, organization_id, code, name, city, country) VALUES (?, ?, 'PLT-CHI', 'Chicago Machining Plant', 'Chicago, IL', 'US')`).run(pltChi, DEMO_ORG_ID);
    tx.prepare(`INSERT INTO plants_or_locations (id, organization_id, code, name, city, country) VALUES (?, ?, 'PLT-CLE', 'Cleveland Assembly Hub', 'Cleveland, OH', 'US')`).run(pltOh, DEMO_ORG_ID);

    // 5. Suppliers, Contacts, Terms
    const supVanguard = '66666666-6666-4666-8666-666666666601';
    const supKessler = '66666666-6666-4666-8666-666666666602';
    const supMidwest = '66666666-6666-4666-8666-666666666603';
    const supCobalt = '66666666-6666-4666-8666-666666666604';
    const supBoreal = '66666666-6666-4666-8666-666666666605';

    const supplierRows = [
      [supVanguard, 'SUP-1042', 'Vanguard Forging & Stampings', 'Stamped & Forged Metal', 'US', 'USD', 45, 'US-TIN-441092'],
      [supKessler, 'SUP-1088', 'Kessler Precision Hydraulics GmbH', 'Hydraulic Valves & Manifolds', 'DE', 'EUR', 30, 'DE-VAT-291044'],
      [supMidwest, 'SUP-1105', 'Midwest Fastener & Screw Corp', 'Industrial Fasteners', 'US', 'USD', 30, 'US-TIN-881204'],
      [supCobalt, 'SUP-1130', 'Cobalt Elastomers & Seals Inc.', 'Seals & Elastomers', 'US', 'USD', 60, 'US-TIN-672109'],
      [supBoreal, 'SUP-1194', 'Boreal Aluminum Extrusions', 'Extruded Profiles', 'CA', 'USD', 30, 'CA-BN-551920'],
    ];
    for (const [id, code, name, cat, country, curr, terms, tax] of supplierRows) {
      tx.prepare(`
        INSERT INTO suppliers (id, organization_id, supplier_code, name, category, country, default_currency, payment_terms_days, tax_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, DEMO_ORG_ID, code, name, cat, country, curr, terms, tax);
    }

    const contacts = [
      ['66666666-6666-4666-8666-777777777701', supVanguard, 'Elena Vance', 'Quality & Warranty Lead', 'claims@vanguardforging.example', '+1-312-555-0142', 1],
      ['66666666-6666-4666-8666-777777777702', supKessler, 'Lukas Weber', 'Export Accounts Manager', 'quality@kessler-hydraulics.example', '+49-711-555-0190', 1],
      ['66666666-6666-4666-8666-777777777703', supMidwest, 'Diane Kowalski', 'AR & Credit Supervisor', 'credits@midwestfastener.example', '+1-216-555-0188', 1],
      ['66666666-6666-4666-8666-777777777704', supCobalt, 'Arthur Patel', 'Customer Claims Coordinator', 'ar@cobaltelastomers.example', '+1-614-555-0117', 1],
      ['66666666-6666-4666-8666-777777777705', supBoreal, 'Claire Tremblay', 'Inside Sales Lead', 'claims@borealaluminum.example', '+1-514-555-0165', 1],
    ];
    for (const [id, supId, name, role, email, phone, isPrimary] of contacts) {
      tx.prepare(`
        INSERT INTO supplier_contacts (id, organization_id, supplier_id, name, role, email, phone, is_primary)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, DEMO_ORG_ID, supId, name, role, email, phone, isPrimary);
    }

    tx.prepare(`
      INSERT INTO supplier_terms (id, organization_id, supplier_id, agreement_title, warranty_window_days, claim_notice_days, allows_sorting_chargeback, allows_freight_recovery, allows_downtime_recovery, terms_summary, effective_from)
      VALUES
      ('66666666-6666-4666-8666-888888888801', ?, ?, '2026 Master Supply Agreement §9.3', 180, 15, 1, 1, 0, 'Covers direct replacement cost, containment sorting labour at documented shop rate, and inbound/outbound expedite freight for non-conforming lots. Consequential downtime excluded.', '2026-01-01'),
      ('66666666-6666-4666-8666-888888888802', ?, ?, 'EU Precision Valve Supply Addendum §7.1', 120, 21, 1, 1, 0, 'Warranty replacement or credit note within 21 days of confirmed NCR; air freight covered only with prior written RMA.', '2026-01-01')
    `).run(DEMO_ORG_ID, supVanguard, DEMO_ORG_ID, supKessler);

    // 6. Purchase Orders, Goods Receipts, Invoices (creating real traceable source records)
    const po1 = '77777777-7777-4777-8777-777777777701';
    const po2 = '77777777-7777-4777-8777-777777777702';
    const po3 = '77777777-7777-4777-8777-777777777703';
    const po4 = '77777777-7777-4777-8777-777777777704';
    const po5 = '77777777-7777-4777-8777-777777777705';

    tx.prepare(`INSERT INTO purchase_orders (id, organization_id, supplier_id, plant_id, po_number, order_date, promised_date, currency) VALUES (?, ?, ?, ?, 'PO-2026-4410', '2026-09-20', '2026-10-05', 'USD')`).run(po1, DEMO_ORG_ID, supVanguard, pltChi);
    tx.prepare(`INSERT INTO purchase_orders (id, organization_id, supplier_id, plant_id, po_number, order_date, promised_date, currency) VALUES (?, ?, ?, ?, 'PO-2026-4419', '2026-09-28', '2026-10-14', 'EUR')`).run(po2, DEMO_ORG_ID, supKessler, pltChi);
    tx.prepare(`INSERT INTO purchase_orders (id, organization_id, supplier_id, plant_id, po_number, order_date, promised_date, currency) VALUES (?, ?, ?, ?, 'PO-2026-4435', '2026-10-02', '2026-10-12', 'USD')`).run(po3, DEMO_ORG_ID, supMidwest, pltOh);
    tx.prepare(`INSERT INTO purchase_orders (id, organization_id, supplier_id, plant_id, po_number, order_date, promised_date, currency) VALUES (?, ?, ?, ?, 'PO-2026-4390', '2026-08-19', '2026-09-02', 'USD')`).run(po4, DEMO_ORG_ID, supCobalt, pltOh);
    tx.prepare(`INSERT INTO purchase_orders (id, organization_id, supplier_id, plant_id, po_number, order_date, promised_date, currency) VALUES (?, ?, ?, ?, 'PO-2026-4452', '2026-10-08', '2026-10-20', 'USD')`).run(po5, DEMO_ORG_ID, supBoreal, pltChi);

    const pol1 = '77777777-7777-4777-8777-888888888801';
    const pol2 = '77777777-7777-4777-8777-888888888802';
    const pol3 = '77777777-7777-4777-8777-888888888803';
    const pol4 = '77777777-7777-4777-8777-888888888804';
    const pol5 = '77777777-7777-4777-8777-888888888805';

    tx.prepare(`INSERT INTO purchase_order_lines (id, organization_id, purchase_order_id, line_number, part_number, description, ordered_qty, unit_price_cents, currency) VALUES (?, ?, ?, 1, 'AX-9021-B', 'Hardened Steel Flange 42mm', 500, 1850, 'USD')`).run(pol1, DEMO_ORG_ID, po1);
    tx.prepare(`INSERT INTO purchase_order_lines (id, organization_id, purchase_order_id, line_number, part_number, description, ordered_qty, unit_price_cents, currency) VALUES (?, ?, ?, 1, 'HY-310-K', 'Proportional Control Valve 210bar', 80, 31000, 'EUR')`).run(pol2, DEMO_ORG_ID, po2);
    tx.prepare(`INSERT INTO purchase_order_lines (id, organization_id, purchase_order_id, line_number, part_number, description, ordered_qty, unit_price_cents, currency) VALUES (?, ?, ?, 1, 'MF-8812-H', 'M12 Structural Hex Bolt Grade 10.9', 1200, 1850, 'USD')`).run(pol3, DEMO_ORG_ID, po3);
    tx.prepare(`INSERT INTO purchase_order_lines (id, organization_id, purchase_order_id, line_number, part_number, description, ordered_qty, unit_price_cents, currency) VALUES (?, ?, ?, 1, 'CE-400-V', 'Viton High-Temp O-Ring Kit', 400, 2850, 'USD')`).run(pol4, DEMO_ORG_ID, po4);
    tx.prepare(`INSERT INTO purchase_order_lines (id, organization_id, purchase_order_id, line_number, part_number, description, ordered_qty, unit_price_cents, currency) VALUES (?, ?, ?, 1, 'BA-6061-R', '6061-T6 Anodized Guide Rail 2.4m', 120, 26000, 'USD')`).run(pol5, DEMO_ORG_ID, po5);

    const gr1 = '88888888-8888-4888-8888-888888888801';
    const gr2 = '88888888-8888-4888-8888-888888888802';
    const gr4 = '88888888-8888-4888-8888-888888888804';
    const gr5 = '88888888-8888-4888-8888-888888888805';
    tx.prepare(`INSERT INTO goods_receipts (id, organization_id, supplier_id, purchase_order_id, plant_id, receipt_number, received_date) VALUES (?, ?, ?, ?, ?, 'GR-88201', '2026-10-08')`).run(gr1, DEMO_ORG_ID, supVanguard, po1, pltChi);
    tx.prepare(`INSERT INTO goods_receipts (id, organization_id, supplier_id, purchase_order_id, plant_id, receipt_number, received_date) VALUES (?, ?, ?, ?, ?, 'GR-88214', '2026-10-16')`).run(gr2, DEMO_ORG_ID, supKessler, po2, pltChi);
    tx.prepare(`INSERT INTO goods_receipts (id, organization_id, supplier_id, purchase_order_id, plant_id, receipt_number, received_date) VALUES (?, ?, ?, ?, ?, 'GR-87904', '2026-09-04')`).run(gr4, DEMO_ORG_ID, supCobalt, po4, pltOh);
    tx.prepare(`INSERT INTO goods_receipts (id, organization_id, supplier_id, purchase_order_id, plant_id, receipt_number, received_date) VALUES (?, ?, ?, ?, ?, 'GR-88190', '2026-10-21')`).run(gr5, DEMO_ORG_ID, supBoreal, po5, pltChi);

    tx.prepare(`INSERT INTO goods_receipt_lines (id, organization_id, goods_receipt_id, po_line_id, part_number, received_qty, rejected_qty, damaged_qty, inspection_notes) VALUES ('88888888-8888-4888-8888-999999999901', ?, ?, ?, 'AX-9021-B', 440, 260, 0, 'Heat treat hardness out of spec on lot 1042-C')`).run(DEMO_ORG_ID, gr1, pol1);
    tx.prepare(`INSERT INTO goods_receipt_lines (id, organization_id, goods_receipt_id, po_line_id, part_number, received_qty, rejected_qty, damaged_qty, inspection_notes) VALUES ('88888888-8888-4888-8888-999999999902', ?, ?, ?, 'HY-310-K', 80, 6, 0, '6 valves failed 210 bar pressure test')`).run(DEMO_ORG_ID, gr2, pol2);
    tx.prepare(`INSERT INTO goods_receipt_lines (id, organization_id, goods_receipt_id, po_line_id, part_number, received_qty, rejected_qty, damaged_qty, inspection_notes) VALUES ('88888888-8888-4888-8888-999999999904', ?, ?, ?, 'CE-400-V', 280, 0, 0, '120 kits short on carton 4')`).run(DEMO_ORG_ID, gr4, pol4);
    tx.prepare(`INSERT INTO goods_receipt_lines (id, organization_id, goods_receipt_id, po_line_id, part_number, received_qty, rejected_qty, damaged_qty, inspection_notes) VALUES ('88888888-8888-4888-8888-999999999905', ?, ?, ?, 'BA-6061-R', 120, 0, 18, '18 anodized rails bent in unsecured bundle')`).run(DEMO_ORG_ID, gr5, pol5);

    const inv1 = '99999999-9999-4999-8999-999999999901';
    const inv3 = '99999999-9999-4999-8999-999999999903';
    tx.prepare(`INSERT INTO supplier_invoices (id, organization_id, supplier_id, purchase_order_id, invoice_number, invoice_date, total_amount_cents, currency) VALUES (?, ?, ?, ?, 'INV-VF-9031', '2026-10-09', 925000, 'USD')`).run(inv1, DEMO_ORG_ID, supVanguard, po1);
    tx.prepare(`INSERT INTO supplier_invoices (id, organization_id, supplier_id, purchase_order_id, invoice_number, invoice_date, total_amount_cents, currency) VALUES (?, ?, ?, ?, 'INV-MW-7714', '2026-10-14', 2550000, 'USD')`).run(inv3, DEMO_ORG_ID, supMidwest, po3);

    tx.prepare(`INSERT INTO supplier_invoice_lines (id, organization_id, supplier_invoice_id, po_line_id, part_number, invoiced_qty, unit_price_cents, line_total_cents, currency) VALUES ('99999999-9999-4999-8999-aaaaaaaaaa01', ?, ?, ?, 'AX-9021-B', 500, 1850, 925000, 'USD')`).run(DEMO_ORG_ID, inv1, pol1);
    tx.prepare(`INSERT INTO supplier_invoice_lines (id, organization_id, supplier_invoice_id, po_line_id, part_number, invoiced_qty, unit_price_cents, line_total_cents, currency) VALUES ('99999999-9999-4999-8999-aaaaaaaaaa03', ?, ?, ?, 'MF-8812-H', 1200, 2125, 2550000, 'USD')`).run(DEMO_ORG_ID, inv3, pol3);

    // 7. Recovery Cases across the full lifecycle
    const cases = [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01',
        num: 'SRD-2026-001',
        sup: supCobalt,
        plant: pltOh,
        po: po4,
        gr: gr4,
        inv: null,
        type: 'short_shipment',
        title: 'Short shipment of 120 Viton High-Temp O-Ring Kits (PO-2026-4390)',
        desc: 'Receiving count on GR-87904 recorded 280 kits against 400 ordered and billed. Packing slip confirmed 2 sealed cartons omitted.',
        resp: 'Confirmed supplier warehouse picking omission.',
        basis: 'PO-2026-4390 quantity verification & signed receiving tally GR-87904.',
        incDate: '2026-09-04',
        discDate: '2026-09-05',
        subDate: '2026-09-08',
        deadline: '2026-09-22',
        status: 'recovered',
        curr: 'USD',
        gross: 342000,
        pot: 342000,
        sub: 342000,
        app: 342000,
        exp: 342000,
        rec: 342000,
        creditRef: 'CM-88412',
        recDate: '2026-09-29',
        costs: [
          ['material_loss', '120 missing Viton O-Ring Kits (CE-400-V)', 120, 1, 'kit', 2850, 342000, 342000, '120 kits × $28.50/kit'],
        ],
      },
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02',
        num: 'SRD-2026-002',
        sup: supVanguard,
        plant: pltChi,
        po: po1,
        gr: gr1,
        inv: inv1,
        type: 'quality_rejection',
        title: 'Heat-treat hardness failure & containment sorting on AX-9021-B flanges',
        desc: '260 of 440 received flanges measured 44-47 HRC (spec 58-62 HRC). Required 100% containment sorting, weekend overtime, and production line changeover.',
        resp: 'Supplier heat-treat furnace batch #1042-C out of specification; production downtime excluded per MSA §9.3.',
        basis: '2026 Master Supply Agreement §9.3 (direct scrap + sorting labour recoverable; consequential downtime excluded).',
        incDate: '2026-10-08',
        discDate: '2026-10-09',
        subDate: '2026-10-12',
        deadline: '2026-10-26',
        status: 'partially_recovered',
        curr: 'USD',
        gross: 894000,
        pot: 786000,
        sub: 786000,
        app: 720000,
        exp: 720000,
        rec: 450000,
        creditRef: 'CM-VF-2026-19',
        recDate: null,
        costs: [
          ['material_loss', '260 rejected hardened steel flanges (AX-9021-B)', 260, 1, 'unit', 1850, 481000, 481000, '260 units × $18.50/unit'],
          ['sorting_labour', 'QA technician containment bench hardness check', 40, 1, 'hour', 4800, 192000, 192000, '40 hrs × $48.00/hr'],
          ['overtime', 'Weekend sorting shift differential (15 hrs)', 15, 1, 'hour', 7200, 108000, 108000, '15 hrs × $72.00/hr'],
          ['external_inspection', 'Independent metallurgical lab verification', 1, 1, 'report', 5000, 5000, 5000, '1 report × $50.00'],
          ['production_downtime', 'CNC cell #4 changeover loss (excluded under MSA §9.3)', 3857, 1000, 'hour', 28000, 108000, 0, '3.857 hrs × $280.00/hr (non-recoverable under MSA)'],
        ],
      },
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03',
        num: 'SRD-2026-003',
        sup: supMidwest,
        plant: pltOh,
        po: po3,
        gr: null,
        inv: inv3,
        type: 'price_variance',
        title: 'Unapproved unit price increase on M12 Hex Bolts (INV-MW-7714)',
        desc: 'Supplier billed $21.25/unit across 1,200 units instead of contracted PO-2026-4435 price of $18.50/unit.',
        resp: 'Supplier acknowledged clerical price-tier error in AR system.',
        basis: 'PO-2026-4435 line 1 fixed unit pricing.',
        incDate: '2026-10-14',
        discDate: '2026-10-15',
        subDate: '2026-10-18',
        deadline: '2026-11-01',
        status: 'credit_expected',
        curr: 'USD',
        gross: 330000,
        pot: 330000,
        sub: 330000,
        app: 330000,
        exp: 330000,
        rec: 0,
        creditRef: 'CM-MW-409 (pending AP offset)',
        recDate: null,
        costs: [
          ['material_loss', 'Unit price overcharge ($21.25 billed vs $18.50 PO)', 1200, 1, 'unit', 275, 330000, 330000, '1,200 units × $2.75 variance'],
        ],
      },
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04',
        num: 'SRD-2026-004',
        sup: supKessler,
        plant: pltChi,
        po: po2,
        gr: gr2,
        inv: null,
        type: 'quality_rejection',
        title: '6 proportional hydraulic valves failed 210-bar bench test + air expedite',
        desc: 'Bench testing at Chicago incoming QA revealed internal spool leakage on 6 HY-310-K valves. Air replacement shipment required to hold assembly schedule.',
        resp: 'Supplier accepts valve replacement (€1,860) but disputes €620 DHL air freight citing missing prior RMA.',
        basis: 'EU Precision Valve Supply Addendum §7.1.',
        incDate: '2026-10-16',
        discDate: '2026-10-17',
        subDate: '2026-10-20',
        deadline: '2026-11-10',
        status: 'disputed',
        curr: 'EUR',
        gross: 248000,
        pot: 248000,
        sub: 248000,
        app: 186000,
        exp: 186000,
        rec: 0,
        creditRef: null,
        recDate: null,
        costs: [
          ['material_loss', '6 non-conforming HY-310-K proportional valves', 6, 1, 'unit', 31000, 186000, 186000, '6 units × €310.00'],
          ['premium_freight', 'DHL Express Munich-to-Chicago replacement air freight', 1, 1, 'shipment', 62000, 62000, 62000, '1 shipment × €620.00'],
        ],
      },
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa05',
        num: 'SRD-2026-005',
        sup: supBoreal,
        plant: pltChi,
        po: po5,
        gr: gr5,
        inv: null,
        type: 'damaged_goods',
        title: 'Crushed & bent anodized aluminum guide rails on arrival (GR-88190)',
        desc: '18 anodized 2.4m rails arrived with dented edges and twist exceeding 1.5mm/m due to missing timber dunnage in supplier bundle.',
        resp: 'Awaiting supplier packaging engineering response.',
        basis: 'Receiving dock exception GR-88190 & packaging spec PS-19.',
        incDate: '2026-10-21',
        discDate: '2026-10-21',
        subDate: '2026-10-24',
        deadline: '2026-11-07',
        status: 'submitted',
        curr: 'USD',
        gross: 518000,
        pot: 518000,
        sub: 518000,
        app: 0,
        exp: 0,
        rec: 0,
        creditRef: null,
        recDate: null,
        costs: [
          ['material_loss', '18 damaged 6061-T6 guide rails (BA-6061-R)', 18, 1, 'unit', 26000, 468000, 468000, '18 units × $260.00'],
          ['third_party_sorting', 'Straightness verification & repacking handling', 1, 1, 'service', 50000, 50000, 50000, '1 service × $500.00'],
        ],
      },
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa06',
        num: 'SRD-2026-006',
        sup: supVanguard,
        plant: pltChi,
        po: po1,
        gr: gr1,
        inv: inv1,
        type: 'overbilling',
        title: 'Billed 500 flanges on INV-VF-9031 while only 440 received on GR-88201',
        desc: 'Invoice billed full PO quantity of 500 units while receiving tallied 440 units. Supplier confirmed remaining 60 units were never shipped.',
        resp: 'Supplier AR confirmed short billing adjustment approved.',
        basis: '3-way match variance between PO-2026-4410, GR-88201, and INV-VF-9031.',
        incDate: '2026-10-09',
        discDate: '2026-10-11',
        subDate: '2026-10-14',
        deadline: '2026-10-28',
        status: 'approved',
        curr: 'USD',
        gross: 111000,
        pot: 111000,
        sub: 111000,
        app: 111000,
        exp: 111000,
        rec: 0,
        creditRef: null,
        recDate: null,
        costs: [
          ['material_loss', '60 unshipped units billed on INV-VF-9031', 60, 1, 'unit', 1850, 111000, 111000, '60 units × $18.50'],
        ],
      },
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa07',
        num: 'SRD-2026-007',
        sup: supMidwest,
        plant: pltOh,
        po: po3,
        gr: null,
        inv: null,
        type: 'sorting_rework',
        title: 'Mixed-lot thread gauge sorting labour on Cleveland assembly line',
        desc: 'Operators found burred M12 threads across 3 totes requiring 18 hours sorting and 8 hours thread-chasing rework.',
        resp: 'Awaiting signed floor supervisor NCR sign-off before submitting to Midwest Fastener.',
        basis: 'Cleveland QA floor containment log.',
        incDate: '2026-11-04',
        discDate: '2026-11-05',
        subDate: null,
        deadline: '2026-11-24',
        status: 'needs_evidence',
        curr: 'USD',
        gross: 138400,
        pot: 138400,
        sub: 0,
        app: 0,
        exp: 0,
        rec: 0,
        creditRef: null,
        recDate: null,
        costs: [
          ['sorting_labour', 'Floor containment sorting across 3 fastener totes', 18, 1, 'hour', 4800, 86400, 86400, '18 hrs × $48.00/hr'],
          ['rework_labour', 'Thread-chasing rework on salvageable batch', 8, 1, 'hour', 6500, 52000, 52000, '8 hrs × $65.00/hr'],
        ],
      },
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa08',
        num: 'SRD-2026-008',
        sup: supKessler,
        plant: pltChi,
        po: po2,
        gr: gr2,
        inv: null,
        type: 'freight_expedite',
        title: 'Emergency air freight for delayed valve sub-assembly replenishment',
        desc: 'Draft claim evaluating expedite air-freight charge incurred after 9-day delay past promised PO date.',
        resp: 'Reviewing prior email authorization with buyer.',
        basis: 'PO-2026-4419 promised date 2026-10-14 vs actual 2026-10-23.',
        incDate: '2026-11-08',
        discDate: '2026-11-09',
        subDate: null,
        deadline: '2026-11-28',
        status: 'draft',
        curr: 'EUR',
        gross: 64000,
        pot: 64000,
        sub: 0,
        app: 0,
        exp: 0,
        rec: 0,
        creditRef: null,
        recDate: null,
        costs: [
          ['premium_freight', 'Priority air freight invoice #DHL-884120', 1, 1, 'shipment', 64000, 64000, 64000, '1 shipment × €640.00'],
        ],
      },
    ];

    const insertCase = tx.prepare(`
      INSERT INTO recovery_cases (
        id, organization_id, case_number, supplier_id, plant_id, purchase_order_id, goods_receipt_id, supplier_invoice_id,
        incident_type, title, description, responsibility_assessment, claim_basis,
        incident_date, discovery_date, submission_date, response_deadline,
        status, currency, gross_loss_cents, potentially_recoverable_cents,
        submitted_amount_cents, approved_amount_cents, expected_credit_cents, recovered_amount_cents,
        owner_user_id, credit_reference, recovered_date, source_provenance, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertCost = tx.prepare(`
      INSERT INTO loss_cost_items (
        id, organization_id, case_id, category, description,
        quantity_numerator, quantity_denominator, unit_label, unit_rate_cents,
        calculated_amount_cents, recoverable_amount_cents, formula_text, currency
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const c of cases) {
      insertCase.run(
        c.id,
        DEMO_ORG_ID,
        c.num,
        c.sup,
        c.plant,
        c.po,
        c.gr,
        c.inv,
        c.type,
        c.title,
        c.desc,
        c.resp,
        c.basis,
        c.incDate,
        c.discDate,
        c.subDate,
        c.deadline,
        c.status,
        c.curr,
        c.gross,
        c.pot,
        c.sub,
        c.app,
        c.exp,
        c.rec,
        DEMO_OWNER_ID,
        c.creditRef,
        c.recDate,
        JSON.stringify({ origin: 'demo_seed', verified: true }),
        DEMO_OWNER_ID
      );

      c.costs.forEach((cost, idx) => {
        const [cat, desc, num, denom, unit, rate, calc, recov, formula] = cost as [
          string,
          string,
          number,
          number,
          string,
          number,
          number,
          number,
          string,
        ];
        insertCost.run(
          crypto.randomUUID(),
          DEMO_ORG_ID,
          c.id,
          cat,
          desc,
          num,
          denom,
          unit,
          rate,
          calc,
          recov,
          formula,
          c.curr
        );
      });
    }

    // 8. Settlements & Transactions for SRD-2026-001, 002, 003
    tx.prepare(`
      INSERT INTO recovery_settlements (id, organization_id, case_id, settlement_type, reference_number, approved_amount_cents, expected_date, currency, status, notes, created_by)
      VALUES
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', ?, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', 'credit_memo', 'CM-88412', 342000, '2026-09-29', 'USD', 'settled', 'Full credit applied to October statement.', ?),
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', ?, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02', 'credit_memo', 'CM-VF-2026-19', 720000, '2026-11-25', 'USD', 'partially_settled', 'Agreed $7,200 across two AP credit installments ($4,500 received, $2,700 scheduled).', ?),
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb03', ?, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03', 'credit_memo', 'CM-MW-409', 330000, '2026-11-22', 'USD', 'promised', 'Supplier confirmed credit memo issuance for Nov 22 AP run.', ?)
    `).run(DEMO_ORG_ID, DEMO_OWNER_ID, DEMO_ORG_ID, DEMO_OWNER_ID, DEMO_ORG_ID, DEMO_OWNER_ID);

    tx.prepare(`
      INSERT INTO recovery_transactions (id, organization_id, case_id, settlement_id, transaction_date, amount_received_cents, currency, reference_number, notes, recorded_by)
      VALUES
      ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', ?, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', '2026-09-29', 342000, 'USD', 'AP-OFFSET-88412', 'Cleared against invoice CE-88109.', ?),
      ('cccccccc-cccc-4ccc-8ccc-cccccccccccd', ?, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', '2026-10-30', 450000, 'USD', 'CM-VF-2026-19-A', 'Installment 1 of 2 credit memo received ($4,500.00 of $7,200.00 approved).', ?)
    `).run(DEMO_ORG_ID, DEMO_OWNER_ID, DEMO_ORG_ID, DEMO_OWNER_ID);

    // 9. Evidence attachments
    tx.prepare(`
      INSERT INTO recovery_evidence (id, organization_id, case_id, checklist_item_key, title, evidence_type, file_name, mime_type, file_size_bytes, storage_path, is_completed, uploaded_by, notes)
      VALUES
      ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', ?, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02', 'inspection_report', 'Metallurgical Hardness NCR-2026-1042', 'inspection_report', 'ncr-1042-hardness-report.txt', 'text/plain', 184, ?, 1, ?, 'Verified Rockwell C readings across 260 rejected flanges.'),
      ('dddddddd-dddd-4ddd-8ddd-dddddddddd02', ?, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa05', 'goods_receipt', 'Receiving Dock Exception GR-88190', 'goods_receipt', 'receiving-pod-gr88190.txt', 'text/plain', 175, ?, 1, ?, 'Signed by dock receiver on arrival.'),
      ('dddddddd-dddd-4ddd-8ddd-dddddddddd03', ?, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', 'cost_worksheet', 'Applied Credit Memo CM-88412', 'credit_memo', 'credit-memo-88412.txt', 'text/plain', 132, ?, 1, ?, 'Final AP reconciliation attachment.')
    `).run(
      DEMO_ORG_ID,
      `${DEMO_ORG_ID}/ncr-1042-hardness-report.txt`,
      DEMO_ANALYST_ID,
      DEMO_ORG_ID,
      `${DEMO_ORG_ID}/receiving-pod-gr88190.txt`,
      DEMO_BUYER_ID,
      DEMO_ORG_ID,
      `${DEMO_ORG_ID}/credit-memo-88412.txt`,
      DEMO_OWNER_ID
    );

    // 10. Supplier Communications
    tx.prepare(`
      INSERT INTO supplier_communications (id, organization_id, case_id, direction, channel, recipient_email, subject, body, is_ai_drafted, approved_by, approved_at, sent_at, created_by)
      VALUES
      ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', ?, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02', 'outbound_sent', 'email', 'claims@vanguardforging.example', 'Recovery Claim SRD-2026-002 - Heat-Treat Non-Conformance (PO-2026-4410)', 'Dear Elena,\n\nPlease find attached NCR-2026-1042 documenting 260 units of AX-9021-B measuring 44-47 HRC against the 58-62 HRC specification. Under MSA Section 9.3, we are submitting a documented claim for $7,860.00 covering material rejection, containment sorting labour, and external lab verification.\n\nRegards,\nJordan Mercer', 0, ?, '2026-10-12T14:20:00Z', '2026-10-12T14:22:00Z', ?),
      ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02', ?, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04', 'inbound_response', 'email', 'quality@kessler-hydraulics.example', 'Re: Claim SRD-2026-004 - HY-310-K Valves', 'We approve €1,860.00 credit for the 6 failed valves upon RMA return, however we dispute the €620.00 DHL air freight charge as no prior air-freight RMA was issued.', 0, NULL, NULL, '2026-10-25T09:15:00Z', ?)
    `).run(DEMO_ORG_ID, DEMO_OWNER_ID, DEMO_OWNER_ID, DEMO_ORG_ID, DEMO_ANALYST_ID);

    // 11. Tasks & Timeline Events
    tx.prepare(`
      INSERT INTO recovery_tasks (id, organization_id, case_id, title, assigned_to, due_date, is_completed)
      VALUES
      ('ffffffff-ffff-4fff-8fff-ffffffffff01', ?, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02', 'Follow up with Vanguard AR on $2,700 second credit installment', ?, '2026-11-25', 0),
      ('ffffffff-ffff-4fff-8fff-ffffffffff02', ?, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04', 'Locate written air-freight authorization email from Oct 16', ?, '2026-11-18', 0),
      ('ffffffff-ffff-4fff-8fff-ffffffffff03', ?, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa07', 'Attach signed Cleveland floor NCR for thread gauge sorting', ?, '2026-11-19', 0)
    `).run(DEMO_ORG_ID, DEMO_OWNER_ID, DEMO_ORG_ID, DEMO_BUYER_ID, DEMO_ORG_ID, DEMO_ANALYST_ID);

    tx.prepare(`
      INSERT INTO claim_activity_events (id, organization_id, case_id, actor_user_id, event_type, summary)
      VALUES
      ('12121212-1212-4121-8121-121212121201', ?, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02', ?, 'case_submitted', 'Submitted $7,860.00 claim dossier to Vanguard Forging (MSA §9.3).'),
      ('12121212-1212-4121-8121-121212121202', ?, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02', ?, 'settlement_recorded', 'Recorded Installment 1 credit memo CM-VF-2026-19-A for $4,500.00 received ($2,700.00 balance remaining).'),
      ('12121212-1212-4121-8121-121212121203', ?, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04', ?, 'supplier_dispute', 'Kessler Hydraulics disputed €620.00 air freight portion while approving €1,860.00 valve replacement.'),
      ('12121212-1212-4121-8121-121212121204', ?, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', ?, 'case_recovered', 'Full $3,420.00 credit reconciled against AP statement (CM-88412).')
    `).run(DEMO_ORG_ID, DEMO_OWNER_ID, DEMO_ORG_ID, DEMO_OWNER_ID, DEMO_ORG_ID, DEMO_ANALYST_ID, DEMO_ORG_ID, DEMO_OWNER_ID);

    // 12. Open Discrepancy Leads (ready for review & case creation)
    tx.prepare(`
      INSERT INTO discrepancy_leads (
        id, organization_id, supplier_id, rule_code, rule_name, incident_type, source_key,
        purchase_order_id, goods_receipt_id, supplier_invoice_id,
        expected_value_text, actual_value_text, variance_text, tolerance_text,
        estimated_amount_cents, currency, match_confidence, review_reason, suggested_action, status
      ) VALUES
      ('13131313-1313-4131-8131-131313131301', ?, ?, 'RULE_LATE_DELIVERY', 'Delivery received past promised PO date', 'late_delivery', 'demo:late:po-4419', ?, ?, NULL, 'Promised 2026-10-14', 'Received 2026-10-16', '+2 calendar days late', '1 day grace window', 0, 'EUR', 'review_needed', 'Late delivery alone does not verify financial loss. Check whether assembly overtime or expedite freight occurred.', 'Review receiving dock impact before raising a claim.', 'open'),
      ('13131313-1313-4131-8131-131313131302', ?, ?, 'RULE_PRICE_EXCEEDS_PO', 'Invoice unit price exceeds PO unit price', 'price_variance', 'demo:pv:inv-vf-9099', ?, NULL, NULL, '$18.50 / unit (PO-2026-4410)', '$20.15 / unit (Inv × 240)', '+$396.00 (+8.92%)', '2.00% / $25.00', 39600, 'USD', 'exact', 'Unit price surcharge on supplemental lot #1042-D exceeds organization tolerance.', 'Verify whether steel surcharge amendment was signed; raise claim if unapproved.', 'open'),
      ('13131313-1313-4131-8131-131313131303', ?, ?, 'RULE_DUPLICATE_INVOICE', 'Potential duplicate supplier invoice', 'overbilling', 'demo:dup:mw-7714-b', ?, NULL, ?, 'Single invoice (INV-MW-7714 on 2026-10-14)', 'Second invoice INV-MW-7714B ($25,500.00)', 'Potential double-billing of $25,500.00', 'Exact uniqueness check', 2550000, 'USD', 'review_needed', 'Same supplier, date, and exact invoice amount ($25,500.00). Requires AP verification before raising claim.', 'Verify AP payment batch to ensure INV-MW-7714B was not already paid.', 'open')
    `).run(
      DEMO_ORG_ID, supKessler, po2, gr2,
      DEMO_ORG_ID, supVanguard, po1,
      DEMO_ORG_ID, supMidwest, po3, inv3
    );
  });
}
