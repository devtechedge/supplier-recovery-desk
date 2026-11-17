# Security

This document describes the current security posture of Supplier Recovery Desk. It is an honest assessment, not a certification.

## Authentication and sessions

- Sessions use a signed HS256 JWT (`jose`) stored in an HTTP-only, SameSite=Lax cookie (`srd_session`) with a 7-day expiry.
- The signing secret is read from `AUTH_SESSION_SECRET`. In local development and for the hosted demo without that variable, a hardcoded development secret is used. Production deployments must set `AUTH_SESSION_SECRET` to a long random value.
- Users authenticate with email and password. Passwords are hashed with scrypt (random per-user salt).
- There is no password reset flow yet, and no email verification. Email-based flows are future work.

## Multi-tenancy

- Every business table carries `organization_id`, and all server-side access goes through an active membership check (`organization_memberships`) before any query.
- A submitted or cookie organization ID is never trusted on its own; it is validated against the authenticated user's memberships.
- The SQL layer is parameterized everywhere; the codebase does not interpolate user input into SQL.
- Supabase migrations include Row Level Security policies for every tenant table and a private evidence storage bucket. RLS is enforced when the app runs against a Supabase/Postgres database; the local and hosted-demo embedded SQLite path relies on the server-side membership checks as the authorization boundary.

## Evidence uploads

- Allowed MIME types: PDF, PNG, JPEG, WEBP, CSV, TXT. Maximum size: 10 MB.
- Filenames are sanitized, and stored paths are normalized to prevent traversal.
- Evidence is stored outside the public tree (local private directory or a private Supabase bucket) and downloads require either an authenticated membership or a short-lived HMAC-signed URL.
- Signed URLs expire after a few minutes; the signing secret is the same `AUTH_SESSION_SECRET`.

## Payments

- Stripe integration is present but not configured in the hosted demo. It runs in an explicit development billing mode and never treats a client-side plan selector as proof of a paid subscription.
- Webhook processing is signature-verified and idempotent.
- No card data touches this codebase; all card entry happens in Stripe-hosted checkout.

## AI assistance

- AI features are optional, provider-isolated, server-side only, and disabled unless a Gemini key is configured and the workspace opts in.
- AI output is validated with Zod, never auto-committed to financial figures, and never sends communications automatically. Everything AI-assisted is labeled as awaiting review.
- Documents are only sent to the configured AI provider when the workspace setting is enabled; that setting's behavior is documented in the UI.

## Secrets and environment

- Service-role and secret keys never reach the browser and are not prefixed `NEXT_PUBLIC_`.
- Real secrets are not committed. `.env.example` documents every variable by purpose.
- Logs avoid PII; activity is recorded in an append-only audit trail.

## Accepted residual risk

- The hosted demo uses an ephemeral embedded database that resets on cold start; it is isolated from real customer data by design.
- Organization invitations exist as a data model but invitations are not emailed yet; membership is provisioned by an owner/admin within the app.
- Rate limiting covers authentication-sensitive and AI endpoints; general API endpoints use lightweight guards but not full per-user quotas.
- Legal/regulatory statements are deliberately absent. Nothing here claims certification or compliance approval.

## Reporting

To report a vulnerability, open a private advisory or contact the repository owner directly. Please do not disclose vulnerabilities in public issues.
