# Architecture - Supplier Recovery Desk

## 1. Multi-Tenancy & Security Boundaries

- Every business table (`suppliers`, `recovery_cases`, `loss_cost_items`, `evidence_items`, `recovery_settlements`, `discrepancy_leads`, `import_batches`, `audit_logs`, etc.) carries `organization_id`.
- Server-side `requireOrgContext(permission?)` resolves the authenticated user from an HTTP-only `jose` HS256 session cookie (`srd_session`) and verifies active membership in `organization_memberships` before binding `ctx.organization.id`. Unverified org IDs in cookies or request bodies are ignored.
- Supabase PostgreSQL migrations include Row-Level Security (`supabase/migrations/0002_rls_and_storage.sql`) via `app.is_org_member(organization_id)` and `app.has_org_role(organization_id, roles)`.
- Evidence uploads validate MIME types, extensions, and 10 MB size limits, sanitize filenames, store bytes privately outside `public/` (either `.data/evidence/<orgId>/` or Supabase private bucket `recovery-evidence`), and serve downloads only after tenant membership validation or HMAC signed-token verification (`/api/evidence/[id]/download`).

## 2. Financial & Workflow Integrity

- **Pure Domain Core (`/lib/domain/`)**:
  - `money.ts`: Integer minor-unit (`cents`) parsing, formatting, currency-grouped aggregation, and recovery balance math (`Actual Recovered` vs `Expected Credits` vs `Approved` vs `Submitted` vs `Potentially Recoverable`).
  - `workflow.ts`: Validated state transitions, approval/settlement prerequisites, evidence checklists per incident type, and due-date calculation.
  - `discrepancy.ts`: Deterministic rules (`RULE_PRICE_VARIANCE`, `RULE_INVOICE_EXCEEDS_RECEIPT`, `RULE_SHORT_SHIPMENT`, `RULE_QUALITY_REJECTION`, `RULE_LATE_DELIVERY`, `RULE_DUPLICATE_INVOICE`) with explicit tolerances.
  - `csv.ts`: RFC-4180 parser, column mapper, Zod row schemas, duplicate detection keys, and downloadable error CSV generation.
  - `permissions.ts` & `billing.ts`: Role permission matrix and plan seat/case/import/AI entitlement checks.
- **Database Transactions**: Claim transitions, cost recalculations, settlement ledger writes, and `recovery_transactions` inserts execute atomically inside `runInTransaction(...)`.

## 3. Document & PDF Pipeline

- `/lib/pdf/dossier.ts` generates multi-section formal PDF claim dossiers using `pdf-lib` containing claim identification, PO/GR/Invoice references, cost breakdown table, evidence manifest, timeline summary, and financial status.

## 4. Optional AI Boundary (`/lib/ai/provider.ts`)

- AI is strictly assistive (`extract_document`, `draft_communication`, `summarize_case`), server-side only (`@google/genai`), rate-limited per organization, gated by workspace opt-in (`ai_processing_enabled`) and plan allowance, and falls back deterministically when disabled or unconfigured.
- AI never modifies financial figures, settlement amounts, or transitions case statuses, and outbound emails always require explicit human approval.
