import { PublicHeader } from '@/components/public-header';
import { PublicFooter } from '@/components/public-footer';

export default function PrivacyDraftPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-xs font-semibold text-amber-700">
          DRAFT PLACEHOLDER - REQUIRES LEGAL COUNSEL REVIEW BEFORE COMMERCIAL LAUNCH
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold text-slate-950">Privacy Policy (Draft)</h1>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-slate-700">
          <p>
            This document is an operational draft outlining data-handling architecture for Supplier Recovery Desk. It has not been reviewed or approved as final legal counsel documentation.
          </p>
          <p>
            1. Tenant Data Isolation: Organization purchasing records, supplier contacts, evidence attachments, and settlement logs are partitioned by organization identifier and enforced server-side.
          </p>
          <p>
            2. Private Evidence Storage: Uploaded documents are stored in private storage buckets and accessed exclusively via short-lived signed URLs after membership verification.
          </p>
          <p>
            3. Optional AI Processing: When workspace administrators explicitly enable AI document assistance, submitted text snippets are transmitted to the configured AI provider solely for structured extraction or draft assistance. AI processing can be disabled at any time in Organization Settings.
          </p>
          <p>
            4. Export &amp; Deletion: Organization owners can export structured organization records in JSON/CSV and submit a workspace deletion request from Settings.
          </p>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
