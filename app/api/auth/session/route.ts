import { NextResponse } from 'next/server';
import { clearSessionCookies, getDemoLoginTarget, setSessionCookies, getActiveOrgContext, listUserOrganizations } from '@/lib/auth/session';

export async function POST() {
  const { userId, organizationId } = getDemoLoginTarget();
  await setSessionCookies(userId, organizationId);
  return NextResponse.json({ ok: true, organizationId, isDemo: true });
}

export async function DELETE() {
  await clearSessionCookies();
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const ctx = await getActiveOrgContext();
  if (!ctx) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  const orgs = listUserOrganizations(ctx.user.id);
  return NextResponse.json({
    authenticated: true,
    user: ctx.user,
    organization: ctx.organization,
    role: ctx.role,
    subscription: ctx.subscription,
    organizations: orgs,
  });
}
