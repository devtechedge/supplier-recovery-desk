import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  bigint,
  char,
  date,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  isDemo: boolean('is_demo').notNull().default(false),
  defaultCurrency: char('default_currency', { length: 3 }).notNull().default('USD'),
  priceTolerancePctBps: integer('price_tolerance_pct_bps').notNull().default(200),
  priceToleranceAbsCents: bigint('price_tolerance_abs_cents', { mode: 'number' }).notNull().default(2500),
  qtyTolerancePctBps: integer('qty_tolerance_pct_bps').notNull().default(100),
  qtyToleranceAbs: integer('qty_tolerance_abs').notNull().default(1),
  defaultSortingHourlyCents: bigint('default_sorting_hourly_cents', { mode: 'number' }).notNull().default(4800),
  defaultReworkHourlyCents: bigint('default_rework_hourly_cents', { mode: 'number' }).notNull().default(6500),
  defaultDowntimeHourlyCents: bigint('default_downtime_hourly_cents', { mode: 'number' }).notNull().default(28000),
  defaultOvertimeHourlyCents: bigint('default_overtime_hourly_cents', { mode: 'number' }).notNull().default(7200),
  defaultResponseDays: integer('default_response_days').notNull().default(14),
  aiProcessingEnabled: boolean('ai_processing_enabled').notNull().default(false),
  workflowConfig: jsonb('workflow_config').notNull().default({}),
  notificationPreferences: jsonb('notification_preferences').notNull().default({}),
  deletionRequestedAt: timestamp('deletion_requested_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userProfiles = pgTable('user_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  fullName: text('full_name').notNull(),
  passwordHash: text('password_hash'),
  jobTitle: text('job_title'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const organizationMemberships = pgTable(
  'organization_memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => userProfiles.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    status: text('status').notNull().default('active'),
    invitedBy: uuid('invited_by').references(() => userProfiles.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('org_membership_unique').on(table.organizationId, table.userId),
    index('idx_org_memberships_user').on(table.userId),
  ]
);

export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    supplierCode: text('supplier_code').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull().default('Mechanical Components'),
    country: text('country').default('US'),
    defaultCurrency: char('default_currency', { length: 3 }).notNull().default('USD'),
    paymentTermsDays: integer('payment_terms_days').default(30),
    taxId: text('tax_id'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('suppliers_org_code_unique').on(table.organizationId, table.supplierCode)]
);

export const recoveryCases = pgTable(
  'recovery_cases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    caseNumber: text('case_number').notNull(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    incidentType: text('incident_type').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    responsibilityAssessment: text('responsibility_assessment').notNull().default('Under review'),
    claimBasis: text('claim_basis'),
    incidentDate: date('incident_date').notNull(),
    discoveryDate: date('discovery_date').notNull(),
    submissionDate: date('submission_date'),
    responseDeadline: date('response_deadline'),
    status: text('status').notNull().default('draft'),
    currency: char('currency', { length: 3 }).notNull().default('USD'),
    grossLossCents: bigint('gross_loss_cents', { mode: 'number' }).notNull().default(0),
    potentiallyRecoverableCents: bigint('potentially_recoverable_cents', { mode: 'number' }).notNull().default(0),
    submittedAmountCents: bigint('submitted_amount_cents', { mode: 'number' }).notNull().default(0),
    approvedAmountCents: bigint('approved_amount_cents', { mode: 'number' }).notNull().default(0),
    expectedCreditCents: bigint('expected_credit_cents', { mode: 'number' }).notNull().default(0),
    recoveredAmountCents: bigint('recovered_amount_cents', { mode: 'number' }).notNull().default(0),
    ownerUserId: uuid('owner_user_id').references(() => userProfiles.id),
    internalNotes: text('internal_notes').default(''),
    creditReference: text('credit_reference'),
    recoveredDate: date('recovered_date'),
    sourceProvenance: jsonb('source_provenance').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('cases_org_number_unique').on(table.organizationId, table.caseNumber),
    index('idx_cases_org_status').on(table.organizationId, table.status),
  ]
);
