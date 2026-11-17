import Link from 'next/link';
import { PublicHeader } from '@/components/public-header';
import { PublicFooter } from '@/components/public-footer';

const CAPABILITIES = [
  {
    title: '01. Six-Template CSV Ingestion Wizard',
    detail:
      'Import Suppliers, Purchase Orders, Goods Receipts, Supplier Invoices, Quality Incidents, and Additional Loss Costs. Preview row-level Zod validation errors, duplicate keys, and unmatched PO/supplier references before committing.',
  },
  {
    title: '02. Deterministic Discrepancy Rules Engine',
    detail:
      'Evaluate invoice unit price vs. PO unit price, invoiced quantity vs. goods receipt quantity, short shipments, rejected/damaged lots, late deliveries, and duplicate invoices against organization-specific tolerances.',
  },
  {
    title: '03. Inspectable Cost Engine (Decimal-Safe)',
    detail:
      'Calculate material loss, sorting labour, rework, scrap, downtime, overtime, and expedite freight in integer minor units. Preserve manual recoverable overrides with required audit justification.',
  },
  {
    title: '04. Private Evidence & Tailored Checklists',
    detail:
      'Tailor required evidence checklists per incident type (short shipment, quality NCR, price variance, damaged arrival). Store files in private buckets accessed only via short-lived signed URLs.',
  },
  {
    title: '05. Claim Dossier PDF & Human-Approved Drafts',
    detail:
      'Generate downloadable PDF dossiers directly from saved case records. Draft factual supplier communications with optional Gemini AI assistance-never auto-sent without explicit human approval.',
  },
  {
    title: '06. Settlement & Partial Recovery Ledger',
    detail:
      'Keep approved credits and promised credit memos separate from cash or applied credit transactions actually received, maintaining an accurate outstanding recoverable balance.',
  },
];

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <PublicHeader />
      <main className="mx-auto max-w-[1280px] px-6 py-16">
        <div className="max-w-3xl">
          <p className="text-xs font-medium text-sky-700">Product Architecture</p>
          <h1 className="mt-3 font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 text-balance">
            Built for finance, procurement, and supplier quality teams who need defensible recovery records
          </h1>
          <p className="mt-4 text-base text-slate-600 leading-relaxed">
            Supplier Recovery Desk focuses exclusively on the post-incident financial recovery lifecycle-from discrepancy detection through credit reconciliation.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8">
          {CAPABILITIES.map((cap) => (
            <div key={cap.title} className="rounded-lg border border-slate-200 bg-white p-6">
              <h2 className="font-display text-lg font-semibold text-slate-950">{cap.title}</h2>
              <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">{cap.detail}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-lg border border-slate-200 bg-white p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <h2 className="font-display text-xl font-semibold text-slate-950">
              Inspect the live demo environment
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Explore pre-seeded industrial suppliers, open discrepancy leads, disputed claims, and partial settlements.
            </p>
          </div>
          <Link
            href="/auth/signin"
            className="rounded-md bg-[#0F172A] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1E293B] whitespace-nowrap"
          >
            Sign in or Launch Demo
          </Link>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
