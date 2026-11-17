import Link from 'next/link';
import { PublicHeader } from '@/components/public-header';
import { PublicFooter } from '@/components/public-footer';
import { PLANS } from '@/lib/domain/billing';

export default function PricingPage() {
  const tiers = Object.values(PLANS);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <PublicHeader />
      <main className="mx-auto max-w-[1280px] px-6 py-16">
        <div className="max-w-2xl">
          <p className="text-xs font-medium text-sky-700">Commercial Plans</p>
          <h1 className="mt-3 font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-950">
            Transparent limits for single-plant and multi-site recovery teams
          </h1>
          <p className="mt-3 text-sm text-slate-600 leading-relaxed">
            All core deterministic workflows-CSV imports, discrepancy detection, case management, evidence checklists, PDF dossiers, and settlement tracking-work without relying on AI add-ons.
          </p>
        </div>

        <div className="mt-10 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
              <tr>
                <th className="px-5 py-3.5">Capability / Limit</th>
                {tiers.map((t) => (
                  <th key={t.tier} className="px-5 py-3.5">
                    <div>{t.name}</div>
                    <div className="mt-0.5 font-mono text-sm font-bold text-slate-950 tabular-nums">
                      {t.monthlyPriceUsd ? `$${t.monthlyPriceUsd.toLocaleString()}/mo` : 'Custom'}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs sm:text-sm">
              <tr>
                <td className="px-5 py-3 font-medium text-slate-800">Team seats</td>
                {tiers.map((t) => (
                  <td key={t.tier} className="px-5 py-3 font-mono tabular-nums text-slate-700">
                    Up to {t.maxSeats}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-5 py-3 font-medium text-slate-800">Monthly recovery cases</td>
                {tiers.map((t) => (
                  <td key={t.tier} className="px-5 py-3 font-mono tabular-nums text-slate-700">
                    {t.maxMonthlyCases.toLocaleString()}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-5 py-3 font-medium text-slate-800">Monthly CSV import rows</td>
                {tiers.map((t) => (
                  <td key={t.tier} className="px-5 py-3 font-mono tabular-nums text-slate-700">
                    {t.maxMonthlyImportRows.toLocaleString()}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-5 py-3 font-medium text-slate-800">Optional AI document assists / mo</td>
                {tiers.map((t) => (
                  <td key={t.tier} className="px-5 py-3 font-mono tabular-nums text-slate-700">
                    {t.maxMonthlyAiRequests === 0 ? 'Not included' : t.maxMonthlyAiRequests.toLocaleString()}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-5 py-3 font-medium text-slate-800">PDF claim dossier generation</td>
                {tiers.map((t) => (
                  <td key={t.tier} className="px-5 py-3 text-slate-700">
                    {t.dossierGeneration ? 'Included' : '-'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-5 py-3 font-medium text-slate-800">Configurable workflow transitions</td>
                {tiers.map((t) => (
                  <td key={t.tier} className="px-5 py-3 text-slate-700">
                    {t.configurableWorkflows ? 'Included' : 'Standard lifecycle'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-slate-500">
            Pricing figures shown represent illustrative initial commercial tiers and are configurable per organization subscription.
          </p>
          <Link
            href="/auth/signup"
            className="rounded-md bg-[#0F172A] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1E293B]"
          >
            Create Organization Account
          </Link>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
