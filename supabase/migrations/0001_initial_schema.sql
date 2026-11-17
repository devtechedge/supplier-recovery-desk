-- Supplier Recovery Desk - Initial Multi-Tenant PostgreSQL Schema
-- Target: Supabase PostgreSQL 15+

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Organizations & Users
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  default_currency CHAR(3) NOT NULL DEFAULT 'USD',
  price_tolerance_pct_bps INTEGER NOT NULL DEFAULT 200, -- 2.00% in basis points
  price_tolerance_abs_cents BIGINT NOT NULL DEFAULT 2500, -- $25.00
  qty_tolerance_pct_bps INTEGER NOT NULL DEFAULT 100, -- 1.00%
  qty_tolerance_abs INTEGER NOT NULL DEFAULT 1,
  default_sorting_hourly_cents BIGINT NOT NULL DEFAULT 4800,
  default_rework_hourly_cents BIGINT NOT NULL DEFAULT 6500,
  default_downtime_hourly_cents BIGINT NOT NULL DEFAULT 28000,
  default_overtime_hourly_cents BIGINT NOT NULL DEFAULT 7200,
  default_response_days INTEGER NOT NULL DEFAULT 14,
  ai_processing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  workflow_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  notification_preferences JSONB NOT NULL DEFAULT '{"overdueAlerts":true,"settlementAlerts":true,"importAlerts":true}'::jsonb,
  deletion_requested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  password_hash TEXT, -- Used only for local/non-Supabase fallback auth
  job_title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'analyst', 'contributor', 'viewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  invited_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON organization_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_org ON organization_memberships(organization_id);

-- 2. Plants / Locations
CREATE TABLE IF NOT EXISTS plants_or_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  city TEXT,
  country TEXT DEFAULT 'US',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code)
);

-- 3. Suppliers, Contacts & Terms
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Mechanical Components',
  country TEXT DEFAULT 'US',
  default_currency CHAR(3) NOT NULL DEFAULT 'USD',
  payment_terms_days INTEGER DEFAULT 30,
  tax_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, supplier_code)
);
CREATE INDEX IF NOT EXISTS idx_suppliers_org_name ON suppliers(organization_id, name);

CREATE TABLE IF NOT EXISTS supplier_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_supplier_contacts_supplier ON supplier_contacts(organization_id, supplier_id);

CREATE TABLE IF NOT EXISTS supplier_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  agreement_title TEXT NOT NULL,
  warranty_window_days INTEGER NOT NULL DEFAULT 90,
  claim_notice_days INTEGER NOT NULL DEFAULT 15,
  allows_sorting_chargeback BOOLEAN NOT NULL DEFAULT TRUE,
  allows_freight_recovery BOOLEAN NOT NULL DEFAULT TRUE,
  allows_downtime_recovery BOOLEAN NOT NULL DEFAULT FALSE,
  terms_summary TEXT NOT NULL,
  effective_from DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Purchasing, Receiving & Invoicing Records
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  plant_id UUID REFERENCES plants_or_locations(id),
  po_number TEXT NOT NULL,
  order_date DATE NOT NULL,
  promised_date DATE,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'open',
  source_batch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, po_number)
);
CREATE INDEX IF NOT EXISTS idx_pos_org_supplier ON purchase_orders(organization_id, supplier_id);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  part_number TEXT NOT NULL,
  description TEXT NOT NULL,
  ordered_qty INTEGER NOT NULL CHECK (ordered_qty >= 0),
  unit_price_cents BIGINT NOT NULL CHECK (unit_price_cents >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  UNIQUE (organization_id, purchase_order_id, line_number)
);

CREATE TABLE IF NOT EXISTS goods_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  plant_id UUID REFERENCES plants_or_locations(id),
  receipt_number TEXT NOT NULL,
  received_date DATE NOT NULL,
  source_batch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, receipt_number)
);

CREATE TABLE IF NOT EXISTS goods_receipt_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  goods_receipt_id UUID NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  po_line_id UUID REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
  part_number TEXT NOT NULL,
  received_qty INTEGER NOT NULL CHECK (received_qty >= 0),
  rejected_qty INTEGER NOT NULL DEFAULT 0 CHECK (rejected_qty >= 0),
  damaged_qty INTEGER NOT NULL DEFAULT 0 CHECK (damaged_qty >= 0),
  inspection_notes TEXT
);

CREATE TABLE IF NOT EXISTS supplier_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  total_amount_cents BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  source_batch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, supplier_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS supplier_invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_invoice_id UUID NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
  po_line_id UUID REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
  part_number TEXT NOT NULL,
  invoiced_qty INTEGER NOT NULL CHECK (invoiced_qty >= 0),
  unit_price_cents BIGINT NOT NULL CHECK (unit_price_cents >= 0),
  line_total_cents BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD'
);

-- 5. Imports & Source Provenance
CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES user_profiles(id),
  import_type TEXT NOT NULL CHECK (import_type IN ('suppliers','purchase_orders','goods_receipts','supplier_invoices','quality_incidents','additional_costs')),
  filename TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'committed' CHECK (status IN ('preview', 'committed', 'failed')),
  total_rows INTEGER NOT NULL DEFAULT 0,
  valid_rows INTEGER NOT NULL DEFAULT 0,
  error_rows INTEGER NOT NULL DEFAULT 0,
  duplicate_rows INTEGER NOT NULL DEFAULT 0,
  column_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_import_batches_org ON import_batches(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('imported', 'error', 'duplicate', 'unmatched_warning')),
  raw_payload JSONB NOT NULL,
  error_message TEXT,
  created_entity_id UUID
);

CREATE TABLE IF NOT EXISTS source_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  title TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  checksum TEXT,
  ai_extraction_json JSONB,
  ai_confirmed_by UUID REFERENCES user_profiles(id),
  ai_confirmed_at TIMESTAMPTZ,
  uploaded_by UUID NOT NULL REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Loss Events & Deterministic Discrepancy Leads
CREATE TABLE IF NOT EXISTS loss_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  plant_id UUID REFERENCES plants_or_locations(id),
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  goods_receipt_id UUID REFERENCES goods_receipts(id) ON DELETE SET NULL,
  supplier_invoice_id UUID REFERENCES supplier_invoices(id) ON DELETE SET NULL,
  incident_type TEXT NOT NULL CHECK (incident_type IN ('short_shipment','damaged_goods','quality_rejection','price_variance','overbilling','late_delivery','sorting_rework','freight_expedite')),
  part_number TEXT,
  incident_date DATE NOT NULL,
  discovery_date DATE NOT NULL,
  affected_qty INTEGER NOT NULL DEFAULT 0,
  gross_loss_cents BIGINT NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  summary TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'csv_import', 'rule_detection', 'ai_extracted')),
  source_batch_id UUID REFERENCES import_batches(id) ON DELETE SET NULL,
  created_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loss_events_org ON loss_events(organization_id, supplier_id);

CREATE TABLE IF NOT EXISTS discrepancy_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  rule_code TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  incident_type TEXT NOT NULL,
  source_key TEXT NOT NULL,
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  goods_receipt_id UUID REFERENCES goods_receipts(id) ON DELETE SET NULL,
  supplier_invoice_id UUID REFERENCES supplier_invoices(id) ON DELETE SET NULL,
  loss_event_id UUID REFERENCES loss_events(id) ON DELETE SET NULL,
  expected_value_text TEXT NOT NULL,
  actual_value_text TEXT NOT NULL,
  variance_text TEXT NOT NULL,
  tolerance_text TEXT NOT NULL,
  estimated_amount_cents BIGINT NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  match_confidence TEXT NOT NULL DEFAULT 'exact' CHECK (match_confidence IN ('exact', 'high', 'review_needed')),
  review_reason TEXT NOT NULL,
  suggested_action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'converted', 'dismissed')),
  linked_case_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, source_key)
);

-- 7. Recovery Cases, Costs, Evidence, Communications & Settlements
CREATE TABLE IF NOT EXISTS recovery_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  case_number TEXT NOT NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  plant_id UUID REFERENCES plants_or_locations(id),
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  goods_receipt_id UUID REFERENCES goods_receipts(id) ON DELETE SET NULL,
  supplier_invoice_id UUID REFERENCES supplier_invoices(id) ON DELETE SET NULL,
  incident_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  responsibility_assessment TEXT NOT NULL DEFAULT 'Under review',
  claim_basis TEXT,
  incident_date DATE NOT NULL,
  discovery_date DATE NOT NULL,
  submission_date DATE,
  response_deadline DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','needs_evidence','ready_for_review','submitted','supplier_responded','disputed','approved','partially_approved','credit_expected','partially_recovered','recovered','closed','cancelled')),
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  gross_loss_cents BIGINT NOT NULL DEFAULT 0,
  potentially_recoverable_cents BIGINT NOT NULL DEFAULT 0,
  submitted_amount_cents BIGINT NOT NULL DEFAULT 0,
  approved_amount_cents BIGINT NOT NULL DEFAULT 0,
  expected_credit_cents BIGINT NOT NULL DEFAULT 0,
  recovered_amount_cents BIGINT NOT NULL DEFAULT 0,
  owner_user_id UUID REFERENCES user_profiles(id),
  internal_notes TEXT DEFAULT '',
  credit_reference TEXT,
  recovered_date DATE,
  source_provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, case_number)
);
CREATE INDEX IF NOT EXISTS idx_recovery_cases_org_status ON recovery_cases(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_recovery_cases_org_supplier ON recovery_cases(organization_id, supplier_id);

CREATE TABLE IF NOT EXISTS recovery_case_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
  loss_event_id UUID REFERENCES loss_events(id) ON DELETE SET NULL,
  discrepancy_lead_id UUID REFERENCES discrepancy_leads(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loss_cost_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
  loss_event_id UUID REFERENCES loss_events(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('material_loss','sorting_labour','rework_labour','scrap','production_downtime','overtime','premium_freight','external_inspection','third_party_sorting','customer_cost','other_expense')),
  description TEXT NOT NULL,
  quantity_numerator INTEGER NOT NULL DEFAULT 1,
  quantity_denominator INTEGER NOT NULL DEFAULT 1,
  unit_label TEXT NOT NULL DEFAULT 'unit',
  unit_rate_cents BIGINT NOT NULL DEFAULT 0,
  calculated_amount_cents BIGINT NOT NULL DEFAULT 0,
  recoverable_amount_cents BIGINT NOT NULL DEFAULT 0,
  is_manual_override BOOLEAN NOT NULL DEFAULT FALSE,
  override_reason TEXT,
  override_by UUID REFERENCES user_profiles(id),
  override_at TIMESTAMPTZ,
  formula_text TEXT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cost_items_case ON loss_cost_items(organization_id, case_id);

CREATE TABLE IF NOT EXISTS recovery_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
  checklist_item_key TEXT,
  title TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT TRUE,
  uploaded_by UUID NOT NULL REFERENCES user_profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_evidence_case ON recovery_evidence(organization_id, case_id);

CREATE TABLE IF NOT EXISTS supplier_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('outbound_draft','outbound_sent','inbound_response')),
  channel TEXT NOT NULL DEFAULT 'email',
  recipient_email TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  is_ai_drafted BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by UUID REFERENCES user_profiles(id),
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  external_message_id TEXT,
  created_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recovery_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  assigned_to UUID REFERENCES user_profiles(id),
  due_date DATE,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recovery_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
  settlement_type TEXT NOT NULL CHECK (settlement_type IN ('credit_memo','bank_refund','invoice_offset','replacement_goods')),
  reference_number TEXT NOT NULL,
  approved_amount_cents BIGINT NOT NULL DEFAULT 0,
  expected_date DATE,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'promised' CHECK (status IN ('promised','partially_settled','settled','disputed')),
  notes TEXT,
  created_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recovery_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
  settlement_id UUID REFERENCES recovery_settlements(id) ON DELETE SET NULL,
  transaction_date DATE NOT NULL,
  amount_received_cents BIGINT NOT NULL CHECK (amount_received_cents > 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  reference_number TEXT NOT NULL,
  notes TEXT,
  recorded_by UUID NOT NULL REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recovery_tx_case ON recovery_transactions(organization_id, case_id);

-- 8. Activity, Notifications, Audit & Billing
CREATE TABLE IF NOT EXISTS claim_activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES user_profiles(id),
  event_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_claim_activity_case ON claim_activity_events(organization_id, case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES user_profiles(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  link_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES user_profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  plan_tier TEXT NOT NULL DEFAULT 'growth' CHECK (plan_tier IN ('starter','growth','scale','enterprise')),
  status TEXT NOT NULL DEFAULT 'development_mode' CHECK (status IN ('development_mode','trialing','active','past_due','canceled','incomplete')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_end TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_key TEXT NOT NULL, -- YYYY-MM
  cases_created INTEGER NOT NULL DEFAULT 0,
  import_rows_processed INTEGER NOT NULL DEFAULT 0,
  ai_requests INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, period_key)
);

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
