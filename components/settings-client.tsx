'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CheckCircle2, CreditCard, Download, ShieldAlert, Trash2, UserPlus } from 'lucide-react';
import { PLANS, PLAN_TIERS, type PlanTier } from '@/lib/domain/billing';
import { ORG_ROLES, type OrgRole } from '@/lib/domain/permissions';

interface MemberRow {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  job_title: string | null;
  role: OrgRole;
  status: string;
}

interface SettingsClientProps {
  organization: {
    id: string;
    name: string;
    isDemo: boolean;
    defaultCurrency: string;
    priceTolerancePctBps: number;
    priceToleranceAbsCents: number;
    qtyTolerancePctBps: number;
    qtyToleranceAbs: number;
    defaultSortingHourlyCents: number;
    defaultReworkHourlyCents: number;
    defaultDowntimeHourlyCents: number;
    defaultOvertimeHourlyCents: number;
    defaultResponseDays: number;
    aiProcessingEnabled: boolean;
  };
  currentRole: OrgRole;
  subscription: {
    planTier: PlanTier;
    status: string;
  };
  stripeConfigured: boolean;
  members: MemberRow[];
  usage: {
    activeSeats: number;
    casesCreatedThisMonth: number;
    importRowsThisMonth: number;
    aiRequestsThisMonth: number;
  };
}

export function SettingsClient({
  organization,
  currentRole,
  subscription,
  stripeConfigured,
  members,
  usage,
}: SettingsClientProps) {
  const router = useRouter();
  const [name, setName] = useState(organization.name);
  const [defaultCurrency, setDefaultCurrency] = useState(organization.defaultCurrency);
  const [priceTolerancePct, setPriceTolerancePct] = useState(
    (organization.priceTolerancePctBps / 100).toFixed(2)
  );
  const [priceToleranceAbs, setPriceToleranceAbs] = useState(
    (organization.priceToleranceAbsCents / 100).toFixed(2)
  );
  const [qtyTolerancePct, setQtyTolerancePct] = useState(
    (organization.qtyTolerancePctBps / 100).toFixed(2)
  );
  const [qtyToleranceAbs, setQtyToleranceAbs] = useState(String(organization.qtyToleranceAbs));
  const [sortingRate, setSortingRate] = useState(
    (organization.defaultSortingHourlyCents / 100).toFixed(2)
  );
  const [reworkRate, setReworkRate] = useState(
    (organization.defaultReworkHourlyCents / 100).toFixed(2)
  );
  const [downtimeRate, setDowntimeRate] = useState(
    (organization.defaultDowntimeHourlyCents / 100).toFixed(2)
  );
  const [overtimeRate, setOvertimeRate] = useState(
    (organization.defaultOvertimeHourlyCents / 100).toFixed(2)
  );
  const [defaultResponseDays, setDefaultResponseDays] = useState(
    String(organization.defaultResponseDays)
  );
  const [aiProcessingEnabled, setAiProcessingEnabled] = useState(organization.aiProcessingEnabled);

  // Team invite
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('analyst');

  // Create new org
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgCurrency, setNewOrgCurrency] = useState('USD');

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const activePlan = PLANS[subscription.planTier] ?? PLANS.starter;
  const canManageSettings = currentRole === 'owner' || currentRole === 'admin';

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setBusy('settings');
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_settings',
          name,
          defaultCurrency,
          priceTolerancePct: Number(priceTolerancePct),
          priceToleranceAbs,
          qtyTolerancePct: Number(qtyTolerancePct),
          qtyToleranceAbs: Number(qtyToleranceAbs),
          sortingHourlyRate: sortingRate,
          reworkHourlyRate: reworkRate,
          downtimeHourlyRate: downtimeRate,
          overtimeHourlyRate: overtimeRate,
          defaultResponseDays: Number(defaultResponseDays),
          aiProcessingEnabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to update settings');
        return;
      }
      setNotice('Organization rules, hourly rates, and AI preferences saved.');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function handleInviteMember(e: React.FormEvent) {
    e.preventDefault();
    setBusy('invite');
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'invite_member',
          email: inviteEmail,
          fullName: inviteName,
          role: inviteRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to add member');
        return;
      }
      setInviteEmail('');
      setInviteName('');
      setNotice('Team member added to workspace.');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function handleRoleChange(membershipId: string, role: OrgRole) {
    setBusy(`role:${membershipId}`);
    setError(null);
    try {
      const res = await fetch('/api/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_member_role', membershipId, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to update role');
        return;
      }
      setNotice('Member role updated.');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function handleBillingAction(action: 'checkout' | 'portal' | 'dev_switch_plan', planTier?: PlanTier) {
    setBusy(`billing:${action}:${planTier ?? ''}`);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, planTier }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Billing action failed');
        return;
      }
      if (data.url) {
        window.location.assign(data.url);
        return;
      }
      setNotice(`Plan updated to ${planTier?.toUpperCase()} (${data.mode}).`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setBusy('create_org');
    setError(null);
    try {
      const res = await fetch('/api/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_org',
          name: newOrgName,
          defaultCurrency: newOrgCurrency,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create organization');
        return;
      }
      setNewOrgName('');
      setNotice('Created and switched to new isolated organization.');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function handleRequestDeletion() {
    setBusy('deletion');
    setError(null);
    try {
      const res = await fetch('/api/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request_deletion' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not record deletion request');
        return;
      }
      setNotice(data.message);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950">
          Workspace Settings, Team &amp; Billing
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Configure discrepancy tolerances, standard plant labour rates, RBAC roles, subscription limits, and data governance.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      )}

      {notice && (
        <div role="status" className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}

      {/* Organization Rules & Rates */}
      <form onSubmit={handleSaveSettings} className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-950">
              Organization Tolerances &amp; Standard Cost Rates
            </h2>
            <p className="text-xs text-slate-500">
              Used by deterministic discrepancy rules and cost-breakdown calculators.
            </p>
          </div>
          {!canManageSettings && (
            <span className="text-xs text-amber-700 font-medium">Read-only for role: {currentRole}</span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label htmlFor="set-org-name" className="block text-xs font-medium text-slate-700">
              Organization Name
            </label>
            <input
              id="set-org-name"
              type="text"
              disabled={!canManageSettings}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs disabled:bg-slate-50"
            />
          </div>
          <div>
            <label htmlFor="set-org-currency" className="block text-xs font-medium text-slate-700">
              Default Currency
            </label>
            <select
              id="set-org-currency"
              disabled={!canManageSettings}
              value={defaultCurrency}
              onChange={(e) => setDefaultCurrency(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono disabled:bg-slate-50"
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="CAD">CAD</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div>
            <label htmlFor="set-price-pct" className="block text-xs font-medium text-slate-700">
              Price Tolerance (%)
            </label>
            <input
              id="set-price-pct"
              type="number"
              step="0.1"
              disabled={!canManageSettings}
              value={priceTolerancePct}
              onChange={(e) => setPriceTolerancePct(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono"
            />
          </div>
          <div>
            <label htmlFor="set-price-abs" className="block text-xs font-medium text-slate-700">
              Price Tolerance (Abs)
            </label>
            <input
              id="set-price-abs"
              type="text"
              disabled={!canManageSettings}
              value={priceToleranceAbs}
              onChange={(e) => setPriceToleranceAbs(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono"
            />
          </div>
          <div>
            <label htmlFor="set-qty-pct" className="block text-xs font-medium text-slate-700">
              Qty Tolerance (%)
            </label>
            <input
              id="set-qty-pct"
              type="number"
              step="0.1"
              disabled={!canManageSettings}
              value={qtyTolerancePct}
              onChange={(e) => setQtyTolerancePct(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono"
            />
          </div>
          <div>
            <label htmlFor="set-qty-abs" className="block text-xs font-medium text-slate-700">
              Qty Tolerance (Units)
            </label>
            <input
              id="set-qty-abs"
              type="number"
              disabled={!canManageSettings}
              value={qtyToleranceAbs}
              onChange={(e) => setQtyToleranceAbs(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono"
            />
          </div>
          <div>
            <label htmlFor="set-resp-days" className="block text-xs font-medium text-slate-700">
              Default Response Days
            </label>
            <input
              id="set-resp-days"
              type="number"
              disabled={!canManageSettings}
              value={defaultResponseDays}
              onChange={(e) => setDefaultResponseDays(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label htmlFor="set-sort-rate" className="block text-xs font-medium text-slate-700">
              Sorting Rate / hr
            </label>
            <input
              id="set-sort-rate"
              type="text"
              disabled={!canManageSettings}
              value={sortingRate}
              onChange={(e) => setSortingRate(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono"
            />
          </div>
          <div>
            <label htmlFor="set-rework-rate" className="block text-xs font-medium text-slate-700">
              Rework Rate / hr
            </label>
            <input
              id="set-rework-rate"
              type="text"
              disabled={!canManageSettings}
              value={reworkRate}
              onChange={(e) => setReworkRate(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono"
            />
          </div>
          <div>
            <label htmlFor="set-downtime-rate" className="block text-xs font-medium text-slate-700">
              Downtime Rate / hr
            </label>
            <input
              id="set-downtime-rate"
              type="text"
              disabled={!canManageSettings}
              value={downtimeRate}
              onChange={(e) => setDowntimeRate(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono"
            />
          </div>
          <div>
            <label htmlFor="set-overtime-rate" className="block text-xs font-medium text-slate-700">
              Overtime Rate / hr
            </label>
            <input
              id="set-overtime-rate"
              type="text"
              disabled={!canManageSettings}
              value={overtimeRate}
              onChange={(e) => setOvertimeRate(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono"
            />
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 flex items-start gap-3">
          <input
            id="set-ai-optin"
            type="checkbox"
            disabled={!canManageSettings}
            checked={aiProcessingEnabled}
            onChange={(e) => setAiProcessingEnabled(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300"
          />
          <div>
            <label htmlFor="set-ai-optin" className="text-xs font-semibold text-slate-900 cursor-pointer">
              Enable Optional AI Document Extraction &amp; Claim Drafting
            </label>
            <p className="mt-0.5 text-[11px] text-slate-600">
              When enabled and configured on Growth+ plans, pasted NCR notes and claim draft requests may be sent server-side to Gemini. Deterministic rules, CSV imports, and PDF dossiers work 100% with this disabled.
            </p>
          </div>
        </div>

        {canManageSettings && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy === 'settings'}
              className="rounded-md bg-[#0F172A] px-4 py-2 text-xs font-medium text-white hover:bg-[#1E293B] cursor-pointer disabled:opacity-60"
            >
              {busy === 'settings' ? 'Saving...' : 'Save Organization Settings'}
            </button>
          </div>
        )}
      </form>

      {/* Billing & Usage */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-950 inline-flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-slate-600" aria-hidden="true" />
              <span>Subscription &amp; Plan Entitlements</span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Current Plan: <strong className="text-slate-950">{activePlan.name}</strong> · Status:{' '}
              <span className="font-mono text-sky-700">{subscription.status}</span>
              {!stripeConfigured && ' · Explicit Development Billing Mode (Stripe keys not configured)'}
            </p>
          </div>
          {stripeConfigured && (
            <button
              type="button"
              onClick={() => handleBillingAction('portal')}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Open Stripe Customer Portal
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="rounded border border-slate-200 p-3">
            <p className="text-slate-500">Team Seats</p>
            <p className="mt-1 font-mono text-sm font-semibold text-slate-900 tabular-nums">
              {usage.activeSeats} / {activePlan.maxSeats}
            </p>
          </div>
          <div className="rounded border border-slate-200 p-3">
            <p className="text-slate-500">Monthly Cases</p>
            <p className="mt-1 font-mono text-sm font-semibold text-slate-900 tabular-nums">
              {usage.casesCreatedThisMonth} / {activePlan.maxMonthlyCases}
            </p>
          </div>
          <div className="rounded border border-slate-200 p-3">
            <p className="text-slate-500">Monthly Import Rows</p>
            <p className="mt-1 font-mono text-sm font-semibold text-slate-900 tabular-nums">
              {usage.importRowsThisMonth.toLocaleString()} / {activePlan.maxMonthlyImportRows.toLocaleString()}
            </p>
          </div>
          <div className="rounded border border-slate-200 p-3">
            <p className="text-slate-500">Monthly AI Assists</p>
            <p className="mt-1 font-mono text-sm font-semibold text-slate-900 tabular-nums">
              {usage.aiRequestsThisMonth} / {activePlan.maxMonthlyAiRequests}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {PLAN_TIERS.map((tier) => {
            const p = PLANS[tier];
            const isCurrent = tier === subscription.planTier;
            return (
              <div
                key={tier}
                className={`rounded-md border p-4 flex flex-col justify-between ${
                  isCurrent ? 'border-sky-700 bg-sky-50/40' : 'border-slate-200 bg-white'
                }`}
              >
                <div>
                  <p className="font-display text-sm font-semibold text-slate-950">{p.name}</p>
                  <p className="mt-1 font-mono text-sm font-bold text-slate-900">
                    {p.monthlyPriceUsd ? `$${p.monthlyPriceUsd}/mo` : 'Custom'}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-600">{p.audience}</p>
                </div>
                <button
                  type="button"
                  disabled={isCurrent || !canManageSettings || busy !== null}
                  onClick={() =>
                    handleBillingAction(stripeConfigured ? 'checkout' : 'dev_switch_plan', tier)
                  }
                  className={`mt-4 w-full rounded px-3 py-1.5 text-xs font-medium cursor-pointer disabled:opacity-50 ${
                    isCurrent
                      ? 'bg-slate-200 text-slate-700'
                      : 'bg-[#0F172A] text-white hover:bg-[#1E293B]'
                  }`}
                >
                  {isCurrent
                    ? 'Active Plan'
                    : stripeConfigured
                      ? `Upgrade via Stripe`
                      : `Switch (Dev Mode)`}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Team Members & RBAC */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
        <div className="border-b border-slate-200 pb-3">
          <h2 className="font-display text-base font-semibold text-slate-950">
            Team Members &amp; Role-Based Access Control
          </h2>
          <p className="text-xs text-slate-500">
            Owner, Admin, Analyst (claims &amp; evidence), Finance (settlements &amp; credits), and Read-Only Auditor roles.
          </p>
        </div>

        <div className="overflow-x-auto rounded border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-2.5 font-medium">Member</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{m.full_name}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-600">{m.email}</td>
                  <td className="px-4 py-2.5 text-slate-600">{m.job_title ?? '-'}</td>
                  <td className="px-4 py-2.5">
                    <select
                      aria-label={`Role for ${m.full_name}`}
                      disabled={!canManageSettings || busy === `role:${m.id}`}
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.id, e.target.value as OrgRole)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs capitalize"
                    >
                      {ORG_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canManageSettings && (
          <form onSubmit={handleInviteMember} className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 items-end">
            <div>
              <label htmlFor="inv-name" className="block text-[11px] font-medium text-slate-700">
                Full name
              </label>
              <input
                id="inv-name"
                type="text"
                required
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Morgan Patel"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>
            <div>
              <label htmlFor="inv-email" className="block text-[11px] font-medium text-slate-700">
                Work email
              </label>
              <input
                id="inv-email"
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="mpatel@company.com"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>
            <div>
              <label htmlFor="inv-role" className="block text-[11px] font-medium text-slate-700">
                Role
              </label>
              <select
                id="inv-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as OrgRole)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
              >
                {ORG_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={busy === 'invite'}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#0F172A] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#1E293B] cursor-pointer"
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Add Member</span>
            </button>
          </form>
        )}
      </section>

      {/* Multi-Tenant Isolation & Data Export / Deletion */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={handleCreateOrg} className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
          <h2 className="font-display text-sm font-semibold text-slate-950">
            Create Isolated Customer Organization
          </h2>
          <p className="text-xs text-slate-600">
            Provision a clean, empty organization workspace completely isolated from Demo Data.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <input
              type="text"
              required
              aria-label="New organization name"
              placeholder="e.g., Summit Industrial Corp"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              className="col-span-2 rounded-md border border-slate-300 px-3 py-2 text-xs"
            />
            <select
              aria-label="New organization currency"
              value={newOrgCurrency}
              onChange={(e) => setNewOrgCurrency(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-mono"
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={busy === 'create_org'}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
          >
            Create &amp; Switch Workspace
          </button>
        </form>

        <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
          <h2 className="font-display text-sm font-semibold text-slate-950 inline-flex items-center gap-1.5">
            <ShieldAlert className="h-4 w-4 text-slate-600" aria-hidden="true" />
            <span>Data Portability &amp; Workspace Governance</span>
          </h2>
          <p className="text-xs text-slate-600">
            Export all recovery cases, supplier ledgers, settlements, and audit logs as JSON, or request organization deletion.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="/api/orgs/export"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Export Organization JSON</span>
            </a>
            {currentRole === 'owner' && !organization.isDemo && (
              <button
                type="button"
                onClick={handleRequestDeletion}
                disabled={busy === 'deletion'}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-3.5 py-2 text-xs font-medium text-red-700 hover:bg-red-100 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Request Organization Deletion</span>
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
