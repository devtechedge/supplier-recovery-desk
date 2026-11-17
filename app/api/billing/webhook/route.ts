import { NextRequest, NextResponse } from 'next/server';
import { getDb, runInTransaction } from '@/lib/db';
import { getStripeClient } from '@/lib/billing/stripe';

export async function POST(req: NextRequest) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret || webhookSecret.includes('your_webhook_secret')) {
    return NextResponse.json({ error: 'Stripe webhook not configured' }, { status: 400 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const rawBody = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err instanceof Error ? err.message : 'invalid'}` },
      { status: 400 }
    );
  }

  const db = getDb();
  const alreadyProcessed = db
    .prepare('SELECT event_id FROM stripe_webhook_events WHERE event_id = ?')
    .get(event.id);
  if (alreadyProcessed) {
    return NextResponse.json({ received: true, idempotentDuplicate: true });
  }

  runInTransaction((tx) => {
    tx.prepare(
      'INSERT INTO stripe_webhook_events (event_id, event_type) VALUES (?, ?)'
    ).run(event.id, event.type);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const orgId = session.metadata?.organizationId;
      const planTier = session.metadata?.planTier || 'growth';
      if (orgId) {
        tx.prepare(
          `UPDATE subscriptions
           SET plan_tier = ?, status = 'active',
               stripe_customer_id = ?, stripe_subscription_id = ?,
               updated_at = datetime('now')
           WHERE organization_id = ?`
        ).run(
          planTier,
          typeof session.customer === 'string' ? session.customer : null,
          typeof session.subscription === 'string' ? session.subscription : null,
          orgId
        );
      }
    } else if (
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const sub = event.data.object;
      const mappedStatus =
        event.type === 'customer.subscription.deleted'
          ? 'canceled'
          : sub.status === 'past_due'
            ? 'past_due'
            : sub.status === 'trialing'
              ? 'trialing'
              : 'active';

      tx.prepare(
        `UPDATE subscriptions
         SET status = ?, updated_at = datetime('now')
         WHERE stripe_subscription_id = ?`
      ).run(mappedStatus, sub.id);
    }
  });

  return NextResponse.json({ received: true });
}
