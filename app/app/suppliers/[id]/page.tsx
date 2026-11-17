import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react';
import { getDb } from '@/lib/db';
import { getActiveOrgContext } from '@/lib/auth/session';
import { formatBpsAsPercent, formatCents, calculateRecoveryRateBps } from '@/lib/domain/money';
import { INCIDENT_TYPE_LABELS, type CaseStatus, type IncidentType } from '@/lib/domain/workflow';
import { CaseStatusLabel } from '@/components/status-badge';

export const dynamic = 'force-dynamic';

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getActiveOrgContext();
  if (!ctx) redirect('/auth/signin');

  const { id } = await params;
  const db = getDb();

  const supplier = db
    .prepare('SELECT * FROM suppliers WHERE id = ? AND organization_id = ?')
    .get(id, ctx.organization.id) as Record<string, unknown> | undefined;

  if (!supplier) {
    notFound();
  }

  const contacts = db
    .prepare('SELECT * FROM supplier_contacts WHERE supplier_id = ? AND organization_id = ? ORDER BY is_primary DESC')
    .all(id, ctx.organization.id) as Array<Record<string, unknown>>;

  const terms = db
    .prepare('SELECT * FROM supplier_terms WHERE supplier_id = ? AND organization_id = ?')
    .all(id, ctx.organization.id) as Array<Record<string, unknown>>;

  const cases = db
    .prepare('SELECT * FROM recovery_cases WHERE supplier_id = ? AND organization_id = ? ORDER BY created_at DESC')
    .all(id, ctx.organization.id) as Array<Record<string, unknown>>;

  const activeCases = cases.filter((c) => c.status !== 'cancelled');
  const currencies = Array.from(
    new Set(activeCases.map((c) => String(c.currency || supplier.default_currency || 'USD')))
  );
  if (currencies.length === 0) currencies.push(String(supplier.default_currency || 'USD'));

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-5">
        <Link href="/app/suppliers" className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-950">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Back to Suppliers</span>
        </Link>
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded">
                {String(supplier.supplier_code)}
              </span>
              <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950">
                {String(supplier.name)}
              </h1>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              {String(supplier.category)} · Country: {String(supplier.country)} · Net {String(supplier.payment_terms_days)} days · Default currency: {String(supplier.default_currency)}
            </p>
          </div>
          <Link
            href="/app/cases?new=1"
            className="rounded-md bg-[#0F172A] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#1E293B] whitespace-nowrap"
          >
            New Claim for Supplier
          </Link>
        </div>
      </div>

      {/* Recorded Financial Performance Indicators */}
      {currencies.map((cur) => {
        const subset = activeCases.filter((c) => String(c.currency) === cur);
        const submitted = subset.reduce((a, c) => a + Number(c.submitted_amount_cents || 0), 0);
        const approved = subset.reduce((a, c) => a + Number(c.approved_amount_cents || 0), 0);
        const recovered = subset.reduce((a, c) => a + Number(c.recovered_amount_cents || 0), 0);
        const rateBps = calculateRecoveryRateBps(recovered, submitted);
        const disputedCount = subset.filter((c) => c.status === 'disputed').length;

        return (
          <section key={cur} className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-slate-900">
                {cur} Recorded Recovery Performance
              </h2>
              <span className="text-[11px] text-slate-500">
                Calculated strictly from {subset.length} recorded non-cancelled cases in {cur}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">Submitted</p>
                <p className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
                  {formatCents(submitted, cur)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">Supplier Approved</p>
                <p className="mt-1 font-mono text-lg font-semibold text-sky-700 tabular-nums">
                  {formatCents(approved, cur)}
                </p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-white p-4">
                <p className="text-xs text-emerald-800">Actual Recovered</p>
                <p className="mt-1 font-mono text-lg font-bold text-emerald-700 tabular-nums">
                  {formatCents(recovered, cur)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">Realized Recovery Rate</p>
                <p className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
                  {formatBpsAsPercent(rateBps)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">Currently Disputed</p>
                <p className="mt-1 font-mono text-lg font-semibold text-red-700 tabular-nums">
                  {disputedCount}
                </p>
              </div>
            </div>
          </section>
        );
      })}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="font-display text-sm font-semibold text-slate-900 border-b border-slate-200 pb-3">
            Claims &amp; Quality Contacts
          </h2>
          {contacts.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">No contacts stored for this supplier yet.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {contacts.map((ct) => (
                <div key={String(ct.id)} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0 text-xs">
                  <div>
                    <p className="font-semibold text-slate-900">{String(ct.name)}</p>
                    <p className="text-slate-500">{String(ct.role)}</p>
                  </div>
                  <div className="text-right font-mono text-slate-700">
                    <p className="inline-flex items-center gap-1">
                      <Mail className="h-3 w-3 text-slate-400" aria-hidden="true" />
                      <span>{String(ct.email)}</span>
                    </p>
                    {ct.phone ? <p className="text-[11px] text-slate-500">{String(ct.phone)}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="font-display text-sm font-semibold text-slate-900 border-b border-slate-200 pb-3">
            Supply Agreement &amp; Recovery Terms
          </h2>
          {terms.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">No formal supply terms recorded yet.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {terms.map((tm) => (
                <div key={String(tm.id)} className="text-xs">
                  <p className="font-semibold text-slate-900 inline-flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                    <span>{String(tm.agreement_title)}</span>
                  </p>
                  <p className="mt-1 text-slate-600 leading-relaxed">{String(tm.terms_summary)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Cases for this supplier */}
      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-3.5">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Related Recovery Cases ({cases.length})
          </h2>
        </div>
        {cases.length === 0 ? (
          <p className="px-5 py-6 text-xs text-slate-500">No recovery cases logged against this supplier.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Case #</th>
                  <th className="px-4 py-2.5 font-medium">Title</th>
                  <th className="px-4 py-2.5 font-medium">Incident</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium text-right">Submitted</th>
                  <th className="px-4 py-2.5 font-medium text-right">Recovered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cases.map((c) => (
                  <tr key={String(c.id)} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono font-semibold">
                      <Link href={`/app/cases/${String(c.id)}`} className="text-sky-700 hover:underline">
                        {String(c.case_number)}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-slate-900">{String(c.title)}</td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {INCIDENT_TYPE_LABELS[String(c.incident_type) as IncidentType] ?? String(c.incident_type)}
                    </td>
                    <td className="px-4 py-2.5">
                      <CaseStatusLabel status={String(c.status) as CaseStatus} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {formatCents(Number(c.submitted_amount_cents || 0), String(c.currency))}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                      {formatCents(Number(c.recovered_amount_cents || 0), String(c.currency))}
                    </td>
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
