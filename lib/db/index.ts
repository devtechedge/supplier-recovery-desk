import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';

export interface SqliteStatement {
  run: (...params: unknown[]) => { changes: number | bigint; lastInsertRowid: number | bigint };
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
}

export interface SqliteDatabase {
  exec: (sql: string) => void;
  prepare: (sql: string) => SqliteStatement;
  close: () => void;
}

let dbInstance: SqliteDatabase | null = null;
let initializedPath: string | null = null;

function getDbFilePath(): string {
  if (process.env.SRD_SQLITE_PATH) {
    return process.env.SRD_SQLITE_PATH;
  }
  const root = process.env.VERCEL
    ? path.join(os.tmpdir(), 'srd')
    : path.join(process.cwd(), '.data');
  return path.join(root, 'srd.db');
}

function toPlainRow(row: unknown): unknown {
  if (row && typeof row === 'object') {
    return Object.assign({}, row);
  }
  return row;
}

function wrapSqliteDatabase(rawDb: SqliteDatabase): SqliteDatabase {
  return {
    exec: (sql: string) => rawDb.exec(sql),
    close: () => rawDb.close(),
    prepare: (sql: string) => {
      const stmt = rawDb.prepare(sql);
      return {
        run: (...params: unknown[]) => stmt.run(...params),
        get: (...params: unknown[]) => toPlainRow(stmt.get(...params)),
        all: (...params: unknown[]) => stmt.all(...params).map(toPlainRow),
      };
    },
  };
}

export interface SqliteModule {
  DatabaseSync: new (path: string) => SqliteDatabase;
}

/**
 * Loads a SQLite engine. Prefers the Node built-in `node:sqlite` (Node >= 22),
 * then falls back to `better-sqlite3` (interface-compatible) on runtimes that
 * ship without the built-in module (for example Vercel's Node 24 functions).
 */
function loadSqliteModule(): SqliteModule {
  const g = (
    process as unknown as {
      getBuiltinModule?: (id: string) => SqliteModule | undefined;
    }
  ).getBuiltinModule;
  if (typeof g === 'function') {
    const builtin = g('node:sqlite');
    if (builtin?.DatabaseSync) {
      return builtin;
    }
  }

  return { DatabaseSync: BetterSqlite3 as unknown as new (path: string) => SqliteDatabase };
}

export function getDb(): SqliteDatabase {
  const targetPath = getDbFilePath();
  if (dbInstance && initializedPath === targetPath) {
    return dbInstance;
  }

  if (targetPath !== ':memory:') {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const sqliteMod = loadSqliteModule();

  const rawDb = new sqliteMod.DatabaseSync(targetPath);
  rawDb.exec('PRAGMA foreign_keys = ON;');
  rawDb.exec('PRAGMA journal_mode = WAL;');

  const db = wrapSqliteDatabase(rawDb);
  applyLocalSchema(db);
  dbInstance = db;
  initializedPath = targetPath;
  return db;
}

export function closeDbForTests(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore
    }
    dbInstance = null;
    initializedPath = null;
  }
}

export function runInTransaction<T>(fn: (db: SqliteDatabase) => T): T {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = fn(db);
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

function applyLocalSchema(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      is_demo INTEGER NOT NULL DEFAULT 0,
      default_currency TEXT NOT NULL DEFAULT 'USD',
      price_tolerance_pct_bps INTEGER NOT NULL DEFAULT 200,
      price_tolerance_abs_cents INTEGER NOT NULL DEFAULT 2500,
      qty_tolerance_pct_bps INTEGER NOT NULL DEFAULT 100,
      qty_tolerance_abs INTEGER NOT NULL DEFAULT 1,
      default_sorting_hourly_cents INTEGER NOT NULL DEFAULT 4800,
      default_rework_hourly_cents INTEGER NOT NULL DEFAULT 6500,
      default_downtime_hourly_cents INTEGER NOT NULL DEFAULT 28000,
      default_overtime_hourly_cents INTEGER NOT NULL DEFAULT 7200,
      default_response_days INTEGER NOT NULL DEFAULT 14,
      ai_processing_enabled INTEGER NOT NULL DEFAULT 0,
      workflow_config TEXT NOT NULL DEFAULT '{}',
      notification_preferences TEXT NOT NULL DEFAULT '{"overdueAlerts":true,"settlementAlerts":true,"importAlerts":true}',
      deletion_requested_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      password_hash TEXT,
      job_title TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS organization_memberships (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('owner','admin','analyst','contributor','viewer')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','suspended')),
      invited_by TEXT REFERENCES user_profiles(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (organization_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS plants_or_locations (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      city TEXT,
      country TEXT DEFAULT 'US',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (organization_id, code)
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      supplier_code TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Mechanical Components',
      country TEXT DEFAULT 'US',
      default_currency TEXT NOT NULL DEFAULT 'USD',
      payment_terms_days INTEGER DEFAULT 30,
      tax_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (organization_id, supplier_code)
    );

    CREATE TABLE IF NOT EXISTS supplier_contacts (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS supplier_terms (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      agreement_title TEXT NOT NULL,
      warranty_window_days INTEGER NOT NULL DEFAULT 90,
      claim_notice_days INTEGER NOT NULL DEFAULT 15,
      allows_sorting_chargeback INTEGER NOT NULL DEFAULT 1,
      allows_freight_recovery INTEGER NOT NULL DEFAULT 1,
      allows_downtime_recovery INTEGER NOT NULL DEFAULT 0,
      terms_summary TEXT NOT NULL,
      effective_from TEXT,
      effective_to TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
      plant_id TEXT REFERENCES plants_or_locations(id),
      po_number TEXT NOT NULL,
      order_date TEXT NOT NULL,
      promised_date TEXT,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'open',
      source_batch_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (organization_id, po_number)
    );

    CREATE TABLE IF NOT EXISTS purchase_order_lines (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      line_number INTEGER NOT NULL,
      part_number TEXT NOT NULL,
      description TEXT NOT NULL,
      ordered_qty INTEGER NOT NULL,
      unit_price_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      UNIQUE (organization_id, purchase_order_id, line_number)
    );

    CREATE TABLE IF NOT EXISTS goods_receipts (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
      purchase_order_id TEXT REFERENCES purchase_orders(id) ON DELETE SET NULL,
      plant_id TEXT REFERENCES plants_or_locations(id),
      receipt_number TEXT NOT NULL,
      received_date TEXT NOT NULL,
      source_batch_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (organization_id, receipt_number)
    );

    CREATE TABLE IF NOT EXISTS goods_receipt_lines (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      goods_receipt_id TEXT NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
      po_line_id TEXT REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
      part_number TEXT NOT NULL,
      received_qty INTEGER NOT NULL,
      rejected_qty INTEGER NOT NULL DEFAULT 0,
      damaged_qty INTEGER NOT NULL DEFAULT 0,
      inspection_notes TEXT
    );

    CREATE TABLE IF NOT EXISTS supplier_invoices (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
      purchase_order_id TEXT REFERENCES purchase_orders(id) ON DELETE SET NULL,
      invoice_number TEXT NOT NULL,
      invoice_date TEXT NOT NULL,
      total_amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      source_batch_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (organization_id, supplier_id, invoice_number)
    );

    CREATE TABLE IF NOT EXISTS supplier_invoice_lines (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      supplier_invoice_id TEXT NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
      po_line_id TEXT REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
      part_number TEXT NOT NULL,
      invoiced_qty INTEGER NOT NULL,
      unit_price_cents INTEGER NOT NULL,
      line_total_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD'
    );

    CREATE TABLE IF NOT EXISTS import_batches (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      uploaded_by TEXT NOT NULL REFERENCES user_profiles(id),
      import_type TEXT NOT NULL,
      filename TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'committed',
      total_rows INTEGER NOT NULL DEFAULT 0,
      valid_rows INTEGER NOT NULL DEFAULT 0,
      error_rows INTEGER NOT NULL DEFAULT 0,
      duplicate_rows INTEGER NOT NULL DEFAULT 0,
      column_mapping TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS import_rows (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
      row_number INTEGER NOT NULL,
      status TEXT NOT NULL,
      raw_payload TEXT NOT NULL,
      error_message TEXT,
      created_entity_id TEXT
    );

    CREATE TABLE IF NOT EXISTS source_documents (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL,
      title TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      checksum TEXT,
      ai_extraction_json TEXT,
      ai_confirmed_by TEXT REFERENCES user_profiles(id),
      ai_confirmed_at TEXT,
      uploaded_by TEXT NOT NULL REFERENCES user_profiles(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS loss_events (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
      plant_id TEXT REFERENCES plants_or_locations(id),
      purchase_order_id TEXT REFERENCES purchase_orders(id) ON DELETE SET NULL,
      goods_receipt_id TEXT REFERENCES goods_receipts(id) ON DELETE SET NULL,
      supplier_invoice_id TEXT REFERENCES supplier_invoices(id) ON DELETE SET NULL,
      incident_type TEXT NOT NULL,
      part_number TEXT,
      incident_date TEXT NOT NULL,
      discovery_date TEXT NOT NULL,
      affected_qty INTEGER NOT NULL DEFAULT 0,
      gross_loss_cents INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      summary TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'manual',
      source_batch_id TEXT REFERENCES import_batches(id) ON DELETE SET NULL,
      created_by TEXT REFERENCES user_profiles(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS discrepancy_leads (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      rule_code TEXT NOT NULL,
      rule_name TEXT NOT NULL,
      incident_type TEXT NOT NULL,
      source_key TEXT NOT NULL,
      purchase_order_id TEXT REFERENCES purchase_orders(id) ON DELETE SET NULL,
      goods_receipt_id TEXT REFERENCES goods_receipts(id) ON DELETE SET NULL,
      supplier_invoice_id TEXT REFERENCES supplier_invoices(id) ON DELETE SET NULL,
      loss_event_id TEXT REFERENCES loss_events(id) ON DELETE SET NULL,
      expected_value_text TEXT NOT NULL,
      actual_value_text TEXT NOT NULL,
      variance_text TEXT NOT NULL,
      tolerance_text TEXT NOT NULL,
      estimated_amount_cents INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      match_confidence TEXT NOT NULL DEFAULT 'exact',
      review_reason TEXT NOT NULL,
      suggested_action TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      linked_case_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (organization_id, source_key)
    );

    CREATE TABLE IF NOT EXISTS recovery_cases (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      case_number TEXT NOT NULL,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
      plant_id TEXT REFERENCES plants_or_locations(id),
      purchase_order_id TEXT REFERENCES purchase_orders(id) ON DELETE SET NULL,
      goods_receipt_id TEXT REFERENCES goods_receipts(id) ON DELETE SET NULL,
      supplier_invoice_id TEXT REFERENCES supplier_invoices(id) ON DELETE SET NULL,
      incident_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      responsibility_assessment TEXT NOT NULL DEFAULT 'Under review',
      claim_basis TEXT,
      incident_date TEXT NOT NULL,
      discovery_date TEXT NOT NULL,
      submission_date TEXT,
      response_deadline TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      currency TEXT NOT NULL DEFAULT 'USD',
      gross_loss_cents INTEGER NOT NULL DEFAULT 0,
      potentially_recoverable_cents INTEGER NOT NULL DEFAULT 0,
      submitted_amount_cents INTEGER NOT NULL DEFAULT 0,
      approved_amount_cents INTEGER NOT NULL DEFAULT 0,
      expected_credit_cents INTEGER NOT NULL DEFAULT 0,
      recovered_amount_cents INTEGER NOT NULL DEFAULT 0,
      owner_user_id TEXT REFERENCES user_profiles(id),
      internal_notes TEXT DEFAULT '',
      credit_reference TEXT,
      recovered_date TEXT,
      source_provenance TEXT NOT NULL DEFAULT '{}',
      created_by TEXT REFERENCES user_profiles(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (organization_id, case_number)
    );

    CREATE TABLE IF NOT EXISTS recovery_case_items (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
      loss_event_id TEXT REFERENCES loss_events(id) ON DELETE SET NULL,
      discrepancy_lead_id TEXT REFERENCES discrepancy_leads(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS loss_cost_items (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
      loss_event_id TEXT REFERENCES loss_events(id) ON DELETE SET NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      quantity_numerator INTEGER NOT NULL DEFAULT 1,
      quantity_denominator INTEGER NOT NULL DEFAULT 1,
      unit_label TEXT NOT NULL DEFAULT 'unit',
      unit_rate_cents INTEGER NOT NULL DEFAULT 0,
      calculated_amount_cents INTEGER NOT NULL DEFAULT 0,
      recoverable_amount_cents INTEGER NOT NULL DEFAULT 0,
      is_manual_override INTEGER NOT NULL DEFAULT 0,
      override_reason TEXT,
      override_by TEXT REFERENCES user_profiles(id),
      override_at TEXT,
      formula_text TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recovery_evidence (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
      checklist_item_key TEXT,
      title TEXT NOT NULL,
      evidence_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      is_completed INTEGER NOT NULL DEFAULT 1,
      uploaded_by TEXT NOT NULL REFERENCES user_profiles(id),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS supplier_communications (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
      direction TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'email',
      recipient_email TEXT,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      is_ai_drafted INTEGER NOT NULL DEFAULT 0,
      approved_by TEXT REFERENCES user_profiles(id),
      approved_at TEXT,
      sent_at TEXT,
      external_message_id TEXT,
      created_by TEXT REFERENCES user_profiles(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recovery_tasks (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      assigned_to TEXT REFERENCES user_profiles(id),
      due_date TEXT,
      is_completed INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recovery_settlements (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
      settlement_type TEXT NOT NULL,
      reference_number TEXT NOT NULL,
      approved_amount_cents INTEGER NOT NULL DEFAULT 0,
      expected_date TEXT,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'promised',
      notes TEXT,
      created_by TEXT REFERENCES user_profiles(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recovery_transactions (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
      settlement_id TEXT REFERENCES recovery_settlements(id) ON DELETE SET NULL,
      transaction_date TEXT NOT NULL,
      amount_received_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      reference_number TEXT NOT NULL,
      notes TEXT,
      recorded_by TEXT NOT NULL REFERENCES user_profiles(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS claim_activity_events (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
      actor_user_id TEXT REFERENCES user_profiles(id),
      event_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES user_profiles(id),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      link_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      actor_user_id TEXT REFERENCES user_profiles(id),
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
      plan_tier TEXT NOT NULL DEFAULT 'growth',
      status TEXT NOT NULL DEFAULT 'development_mode',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      current_period_end TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS usage_records (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      period_key TEXT NOT NULL,
      cases_created INTEGER NOT NULL DEFAULT 0,
      import_rows_processed INTEGER NOT NULL DEFAULT 0,
      ai_requests INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (organization_id, period_key)
    );

    CREATE TABLE IF NOT EXISTS stripe_webhook_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      processed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_cases_org_status ON recovery_cases(organization_id, status);
    CREATE INDEX IF NOT EXISTS idx_cases_org_supplier ON recovery_cases(organization_id, supplier_id);
    CREATE INDEX IF NOT EXISTS idx_cost_items_case ON loss_cost_items(organization_id, case_id);
    CREATE INDEX IF NOT EXISTS idx_discrepancies_org_status ON discrepancy_leads(organization_id, status);
    CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_logs(organization_id, created_at);
  `);
}
