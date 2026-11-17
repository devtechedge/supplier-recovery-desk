import Stripe from 'stripe';
import type { PlanTier } from '@/lib/domain/billing';

export function isStripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      !process.env.STRIPE_SECRET_KEY.includes('your_secret_key')
  );
}

export function getStripeClient(): Stripe | null {
  if (!isStripeConfigured()) return null;
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export function getPriceIdForTier(tier: Exclude<PlanTier, 'enterprise'>): string | null {
  const map: Record<Exclude<PlanTier, 'enterprise'>, string | undefined> = {
    starter: process.env.STRIPE_PRICE_STARTER,
    growth: process.env.STRIPE_PRICE_GROWTH,
    scale: process.env.STRIPE_PRICE_SCALE,
  };
  const val = map[tier];
  if (!val || val.startsWith('price_starter') || val.startsWith('price_growth') || val.startsWith('price_scale')) {
    return null;
  }
  return val;
}
