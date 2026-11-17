import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { getDb, runInTransaction } from '@/lib/db';
import { ensureDemoDataSeeded, hashPassword, verifyPassword, DEMO_ORG_ID, DEMO_OWNER_ID } from '@/lib/db/seed';
import { hasPermission, type OrgRole, type Permission } from '@/lib/domain/permissions';

const SESSION_COOKIE = 'srd_session';
const ACTIVE_ORG_COOKIE = 'srd_active_org';

function getSessionSecret(): Uint8Array {
  const secret =
    process.env.AUTH_SESSION_SECRET ||
    'dev-only-supplier-recovery-desk-session-secret-change-in-production';
  return new TextEncoder().encode(secret);
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  jobTitle: string | null;
}

export interface OrgContext {
  user: AuthUser;
  organization: {
    id: string;
    name: string;
    slug: string;
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
    workflowConfig: Record<string, string[]>;
  };
  role: OrgRole;
  subscription: {
    planTier: 'starter' | 'growth' | 'scale' | 'enterprise';
    status: string;
  };
}

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSessionSecret());
}

export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecret());
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function setSessionCookies(userId: string, orgId?: string): Promise<void> {
  const token = await createSessionToken(userId);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7,
  });
  if (orgId) {
    cookieStore.set(ACTIVE_ORG_COOKIE, orgId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7,
    });
  }
}

export async function clearSessionCookies(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(ACTIVE_ORG_COOKIE);
}

export async function getAuthenticatedUser(): Promise<AuthUser | null> {
  ensureDemoDataSeeded();
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const userId = await verifySessionToken(token);
  if (!userId) return null;

  const db = getDb();
  const row = db
    .prepare('SELECT id, email, full_name, job_title FROM user_profiles WHERE id = ?')
    .get(userId) as
    | { id: string; email: string; full_name: string; job_title: string | null }
    | undefined;

  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    jobTitle: row.job_title,
  };
}

export async function getActiveOrgContext(
  explicitUserId?: string,
  explicitOrgId?: string
): Promise<OrgContext | null> {
  ensureDemoDataSeeded();
  const db = getDb();

  let userId = explicitUserId;
  let preferredOrgId = explicitOrgId;

  if (!userId) {
    const user = await getAuthenticatedUser();
    if (!user) return null;
    userId = user.id;
    const cookieStore = await cookies();
    preferredOrgId = preferredOrgId ?? cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  }

  const userRow = db
    .prepare('SELECT id, email, full_name, job_title FROM user_profiles WHERE id = ?')
    .get(userId) as
    | { id: string; email: string; full_name: string; job_title: string | null }
    | undefined;
  if (!userRow) return null;

  const memberships = db
    .prepare(
      `SELECT m.organization_id, m.role, o.*
       FROM organization_memberships m
       JOIN organizations o ON o.id = m.organization_id
       WHERE m.user_id = ? AND m.status = 'active'
       ORDER BY o.is_demo ASC, o.created_at ASC`
    )
    .all(userId) as Array<Record<string, unknown>>;

  if (memberships.length === 0) return null;

  // NEVER trust an unverified organization ID: only match an org where the user has an active membership
  const selected =
    (preferredOrgId ? memberships.find((m) => m.organization_id === preferredOrgId) : undefined) ??
    memberships[0];

  const orgId = String(selected.organization_id);
  const subRow = db
    .prepare('SELECT plan_tier, status FROM subscriptions WHERE organization_id = ?')
    .get(orgId) as { plan_tier: string; status: string } | undefined;

  let workflowConfig: Record<string, string[]> = {};
  try {
    workflowConfig = JSON.parse(String(selected.workflow_config || '{}'));
  } catch {
    workflowConfig = {};
  }

  return {
    user: {
      id: userRow.id,
      email: userRow.email,
      fullName: userRow.full_name,
      jobTitle: userRow.job_title,
    },
    organization: {
      id: orgId,
      name: String(selected.name),
      slug: String(selected.slug),
      isDemo: Number(selected.is_demo) === 1,
      defaultCurrency: String(selected.default_currency),
      priceTolerancePctBps: Number(selected.price_tolerance_pct_bps),
      priceToleranceAbsCents: Number(selected.price_tolerance_abs_cents),
      qtyTolerancePctBps: Number(selected.qty_tolerance_pct_bps),
      qtyToleranceAbs: Number(selected.qty_tolerance_abs),
      defaultSortingHourlyCents: Number(selected.default_sorting_hourly_cents),
      defaultReworkHourlyCents: Number(selected.default_rework_hourly_cents),
      defaultDowntimeHourlyCents: Number(selected.default_downtime_hourly_cents),
      defaultOvertimeHourlyCents: Number(selected.default_overtime_hourly_cents),
      defaultResponseDays: Number(selected.default_response_days),
      aiProcessingEnabled: Number(selected.ai_processing_enabled) === 1,
      workflowConfig,
    },
    role: String(selected.role) as OrgRole,
    subscription: {
      planTier: (subRow?.plan_tier as OrgContext['subscription']['planTier']) ?? 'starter',
      status: subRow?.status ?? 'development_mode',
    },
  };
}

export async function requireOrgContext(requiredPermission?: Permission): Promise<OrgContext> {
  const ctx = await getActiveOrgContext();
  if (!ctx) {
    throw new AuthError('Authentication required', 401);
  }
  if (requiredPermission && !hasPermission(ctx.role, requiredPermission)) {
    throw new AuthError(
      `Role "${ctx.role}" lacks permission "${requiredPermission}"`,
      403
    );
  }
  return ctx;
}

export function listUserOrganizations(userId: string) {
  const db = getDb();
  return db
    .prepare(
      `SELECT o.id, o.name, o.slug, o.is_demo, m.role
       FROM organization_memberships m
       JOIN organizations o ON o.id = m.organization_id
       WHERE m.user_id = ? AND m.status = 'active'
       ORDER BY o.is_demo ASC, o.name ASC`
    )
    .all(userId) as Array<{ id: string; name: string; slug: string; is_demo: number; role: OrgRole }>;
}

export function registerUserWithOrganization(params: {
  email: string;
  password: string;
  fullName: string;
  organizationName: string;
  jobTitle?: string;
}): { userId: string; organizationId: string } {
  ensureDemoDataSeeded();
  const db = getDb();
  const normalizedEmail = params.email.trim().toLowerCase();
  const existing = db
    .prepare('SELECT id FROM user_profiles WHERE email = ?')
    .get(normalizedEmail) as { id: string } | undefined;

  if (existing) {
    throw new AuthError('An account with this email already exists', 409);
  }

  const userId = crypto.randomUUID();
  const orgId = crypto.randomUUID();
  const slugBase = params.organizationName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'org';
  const slug = `${slugBase}-${crypto.randomBytes(3).toString('hex')}`;
  const passwordHash = hashPassword(params.password);

  runInTransaction((tx) => {
    tx.prepare(
      'INSERT INTO user_profiles (id, email, full_name, password_hash, job_title) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, normalizedEmail, params.fullName.trim(), passwordHash, params.jobTitle ?? null);

    tx.prepare(
      `INSERT INTO organizations (id, name, slug, is_demo, default_currency)
       VALUES (?, ?, ?, 0, 'USD')`
    ).run(orgId, params.organizationName.trim(), slug);

    tx.prepare(
      `INSERT INTO organization_memberships (id, organization_id, user_id, role, status)
       VALUES (?, ?, ?, 'owner', 'active')`
    ).run(crypto.randomUUID(), orgId, userId);

    tx.prepare(
      `INSERT INTO plants_or_locations (id, organization_id, code, name, country)
       VALUES (?, ?, 'PLT-MAIN', 'Primary Facility', 'US')`
    ).run(crypto.randomUUID(), orgId);

    tx.prepare(
      `INSERT INTO subscriptions (id, organization_id, plan_tier, status)
       VALUES (?, ?, 'starter', 'development_mode')`
    ).run(crypto.randomUUID(), orgId);

    tx.prepare(
      `INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, details)
       VALUES (?, ?, ?, 'organization.created', 'organization', ?, ?)`
    ).run(crypto.randomUUID(), orgId, userId, orgId, JSON.stringify({ name: params.organizationName }));
  });

  return { userId, organizationId: orgId };
}

export function authenticateWithPassword(email: string, password: string): {
  userId: string;
  defaultOrgId: string;
} {
  ensureDemoDataSeeded();
  const db = getDb();
  const normalizedEmail = email.trim().toLowerCase();
  const user = db
    .prepare('SELECT id, password_hash FROM user_profiles WHERE email = ?')
    .get(normalizedEmail) as { id: string; password_hash: string | null } | undefined;

  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new AuthError('Invalid email or password', 401);
  }

  const membership = db
    .prepare(
      `SELECT organization_id FROM organization_memberships
       WHERE user_id = ? AND status = 'active'
       ORDER BY created_at ASC LIMIT 1`
    )
    .get(user.id) as { organization_id: string } | undefined;

  return {
    userId: user.id,
    defaultOrgId: membership?.organization_id ?? DEMO_ORG_ID,
  };
}

export function getDemoLoginTarget() {
  ensureDemoDataSeeded();
  return { userId: DEMO_OWNER_ID, organizationId: DEMO_ORG_ID };
}

export class AuthError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 401) {
    super(message);
    this.statusCode = statusCode;
  }
}
