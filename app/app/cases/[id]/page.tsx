import { notFound, redirect } from 'next/navigation';
import { getActiveOrgContext } from '@/lib/auth/session';
import { getRecoveryCaseDetail } from '@/lib/services/cases';
import { CaseWorkspaceClient } from '@/components/case-workspace-client';

export const dynamic = 'force-dynamic';

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getActiveOrgContext();
  if (!ctx) redirect('/auth/signin');

  const { id } = await params;
  const detail = getRecoveryCaseDetail(ctx.organization.id, id);
  if (!detail) notFound();

  return (
    <CaseWorkspaceClient
      caseDetail={detail}
      orgRates={{
        sortingHourlyCents: ctx.organization.defaultSortingHourlyCents,
        reworkHourlyCents: ctx.organization.defaultReworkHourlyCents,
        downtimeHourlyCents: ctx.organization.defaultDowntimeHourlyCents,
        overtimeHourlyCents: ctx.organization.defaultOvertimeHourlyCents,
      }}
    />
  );
}
