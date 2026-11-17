'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Sparkles,
  Upload,
} from 'lucide-react';
import { CSV_TEMPLATES, IMPORT_TYPES, parseCsvText, type ImportType } from '@/lib/domain/csv';
import { formatCents } from '@/lib/domain/money';
import { INCIDENT_TYPE_LABELS, type IncidentType } from '@/lib/domain/workflow';

interface DiscrepancyLeadRow {
  id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_code: string;
  rule_code: string;
  rule_name: string;
  incident_type: IncidentType;
  po_number: string | null;
  receipt_number: string | null;
  invoice_number: string | null;
  expected_value_text: string;
  actual_value_text: string;
  variance_text: string;
  tolerance_text: string;
  estimated_amount_cents: number;
  currency: string;
  match_confidence: string;
  review_reason: string;
  suggested_action: string;
  status: 'open' | 'converted' | 'dismissed';
  linked_case_id: string | null;
  created_at: string;
}

interface ImportBatchRow {
  id: string;
  import_type: ImportType;
  filename: string;
  status: string;
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  duplicate_rows: number;
  uploaded_by_name: string | null;
  created_at: string;
}

interface PreviewResponse {
  headers: string[];
  totalRows: number;
  validCount: number;
  errorCount: number;
  duplicateCount: number;
  unmatchedCount: number;
  rows: Array<{
    rowNumber: number;
    mapped: Record<string, string>;
    status: 'valid' | 'error' | 'duplicate' | 'unmatched_warning';
    errorMessage?: string;
    warningMessage?: string;
  }>;
}

export function ImportsClient({
  initialLeads,
  initialBatches,
  aiEnabledInOrg,
}: {
  initialLeads: DiscrepancyLeadRow[];
  initialBatches: ImportBatchRow[];
  aiEnabledInOrg: boolean;
}) {
  const router = useRouter();

  // Wizard state
  const [importType, setImportType] = useState<ImportType>('supplier_invoices');
  const [filename, setFilename] = useState('supplier_invoices_sample.csv');
  const [csvText, setCsvText] = useState('');
  const [sourceHeaders, setSourceHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [commitSummary, setCommitSummary] = useState<string | null>(null);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Leads & batches state
  const [leads, setLeads] = useState<DiscrepancyLeadRow[]>(initialLeads);
  const [batches, setBatches] = useState<ImportBatchRow[]>(initialBatches);
  const [leadFilter, setLeadFilter] = useState<'open' | 'all'>('open');

  // AI document extraction helper state
  const [rawDocText, setRawDocText] = useState('');
  const [extractedResult, setExtractedResult] = useState<{
    provider: string;
    notice: string;
    data: Record<string, unknown>;
  } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const spec = CSV_TEMPLATES[importType];
  const allTargetCols = [...spec.requiredColumns, ...spec.optionalColumns];

  function initializeHeadersAndMapping(text: string, type: ImportType) {
    const parsed = parseCsvText(text);
    setSourceHeaders(parsed.headers);
    const nextSpec = CSV_TEMPLATES[type];
    const autoMap: Record<string, string> = {};
    for (const target of [...nextSpec.requiredColumns, ...nextSpec.optionalColumns]) {
      const exact = parsed.headers.find((h) => h.toLowerCase() === target.toLowerCase());
      if (exact) autoMap[target] = exact;
    }
    setColumnMapping(autoMap);
    setPreview(null);
    setCommitSummary(null);
    setWizardError(null);
  }

  function handleSelectType(nextType: ImportType) {
    setImportType(nextType);
    setPreview(null);
    setCommitSummary(null);
    setWizardError(null);
    if (csvText.trim()) {
      initializeHeadersAndMapping(csvText, nextType);
    }
  }

  function handleLoadSample() {
    const sample = CSV_TEMPLATES[importType].sampleCsv;
    setCsvText(sample);
    setFilename(`sample_${importType}.csv`);
    initializeHeadersAndMapping(sample, importType);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    setFilename(file.name);
    initializeHeadersAndMapping(text, importType);
  }

  async function handlePreview() {
    if (!csvText.trim()) {
      setWizardError('Upload a CSV file or load the sample template first.');
      return;
    }
    setBusyAction('preview');
    setWizardError(null);
    setCommitSummary(null);
    try {
      const res = await fetch('/api/imports/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          importType,
          csvText,
          columnMapping,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWizardError(data.error || 'Preview validation failed');
        return;
      }
      setPreview(data);
    } catch {
      setWizardError('Network error while validating CSV');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCommit() {
    if (!csvText.trim()) return;
    setBusyAction('commit');
    setWizardError(null);
    try {
      const res = await fetch('/api/imports/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          importType,
          filename: filename || `${importType}.csv`,
          csvText,
          columnMapping,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWizardError(data.error || 'Failed to commit import batch');
        return;
      }
      setCommitSummary(
        `Imported ${data.importedCount} of ${data.totalRows} rows (${data.errorCount} errors, ${data.duplicateCount} duplicates skipped). Deterministic scan detected ${data.newLeadsDetected} new discrepancy lead(s).`
      );
      setPreview(null);
      await refreshLeadsAndBatches();
      router.refresh();
    } catch {
      setWizardError('Network error while committing CSV batch');
    } finally {
      setBusyAction(null);
    }
  }

  function handleDownloadErrorCsv() {
    if (!preview) return;
    const problemRows = preview.rows.filter((r) => r.status !== 'valid');
    const lines = ['row_number,status,message,raw_summary'];
    for (const r of problemRows) {
      const msg = (r.errorMessage ?? r.warningMessage ?? '').replace(/"/g, '""');
      const summary = JSON.stringify(r.mapped).replace(/"/g, '""');
      lines.push(`${r.rowNumber},${r.status},"${msg}","${summary}"`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-issues-${importType}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function refreshLeadsAndBatches() {
    const [leadsRes, batchesRes] = await Promise.all([
      fetch('/api/discrepancies'),
      fetch('/api/imports/commit'),
    ]);
    if (leadsRes.ok) {
      const d = await leadsRes.json();
      setLeads(d.leads ?? []);
    }
    if (batchesRes.ok) {
      const b = await batchesRes.json();
      setBatches(b.batches ?? []);
    }
  }

  async function handleRescan() {
    setBusyAction('rescan');
    try {
      const res = await fetch('/api/discrepancies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rescan' }),
      });
      if (res.ok) {
        await refreshLeadsAndBatches();
        router.refresh();
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRaiseCase(leadId: string) {
    setBusyAction(`raise:${leadId}`);
    try {
      const res = await fetch('/api/discrepancies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'raise_case', leadId }),
      });
      const data = await res.json();
      if (res.ok && data.caseId) {
        router.push(`/app/cases/${data.caseId}`);
        router.refresh();
      } else {
        setWizardError(data.error || 'Could not raise recovery case from lead');
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDismissLead(leadId: string) {
    setBusyAction(`dismiss:${leadId}`);
    try {
      const res = await fetch('/api/discrepancies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss', leadId }),
      });
      if (res.ok) {
        await refreshLeadsAndBatches();
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function handleExtractDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!rawDocText.trim()) return;
    setBusyAction('ai_extract');
    setAiError(null);
    try {
      const res = await fetch('/api/ai/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'extract_document', rawText: rawDocText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error || 'Document extraction failed');
        return;
      }
      setExtractedResult(data);
    } catch {
      setAiError('Network error during document extraction');
    } finally {
      setBusyAction(null);
    }
  }

  const visibleLeads = leads.filter((l) => (leadFilter === 'open' ? l.status === 'open' : true));

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950">
            Imports &amp; Discrepancy Detection
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Import ERP CSV exports, validate every row before committing, and review deterministic discrepancy leads with explicit rules and tolerances.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRescan}
          disabled={busyAction === 'rescan'}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer disabled:opacity-60 whitespace-nowrap"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busyAction === 'rescan' ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>Run Discrepancy Scan</span>
        </button>
      </div>

      {/* CSV Import Wizard */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-950">
              CSV Import Wizard
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Preview-first validation with column mapping, duplicate detection, and provenance tracking.
            </p>
          </div>
          <a
            href={`/api/imports/templates/${importType}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Download Sample CSV</span>
          </a>
        </div>

        {/* Step 1: Select Import Type */}
        <div>
          <span className="block text-xs font-medium text-slate-700 mb-2">
            1. Select ERP / Operational Dataset Type
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {IMPORT_TYPES.map((t) => {
              const s = CSV_TEMPLATES[t];
              const active = importType === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleSelectType(t)}
                  className={`text-left rounded-md border p-3 transition-colors cursor-pointer ${
                    active
                      ? 'border-sky-700 bg-sky-50/70'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <p className="text-xs font-semibold text-slate-950">{s.label}</p>
                  <p className="mt-1 text-[11px] text-slate-600 line-clamp-2">{s.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Upload or Load Sample */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="csv-file-input" className="text-xs font-medium text-slate-800">
                2. Upload CSV File or Load Sample
              </label>
              <button
                type="button"
                onClick={handleLoadSample}
                className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-slate-50 cursor-pointer"
              >
                Load Sample CSV
              </button>
            </div>
            <label className="flex items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-4 py-4 text-xs text-slate-600 hover:border-slate-400 cursor-pointer">
              <Upload className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <span>{filename ? `Selected: ${filename}` : 'Choose .csv file from computer'}</span>
              <input
                id="csv-file-input"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                className="sr-only"
              />
            </label>
            <div>
              <label htmlFor="csv-raw-textarea" className="block text-[11px] font-medium text-slate-600">
                Or paste CSV rows directly
              </label>
              <textarea
                id="csv-raw-textarea"
                rows={4}
                value={csvText}
                onChange={(e) => {
                  setCsvText(e.target.value);
                  initializeHeadersAndMapping(e.target.value, importType);
                }}
                placeholder={`${spec.requiredColumns.join(',')}\n...`}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[11px] font-mono text-slate-800"
              />
            </div>
          </div>

          {/* Step 3: Column Mapping */}
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-800">
              3. Map CSV Columns to Required Schema Fields
            </p>
            {sourceHeaders.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">
                Load sample CSV or upload a file to auto-map source columns.
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[220px] overflow-y-auto pr-1">
                {allTargetCols.map((target) => {
                  const isReq = spec.requiredColumns.includes(target);
                  return (
                    <div key={target}>
                      <label htmlFor={`map-${target}`} className="block text-[11px] font-mono text-slate-700">
                        {target} {isReq ? <span className="text-red-600">*</span> : null}
                      </label>
                      <select
                        id={`map-${target}`}
                        value={columnMapping[target] ?? '__ignore__'}
                        onChange={(e) =>
                          setColumnMapping((prev) => ({ ...prev, [target]: e.target.value }))
                        }
                        className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-[11px] font-mono text-slate-900"
                      >
                        <option value="__ignore__">- Not mapped -</option>
                        {sourceHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {wizardError && (
          <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {wizardError}
          </div>
        )}

        {commitSummary && (
          <div role="status" className="rounded border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" aria-hidden="true" />
            <span>{commitSummary}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={handlePreview}
            disabled={!csvText.trim() || busyAction === 'preview'}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
          >
            {busyAction === 'preview' ? 'Validating...' : 'Preview & Validate'}
          </button>
          <button
            type="button"
            onClick={handleCommit}
            disabled={!csvText.trim() || busyAction === 'commit'}
            className="rounded-md bg-[#0F172A] px-4 py-2 text-xs font-medium text-white hover:bg-[#1E293B] disabled:opacity-50 cursor-pointer"
          >
            {busyAction === 'commit' ? 'Committing Batch...' : 'Confirm & Commit Import'}
          </button>
        </div>

        {/* Preview Validation Table */}
        {preview && (
          <div className="border-t border-slate-200 pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums">
                <span className="text-slate-800">Total: {preview.totalRows}</span>
                <span className="text-emerald-700 font-semibold">Valid: {preview.validCount}</span>
                <span className="text-red-700">Errors: {preview.errorCount}</span>
                <span className="text-amber-700">Duplicates: {preview.duplicateCount}</span>
                <span className="text-slate-600">Warnings: {preview.unmatchedCount}</span>
              </div>
              {preview.errorCount + preview.duplicateCount + preview.unmatchedCount > 0 && (
                <button
                  type="button"
                  onClick={handleDownloadErrorCsv}
                  className="inline-flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <Download className="h-3 w-3" aria-hidden="true" />
                  <span>Download Error Rows CSV</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto rounded border border-slate-200 max-h-[280px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">Row</th>
                    <th className="px-3 py-2 font-medium">Validation</th>
                    <th className="px-3 py-2 font-medium">Mapped Summary</th>
                    <th className="px-3 py-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.rows.map((r) => (
                    <tr key={r.rowNumber}>
                      <td className="px-3 py-2 font-mono text-slate-600">{r.rowNumber}</td>
                      <td className="px-3 py-2 font-mono font-semibold">
                        {r.status === 'valid' && <span className="text-emerald-700">valid</span>}
                        {r.status === 'error' && <span className="text-red-700">error</span>}
                        {r.status === 'duplicate' && <span className="text-amber-700">duplicate</span>}
                        {r.status === 'unmatched_warning' && <span className="text-amber-700">warning</span>}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-700 max-w-[360px] truncate">
                        {Object.entries(r.mapped)
                          .slice(0, 5)
                          .map(([k, v]) => `${k}=${v}`)
                          .join(' · ')}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-slate-600">
                        {r.errorMessage ?? r.warningMessage ?? 'Ready to import'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Open Discrepancy Leads Queue */}
      <section id="leads" className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-950">
              Detected Discrepancy Leads
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Deterministic rule matches comparing invoices, purchase orders, goods receipts, and quality logs. Human review is required before raising a claim.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setLeadFilter('open')}
              className={`rounded px-2.5 py-1 font-medium cursor-pointer ${
                leadFilter === 'open' ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700'
              }`}
            >
              Open ({leads.filter((l) => l.status === 'open').length})
            </button>
            <button
              type="button"
              onClick={() => setLeadFilter('all')}
              className={`rounded px-2.5 py-1 font-medium cursor-pointer ${
                leadFilter === 'all' ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700'
              }`}
            >
              All ({leads.length})
            </button>
          </div>
        </div>

        {visibleLeads.length === 0 ? (
          <div className="px-6 py-10 text-center text-xs text-slate-500">
            No {leadFilter === 'open' ? 'open ' : ''}discrepancy leads found. Import ERP records or run a discrepancy scan above.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {visibleLeads.map((lead) => (
              <div key={lead.id} className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono font-semibold text-sky-700">{lead.rule_code}</span>
                    <span className="font-semibold text-slate-950">{lead.rule_name}</span>
                    <span className="text-slate-400">·</span>
                    <span className="font-medium text-slate-700">{lead.supplier_name}</span>
                    {lead.po_number ? (
                      <span className="font-mono text-slate-500">PO: {lead.po_number}</span>
                    ) : null}
                    {lead.invoice_number ? (
                      <span className="font-mono text-slate-500">INV: {lead.invoice_number}</span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] bg-slate-50 border border-slate-200 rounded px-3 py-2 font-mono">
                    <div>
                      <span className="text-slate-500">Expected: </span>
                      <span className="text-slate-900">{lead.expected_value_text}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Observed: </span>
                      <span className="text-slate-900">{lead.actual_value_text}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Variance: </span>
                      <span className="text-amber-800 font-semibold">{lead.variance_text}</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600">
                    {lead.review_reason} <span className="text-slate-400">({lead.tolerance_text})</span>
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end gap-2.5 shrink-0">
                  <div className="text-left lg:text-right">
                    <p className="text-[11px] text-slate-500">Estimated potential variance</p>
                    <p className="font-mono text-base font-bold text-slate-950 tabular-nums">
                      {formatCents(Number(lead.estimated_amount_cents || 0), lead.currency)}
                    </p>
                  </div>

                  {lead.status === 'open' ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleRaiseCase(lead.id)}
                        disabled={busyAction === `raise:${lead.id}`}
                        className="rounded-md bg-[#0F172A] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1E293B] cursor-pointer disabled:opacity-60 whitespace-nowrap"
                      >
                        {busyAction === `raise:${lead.id}` ? 'Creating...' : 'Raise Recovery Case'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDismissLead(lead.id)}
                        disabled={busyAction === `dismiss:${lead.id}`}
                        className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        Dismiss
                      </button>
                    </div>
                  ) : lead.linked_case_id ? (
                    <Link
                      href={`/app/cases/${lead.linked_case_id}`}
                      className="text-xs font-medium text-sky-700 hover:underline"
                    >
                      View Linked Case →
                    </Link>
                  ) : (
                    <span className="text-xs text-slate-500 capitalize">{lead.status}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* AI Document Extraction Assistant (Optional, Human-Reviewed) */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-950 inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-sky-700" aria-hidden="true" />
              <span>Incident &amp; NCR Document Extraction Helper</span>
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {aiEnabledInOrg
                ? 'Paste raw NCR notes, delivery exception emails, or inspection logs to structure fields for review. Extracted output never creates financial records automatically.'
                : 'Workspace AI processing is disabled in Settings; deterministic regex/pattern extraction will structure pasted notes locally.'}
            </p>
          </div>
        </div>

        <form onSubmit={handleExtractDocument} className="space-y-3">
          <label htmlFor="ai-doc-text" className="block text-xs font-medium text-slate-700">
            Paste supplier NCR email, inspection report, or freight bill text
          </label>
          <textarea
            id="ai-doc-text"
            rows={3}
            value={rawDocText}
            onChange={(e) => setRawDocText(e.target.value)}
            placeholder="Example: NCR-402 from Plant B dock inspection on 2026-10-18. 35 units of AX-9021-B failed hardness check. Estimated material & sorting loss USD 1,480.00 under PO-2026-4410."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900"
          />
          {aiError && (
            <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {aiError}
            </div>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!rawDocText.trim() || busyAction === 'ai_extract'}
              className="rounded-md border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
            >
              {busyAction === 'ai_extract' ? 'Extracting...' : 'Extract Structured Fields'}
            </button>
          </div>
        </form>

        {extractedResult && (
          <div className="rounded-md border border-amber-200 bg-amber-50/70 p-4 space-y-2 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-amber-900">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{extractedResult.notice} ({extractedResult.provider})</span>
            </div>
            <pre className="overflow-x-auto rounded bg-white border border-amber-200 p-3 font-mono text-[11px] text-slate-800">
              {JSON.stringify(extractedResult.data, null, 2)}
            </pre>
            <Link
              href="/app/cases?new=1"
              className="inline-block text-xs font-medium text-sky-700 hover:underline"
            >
              Open New Recovery Case form to enter reviewed values →
            </Link>
          </div>
        )}
      </section>

      {/* Import Batch Provenance History */}
      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-3.5 flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-slate-500" aria-hidden="true" />
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Import Batch Provenance Log
          </h2>
        </div>
        {batches.length === 0 ? (
          <p className="px-5 py-6 text-xs text-slate-500">No CSV import batches committed yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-2.5 font-medium">File</th>
                  <th className="px-4 py-2.5 font-medium">Dataset</th>
                  <th className="px-4 py-2.5 font-medium text-right">Total</th>
                  <th className="px-4 py-2.5 font-medium text-right">Imported</th>
                  <th className="px-4 py-2.5 font-medium text-right">Errors</th>
                  <th className="px-4 py-2.5 font-medium text-right">Duplicates</th>
                  <th className="px-4 py-2.5 font-medium">Uploaded by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-2.5 font-mono text-slate-900">{b.filename}</td>
                    <td className="px-4 py-2.5 text-slate-700">{b.import_type}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{b.total_rows}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-emerald-700 tabular-nums">{b.valid_rows}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-red-700 tabular-nums">{b.error_rows}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-amber-700 tabular-nums">{b.duplicate_rows}</td>
                    <td className="px-4 py-2.5 text-slate-600">{b.uploaded_by_name ?? 'System'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
