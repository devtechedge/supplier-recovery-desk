import { NextRequest, NextResponse } from 'next/server';
import { requireOrgContext } from '@/lib/auth/session';
import { handleApiError } from '@/lib/api/http';
import { getOverviewDashboardData } from '@/lib/services/dashboard';
import { listRecoveryCases } from '@/lib/services/cases';

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireOrgContext();
    const sp = req.nextUrl.searchParams;
    const data = getOverviewDashboardData(ctx.organization.id, {
      supplierId: sp.get('supplierId') ?? undefined,
      plantId: sp.get('plantId') ?? undefined,
      incidentType: sp.get('incidentType') ?? undefined,
      status: sp.get('status') ?? undefined,
      fromDate: sp.get('fromDate') ?? undefined,
      toDate: sp.get('toDate') ?? undefined,
    });
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireOrgContext('reports:export');
    const body = (await req.json().catch(() => ({}))) as {
      status?: string;
      supplierId?: string;
      incidentType?: string;
    };

    const rows = listRecoveryCases(ctx.organization.id, {
      status: body.status,
      supplierId: body.supplierId,
      incidentType: body.incidentType,
    });

    const header = [
      'case_number',
      'supplier_code',
      'supplier_name',
      'incident_type',
      'status',
      'currency',
      'incident_date',
      'submission_date',
      'response_deadline',
      'gross_loss',
      'potentially_recoverable',
      'submitted_amount',
      'approved_amount',
      'expected_credit',
      'actual_recovered',
      'outstanding_balance',
    ].join(',');

    const lines = rows.map((r) =>
      [
        r.caseNumber,
        r.supplierCode,
        `"${r.supplierName.replace(/"/g, '""')}"`,
        r.incidentType,
        r.status,
        r.currency,
        r.incidentDate,
        r.submissionDate ?? '',
        r.responseDeadline ?? '',
        (r.grossLossCents / 100).toFixed(2),
        (r.potentiallyRecoverableCents / 100).toFixed(2),
        (r.submittedAmountCents / 100).toFixed(2),
        (r.approvedAmountCents / 100).toFixed(2),
        (r.expectedCreditCents / 100).toFixed(2),
        (r.recoveredAmountCents / 100).toFixed(2),
        (r.outstandingBalanceCents / 100).toFixed(2),
      ].join(',')
    );

    const csv = [header, ...lines].join('\n');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${ctx.organization.slug}-recovery-report.csv"`,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
