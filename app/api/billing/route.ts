import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/session';
import { handleApiError } from '@/lib/api/http';
import { PLANS, PLAN_TIERS } from '@/lib/domain/billing';
import { getPriceIdForTier, getStripeClient, isStripeConfigured } from '@/lib/billing/stripe';

export async function GET() {
  try {
    const ctx = await requireOrgContext();
    return NextResponse.json({
      stripeConfigured: isStripeConfigured(),
      subscription: ctx.subscription,
      plans: PLANS,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

const BillingActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('checkout'),
    planTier: z.enum(PLAN_TIERS),
  }),
  z.object({
    action: z.literal('portal'),
  }),
  z.object({
    action: z.literal('dev_switch_plan'),
    planTier: z.enum(PLAN_TIERS),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireOrgContext('billing:manage');
    const body = BillingActionSchema.parse(await req.json());
    const db = getDb();
    const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    if (body.action === 'dev_switch_plan') {
      if (isStripeConfigured()) {
        return NextResponse.json(
          { error: 'Development billing mode is disabled because Stripe is configured.' },
          { status: 400 }
        );
      }
      db.prepare(
        `UPDATE subscriptions
         SET plan_tier = ?, status = 'development_mode', updated_at = datetime('now')
         WHERE organization_id = ?`
      ).run(body.planTier, ctx.organization.id);
      return NextResponse.json({ ok: true, planTier: body.planTier, mode: 'development_mode' });
    }

    const stripe = getStripeClient();
    if (!stripe) {
      return NextResponse.json(
        {
          error:
            'Stripe credentials are not configured. Use Development Billing Mode to test entitlement tiers locally.',
          developmentBillingMode: true,
        },
        { status: 400 }
      );
    }

    if (body.action === 'checkout') {
      if (body.planTier === 'enterprise') {
        return NextResponse.json({
          error: 'Enterprise plans are provisioned via custom sales agreement.',
        }, { status: 400 });
      }
      const priceId = getPriceIdForTier(body.planTier);
      if (!priceId) {
        return NextResponse.json(
          { error: `Missing STRIPE_PRICE_${body.planTier.toUpperCase()} environment configuration.` },
          { status: 400 }
        );
      }
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${baseUrl}/app/settings?billing=success`,
        cancel_url: `${baseUrl}/app/settings?billing=cancelled`,
        metadata: {
          organizationId: ctx.organization.id,
          planTier: body.planTier,
        },
      });
      return NextResponse.json({ url: session.url });
    }

    const sub = db
      .prepare('SELECT stripe_customer_id FROM subscriptions WHERE organization_id = ?')
      .get(ctx.organization.id) as { stripe_customer_id: string | null } | undefined;

    if (!sub?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No Stripe customer associated with this organization yet.' },
        { status: 400 }
      );
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${baseUrl}/app/settings`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (err) {
    return handleApiError(err);
  }
}
