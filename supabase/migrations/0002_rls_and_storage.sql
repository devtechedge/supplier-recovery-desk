-- Supplier Recovery Desk - Supabase Row Level Security & Private Evidence Storage
-- Apply after 0001_initial_schema.sql

-- Helper function: checks if authenticated Supabase user belongs to organization
CREATE OR REPLACE FUNCTION public.is_org_member(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships m
    WHERE m.organization_id = target_org_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(target_org_id UUID, allowed_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships m
    WHERE m.organization_id = target_org_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.role = ANY(allowed_roles)
  );
$$;

-- Enable RLS across all tenant tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE plants_or_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE loss_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE discrepancy_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_case_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE loss_cost_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;

-- Policies for organizations & memberships
CREATE POLICY org_select_member ON organizations FOR SELECT USING (public.is_org_member(id));
CREATE POLICY org_update_admin ON organizations FOR UPDATE USING (public.has_org_role(id, ARRAY['owner','admin']));

CREATE POLICY profile_self_select ON user_profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY profile_self_update ON user_profiles FOR UPDATE USING (id = auth.uid());

CREATE POLICY membership_select_member ON organization_memberships FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY membership_manage_admin ON organization_memberships FOR ALL USING (public.has_org_role(organization_id, ARRAY['owner','admin']));

-- Tenant isolation policies for operational tables
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'plants_or_locations', 'suppliers', 'supplier_contacts', 'supplier_terms',
    'purchase_orders', 'purchase_order_lines', 'goods_receipts', 'goods_receipt_lines',
    'supplier_invoices', 'supplier_invoice_lines', 'import_batches', 'import_rows',
    'source_documents', 'loss_events', 'discrepancy_leads', 'recovery_cases',
    'recovery_case_items', 'loss_cost_items', 'recovery_evidence', 'supplier_communications',
    'recovery_tasks', 'recovery_settlements', 'recovery_transactions',
    'claim_activity_events', 'notifications', 'audit_logs', 'subscriptions', 'usage_records'
  ]
  LOOP
    EXECUTE format('CREATE POLICY %I_tenant_select ON %I FOR SELECT USING (public.is_org_member(organization_id));', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_tenant_write ON %I FOR INSERT WITH CHECK (public.has_org_role(organization_id, ARRAY[''owner'',''admin'',''analyst'',''contributor'']));', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_tenant_update ON %I FOR UPDATE USING (public.has_org_role(organization_id, ARRAY[''owner'',''admin'',''analyst'']));', tbl, tbl);
  END LOOP;
END $$;

-- Private Storage Bucket for Evidence Attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'recovery-evidence',
  'recovery-evidence',
  FALSE,
  10485760,
  ARRAY['application/pdf','image/png','image/jpeg','image/webp','text/csv','text/plain']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY evidence_bucket_read ON storage.objects FOR SELECT
USING (
  bucket_id = 'recovery-evidence'
  AND public.is_org_member((string_to_array(name, '/'))[1]::uuid)
);

CREATE POLICY evidence_bucket_write ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'recovery-evidence'
  AND public.has_org_role((string_to_array(name, '/'))[1]::uuid, ARRAY['owner','admin','analyst','contributor'])
);
