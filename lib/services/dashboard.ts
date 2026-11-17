import { getDb } from '@/lib/db';
import {
  calculateOutstandingBalanceCents,
  calculateRecoveryRateBps,
  groupMonetaryTotalsByCurrency,
} from '@/lib/domain/money';
import { INCIDENT_TYPE_LABELS, STATUS_META, type CaseStatus, type IncidentType } from '@/lib/domain/workflow';

export interface CurrencySummary {
  currency: string;
  potentialIdentifiedCents: number;
  submittedCents: number;
  approvedCents: number;
  expectedCreditsCents: number;
  actualRecoveredCents: number;
  outstandingCents: number;
  recoveryRateBps: number;
}

export interface DashboardFilters {
  supplierId?: string;
  plantId?: string;
  incidentType?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
}

export function getOverviewDashboardData(orgId: string, filters: DashboardFilters = {}) {
  const db = getDb();
  const whereClauses = ['c.organization_id = ?'];
  const params: Array<string | number> = [orgId];

  if (filters.supplierId) {
    whereClauses.push('c.supplier_id = ?');
    params.push(filters.supplierId);
  }
  if (filters.plantId) {
    whereClauses.push('c.plant_id = ?');
    params.push(filters.plantId);
  }
  if (filters.incidentType) {
    whereClauses.push('c.incident_type = ?');
    params.push(filters.incidentType);
  }
  if (filters.status) {
    whereClauses.push('c.status = ?');
    params.push(filters.status);
  }
  if (filters.fromDate) {
    whereClauses.push('c.incident_date >= ?');
    params.push(filters.fromDate);
  }
  if (filters.toDate) {
    whereClauses.push('c.incident_date <= ?');
    params.push(filters.toDate);
  }

  const cases = db
    .prepare(
      `SELECT c.*, s.name AS supplier_name, s.supplier_code, p.name AS plant_name
       FROM recovery_cases c
       JOIN suppliers s ON s.id = c.supplier_id AND s.organization_id = c.organization_id
       LEFT JOIN plants_or_locations p ON p.id = c.plant_id AND p.organization_id = c.organization_id
       WHERE ${whereClauses.join(' AND ')}
       ORDER BY c.created_at DESC`
    )
    .all(...params) as Array<Record<string, unknown>>;

  const activeCases = cases.filter((c) => c.status !== 'cancelled');
  const currenciesSet = new Set<string>();
  for (const c of activeCases) {
    currenciesSet.add(String(c.currency || 'USD').toUpperCase());
  }
  if (currenciesSet.size === 0) currenciesSet.add('USD');

  const currencySummaries: CurrencySummary[] = Array.from(currenciesSet)
    .sort()
    .map((currency) => {
      const subset = activeCases.filter((c) => String(c.currency).toUpperCase() === currency);
      const potentialIdentifiedCents = subset.reduce(
        (acc, c) => acc + Number(c.potentially_recoverable_cents || 0),
        0
      );
      const submittedCents = subset.reduce(
        (acc, c) => acc + Number(c.submitted_amount_cents || 0),
        0
      );
      const approvedCents = subset.reduce(
        (acc, c) => acc + Number(c.approved_amount_cents || 0),
        0
      );
      const expectedCreditsCents = subset.reduce((acc, c) => {
        const exp = Number(c.expected_credit_cents || 0);
        const rec = Number(c.recovered_amount_cents || 0);
        return acc + Math.max(0, exp - rec);
      }, 0);
      const actualRecoveredCents = subset.reduce(
        (acc, c) => acc + Number(c.recovered_amount_cents || 0),
        0
      );
      const outstandingCents = subset.reduce(
        (acc, c) =>
          acc +
          calculateOutstandingBalanceCents({
            expectedCreditCents: Number(c.expected_credit_cents || 0),
            approvedAmountCents: Number(c.approved_amount_cents || 0),
            submittedAmountCents: Number(c.submitted_amount_cents || 0),
            potentiallyRecoverableCents: Number(c.potentially_recoverable_cents || 0),
            recoveredAmountCents: Number(c.recovered_amount_cents || 0),
          }),
        0
      );

      return {
        currency,
        potentialIdentifiedCents,
        submittedCents,
        approvedCents,
        expectedCreditsCents,
        actualRecoveredCents,
        outstandingCents,
        recoveryRateBps: calculateRecoveryRateBps(actualRecoveredCents, submittedCents),
      };
    });

  // Status counts
  const statusMap = new Map<string, number>();
  for (const c of cases) {
    const st = String(c.status);
    statusMap.set(st, (statusMap.get(st) ?? 0) + 1);
  }
  const claimsByStatus = Array.from(statusMap.entries()).map(([status, count]) => ({
    status: status as CaseStatus,
    label: STATUS_META[status as CaseStatus]?.label ?? status,
    count,
  }));

  const todayIso = new Date().toISOString().slice(0, 10);
  const overdueResponses = activeCases
    .filter((c) => {
      const st = String(c.status);
      const dl = c.response_deadline ? String(c.response_deadline) : null;
      return dl && dl < todayIso && (st === 'submitted' || st === 'supplier_responded');
    })
    .map((c) => ({
      id: String(c.id),
      caseNumber: String(c.case_number),
      supplierName: String(c.supplier_name),
      responseDeadline: String(c.response_deadline),
      submittedAmountCents: Number(c.submitted_amount_cents),
      currency: String(c.currency),
    }));

  const upcomingDeadlines = activeCases
    .filter((c) => {
      const st = String(c.status);
      const dl = c.response_deadline ? String(c.response_deadline) : null;
      return (
        dl &&
        dl >= todayIso &&
        !['recovered', 'closed', 'cancelled'].includes(st)
      );
    })
    .sort((a, b) => String(a.response_deadline).localeCompare(String(b.response_deadline)))
    .slice(0, 6)
    .map((c) => ({
      id: String(c.id),
      caseNumber: String(c.case_number),
      supplierName: String(c.supplier_name),
      status: String(c.status) as CaseStatus,
      responseDeadline: String(c.response_deadline),
      currency: String(c.currency),
      outstandingCents: calculateOutstandingBalanceCents({
        expectedCreditCents: Number(c.expected_credit_cents || 0),
        approvedAmountCents: Number(c.approved_amount_cents || 0),
        submittedAmountCents: Number(c.submitted_amount_cents || 0),
        potentiallyRecoverableCents: Number(c.potentially_recoverable_cents || 0),
        recoveredAmountCents: Number(c.recovered_amount_cents || 0),
      }),
    }));

  // Supplier recovery breakdown (grouped per supplier + currency)
  const supplierAgg = new Map<
    string,
    {
      supplierId: string;
      supplierName: string;
      supplierCode: string;
      currency: string;
      caseCount: number;
      submittedCents: number;
      approvedCents: number;
      recoveredCents: number;
    }
  >();

  for (const c of activeCases) {
    const key = `${c.supplier_id}:${c.currency}`;
    const existing = supplierAgg.get(key) ?? {
      supplierId: String(c.supplier_id),
      supplierName: String(c.supplier_name),
      supplierCode: String(c.supplier_code),
      currency: String(c.currency),
      caseCount: 0,
      submittedCents: 0,
      approvedCents: 0,
      recoveredCents: 0,
    };
    existing.caseCount += 1;
    existing.submittedCents += Number(c.submitted_amount_cents || 0);
    existing.approvedCents += Number(c.approved_amount_cents || 0);
    existing.recoveredCents += Number(c.recovered_amount_cents || 0);
    supplierAgg.set(key, existing);
  }

  // Incident category breakdown
  const incidentAgg = new Map<
    string,
    { incidentType: IncidentType; label: string; currency: string; caseCount: number; recoverableCents: number; recoveredCents: number }
  >();
  for (const c of activeCases) {
    const it = String(c.incident_type) as IncidentType;
    const key = `${it}:${c.currency}`;
    const curr = incidentAgg.get(key) ?? {
      incidentType: it,
      label: INCIDENT_TYPE_LABELS[it] ?? it,
      currency: String(c.currency),
      caseCount: 0,
      recoverableCents: 0,
      recoveredCents: 0,
    };
    curr.caseCount += 1;
    curr.recoverableCents += Number(c.potentially_recoverable_cents || 0);
    curr.recoveredCents += Number(c.recovered_amount_cents || 0);
    incidentAgg.set(key, curr);
  }

  // Average days metrics
  const daysToSubmit: number[] = [];
  const daysToSettle: number[] = [];
  for (const c of activeCases) {
    if (c.incident_date && c.submission_date) {
      const diff =
        (Date.parse(String(c.submission_date)) - Date.parse(String(c.incident_date))) /
        (1000 * 60 * 60 * 24);
      if (Number.isFinite(diff) && diff >= 0) daysToSubmit.push(diff);
    }
    if (c.submission_date && c.recovered_date) {
      const diff =
        (Date.parse(String(c.recovered_date)) - Date.parse(String(c.submission_date))) /
        (1000 * 60 * 60 * 24);
      if (Number.isFinite(diff) && diff >= 0) daysToSettle.push(diff);
    }
  }

  const avgDaysToSubmission =
    daysToSubmit.length > 0
      ? Math.round((daysToSubmit.reduce((a, b) => a + b, 0) / daysToSubmit.length) * 10) / 10
      : null;
  const avgDaysToSettlement =
    daysToSettle.length > 0
      ? Math.round((daysToSettle.reduce((a, b) => a + b, 0) / daysToSettle.length) * 10) / 10
      : null;

  // Open discrepancy leads count & amounts grouped by currency
  const openLeads = db
    .prepare(
      `SELECT id, estimated_amount_cents, currency FROM discrepancy_leads
       WHERE organization_id = ? AND status = 'open'`
    )
    .all(orgId) as Array<{ id: string; estimated_amount_cents: number; currency: string }>;

  const openLeadsByCurrency = groupMonetaryTotalsByCurrency(
    openLeads,
    (l) => Number(l.estimated_amount_cents || 0)
  );

  // Recent activity
  const recentActivity = db
    .prepare(
      `SELECT e.id, e.case_id, e.event_type, e.summary, e.created_at, rc.case_number, u.full_name AS actor_name
       FROM claim_activity_events e
       JOIN recovery_cases rc ON rc.id = e.case_id AND rc.organization_id = e.organization_id
       LEFT JOIN user_profiles u ON u.id = e.actor_user_id
       WHERE e.organization_id = ?
       ORDER BY e.created_at DESC
       LIMIT 10`
    )
    .all(orgId) as Array<Record<string, unknown>>;

  return {
    totalCases: cases.length,
    openLeadCount: openLeads.length,
    openLeadsByCurrency,
    currencySummaries,
    claimsByStatus,
    overdueResponses,
    upcomingDeadlines,
    supplierBreakdown: Array.from(supplierAgg.values()).sort(
      (a, b) => b.submittedCents - a.submittedCents
    ),
    incidentBreakdown: Array.from(incidentAgg.values()).sort(
      (a, b) => b.recoverableCents - a.recoverableCents
    ),
    avgDaysToSubmission,
    avgDaysToSettlement,
    recentActivity: recentActivity.map((r) => ({
      id: String(r.id),
      caseId: String(r.case_id),
      caseNumber: String(r.case_number),
      eventType: String(r.event_type),
      summary: String(r.summary),
      actorName: r.actor_name ? String(r.actor_name) : 'System',
      createdAt: String(r.created_at),
    })),
  };
}
