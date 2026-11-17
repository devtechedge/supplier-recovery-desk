'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Download, Filter } from 'lucide-react';
import { formatBpsAsPercent, formatCents } from '@/lib/domain/money';
import {
  CASE_STATUSES,
  INCIDENT_TYPES,
  STATUS_META,
  INCIDENT_TYPE_LABELS,
  type CaseStatus,
  type IncidentType,
} from '@/lib/domain/workflow';

interface CurrencySummary {
  currency: string;
  potentialIdentifiedCents: number;
  submittedCents: number;
  approvedCents: number;
  expectedCreditsCents: number;
  actualRecoveredCents: number;
  outstandingCents: number;
  recoveryRateBps: number;
}

interface ReportData {
  totalCases: number;
  currencySummaries: CurrencySummary[];
  supplierBreakdown: Array<{
    supplierId: string;
    supplierName: string;
    supplierCode: string;
    currency: string;
    caseCount: number;
    submittedCents: number;
    approvedCents: number;
    recoveredCents: number;
  }>;
  incidentBreakdown: Array<{
    incidentType: IncidentType;
    label: string;
    currency: string;
    caseCount: number;
    recoverableCents: number;
    recoveredCents: number;
  }>;
  avgDaysToSubmission: number | null;
  avgDaysToSettlement: number | null;
}

export function ReportsClient({
  initialData,
  suppliers,
  plants,
}: {
  initialData: ReportData;
  suppliers: Array<{ id: string; name: string }>;
  plants: Array<{ id: string; name: string }>;
}) {
  const [data, setData] = useState<ReportData>(initialData);
  const [supplierId, setSupplierId] = useState('');
  const [plantId, setPlantId] = useState('');
  const [incidentType, setIncidentType] = useState('');
  const [status, setStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function applyFilters(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (supplierId) qs.set('supplierId', supplierId);
      if (plantId) qs.set('plantId', plantId);
      if (incidentType) qs.set('incidentType', incidentType);
      if (status) qs.set('status', status);
      if (fromDate) qs.set('fromDate', fromDate);
      if (toDate) qs.set('toDate', toDate);

      const res = await fetch(`/api/reports?${qs.toString()}`);
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }

  async function resetFilters() {
    setSupplierId('');
    setPlantId('');
    setIncidentType('');
    setStatus('');
    setFromDate('');
    setToDate('');
    setLoading(true);
    try {
      const res = await fetch('/api/reports');
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleExportCsv() {
    setExporting(true);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: supplierId || undefined,
          incidentType: incidentType || undefined,
          status: status || undefined,
        }),
      });
      if (!res.ok) return;
      const csv = await res.text();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recovery-ledger-report-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950">
            Recovery Analytics &amp; Reports
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Compare identified, submitted, approved, expected, and actually recovered totals by currency, supplier, and incident category.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#0F172A] px-4 py-2 text-xs font-medium text-white hover:bg-[#1E293B] cursor-pointer disabled:opacity-60 whitespace-nowrap"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          <span>{exporting ? 'Preparing CSV...' : 'Export CSV Ledger'}</span>
        </button>
      </div>

      {/* Filters */}
      <form
        onSubmit={applyFilters}
        className="rounded-lg border border-slate-200 bg-white p-4 space-y-3"
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
          <Filter className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
          <span>Filter Report Scope</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div>
            <label htmlFor="rep-supplier" className="block text-[11px] font-medium text-slate-600">
              Supplier
            </label>
            <select
              id="rep-supplier"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
            >
              <option value="">All suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="rep-plant" className="block text-[11px] font-medium text-slate-600">
              Plant / Location
            </label>
            <select
              id="rep-plant"
              value={plantId}
              onChange={(e) => setPlantId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
            >
              <option value="">All plants</option>
              {plants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="rep-incident" className="block text-[11px] font-medium text-slate-600">
              Incident Category
            </label>
            <select
              id="rep-incident"
              value={incidentType}
              onChange={(e) => setIncidentType(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
            >
              <option value="">All categories</option>
              {INCIDENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {INCIDENT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="rep-status" className="block text-[11px] font-medium text-slate-600">
              Case Status
            </label>
            <select
              id="rep-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
            >
              <option value="">All statuses</option>
              {CASE_STATUSES.map((st: CaseStatus) => (
                <option key={st} value={st}>
                  {STATUS_META[st].label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="rep-from" className="block text-[11px] font-medium text-slate-600">
              Incident From
            </label>
            <input
              id="rep-from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
            />
          </div>

          <div>
            <label htmlFor="rep-to" className="block text-[11px] font-medium text-slate-600">
              Incident To
            </label>
            <input
              id="rep-to"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Reset
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-[#0F172A] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#1E293B] cursor-pointer disabled:opacity-60"
          >
            {loading ? 'Filtering...' : 'Apply Filters'}
          </button>
        </div>
      </form>

      {/* Currency Summary Cards + Cycle Time */}
      {data.currencySummaries.map((cur) => (
        <section key={cur.currency} className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <h2 className="font-display text-sm font-semibold text-slate-950">
              {cur.currency} Recovery Funnel ({data.totalCases} matching cases)
            </h2>
            <span className="text-xs text-slate-600">
              Realized Recovery Rate:{' '}
              <strong className="font-mono text-slate-950 tabular-nums">
                {formatBpsAsPercent(cur.recoveryRateBps)}
              </strong>
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-xs">
            <div>
              <p className="text-slate-500">Potentially Recoverable</p>
              <p className="mt-1 font-mono text-base font-semibold text-slate-900 tabular-nums">
                {formatCents(cur.potentialIdentifiedCents, cur.currency)}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Submitted</p>
              <p className="mt-1 font-mono text-base font-semibold text-slate-900 tabular-nums">
                {formatCents(cur.submittedCents, cur.currency)}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Approved</p>
              <p className="mt-1 font-mono text-base font-semibold text-sky-700 tabular-nums">
                {formatCents(cur.approvedCents, cur.currency)}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Expected Credits (Pending)</p>
              <p className="mt-1 font-mono text-base font-semibold text-amber-700 tabular-nums">
                {formatCents(cur.expectedCreditsCents, cur.currency)}
              </p>
            </div>
            <div>
              <p className="text-emerald-800 font-medium">Actual Recovered</p>
              <p className="mt-1 font-mono text-base font-bold text-emerald-700 tabular-nums">
                {formatCents(cur.actualRecoveredCents, cur.currency)}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Outstanding Balance</p>
              <p className="mt-1 font-mono text-base font-semibold text-slate-900 tabular-nums">
                {formatCents(cur.outstandingCents, cur.currency)}
              </p>
            </div>
          </div>
        </section>
      ))}

      {/* Cycle Time Benchmarks */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-600">Mean Time to Claim Submission</p>
            <p className="text-[11px] text-slate-500">Incident date to formal claim dispatch</p>
          </div>
          <p className="font-mono text-xl font-bold text-slate-950 tabular-nums">
            {data.avgDaysToSubmission !== null ? `${data.avgDaysToSubmission} days` : '-'}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-600">Mean Time to Cash / Credit Settlement</p>
            <p className="text-[11px] text-slate-500">Submission date to full recovery</p>
          </div>
          <p className="font-mono text-xl font-bold text-slate-950 tabular-nums">
            {data.avgDaysToSettlement !== null ? `${data.avgDaysToSettlement} days` : '-'}
          </p>
        </div>
      </section>

      {/* Supplier & Incident Breakdown Tables */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Recovery by Supplier (Per Currency)
            </h2>
          </div>
          {data.supplierBreakdown.length === 0 ? (
            <p className="px-5 py-6 text-xs text-slate-500">No cases match selected filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Supplier</th>
                    <th className="px-4 py-2.5 font-medium text-right">Cases</th>
                    <th className="px-4 py-2.5 font-medium text-right">Submitted</th>
                    <th className="px-4 py-2.5 font-medium text-right">Approved</th>
                    <th className="px-4 py-2.5 font-medium text-right">Actual Recovered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.supplierBreakdown.map((row) => (
                    <tr key={`${row.supplierId}:${row.currency}`}>
                      <td className="px-4 py-2.5 font-medium text-slate-900">
                        <Link href={`/app/suppliers/${row.supplierId}`} className="hover:underline">
                          {row.supplierName}
                        </Link>
                        <span className="ml-1.5 font-mono text-[11px] text-slate-500">{row.currency}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{row.caseCount}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {formatCents(row.submittedCents, row.currency)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-sky-700 tabular-nums">
                        {formatCents(row.approvedCents, row.currency)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                        {formatCents(row.recoveredCents, row.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Recovery by Incident Category
            </h2>
          </div>
          {data.incidentBreakdown.length === 0 ? (
            <p className="px-5 py-6 text-xs text-slate-500">No cases match selected filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Category</th>
                    <th className="px-4 py-2.5 font-medium text-right">Cases</th>
                    <th className="px-4 py-2.5 font-medium text-right">Claimable</th>
                    <th className="px-4 py-2.5 font-medium text-right">Actual Recovered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.incidentBreakdown.map((row) => (
                    <tr key={`${row.incidentType}:${row.currency}`}>
                      <td className="px-4 py-2.5 font-medium text-slate-900">
                        {row.label}
                        <span className="ml-1.5 font-mono text-[11px] text-slate-500">{row.currency}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{row.caseCount}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {formatCents(row.recoverableCents, row.currency)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                        {formatCents(row.recoveredCents, row.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
