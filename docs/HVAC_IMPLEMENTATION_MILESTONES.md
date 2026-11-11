# HVAC Replacement Radar — MVP Implementation Milestones

Status: MVP build authorized. Milestone 0 (coverage alignment and data spike rerun) passed on 2026-11-02.

## Product boundary

The MVP is a Dallas-only sales-intelligence workflow: authenticate, select the supported territory, inspect explainable replacement-opportunity rankings generated from the aligned public data pipeline, filter, view evidence on a map, and export selected properties. It is not a CRM, outreach system, homeowner enrichment product, or equipment inspection tool.

## Milestones

### M1 — Founder-testable ranked-list shell (current)

Objective: expose the real top-100 spike output in a polished list/detail workflow before connecting external services.

Likely files/components: `app/app/page.tsx`, `app/app/globals.css`, `app/app/layout.tsx`, `app/app/data/properties.json`.

Acceptance criteria:

- The app loads real Dallas spike records.
- Score, confidence, coverage state, reasons, permit evidence, and unknowns are visible.
- Search, score, confidence, and category filters work.
- CSV export works without sending data to a third party.
- No inferred equipment age is presented as verified fact.

Tests: ESLint, production build, manual desktop/mobile browser pass.

Dependencies: aligned spike artifacts.

Out of scope: real login, persistence, map tiles, CRM integrations, outreach, billing.

### M2 — Authentication and tenant boundary

Objective: add Supabase Auth and a single contractor workspace boundary while retaining a local/demo fallback for founder testing.

Likely files/components: Supabase client/server helpers, middleware, login page, workspace/account tables, route guards, environment documentation.

Acceptance criteria:

- A user can sign in and sign out.
- Every persisted query is scoped to the authenticated account.
- Missing Supabase configuration produces an explicit demo mode, never a silent production fallback.

Tests: auth redirect tests, tenant isolation tests, build with and without optional environment variables.

Dependencies: Supabase project credentials.

Out of scope: enterprise roles, invitations, SSO, billing.

### M3 — Database-backed data refresh

Objective: move the aligned parcel, permit, signal, and score output into Postgres and make refreshes repeatable.

Likely files/components: SQL migrations, ingestion command, normalized tables, refresh log, server data access, import validation.

Acceptance criteria:

- A refresh can upsert the aligned supported-property universe and permit evidence.
- Coverage states are persisted and enforced in scoring queries.
- A failed refresh is visible and cannot silently replace the last good snapshot.

Tests: normalization fixtures, idempotent rerun, coverage-gating tests, bad-row quarantine tests.

Dependencies: Supabase database; existing `data-spike` source contracts.

Out of scope: multi-market ingestion, real-time streams, ML training.

### M4 — Dallas map and selection workflow

Objective: show ranked supported properties geographically and export explicitly selected opportunities.

Likely files/components: map component, geocoded/parcel centroids, selection state, filter synchronization, CSV exporter.

Acceptance criteria:

- A contractor can switch between list and map views.
- Map markers use stored coordinates or parcel centroids only; missing coordinates are labeled.
- Selecting records in either view produces the same CSV selection.

Tests: selection synchronization, missing-coordinate behavior, export snapshot test, responsive browser pass.

Dependencies: chosen low-cost map provider and a Dallas coordinate field from the data pipeline.

Out of scope: routing, territory optimization, satellite imagery, maps for other metros.

### M5 — Pilot hardening and auditability

Objective: make the founder-testable workflow safe for a small contractor pilot.

Likely files/components: score versioning, source/evidence audit records, error states, rate limiting, security headers, lightweight telemetry.

Acceptance criteria:

- Each score can be traced to a score version and source snapshot.
- User-visible failures explain what can be retried and what is unavailable.
- No secrets or homeowner contact data are shipped to the browser unnecessarily.

Tests: security review, permission tests, refresh failure tests, end-to-end smoke test.

Dependencies: M2–M4.

Out of scope: Stripe, messaging, CRM integrations, automated outreach, mobile app.

## Review gate

Codex reviews each milestone against its acceptance criteria and scope before the next milestone begins. Paid services or credentials are the only expected founder decisions; ordinary implementation proceeds without another approval.
