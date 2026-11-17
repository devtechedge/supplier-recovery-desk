import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb, runInTransaction } from '@/lib/db';
import { ensureDemoDataSeeded, hashPassword } from '@/lib/db/seed';
import {
  listUserOrganizations,
  requireOrgContext,
  setSessionCookies,
} from '@/lib/auth/session';
import { handleApiError } from '@/lib/api/http';
import { parseDecimalToCents } from '@/lib/domain/money';
import { ORG_ROLES } from '@/lib/domain/permissions';
import { checkEntitlement } from '@/lib/domain/billing';

export async function GET() {
  try {
    const ctx = await requireOrgContext();
    const db = getDb();

    const members = db
      .prepare(
        `SELECT m.id, m.role, m.status, m.created_at, u.id AS user_id, u.email, u.full_name, u.job_title
         FROM organization_memberships m
         JOIN user_profiles u ON u.id = m.user_id
         WHERE m.organization_id = ?
         ORDER BY m.created_at ASC`
      )
      .all(ctx.organization.id);

    const plants = db
      .prepare('SELECT * FROM plants_or_locations WHERE organization_id = ? ORDER BY name ASC')
      .all(ctx.organization.id);

    const periodKey = new Date().toISOString().slice(0, 7);
    const usage = db
      .prepare('SELECT * FROM usage_records WHERE organization_id = ? AND period_key = ?')
      .get(ctx.organization.id, periodKey) as
      | { cases_created: number; import_rows_processed: number; ai_requests: number }
      | undefined;

    const orgs = listUserOrganizations(ctx.user.id);

    return NextResponse.json({
      organization: ctx.organization,
      role: ctx.role,
      subscription: ctx.subscription,
      organizations: orgs,
      members,
      plants,
      usage: {
        activeSeats: members.length,
        casesCreatedThisMonth: usage?.cases_created ?? 0,
        importRowsThisMonth: usage?.import_rows_processed ?? 0,
        aiRequestsThisMonth: usage?.ai_requests ?? 0,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

const ActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('switch_org'),
    organizationId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('create_org'),
    name: z.string().min(2),
    defaultCurrency: z.string().length(3).default('USD'),
  }),
  z.object({
    action: z.literal('update_settings'),
    name: z.string().min(2),
    defaultCurrency: z.string().length(3),
    priceTolerancePct: z.coerce.number().min(0).max(50),
    priceToleranceAbs: z.string(),
    qtyTolerancePct: z.coerce.number().min(0).max(50),
    qtyToleranceAbs: z.coerce.number().int().min(0),
    sortingHourlyRate: z.string(),
    reworkHourlyRate: z.string(),
    downtimeHourlyRate: z.string(),
    overtimeHourlyRate: z.string(),
    defaultResponseDays: z.coerce.number().int().min(1).max(120),
    aiProcessingEnabled: z.boolean(),
  }),
  z.object({
    action: z.literal('invite_member'),
    email: z.string().email(),
    fullName: z.string().min(2),
    role: z.enum(ORG_ROLES),
  }),
  z.object({
    action: z.literal('update_member_role'),
    membershipId: z.string().uuid(),
    role: z.enum(ORG_ROLES),
  }),
  z.object({
    action: z.literal('reset_demo'),
  }),
  z.object({
    action: z.literal('request_deletion'),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    const body = ActionSchema.parse(await req.json());
    const db = getDb();

    if (body.action === 'switch_org') {
      const ctx = await requireOrgContext();
      const member = db
        .prepare(
          `SELECT id FROM organization_memberships WHERE organization_id = ? AND user_id = ? AND status = 'active'`
        )
        .get(body.organizationId, ctx.user.id);
      if (!member) {
        return NextResponse.json({ error: 'Not a member of target organization' }, { status: 403 });
      }
      await setSessionCookies(ctx.user.id, body.organizationId);
      return NextResponse.json({ ok: true, organizationId: body.organizationId });
    }

    if (body.action === 'create_org') {
      const ctx = await requireOrgContext();
      const orgId = crypto.randomUUID();
      const slug = `${body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomBytes(2).toString('hex')}`;
      runInTransaction((tx) => {
        tx.prepare(
          `INSERT INTO organizations (id, name, slug, is_demo, default_currency) VALUES (?, ?, ?, 0, ?)`
        ).run(orgId, body.name.trim(), slug, body.defaultCurrency.toUpperCase());
        tx.prepare(
          `INSERT INTO organization_memberships (id, organization_id, user_id, role, status) VALUES (?, ?, ?, 'owner', 'active')`
        ).run(crypto.randomUUID(), orgId, ctx.user.id);
        tx.prepare(
          `INSERT INTO plants_or_locations (id, organization_id, code, name) VALUES (?, ?, 'PLT-MAIN', 'Main Facility')`
        ).run(crypto.randomUUID(), orgId);
        tx.prepare(
          `INSERT INTO subscriptions (id, organization_id, plan_tier, status) VALUES (?, ?, 'starter', 'development_mode')`
        ).run(crypto.randomUUID(), orgId);
      });
      await setSessionCookies(ctx.user.id, orgId);
      return NextResponse.json({ ok: true, organizationId: orgId }, { status: 201 });
    }

    if (body.action === 'update_settings') {
      const ctx = await requireOrgContext('settings:manage');
      db.prepare(
        `UPDATE organizations
         SET name = ?, default_currency = ?,
             price_tolerance_pct_bps = ?, price_tolerance_abs_cents = ?,
             qty_tolerance_pct_bps = ?, qty_tolerance_abs = ?,
             default_sorting_hourly_cents = ?, default_rework_hourly_cents = ?,
             default_downtime_hourly_cents = ?, default_overtime_hourly_cents = ?,
             default_response_days = ?, ai_processing_enabled = ?,
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        body.name.trim(),
        body.defaultCurrency.toUpperCase(),
        Math.round(body.priceTolerancePct * 100),
        parseDecimalToCents(body.priceToleranceAbs),
        Math.round(body.qtyTolerancePct * 100),
        body.qtyToleranceAbs,
        parseDecimalToCents(body.sortingHourlyRate),
        parseDecimalToCents(body.reworkHourlyRate),
        parseDecimalToCents(body.downtimeHourlyRate),
        parseDecimalToCents(body.overtimeHourlyRate),
        body.defaultResponseDays,
        body.aiProcessingEnabled ? 1 : 0,
        ctx.organization.id
      );
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'invite_member') {
      const ctx = await requireOrgContext('members:manage');
      const seatCountRow = db
        .prepare('SELECT COUNT(*) AS cnt FROM organization_memberships WHERE organization_id = ?')
        .get(ctx.organization.id) as { cnt: number };
      const ent = checkEntitlement({
        planTier: ctx.subscription.planTier,
        subscriptionStatus: ctx.subscription.status,
        usage: {
          activeSeats: Number(seatCountRow.cnt),
          casesCreatedThisMonth: 0,
          importRowsThisMonth: 0,
          aiRequestsThisMonth: 0,
        },
        action: 'add_seat',
      });
      if (!ent.allowed) {
        return NextResponse.json({ error: ent.reason }, { status: 403 });
      }

      const email = body.email.trim().toLowerCase();
      runInTransaction((tx) => {
        let user = tx.prepare('SELECT id FROM user_profiles WHERE email = ?').get(email) as
          | { id: string }
          | undefined;
        if (!user) {
          const uid = crypto.randomUUID();
          tx.prepare(
            'INSERT INTO user_profiles (id, email, full_name, password_hash) VALUES (?, ?, ?, ?)'
          ).run(uid, email, body.fullName.trim(), hashPassword('TempInvitePass2026!'));
          user = { id: uid };
        }
        tx.prepare(
          `INSERT INTO organization_memberships (id, organization_id, user_id, role, status, invited_by)
           VALUES (?, ?, ?, ?, 'active', ?)
           ON CONFLICT(organization_id, user_id) DO UPDATE SET role = excluded.role`
        ).run(crypto.randomUUID(), ctx.organization.id, user.id, body.role, ctx.user.id);
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'update_member_role') {
      const ctx = await requireOrgContext('members:manage');
      db.prepare(
        'UPDATE organization_memberships SET role = ?, updated_at = datetime(\'now\') WHERE id = ? AND organization_id = ?'
      ).run(body.role, body.membershipId, ctx.organization.id);
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'reset_demo') {
      const ctx = await requireOrgContext();
      if (!ctx.organization.isDemo) {
        return NextResponse.json({ error: 'Only the DEMO DATA organization can be reset.' }, { status: 400 });
      }
      ensureDemoDataSeeded(true);
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'request_deletion') {
      const ctx = await requireOrgContext('org:manage');
      db.prepare(
        `UPDATE organizations SET deletion_requested_at = datetime('now') WHERE id = ?`
      ).run(ctx.organization.id);
      return NextResponse.json({ ok: true, message: 'Organization deletion request recorded.' });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (err) {
    return handleApiError(err);
  }
}
