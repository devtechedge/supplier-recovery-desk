import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getActiveOrgContext } from '@/lib/auth/session';
import { getOverviewDashboardData } from '@/lib/services/dashboard';
import { formatBpsAsPercent, formatCents } from '@/lib/domain/money';
import { CaseStatusLabel } from '@/components/status-badge';

export const dynamic = 'force-dynamic';

export default async function OverviewDashboardPage() {
  const ctx = await getActiveOrgContext();
  if (!ctx) redirect('/auth/signin');

  const data = getOverviewDashboardData(ctx.organization.id);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950">
            Recovery Overview
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Actual recovered cash and credits reconciled against submitted, approved, and identified supplier losses. Grouped strictly by currency.
          </p>
        </div>
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 text-xs text-slate-600 shrink-0 whitespace-nowrap">
          <span>
            Open discrepancy leads:{' '}
            <Link href="/app/imports#leads" className="font-mono font-semibold text-sky-700 hover:underline tabular-nums">
              {data.openLeadCount}
            </Link>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Active cases:{' '}
            <Link href="/app/cases" className="font-mono font-semibold text-slate-900 hover:underline tabular-nums">
              {data.totalCases}
            </Link>
          </span>
        </div>
      </div>

      {/* Multi-Currency Recovery KPIs */}
      {data.currencySummaries.map((cur) => (
        <section key={cur.currency} aria-label={`${cur.currency} recovery ledger`} className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-slate-800">
              {cur.currency} Recovery Ledger
            </h2>
            <span className="text-xs text-slate-500">
              Recovery rate (Actual Recovered / Submitted):{' '}
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {formatBpsAsPercent(cur.recoveryRateBps)}
              </span>
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="rounded-lg border border-emerald-200 bg-white p-4">
              <p className="text-xs font-medium text-emerald-800">Actual Recovered</p>
              <p className="mt-1.5 font-mono text-xl font-bold text-emerald-700 tabular-nums">
                {formatCents(cur.actualRecoveredCents, cur.currency)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Settled &amp; reconciled</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-600">Expected Credits</p>
              <p className="mt-1.5 font-mono text-xl font-semibold text-amber-700 tabular-nums">
                {formatCents(cur.expectedCreditsCents, cur.currency)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Promised, not yet received</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-600">Approved by Suppliers</p>
              <p className="mt-1.5 font-mono text-xl font-semibold text-sky-700 tabular-nums">
                {formatCents(cur.approvedCents, cur.currency)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Supplier accepted</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-600">Submitted Claims</p>
              <p className="mt-1.5 font-mono text-xl font-semibold text-slate-900 tabular-nums">
                {formatCents(cur.submittedCents, cur.currency)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Formally claimed</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-600">Potentially Recoverable</p>
              <p className="mt-1.5 font-mono text-xl font-semibold text-slate-900 tabular-nums">
                {formatCents(cur.potentialIdentifiedCents, cur.currency)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Documented case total</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-600">Outstanding Balance</p>
              <p className="mt-1.5 font-mono text-xl font-semibold text-slate-900 tabular-nums">
                {formatCents(cur.outstandingCents, cur.currency)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Uncollected remainder</p>
            </div>
          </div>
        </section>
      ))}

      {/* Claims by Status & Cycle Times */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h2 className="font-display text-sm font-semibold text-slate-900">Claims by Status</h2>
            <Link href="/app/cases" className="text-xs font-medium text-sky-700 hover:underline">
              View all cases →
            </Link>
          </div>
          {data.claimsByStatus.length === 0 ? (
            <p className="py-6 text-sm text-slate-500">
              No recovery cases yet. Import ERP CSV data or create your first manual case.
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {data.claimsByStatus.map((s) => (
                <Link
                  key={s.status}
                  href={`/app/cases?status=${s.status}`}
                  className="rounded-md border border-slate-200 px-3 py-2.5 hover:bg-slate-50 transition-colors flex items-center justify-between gap-2"
                >
                  <CaseStatusLabel status={s.status} />
                  <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                    {s.count}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-4 rounded-lg border border-slate-200 bg-white p-5 flex flex-col justify-between">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900 border-b border-slate-200 pb-3">
              Resolution Velocity
            </h2>
            <div className="mt-4 space-y-4">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-600">Avg. incident to submission</span>
                <span className="font-mono text-lg font-semibold text-slate-900 tabular-nums">
                  {data.avgDaysToSubmission !== null ? `${data.avgDaysToSubmission} days` : '-'}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-600">Avg. submission to recovery</span>
                <span className="font-mono text-lg font-semibold text-slate-900 tabular-nums">
                  {data.avgDaysToSettlement !== null ? `${data.avgDaysToSettlement} days` : '-'}
                </span>
              </div>
            </div>
          </div>
          {data.openLeadsByCurrency.length > 0 && (
            <div className="mt-4 border-t border-slate-200 pt-3">
              <p className="text-xs text-slate-500">Unreviewed discrepancy leads</p>
              <div className="mt-1 flex flex-wrap gap-3 text-xs font-mono font-semibold text-sky-700 tabular-nums">
                {data.openLeadsByCurrency.map((l) => (
                  <span key={l.currency}>{formatCents(l.totalCents, l.currency)} ({l.currency})</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Overdue Responses & Upcoming Deadlines */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Overdue Supplier Responses
            </h2>
            <span className="font-mono text-xs font-semibold text-red-700 tabular-nums">
              {data.overdueResponses.length} overdue
            </span>
          </div>
          {data.overdueResponses.length === 0 ? (
            <p className="px-5 py-6 text-xs text-slate-500">No overdue supplier responses.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Case</th>
                    <th className="px-4 py-2.5 font-medium">Supplier</th>
                    <th className="px-4 py-2.5 font-medium">Deadline</th>
                    <th className="px-4 py-2.5 font-medium text-right">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.overdueResponses.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono font-medium">
                        <Link href={`/app/cases/${row.id}`} className="text-sky-700 hover:underline">
                          {row.caseNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-slate-800">{row.supplierName}</td>
                      <td className="px-4 py-2.5 font-mono text-red-700 tabular-nums">{row.responseDeadline}</td>
                      <td className="px-4 py-2.5 font-mono text-right text-slate-900 tabular-nums">
                        {formatCents(row.submittedAmountCents, row.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Upcoming Deadlines
            </h2>
            <span className="font-mono text-xs text-slate-500 tabular-nums">
              {data.upcomingDeadlines.length} scheduled
            </span>
          </div>
          {data.upcomingDeadlines.length === 0 ? (
            <p className="px-5 py-6 text-xs text-slate-500">No upcoming case deadlines.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Case</th>
                    <th className="px-4 py-2.5 font-medium">Supplier</th>
                    <th className="px-4 py-2.5 font-medium">Due</th>
                    <th className="px-4 py-2.5 font-medium text-right">Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.upcomingDeadlines.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono font-medium">
                        <Link href={`/app/cases/${row.id}`} className="text-sky-700 hover:underline">
                          {row.caseNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-slate-800">{row.supplierName}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-700 tabular-nums">{row.responseDeadline}</td>
                      <td className="px-4 py-2.5 font-mono text-right text-slate-900 tabular-nums">
                        {formatCents(row.outstandingCents, row.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Supplier Recovery Trends & Recent Activity */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Supplier Recovery Breakdown
            </h2>
            <Link href="/app/reports" className="text-xs font-medium text-sky-700 hover:underline">
              Full reports →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Supplier</th>
                  <th className="px-4 py-2.5 font-medium text-right">Cases</th>
                  <th className="px-4 py-2.5 font-medium text-right">Submitted</th>
                  <th className="px-4 py-2.5 font-medium text-right">Approved</th>
                  <th className="px-4 py-2.5 font-medium text-right">Recovered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.supplierBreakdown.map((row) => (
                  <tr key={`${row.supplierId}:${row.currency}`} className="hover:bg-slate-50">
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
        </div>

        <div className="lg:col-span-5 rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h2 className="font-display text-sm font-semibold text-slate-900">Recent Activity</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {data.recentActivity.length === 0 ? (
              <p className="px-5 py-6 text-xs text-slate-500">No claim activity recorded yet.</p>
            ) : (
              data.recentActivity.map((act) => (
                <div key={act.id} className="px-5 py-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/app/cases/${act.caseId}`} className="font-mono font-semibold text-sky-700 hover:underline">
                      {act.caseNumber}
                    </Link>
                    <span className="text-[11px] text-slate-500">{act.actorName}</span>
                  </div>
                  <p className="mt-1 text-slate-700 leading-relaxed">{act.summary}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
