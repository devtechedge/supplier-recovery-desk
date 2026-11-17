export const CASE_STATUSES = [
  'draft',
  'needs_evidence',
  'ready_for_review',
  'submitted',
  'supplier_responded',
  'disputed',
  'approved',
  'partially_approved',
  'credit_expected',
  'partially_recovered',
  'recovered',
  'closed',
  'cancelled',
] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

export const INCIDENT_TYPES = [
  'short_shipment',
  'damaged_goods',
  'quality_rejection',
  'price_variance',
  'overbilling',
  'late_delivery',
  'sorting_rework',
  'freight_expedite',
] as const;

export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const COST_CATEGORIES = [
  'material_loss',
  'sorting_labour',
  'rework_labour',
  'scrap',
  'production_downtime',
  'overtime',
  'premium_freight',
  'external_inspection',
  'third_party_sorting',
  'customer_cost',
  'other_expense',
] as const;

export type CostCategory = (typeof COST_CATEGORIES)[number];

export const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
  material_loss: 'Material or component loss',
  sorting_labour: 'Sorting & inspection labour',
  rework_labour: 'Rework & repair labour',
  scrap: 'Scrap & write-off',
  production_downtime: 'Production downtime',
  overtime: 'Overtime labour',
  premium_freight: 'Premium / expedite freight',
  external_inspection: 'External inspection service',
  third_party_sorting: 'Third-party sorting',
  customer_cost: 'Customer-related chargeback',
  other_expense: 'Other documented expense',
};

export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  short_shipment: 'Short shipment',
  damaged_goods: 'Damaged incoming goods',
  quality_rejection: 'Quality rejection / NCR',
  price_variance: 'PO vs. invoice price variance',
  overbilling: 'Quantity overbilling / duplicate',
  late_delivery: 'Late delivery impact',
  sorting_rework: 'Sorting & rework event',
  freight_expedite: 'Emergency expedite freight',
};

export const STATUS_META: Record<
  CaseStatus,
  { label: string; tone: 'neutral' | 'warning' | 'info' | 'positive' | 'danger' }
> = {
  draft: { label: 'Draft', tone: 'neutral' },
  needs_evidence: { label: 'Needs Evidence', tone: 'warning' },
  ready_for_review: { label: 'Ready for Review', tone: 'info' },
  submitted: { label: 'Submitted', tone: 'info' },
  supplier_responded: { label: 'Supplier Responded', tone: 'info' },
  disputed: { label: 'Disputed', tone: 'danger' },
  approved: { label: 'Approved', tone: 'positive' },
  partially_approved: { label: 'Partially Approved', tone: 'warning' },
  credit_expected: { label: 'Credit Expected', tone: 'warning' },
  partially_recovered: { label: 'Partially Recovered', tone: 'warning' },
  recovered: { label: 'Recovered', tone: 'positive' },
  closed: { label: 'Closed', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export const DEFAULT_ALLOWED_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  draft: ['needs_evidence', 'ready_for_review', 'cancelled'],
  needs_evidence: ['draft', 'ready_for_review', 'cancelled'],
  ready_for_review: ['needs_evidence', 'submitted', 'cancelled'],
  submitted: ['supplier_responded', 'disputed', 'approved', 'partially_approved', 'credit_expected', 'cancelled'],
  supplier_responded: ['disputed', 'approved', 'partially_approved', 'credit_expected', 'submitted', 'cancelled'],
  disputed: ['supplier_responded', 'approved', 'partially_approved', 'credit_expected', 'closed', 'cancelled'],
  approved: ['credit_expected', 'partially_recovered', 'recovered', 'disputed'],
  partially_approved: ['credit_expected', 'partially_recovered', 'recovered', 'disputed', 'closed'],
  credit_expected: ['partially_recovered', 'recovered', 'disputed'],
  partially_recovered: ['recovered', 'disputed', 'closed'],
  recovered: ['closed'],
  closed: [],
  cancelled: [],
};

export function validateCaseTransition(
  from: CaseStatus,
  to: CaseStatus,
  customTransitions?: Partial<Record<CaseStatus, CaseStatus[]>>
): { allowed: boolean; reason?: string } {
  if (from === to) {
    return { allowed: true };
  }
  const allowedList = customTransitions?.[from] ?? DEFAULT_ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowedList.includes(to)) {
    return {
      allowed: false,
      reason: `Cannot transition recovery case directly from "${STATUS_META[from].label}" to "${STATUS_META[to].label}".`,
    };
  }
  return { allowed: true };
}

export interface ChecklistTemplateItem {
  key: string;
  label: string;
  required: boolean;
}

const BASE_CHECKLIST: ChecklistTemplateItem[] = [
  { key: 'purchase_order', label: 'Purchase order or supplier agreement', required: true },
  { key: 'cost_worksheet', label: 'Itemized cost calculation breakdown', required: true },
];

const INCIDENT_SPECIFIC_CHECKLISTS: Record<IncidentType, ChecklistTemplateItem[]> = {
  short_shipment: [
    { key: 'goods_receipt', label: 'Goods receipt / receiving count sheet', required: true },
    { key: 'packing_slip', label: 'Carrier bill of lading & packing slip', required: true },
    { key: 'supplier_invoice', label: 'Supplier invoice showing billed quantity', required: false },
  ],
  damaged_goods: [
    { key: 'goods_receipt', label: 'Receiving inspection note', required: true },
    { key: 'damage_photos', label: 'Time-stamped damage photographs', required: true },
    { key: 'carrier_exception', label: 'Carrier delivery exception / POD note', required: false },
  ],
  quality_rejection: [
    { key: 'inspection_report', label: 'Quality inspection / NCR rejection report', required: true },
    { key: 'goods_receipt', label: 'Goods receipt / lot traceability record', required: true },
    { key: 'damage_photos', label: 'Defect photographs or dimensional readings', required: false },
    { key: 'labour_log', label: 'Sorting or containment labour time record', required: false },
  ],
  price_variance: [
    { key: 'supplier_invoice', label: 'Supplier invoice showing billed unit price', required: true },
    { key: 'price_quote', label: 'Agreed price list or PO amendment', required: false },
  ],
  overbilling: [
    { key: 'supplier_invoice', label: 'Supplier invoice(s) showing overbilled lines', required: true },
    { key: 'goods_receipt', label: 'Goods receipt confirming actual received quantity', required: true },
  ],
  late_delivery: [
    { key: 'goods_receipt', label: 'Goods receipt confirming actual delivery date', required: true },
    { key: 'freight_doc', label: 'Expedite freight invoice or line-stop log', required: true },
  ],
  sorting_rework: [
    { key: 'inspection_report', label: 'Containment / sorting instruction or NCR', required: true },
    { key: 'labour_log', label: 'Operator hours & rework time log', required: true },
    { key: 'external_invoice', label: 'Third-party sorting invoice (if outsourced)', required: false },
  ],
  freight_expedite: [
    { key: 'freight_doc', label: 'Carrier expedite air/hot-shot invoice', required: true },
    { key: 'supplier_correspondence', label: 'Supplier delay notice or authorization', required: false },
  ],
};

export function getChecklistForIncident(incidentType: IncidentType): ChecklistTemplateItem[] {
  return [...BASE_CHECKLIST, ...(INCIDENT_SPECIFIC_CHECKLISTS[incidentType] ?? [])];
}
