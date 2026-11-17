'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { formatCents } from '@/lib/domain/money';
import {
  CASE_STATUSES,
  COST_CATEGORIES,
  COST_CATEGORY_LABELS,
  INCIDENT_TYPES,
  INCIDENT_TYPE_LABELS,
  STATUS_META,
  type CaseStatus,
  type CostCategory,
  type IncidentType,
} from '@/lib/domain/workflow';
import { CaseStatusLabel } from './status-badge';

interface CaseRow {
  id: string;
  caseNumber: string;
  supplierId: string;
  supplierName: string;
  supplierCode: string;
  plantName: string | null;
  poNumber: string | null;
  incidentType: IncidentType;
  title: string;
  status: CaseStatus;
  currency: string;
  incidentDate: string;
  responseDeadline: string | null;
  potentiallyRecoverableCents: number;
  submittedAmountCents: number;
  approvedAmountCents: number;
  recoveredAmountCents: number;
  outstandingBalanceCents: number;
}

interface SupplierOption {
  id: string;
  name: string;
  supplier_code: string;
  default_currency: string;
}

export function CasesClient({
  initialCases,
  suppliers,
  defaultStatusFilter = 'all',
  openCreateByDefault = false,
}: {
  initialCases: CaseRow[];
  suppliers: SupplierOption[];
  defaultStatusFilter?: string;
  openCreateByDefault?: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(defaultStatusFilter);
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [incidentFilter, setIncidentFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(openCreateByDefault);

  // Create form state
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const [incidentType, setIncidentType] = useState<IncidentType>('quality_rejection');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [claimBasis, setClaimBasis] = useState('');
  const [currency, setCurrency] = useState(suppliers[0]?.default_currency ?? 'USD');
  const [incidentDate, setIncidentDate] = useState(new Date().toISOString().slice(0, 10));
  const [costCategory, setCostCategory] = useState<CostCategory>('material_loss');
  const [costDesc, setCostDesc] = useState('');
  const [costQty, setCostQty] = useState('1');
  const [costUnit, setCostUnit] = useState('unit');
  const [costRate, setCostRate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const filtered = initialCases.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (supplierFilter !== 'all' && c.supplierId !== supplierFilter) return false;
    if (incidentFilter !== 'all' && c.incidentType !== incidentFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        c.caseNumber.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.supplierName.toLowerCase().includes(q) ||
        (c.poNumber?.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId,
          incidentType,
          title,
          description,
          claimBasis,
          incidentDate,
          discoveryDate: incidentDate,
          currency,
          initialCost:
            costDesc.trim() && costRate.trim()
              ? {
                  category: costCategory,
                  description: costDesc,
                  quantity: Number(costQty) || 1,
                  unitLabel: costUnit || 'unit',
                  unitRate: costRate,
                }
              : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create recovery case');
        return;
      }
      router.push(`/app/cases/${data.id}`);
      router.refresh();
    } catch {
      setError('Network error while creating case');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950">
            Recovery Cases
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Track evidence completeness, submitted claim amounts, supplier disputes, and reconciled recovery balances.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#0F172A] px-4 py-2 text-xs font-medium text-white hover:bg-[#1E293B] cursor-pointer whitespace-nowrap"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>New Recovery Case</span>
        </button>
      </div>

      {showCreate && (
        <section className="rounded-lg border border-slate-300 bg-white p-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h2 className="font-display text-base font-semibold text-slate-950">
              Create Manual Recovery Case
            </h2>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              aria-label="Close new case form"
              className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {suppliers.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">
              Add at least one supplier in{' '}
              <Link href="/app/suppliers" className="text-sky-700 underline">
                Suppliers
              </Link>{' '}
              or import a CSV batch first.
            </p>
          ) : (
            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              {error && (
                <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label htmlFor="case-supplier" className="block text-xs font-medium text-slate-700">
                    Supplier
                  </label>
                  <select
                    id="case-supplier"
                    value={supplierId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setSupplierId(nextId);
                      const sup = suppliers.find((s) => s.id === nextId);
                      if (sup) setCurrency(sup.default_currency);
                    }}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.supplier_code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="case-incident-type" className="block text-xs font-medium text-slate-700">
                    Incident category
                  </label>
                  <select
                    id="case-incident-type"
                    value={incidentType}
                    onChange={(e) => setIncidentType(e.target.value as IncidentType)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900"
                  >
                    {INCIDENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {INCIDENT_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="case-date" className="block text-xs font-medium text-slate-700">
                    Incident date
                  </label>
                  <input
                    id="case-date"
                    type="date"
                    required
                    value={incidentDate}
                    onChange={(e) => setIncidentDate(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900"
                  />
                </div>

                <div>
                  <label htmlFor="case-currency" className="block text-xs font-medium text-slate-700">
                    Currency
                  </label>
                  <select
                    id="case-currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="CAD">CAD</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="case-title" className="block text-xs font-medium text-slate-700">
                    Case title
                  </label>
                  <input
                    id="case-title"
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Damaged motor housings on PO-2026-4512"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="case-basis" className="block text-xs font-medium text-slate-700">
                    Claim basis / PO or contract reference
                  </label>
                  <input
                    id="case-basis"
                    type="text"
                    value={claimBasis}
                    onChange={(e) => setClaimBasis(e.target.value)}
                    placeholder="e.g., PO-2026-4512 & MSA Section 9.3"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="case-desc" className="block text-xs font-medium text-slate-700">
                  Incident summary
                </label>
                <textarea
                  id="case-desc"
                  required
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the discrepancy, affected part numbers, quantities, and dock/QA inspection findings."
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900"
                />
              </div>

              <div className="border-t border-slate-200 pt-4">
                <p className="text-xs font-semibold text-slate-800">
                  Initial Cost Line Item (optional - more lines can be added in the case workspace)
                </p>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-5 gap-3">
                  <select
                    aria-label="Initial cost category"
                    value={costCategory}
                    onChange={(e) => setCostCategory(e.target.value as CostCategory)}
                    className="rounded-md border border-slate-300 px-2.5 py-2 text-xs"
                  >
                    {COST_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {COST_CATEGORY_LABELS[cat]}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    aria-label="Cost line description"
                    placeholder="Line description"
                    value={costDesc}
                    onChange={(e) => setCostDesc(e.target.value)}
                    className="sm:col-span-2 rounded-md border border-slate-300 px-2.5 py-2 text-xs"
                  />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.01"
                      aria-label="Quantity"
                      placeholder="Qty"
                      value={costQty}
                      onChange={(e) => setCostQty(e.target.value)}
                      className="w-20 rounded-md border border-slate-300 px-2 py-2 text-xs font-mono"
                    />
                    <input
                      type="text"
                      aria-label="Unit label"
                      placeholder="unit"
                      value={costUnit}
                      onChange={(e) => setCostUnit(e.target.value)}
                      className="w-20 rounded-md border border-slate-300 px-2 py-2 text-xs"
                    />
                  </div>
                  <input
                    type="text"
                    aria-label="Unit rate"
                    placeholder={`Rate (${currency})`}
                    value={costRate}
                    onChange={(e) => setCostRate(e.target.value)}
                    className="rounded-md border border-slate-300 px-2.5 py-2 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-[#0F172A] px-4 py-2 text-xs font-medium text-white hover:bg-[#1E293B] disabled:opacity-60 cursor-pointer"
                >
                  {submitting ? 'Creating...' : 'Create Recovery Case'}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3.5">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search recovery cases"
            placeholder="Search by case #, title, supplier, or PO..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-slate-300 pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:border-sky-600 focus:outline-none"
          />
        </div>

        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800"
        >
          <option value="all">All statuses</option>
          {CASE_STATUSES.map((st) => (
            <option key={st} value={st}>
              {STATUS_META[st].label}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by supplier"
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
          className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800"
        >
          <option value="all">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by incident type"
          value={incidentFilter}
          onChange={(e) => setIncidentFilter(e.target.value)}
          className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800"
        >
          <option value="all">All incident types</option>
          {INCIDENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {INCIDENT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {/* Cases Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-900">No recovery cases match your filters</p>
            <p className="mt-1 text-xs text-slate-500">
              Adjust filters above, import ERP data, or create a manual recovery case.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Case #</th>
                <th className="px-4 py-3 font-medium">Supplier / Title</th>
                <th className="px-4 py-3 font-medium">Incident</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Claimable</th>
                <th className="px-4 py-3 font-medium text-right">Approved</th>
                <th className="px-4 py-3 font-medium text-right">Recovered</th>
                <th className="px-4 py-3 font-medium text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-semibold whitespace-nowrap">
                    <Link href={`/app/cases/${c.id}`} className="text-sky-700 hover:underline">
                      {c.caseNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 max-w-[340px]">
                    <Link href={`/app/cases/${c.id}`} className="font-medium text-slate-900 hover:underline block truncate">
                      {c.title}
                    </Link>
                    <span className="text-[11px] text-slate-500">
                      {c.supplierName} {c.poNumber ? `· ${c.poNumber}` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                    {INCIDENT_TYPE_LABELS[c.incidentType] ?? c.incidentType}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <CaseStatusLabel status={c.status} />
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                    {formatCents(c.potentiallyRecoverableCents, c.currency)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-sky-700 whitespace-nowrap">
                    {formatCents(c.approvedAmountCents, c.currency)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-emerald-700 whitespace-nowrap">
                    {formatCents(c.recoveredAmountCents, c.currency)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                    {formatCents(c.outstandingBalanceCents, c.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
