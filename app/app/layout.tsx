import { redirect } from 'next/navigation';
import { getActiveOrgContext, listUserOrganizations } from '@/lib/auth/session';
import { AppShell } from '@/components/app-shell';

export const dynamic = 'force-dynamic';

export default async function AuthenticatedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getActiveOrgContext();
  if (!ctx) {
    redirect('/auth/signin');
  }

  const organizations = listUserOrganizations(ctx.user.id);

  return (
    <AppShell
      user={ctx.user}
      organization={{
        id: ctx.organization.id,
        name: ctx.organization.name,
        isDemo: ctx.organization.isDemo,
      }}
      role={ctx.role}
      organizations={organizations}
    >
      {children}
    </AppShell>
  );
}
