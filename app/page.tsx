'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, Check, FileSpreadsheet, FileText, Scale, ShieldCheck } from 'lucide-react';
import { PublicHeader } from '@/components/public-header';
import { PublicFooter } from '@/components/public-footer';
import { PLANS } from '@/lib/domain/billing';

export default function LandingPage() {
  const router = useRouter();
  const [openingDemo, setOpeningDemo] = useState(false);

  async function launchDemo() {
    setOpeningDemo(true);
    try {
      const res = await fetch('/api/auth/session', { method: 'POST' });
      if (res.ok) {
        router.push('/app');
        router.refresh();
      }
    } finally {
      setOpeningDemo(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <PublicHeader />

      <main>
        {/* Hero Section */}
        <section className="mx-auto max-w-[1280px] px-6 pt-16 pb-14">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            <div className="lg:col-span-6">
              <p className="text-xs font-medium tracking-wide text-sky-700">
                Operational Supplier Recovery for Industrial Manufacturing &amp; Distribution
              </p>
              <h1
                className="mt-4 font-display font-bold tracking-tight text-slate-950 text-balance"
                style={{ fontSize: 'clamp(2.25rem, 4vw, 3.35rem)', lineHeight: 1.12 }}
              >
                Find the money lost to supplier failures. Document it. Claim it. Track the recovery.
              </h1>
              <p className="mt-5 text-base leading-relaxed text-slate-600 max-w-[58ch]">
                ERPs record purchase orders and receipts, but supplier recovery still breaks across spreadsheets, emails, and manual debit notes. Supplier Recovery Desk connects discrepancies, evidence, cost breakdowns, and credit reconciliation into one auditable ledger.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={launchDemo}
                  disabled={openingDemo}
                  className="inline-flex items-center gap-2 rounded-md bg-[#0F172A] px-5 py-3 text-sm font-medium text-white hover:bg-[#1E293B] transition-colors cursor-pointer disabled:opacity-60"
                >
                  <span>{openingDemo ? 'Entering Demo Workspace...' : 'Explore Live Demo Workspace'}</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <Link
                  href="/auth/signup"
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-800 hover:bg-slate-50 transition-colors"
                >
                  Create Organization Account
                </Link>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-200 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
                <span>Works alongside SAP, NetSuite, Dynamics &amp; Epicor</span>
                <span aria-hidden="true">·</span>
                <span>CSV-first onboarding</span>
                <span aria-hidden="true">·</span>
                <span>Decimal-safe multi-currency ledger</span>
              </div>
            </div>

            {/* Real In-App Visual Example (Illustrative Demo Data) */}
            <div className="lg:col-span-6 rounded-lg border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Illustrative Recovery Ledger · Synthetic Demo Data
                  </p>
                  <h2 className="mt-1 font-display text-base font-semibold text-slate-900">
                    Apex Precision Components LLC (USD Portfolio)
                  </h2>
                </div>
                <span className="text-xs font-mono text-slate-500">Multi-stage separation</span>
              </div>

              <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="border-b border-slate-100 pb-3">
                  <p className="text-xs text-slate-500">Potential Identified</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">$19,264.00</p>
                </div>
                <div className="border-b border-slate-100 pb-3">
                  <p className="text-xs text-slate-500">Submitted to Suppliers</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">$20,870.00</p>
                </div>
                <div className="border-b border-slate-100 pb-3">
                  <p className="text-xs text-slate-500">Approved by Suppliers</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-sky-700 tabular-nums">$15,030.00</p>
                </div>
                <div className="pb-1">
                  <p className="text-xs text-slate-500">Expected Credits</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-amber-700 tabular-nums">$6,000.00</p>
                </div>
                <div className="pb-1">
                  <p className="text-xs text-slate-500">Actual Recovered</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-emerald-700 tabular-nums">$7,920.00</p>
                </div>
                <div className="pb-1">
                  <p className="text-xs text-slate-500">Outstanding Balance</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">$12,724.00</p>
                </div>
              </div>

              <div className="mt-5 border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between text-xs font-medium text-slate-500 pb-2">
                  <span>Case / Supplier</span>
                  <span>Approved vs. Actual Received</span>
                </div>
                <div className="divide-y divide-slate-100 text-xs">
                  <div className="py-2.5 flex items-center justify-between gap-4">
                    <div>
                      <span className="font-mono font-medium text-slate-900">SRD-2026-001</span>
                      <span className="text-slate-400 mx-1.5">·</span>
                      <span className="text-slate-700">Cobalt Elastomers (Short shipment)</span>
                    </div>
                    <span className="font-mono text-emerald-700 tabular-nums">$3,420.00 / $3,420.00</span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between gap-4">
                    <div>
                      <span className="font-mono font-medium text-slate-900">SRD-2026-002</span>
                      <span className="text-slate-400 mx-1.5">·</span>
                      <span className="text-slate-700">Vanguard Forging (Hardness NCR)</span>
                    </div>
                    <span className="font-mono text-amber-700 tabular-nums">$7,200.00 / $4,500.00</span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between gap-4">
                    <div>
                      <span className="font-mono font-medium text-slate-900">SRD-2026-003</span>
                      <span className="text-slate-400 mx-1.5">·</span>
                      <span className="text-slate-700">Midwest Fastener (Price variance)</span>
                    </div>
                    <span className="font-mono text-slate-600 tabular-nums">$3,300.00 / $0.00</span>
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-slate-500">
                  Promised credit memos and supplier approvals are tracked separately and never counted as cash recovered until a settlement transaction is reconciled.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Operational Problem */}
        <section className="border-y border-slate-200 bg-white">
          <div className="mx-auto max-w-[1280px] px-6 py-14">
            <div className="max-w-2xl">
              <h2 className="font-display text-2xl font-bold tracking-tight text-slate-950">
                Why supplier losses disappear between quality, receiving, and AP
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Receiving logs short quantities and dock damage. Supplier quality teams write non-conformance reports and organize containment sorting. Finance catches unit-price overcharges weeks later. Without a dedicated recovery workspace, claims stall after an email is sent-and promised credit notes go uncollected.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-4 gap-8 border-t border-slate-200 pt-8">
              <div>
                <FileSpreadsheet className="h-5 w-5 text-sky-700" aria-hidden="true" />
                <h3 className="mt-3 font-display text-base font-semibold text-slate-900">
                  01. CSV-First Ingestion
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Import suppliers, POs, goods receipts, invoices, and quality incidents from any ERP export with column mapping and row-level validation.
                </p>
              </div>
              <div>
                <Scale className="h-5 w-5 text-sky-700" aria-hidden="true" />
                <h3 className="mt-3 font-display text-base font-semibold text-slate-900">
                  02. Deterministic Rules
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Flag price variances, quantity overbilling, short receipts, rejections, and duplicate invoices against organization-configured tolerances.
                </p>
              </div>
              <div>
                <FileText className="h-5 w-5 text-sky-700" aria-hidden="true" />
                <h3 className="mt-3 font-display text-base font-semibold text-slate-900">
                  03. Evidence &amp; Dossiers
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Quantify material, sorting labour, rework, scrap, and freight with inspectable formulas, private evidence storage, and PDF claim dossiers.
                </p>
              </div>
              <div>
                <ShieldCheck className="h-5 w-5 text-sky-700" aria-hidden="true" />
                <h3 className="mt-3 font-display text-base font-semibold text-slate-900">
                  04. True Reconciliation
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Track supplier responses, partial credit memos, and bank refunds separately from claims submitted or verbally approved.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Connected 10-Step Workflow */}
        <section id="workflow" className="mx-auto max-w-[1280px] px-6 py-16">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-6">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight text-slate-950">
                One connected recovery workflow from incident to reconciled credit
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Designed for controllers, purchasing leads, supplier quality engineers, and plant managers.
              </p>
            </div>
            <Link href="/features" className="text-sm font-medium text-sky-700 hover:text-sky-800 whitespace-nowrap">
              Inspect full capability matrix →
            </Link>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
            {[
              ['01. Capture loss events', 'Ingest ERP CSV exports or log an incident manually with PO, goods receipt, and invoice links.'],
              ['02. Review discrepancy leads', 'Inspect exact comparison values, variances, and applied tolerances before deciding to raise a claim.'],
              ['03. Build itemized cost formulas', 'Separate gross operational loss from contractually recoverable amounts with hourly rate assumptions and override audit logs.'],
              ['04. Complete incident checklists', 'Track required NCRs, receiving dock tallies, photos, and freight bills in private tenant-isolated storage.'],
              ['05. Generate PDF dossier & email draft', 'Export a real-data claim dossier PDF and review a neutral, factual supplier communication draft before sending.'],
              ['06. Reconcile partial & full settlements', 'Record credit memo promises separately from actual credit/refund transactions until the balance reaches zero.'],
            ].map(([title, desc]) => (
              <div key={title} className="border-b border-slate-200 pb-5">
                <h3 className="font-display text-base font-semibold text-slate-900">{title}</h3>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing Preview */}
        <section className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-[1280px] px-6 py-16">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-bold tracking-tight text-slate-950">
                  Commercial Plans
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Structured around team seats, monthly case volume, and multi-plant reporting. Pricing tiers below are initial commercial plans.
                </p>
              </div>
              <Link href="/pricing" className="text-sm font-medium text-sky-700 hover:text-sky-800 whitespace-nowrap">
                Full plan comparison →
              </Link>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-6">
              {Object.values(PLANS).map((plan) => (
                <div key={plan.tier} className="rounded-lg border border-slate-200 bg-[#F8FAFC] p-5 flex flex-col justify-between">
                  <div>
                    <h3 className="font-display text-base font-semibold text-slate-950">{plan.name}</h3>
                    <p className="mt-1 text-xs text-slate-600 min-h-[32px]">{plan.audience}</p>
                    <p className="mt-4 font-mono text-2xl font-bold text-slate-950 tabular-nums">
                      {plan.monthlyPriceUsd ? `$${plan.monthlyPriceUsd.toLocaleString()}/mo` : 'Custom'}
                    </p>
                    <ul className="mt-5 space-y-2.5 text-xs text-slate-700">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <Check className="h-3.5 w-3.5 text-sky-700 shrink-0 mt-0.5" aria-hidden="true" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Link
                    href="/auth/signup"
                    className="mt-6 block w-full rounded-md border border-slate-300 bg-white py-2 text-center text-xs font-medium text-slate-900 hover:bg-slate-50 transition-colors"
                  >
                    {plan.monthlyPriceUsd ? 'Start Workspace' : 'Request Scoping'}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-[1280px] px-6 py-16">
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-950">
            Frequently Asked Questions
          </h2>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                Does Supplier Recovery Desk replace our ERP?
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                No. It sits alongside SAP, NetSuite, Microsoft Dynamics, Epicor, or QuickBooks as the operational layer for turning receiving, quality, and invoice discrepancies into documented claims and reconciled credits.
              </p>
            </div>
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                Are financial totals calculated by AI?
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Never. Every price variance, quantity variance, cost breakdown, and settlement balance uses deterministic decimal-safe integer arithmetic. Optional AI only assists with extracting text or drafting communications for human approval.
              </p>
            </div>
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                Will the system ever email a supplier automatically?
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                No. Supplier communications are always saved as drafts first and require explicit human review and approval before copying, exporting, or sending.
              </p>
            </div>
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                How is multi-currency recovery handled?
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Every claim, cost item, and settlement stores an explicit ISO currency code. Totals are grouped strictly by currency rather than silently combining USD and EUR.
              </p>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
