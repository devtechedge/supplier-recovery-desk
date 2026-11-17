export const PLAN_TIERS = ['starter', 'growth', 'scale', 'enterprise'] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  audience: string;
  monthlyPriceUsd: number | null; // null = custom pricing
  maxSeats: number;
  maxMonthlyCases: number;
  maxMonthlyImportRows: number;
  maxMonthlyAiRequests: number;
  dossierGeneration: boolean;
  advancedReporting: boolean;
  configurableWorkflows: boolean;
  features: string[];
}

export const PLANS: Record<PlanTier, PlanDefinition> = {
  starter: {
    tier: 'starter',
    name: 'Starter',
    audience: 'For single-plant teams replacing recovery spreadsheets',
    monthlyPriceUsd: 299,
    maxSeats: 5,
    maxMonthlyCases: 40,
    maxMonthlyImportRows: 5000,
    maxMonthlyAiRequests: 0,
    dossierGeneration: true,
    advancedReporting: false,
    configurableWorkflows: false,
    features: [
      '1 organization workspace · up to 5 seats',
      'Up to 40 recovery cases / month',
      'CSV import wizard & discrepancy checks (5,000 rows/mo)',
      'Claim dossier PDF & summary recovery reporting',
    ],
  },
  growth: {
    tier: 'growth',
    name: 'Growth',
    audience: 'For multi-buyer procurement & quality teams',
    monthlyPriceUsd: 799,
    maxSeats: 20,
    maxMonthlyCases: 250,
    maxMonthlyImportRows: 50000,
    maxMonthlyAiRequests: 250,
    dossierGeneration: true,
    advancedReporting: true,
    configurableWorkflows: false,
    features: [
      'Up to 20 team seats across plants',
      'Up to 250 recovery cases / month',
      '50,000 imported transaction rows / month',
      'Supplier scorecards, settlement ledger & 250 AI assists/mo',
    ],
  },
  scale: {
    tier: 'scale',
    name: 'Scale',
    audience: 'For multi-site manufacturers & distributors',
    monthlyPriceUsd: 1499,
    maxSeats: 75,
    maxMonthlyCases: 2000,
    maxMonthlyImportRows: 250000,
    maxMonthlyAiRequests: 1500,
    dossierGeneration: true,
    advancedReporting: true,
    configurableWorkflows: true,
    features: [
      'Up to 75 team seats with role-based permissions',
      'Up to 2,000 recovery cases / month',
      'Configurable lifecycle transitions & tolerance rules',
      '1,500 optional AI document assists / month',
    ],
  },
  enterprise: {
    tier: 'enterprise',
    name: 'Enterprise',
    audience: 'For multi-entity groups needing bespoke ERP workflows',
    monthlyPriceUsd: null,
    maxSeats: 500,
    maxMonthlyCases: 50000,
    maxMonthlyImportRows: 5000000,
    maxMonthlyAiRequests: 25000,
    dossierGeneration: true,
    advancedReporting: true,
    configurableWorkflows: true,
    features: [
      'Bespoke seat, plant & transaction limits',
      'Custom ERP import mappings & onboarding support',
      'Dedicated security review & SLA terms',
      'Multi-currency consolidated group reporting',
    ],
  },
};

export interface UsageSnapshot {
  activeSeats: number;
  casesCreatedThisMonth: number;
  importRowsThisMonth: number;
  aiRequestsThisMonth: number;
}

export function checkEntitlement(params: {
  planTier: PlanTier;
  subscriptionStatus: string;
  usage: UsageSnapshot;
  action: 'create_case' | 'import_rows' | 'add_seat' | 'ai_assist';
  increment?: number;
}): { allowed: boolean; reason?: string } {
  const { planTier, subscriptionStatus, usage, action, increment = 1 } = params;

  if (subscriptionStatus === 'canceled' || subscriptionStatus === 'past_due') {
    return {
      allowed: false,
      reason: `Subscription status is "${subscriptionStatus}". Please update billing before creating new records.`,
    };
  }

  const plan = PLANS[planTier] ?? PLANS.starter;
  if (action === 'create_case' && usage.casesCreatedThisMonth + increment > plan.maxMonthlyCases) {
    return {
      allowed: false,
      reason: `${plan.name} plan monthly case limit (${plan.maxMonthlyCases}) reached. Upgrade plan to add more cases.`,
    };
  }
  if (action === 'import_rows' && usage.importRowsThisMonth + increment > plan.maxMonthlyImportRows) {
    return {
      allowed: false,
      reason: `${plan.name} plan monthly import row limit (${plan.maxMonthlyImportRows.toLocaleString()}) would be exceeded.`,
    };
  }
  if (action === 'add_seat' && usage.activeSeats + increment > plan.maxSeats) {
    return {
      allowed: false,
      reason: `${plan.name} plan seat limit (${plan.maxSeats}) reached.`,
    };
  }
  if (action === 'ai_assist') {
    if (plan.maxMonthlyAiRequests === 0) {
      return {
        allowed: false,
        reason: `AI assistance is not included on the ${plan.name} plan. Deterministic rules and manual drafting remain fully available.`,
      };
    }
    if (usage.aiRequestsThisMonth + increment > plan.maxMonthlyAiRequests) {
      return {
        allowed: false,
        reason: `${plan.name} plan monthly AI request allowance (${plan.maxMonthlyAiRequests}) reached.`,
      };
    }
  }

  return { allowed: true };
}
