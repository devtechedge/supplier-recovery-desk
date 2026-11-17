import { z } from 'zod';
import { parseDecimalToCents } from './money';

export const IMPORT_TYPES = [
  'suppliers',
  'purchase_orders',
  'goods_receipts',
  'supplier_invoices',
  'quality_incidents',
  'additional_costs',
] as const;

export type ImportType = (typeof IMPORT_TYPES)[number];

export interface CsvTemplateSpec {
  type: ImportType;
  label: string;
  description: string;
  requiredColumns: string[];
  optionalColumns: string[];
  sampleCsv: string;
}

export const CSV_TEMPLATES: Record<ImportType, CsvTemplateSpec> = {
  suppliers: {
    type: 'suppliers',
    label: 'Suppliers',
    description: 'Master supplier directory, default currencies, payment terms, and primary claim contacts.',
    requiredColumns: ['supplier_code', 'name', 'default_currency'],
    optionalColumns: ['category', 'country', 'payment_terms_days', 'contact_name', 'contact_email'],
    sampleCsv: [
      'supplier_code,name,category,country,default_currency,payment_terms_days,contact_name,contact_email',
      'SUP-1042,Vanguard Forging & Stampings,Stamped & Forged Metal,US,USD,45,Elena Vance,claims@vanguardforging.example',
      'SUP-1088,Kessler Precision Hydraulics,Hydraulic Valves,DE,EUR,30,Lukas Weber,quality@kessler-hydraulics.example',
    ].join('\n'),
  },
  purchase_orders: {
    type: 'purchase_orders',
    label: 'Purchase orders & lines',
    description: 'PO headers and line-level unit pricing used as the baseline for price and quantity comparisons.',
    requiredColumns: ['po_number', 'supplier_code', 'order_date', 'line_number', 'part_number', 'ordered_qty', 'unit_price', 'currency'],
    optionalColumns: ['promised_date', 'plant_code', 'description'],
    sampleCsv: [
      'po_number,supplier_code,order_date,promised_date,plant_code,line_number,part_number,description,ordered_qty,unit_price,currency',
      'PO-2026-4410,SUP-1042,2026-10-01,2026-10-15,PLT-CHI,1,AX-9021-B,Hardened Steel Flange 42mm,500,18.50,USD',
      'PO-2026-4419,SUP-1088,2026-10-04,2026-10-18,PLT-CHI,1,HY-310-K,Proportional Control Valve,80,145.00,EUR',
    ].join('\n'),
  },
  goods_receipts: {
    type: 'goods_receipts',
    label: 'Goods receipts & rejections',
    description: 'Receiving counts, short quantities, and rejected or damaged quantities logged at dock inspection.',
    requiredColumns: ['receipt_number', 'po_number', 'supplier_code', 'received_date', 'part_number', 'received_qty'],
    optionalColumns: ['rejected_qty', 'damaged_qty', 'plant_code', 'inspection_notes'],
    sampleCsv: [
      'receipt_number,po_number,supplier_code,received_date,plant_code,part_number,received_qty,rejected_qty,damaged_qty,inspection_notes',
      'GR-88201,PO-2026-4410,SUP-1042,2026-10-18,PLT-CHI,AX-9021-B,440,25,10,60 units short on pallet 3; 25 failed OD gauge; 10 flange edge dings',
      'GR-88214,PO-2026-4419,SUP-1088,2026-10-22,PLT-CHI,HY-310-K,80,6,0,6 valves failed pressure bench check at 210 bar',
    ].join('\n'),
  },
  supplier_invoices: {
    type: 'supplier_invoices',
    label: 'Supplier invoices & lines',
    description: 'Supplier billing records compared automatically against PO unit prices and goods receipt quantities.',
    requiredColumns: ['invoice_number', 'supplier_code', 'invoice_date', 'part_number', 'invoiced_qty', 'unit_price', 'currency'],
    optionalColumns: ['po_number'],
    sampleCsv: [
      'invoice_number,supplier_code,po_number,invoice_date,part_number,invoiced_qty,unit_price,currency',
      'INV-VF-9031,SUP-1042,PO-2026-4410,2026-10-19,AX-9021-B,500,21.25,USD',
      'INV-KH-4102,SUP-1088,PO-2026-4419,2026-10-22,HY-310-K,80,145.00,EUR',
    ].join('\n'),
  },
  quality_incidents: {
    type: 'quality_incidents',
    label: 'Quality incidents / NCRs',
    description: 'Non-conformance reports linked to supplier codes and PO references.',
    requiredColumns: ['supplier_code', 'incident_date', 'incident_type', 'part_number', 'affected_qty', 'estimated_loss', 'currency', 'summary'],
    optionalColumns: ['po_number', 'plant_code', 'discovery_date'],
    sampleCsv: [
      'supplier_code,po_number,plant_code,incident_date,discovery_date,incident_type,part_number,affected_qty,estimated_loss,currency,summary',
      'SUP-1042,PO-2026-4410,PLT-CHI,2026-10-18,2026-10-19,quality_rejection,AX-9021-B,35,1480.00,USD,Heat-treat hardness out of spec on lot 1042-C requiring 100% bench sorting',
    ].join('\n'),
  },
  additional_costs: {
    type: 'additional_costs',
    label: 'Additional loss costs (labour, rework, freight)',
    description: 'Documented sorting hours, rework, scrap, downtime, and emergency freight linked to supplier incidents.',
    requiredColumns: ['supplier_code', 'incident_date', 'category', 'description', 'quantity', 'unit_label', 'unit_rate', 'currency'],
    optionalColumns: ['po_number', 'case_number'],
    sampleCsv: [
      'supplier_code,po_number,case_number,incident_date,category,description,quantity,unit_label,unit_rate,currency',
      'SUP-1042,PO-2026-4410,,2026-10-20,sorting_labour,QA technician containment sort for lot 1042-C,14,hour,48.00,USD',
      'SUP-1088,PO-2026-4419,,2026-10-23,premium_freight,DHL Express air replacement shipment for 6 rejected valves,1,shipment,640.00,EUR',
    ].join('\n'),
  },
};

/**
 * RFC-4180 compliant CSV parser. Returns header array and array of row string arrays.
 */
export function parseCsvText(csvText: string): { headers: string[]; rows: string[][] } {
  const clean = csvText.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(field.trim());
      if (row.some((cell) => cell !== '')) {
        records.push(row);
      }
      row = [];
      field = '';
      i += 1;
    } else if (ch === '\n' || ch === '\r') {
      row.push(field.trim());
      if (row.some((cell) => cell !== '')) {
        records.push(row);
      }
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  row.push(field.trim());
  if (row.some((cell) => cell !== '')) {
    records.push(row);
  }

  if (records.length === 0) {
    return { headers: [], rows: [] };
  }

  const [headers, ...rows] = records;
  return { headers, rows };
}

export interface CsvRowValidationResult {
  rowNumber: number;
  raw: Record<string, string>;
  mapped: Record<string, string>;
  status: 'valid' | 'error' | 'duplicate' | 'unmatched_warning';
  errorMessage?: string;
  warningMessage?: string;
}

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const BaseSupplierRowSchema = z.object({
  supplier_code: z.string().min(1, 'supplier_code is required'),
  name: z.string().min(1, 'name is required'),
  default_currency: z.string().length(3, 'default_currency must be 3-letter ISO code'),
  category: z.string().optional(),
  country: z.string().optional(),
  payment_terms_days: z.string().optional(),
  contact_name: z.string().optional(),
  contact_email: z.string().email('Invalid contact_email').optional().or(z.literal('')),
});

const BasePoRowSchema = z.object({
  po_number: z.string().min(1, 'po_number is required'),
  supplier_code: z.string().min(1, 'supplier_code is required'),
  order_date: z.string().regex(ISO_DATE_REGEX, 'order_date must be YYYY-MM-DD'),
  promised_date: z.string().regex(ISO_DATE_REGEX, 'promised_date must be YYYY-MM-DD').optional().or(z.literal('')),
  plant_code: z.string().optional(),
  line_number: z.coerce.number().int().positive('line_number must be positive integer'),
  part_number: z.string().min(1, 'part_number is required'),
  description: z.string().optional(),
  ordered_qty: z.coerce.number().int().nonnegative('ordered_qty must be >= 0'),
  unit_price: z.string().min(1, 'unit_price is required'),
  currency: z.string().length(3, 'currency must be 3-letter ISO code'),
});

const BaseGrRowSchema = z.object({
  receipt_number: z.string().min(1, 'receipt_number is required'),
  po_number: z.string().min(1, 'po_number is required'),
  supplier_code: z.string().min(1, 'supplier_code is required'),
  received_date: z.string().regex(ISO_DATE_REGEX, 'received_date must be YYYY-MM-DD'),
  plant_code: z.string().optional(),
  part_number: z.string().min(1, 'part_number is required'),
  received_qty: z.coerce.number().int().nonnegative(),
  rejected_qty: z.coerce.number().int().nonnegative().optional(),
  damaged_qty: z.coerce.number().int().nonnegative().optional(),
  inspection_notes: z.string().optional(),
});

const BaseInvoiceRowSchema = z.object({
  invoice_number: z.string().min(1, 'invoice_number is required'),
  supplier_code: z.string().min(1, 'supplier_code is required'),
  po_number: z.string().optional(),
  invoice_date: z.string().regex(ISO_DATE_REGEX, 'invoice_date must be YYYY-MM-DD'),
  part_number: z.string().min(1, 'part_number is required'),
  invoiced_qty: z.coerce.number().int().nonnegative(),
  unit_price: z.string().min(1, 'unit_price is required'),
  currency: z.string().length(3, 'currency must be 3-letter ISO code'),
});

const BaseIncidentRowSchema = z.object({
  supplier_code: z.string().min(1, 'supplier_code is required'),
  po_number: z.string().optional(),
  plant_code: z.string().optional(),
  incident_date: z.string().regex(ISO_DATE_REGEX, 'incident_date must be YYYY-MM-DD'),
  discovery_date: z.string().regex(ISO_DATE_REGEX, 'discovery_date must be YYYY-MM-DD').optional().or(z.literal('')),
  incident_type: z.enum([
    'short_shipment',
    'damaged_goods',
    'quality_rejection',
    'price_variance',
    'overbilling',
    'late_delivery',
    'sorting_rework',
    'freight_expedite',
  ]),
  part_number: z.string().min(1, 'part_number is required'),
  affected_qty: z.coerce.number().int().nonnegative(),
  estimated_loss: z.string().min(1, 'estimated_loss is required'),
  currency: z.string().length(3, 'currency must be 3-letter ISO code'),
  summary: z.string().min(3, 'summary is required'),
});

const BaseCostRowSchema = z.object({
  supplier_code: z.string().min(1, 'supplier_code is required'),
  po_number: z.string().optional(),
  case_number: z.string().optional(),
  incident_date: z.string().regex(ISO_DATE_REGEX, 'incident_date must be YYYY-MM-DD'),
  category: z.enum([
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
  ]),
  description: z.string().min(2, 'description is required'),
  quantity: z.coerce.number().positive('quantity must be positive'),
  unit_label: z.string().min(1, 'unit_label is required'),
  unit_rate: z.string().min(1, 'unit_rate is required'),
  currency: z.string().length(3, 'currency must be 3-letter ISO code'),
});

export function validateMappedCsvRows(params: {
  importType: ImportType;
  headers: string[];
  rows: string[][];
  columnMapping: Record<string, string>;
  existingSupplierCodes?: Set<string>;
  existingPoNumbers?: Set<string>;
  existingKeys?: Set<string>;
}): CsvRowValidationResult[] {
  const { importType, headers, rows, columnMapping } = params;
  const seenInBatch = new Set<string>();
  const results: CsvRowValidationResult[] = [];

  for (let idx = 0; idx < rows.length; idx += 1) {
    const cells = rows[idx];
    const raw: Record<string, string> = {};
    headers.forEach((h, cIdx) => {
      raw[h] = cells[cIdx] ?? '';
    });

    const mapped: Record<string, string> = {};
    for (const [targetField, sourceCol] of Object.entries(columnMapping)) {
      if (sourceCol && sourceCol !== '__ignore__') {
        mapped[targetField] = raw[sourceCol] ?? '';
      }
    }
    // Also copy direct matches if not explicitly mapped
    const spec = CSV_TEMPLATES[importType];
    for (const col of [...spec.requiredColumns, ...spec.optionalColumns]) {
      if (mapped[col] === undefined && raw[col] !== undefined) {
        mapped[col] = raw[col];
      }
    }

    let errorMessage: string | undefined;
    try {
      switch (importType) {
        case 'suppliers':
          BaseSupplierRowSchema.parse(mapped);
          break;
        case 'purchase_orders': {
          const parsed = BasePoRowSchema.parse(mapped);
          parseDecimalToCents(parsed.unit_price);
          break;
        }
        case 'goods_receipts':
          BaseGrRowSchema.parse(mapped);
          break;
        case 'supplier_invoices': {
          const parsed = BaseInvoiceRowSchema.parse(mapped);
          parseDecimalToCents(parsed.unit_price);
          break;
        }
        case 'quality_incidents': {
          const parsed = BaseIncidentRowSchema.parse(mapped);
          parseDecimalToCents(parsed.estimated_loss);
          break;
        }
        case 'additional_costs': {
          const parsed = BaseCostRowSchema.parse(mapped);
          parseDecimalToCents(parsed.unit_rate);
          break;
        }
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        errorMessage = err.issues.map((i) => `${i.path.join('.') || 'row'}: ${i.message}`).join('; ');
      } else if (err instanceof Error) {
        errorMessage = err.message;
      } else {
        errorMessage = 'Invalid row';
      }
    }

    if (errorMessage) {
      results.push({
        rowNumber: idx + 2,
        raw,
        mapped,
        status: 'error',
        errorMessage,
      });
      continue;
    }

    // Check duplicates within batch or existing DB
    let dedupeKey = '';
    if (importType === 'suppliers') {
      dedupeKey = `sup:${mapped.supplier_code}`;
    } else if (importType === 'purchase_orders') {
      dedupeKey = `po:${mapped.po_number}:${mapped.line_number}`;
    } else if (importType === 'goods_receipts') {
      dedupeKey = `gr:${mapped.receipt_number}:${mapped.part_number}`;
    } else if (importType === 'supplier_invoices') {
      dedupeKey = `inv:${mapped.supplier_code}:${mapped.invoice_number}:${mapped.part_number}`;
    }

    if (dedupeKey && (seenInBatch.has(dedupeKey) || params.existingKeys?.has(dedupeKey))) {
      results.push({
        rowNumber: idx + 2,
        raw,
        mapped,
        status: 'duplicate',
        warningMessage: `Duplicate key (${dedupeKey}) detected - will not overwrite existing financial record.`,
      });
      continue;
    }
    if (dedupeKey) {
      seenInBatch.add(dedupeKey);
    }

    // Check unmatched supplier/PO references
    let warningMessage: string | undefined;
    if (
      importType !== 'suppliers' &&
      params.existingSupplierCodes &&
      !params.existingSupplierCodes.has(mapped.supplier_code)
    ) {
      warningMessage = `Supplier code "${mapped.supplier_code}" is not yet in directory.`;
    } else if (
      (importType === 'goods_receipts' || importType === 'supplier_invoices') &&
      mapped.po_number &&
      params.existingPoNumbers &&
      !params.existingPoNumbers.has(mapped.po_number)
    ) {
      warningMessage = `PO "${mapped.po_number}" not found; record will be stored with unlinked PO reference.`;
    }

    results.push({
      rowNumber: idx + 2,
      raw,
      mapped,
      status: warningMessage ? 'unmatched_warning' : 'valid',
      warningMessage,
    });
  }

  return results;
}

export function generateErrorReportCsv(results: CsvRowValidationResult[]): string {
  const problemRows = results.filter((r) => r.status === 'error' || r.status === 'duplicate' || r.status === 'unmatched_warning');
  const lines = ['row_number,status,message,raw_summary'];
  for (const r of problemRows) {
    const msg = (r.errorMessage ?? r.warningMessage ?? '').replace(/"/g, '""');
    const summary = JSON.stringify(r.mapped).replace(/"/g, '""');
    lines.push(`${r.rowNumber},${r.status},"${msg}","${summary}"`);
  }
  return lines.join('\n');
}
