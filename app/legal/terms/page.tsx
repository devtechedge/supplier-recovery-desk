import { PublicHeader } from '@/components/public-header';
import { PublicFooter } from '@/components/public-footer';

export default function TermsDraftPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-xs font-semibold text-amber-700">
          DRAFT PLACEHOLDER - REQUIRES LEGAL COUNSEL REVIEW BEFORE COMMERCIAL LAUNCH
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold text-slate-950">Terms of Service (Draft)</h1>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-slate-700">
          <p>
            This document is a placeholder draft requiring legal review prior to commercial contracting.
          </p>
          <p>
            1. Operational Decision Support: Supplier Recovery Desk provides discrepancy detection, cost calculation, and evidence tracking tools. Detected discrepancies represent investigation leads, not legal determinations of supplier liability.
          </p>
          <p>
            2. Human Authorization: Customer personnel remain solely responsible for verifying contractual terms, approving claim dossiers, and authorizing external supplier communications.
          </p>
          <p>
            3. Billing &amp; Usage Limits: Subscription tiers (Starter, Growth, Scale, Enterprise) govern seat counts, monthly case volume, and CSV import limits.
          </p>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
