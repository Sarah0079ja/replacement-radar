# HVAC Replacement Radar — M6: Service Area + Weekly Targets
## Revised Architecture Specification for Codex

**Status:** Architecture approved for review; Codex is not authorized to implement until M6-0 acceptance criteria pass.
**Date:** November 3, 2026
**Supersedes:** Previous M6 architecture draft.

---

## Table of Contents

- [A. Revised Product Behavior](#a-revised-product-behavior)
- [B. M6-0 Property Geography Integrity Specification](#b-m6-0-property-geography-integrity-specification)
- [C. Revised Data Model](#c-revised-data-model)
- [D. Service-Area Model](#d-service-area-model)
- [E. Target-Volume Model (25 / 50 / 100)](#e-target-volume-model)
- [F. Weekly Target Eligibility Rules](#f-weekly-target-eligibility-rules)
- [G. Deterministic Selection Algorithm](#g-deterministic-selection-algorithm)
- [H. Cohort / History Behavior](#h-cohort--history-behavior)
- [I. Status / Pipeline Behavior](#i-status--pipeline-behavior)
- [J. Weekly Metrics Definitions](#j-weekly-metrics-definitions)
- [K. Week Rollover Behavior](#k-week-rollover-behavior)
- [L. Mid-Week Target-Size Change Behavior](#l-mid-week-target-size-change-behavior)
- [M. Mid-Week Service-Area Change Behavior](#m-mid-week-service-area-change-behavior)
- [N. Future Outreach Compatibility](#n-future-outreach-compatibility)
- [O. Required Migrations / Indexes / RLS](#o-required-migrations--indexes--rls)
- [P. Edge Cases](#p-edge-cases)
- [Q. Codex Implementation Milestones with Acceptance Criteria](#q-codex-implementation-milestones-with-acceptance-criteria)

---

## A. Revised Product Behavior

### Core workflow

The M6 product expands the contractor's workspace from a static filtered list into an active prospecting workflow with three distinct layers:

**1. New Prospecting (THIS WEEK)**
A weekly cohort of the contractor's top-N eligible new opportunities. "New" means never previously assigned to a weekly cohort for this workspace. This is the contractor's primary work queue each week.

**2. Follow-Up Pipeline**
Properties the contractor has already CONTACTED. These are no longer new prospects; they are warm leads that will eventually feed a future outreach system. They do not consume new weekly prospecting slots. Not built in M6 beyond preserving the data model.

**3. Active Opportunity / Finished**
APPOINTMENT records are active commercial opportunities visible in workflow/pipeline views. WON and NOT_INTERESTED are closed and do not re-enter any prospecting workflow.

### Navigation structure

```
THIS WEEK          — current new-prospecting cohort (primary work queue)
ALL OPPORTUNITIES  — full service-area database with current statuses
```

Pipeline items (CONTACTED, APPOINTMENT) remain fully accessible through ALL OPPORTUNITIES with status filters. No separate CRM-style pipeline tab is added in M6.

### What changes from M5 / current behavior

- A workspace gains a service area: an explicit set of ZIP codes.
- A workspace gains a weekly target size preference: 25, 50, or 100.
- Weekly cohorts replace the single undifferentiated opportunity list as the primary contractor interface.
- CONTACTED properties are excluded from new weekly cohort generation.
- Cohort membership is persisted — it does not recalculate on page load.
- The `zip` field on every opportunity is audited and replaced with a canonical `property_zip` (M6-0).
- Service-area functionality is blocked until M6-0 passes.

---

## B. M6-0 Property Geography Integrity Specification

### Problem statement

The current `opportunities` table has a `zip` column (nullable `text`) whose provenance is ambiguous. The data pipeline enriches properties using DCAD's ParcelPublishing service, which returns two distinct ZIP sources:

- **Property/site ZIP:** derived from the City of Dallas parcel source street components or DCAD `SITEADDRESS`. This is the physical location of the property.
- **Owner mailing ZIP:** from DCAD `PSTLZIP5` / `PSTLZIP4`. This is the owner's mailing address, which may be located anywhere in the country.

Examples of suspicious ZIP values already observed in the dataset — 33327 (Weston, FL), 90278 (Redondo Beach, CA), 95124 (San Jose, CA) — are characteristic of owner mailing addresses, not Dallas site addresses. If the `zip` column was populated from DCAD `PSTLZIP5`, these values are owner-mailing contamination, not property geography.

Because M6 will make `property_zip` foundational to service-area assignment and weekly cohort generation, contaminated geography values cannot be tolerated. Assigning an opportunity to "Dallas ZIP 75218" when the stored ZIP is actually "90278 (owner mailing)" would silently remove valid Dallas opportunities from a contractor's service area.

### M6-0 scope

M6-0 is a read-and-repair milestone. No new UI features are built. No service-area or weekly-target functionality is implemented. The goal is a verified, auditable `property_zip` field on every opportunity record before geography becomes operational.

### M6-0 tasks for Codex

#### Task B-1: Identify the canonical property/site ZIP source

Trace where the `zip` column is populated in the pipeline:

1. Inspect `data-spike/run_spike.py` and `data-spike/export_app_fixture.py` to identify which source field is written to `zip`.
2. Inspect `data-spike/enrich_dcad.py` (if present) to determine whether DCAD enrichment overwrites the original parcel ZIP.
3. Identify whether the City of Dallas parcel layer (the `DallasTaxParcels` FeatureServer) exposes a ZIP or postal code field directly. If it does, this is the preferred canonical source because it comes from the jurisdictionally-aligned property universe.
4. Identify all fields in the DCAD ParcelPublishing response that could contain a ZIP: `SITEADDRESS` (may embed ZIP), `PSTLZIP5`, `PSTLZIP4`. Document which is property-address ZIP and which is mailing ZIP.
5. Produce a written finding: "The current `zip` column is populated from [source field]. The canonical property/site ZIP should come from [source field]. The owner mailing ZIP is [source field] and must be stored separately."

#### Task B-2: Audit current opportunity records

Run an audit query against the live Supabase `opportunities` table:

```
For each row:
  - Record the current zip value
  - Classify as: DALLAS_ZIP (75xxx range), OUT_OF_STATE_ZIP, MISSING, OTHER
```

Report:
- Total rows audited
- Count and list of rows where `zip` is outside the expected Dallas ZIP range (75001–75999 is a usable first-pass filter; Dallas proper ZIPs are a well-known subset)
- Count of NULL / empty ZIP rows
- Count of rows where ZIP looks plausible for Dallas

A non-Dallas ZIP in an opportunity that is sourced from the City of Dallas parcel universe is a strong indicator of mailing-address contamination.

#### Task B-3: Establish the canonical `property_zip` field

Add a new column `property_zip text` to `public.opportunities`.

This column:
- Must reflect the physical/site address ZIP of the property.
- Must be derived from the City of Dallas parcel layer or DCAD `SITEADDRESS`, not from DCAD `PSTLZIP5`.
- May be NULL only if the source genuinely does not supply a site ZIP and no reliable inference is possible. NULL is preferable to a wrong value.
- Must be labeled `property_zip` in all downstream code to distinguish it unambiguously from mailing.

Keep the existing `zip` column in place as a deprecated alias until M6-0 completes the repair and all code references are updated. Do not delete `zip` until the migration is confirmed in the live dataset.

#### Task B-4: Re-derive `property_zip` for all current records

For every row in `public.opportunities`:

1. Look up the parcel record by `parcel_id` against the City of Dallas parcel layer or DCAD `SITEADDRESS`.
2. Extract the site-address ZIP from the authoritative source.
3. Write it to `property_zip`.
4. If the source does not supply a site ZIP for a parcel, write NULL and record the parcel ID in a repair log.

The re-derivation script must:
- Use the same DCAD ParcelPublishing batch query method already proven for the 307-record enrichment test (100% coverage).
- Not use DCAD `PSTLZIP5` as the source for `property_zip` under any circumstances.
- Log every parcel where site ZIP is missing or ambiguous rather than silently substituting another value.
- Be idempotent (safe to re-run).

#### Task B-5: Verify Dallas geography

After repair, run a verification query:

```
SELECT property_zip, count(*)
FROM opportunities
GROUP BY property_zip
ORDER BY count(*) DESC;
```

Expected result: all `property_zip` values are within Dallas proper ZIP codes (e.g., 75001–75999, with the specific set of City of Dallas ZIPs documented). Any value outside this range is a flag requiring manual review before M6 proceeds.

Also verify: the count of non-NULL `property_zip` values equals or exceeds the count of non-NULL `zip` values (no regression in coverage).

#### Task B-6: Prevent future contamination

In the data pipeline (`run_spike.py`, `enrich_dcad.py`, `export_app_fixture.py`), enforce the following:

- `property_zip` is always populated from the site-address source.
- Owner mailing ZIP (DCAD `PSTLZIP5`) is stored in a separate column `owner_mailing_zip` on opportunities (already partially supported by `owner_mailing_address`), never in `property_zip`.
- Add an assertion in the export pipeline: if `property_zip` matches `owner_mailing_zip` exactly for a record where the owner mailing address is in a different city or state, log a warning. Do not silently accept it.

#### Task B-7: Mark `zip` as deprecated; update all code references

After `property_zip` is populated and verified:

1. Update all SQL queries, TypeScript data fetchers, and seed scripts to use `property_zip` instead of `zip`.
2. Add a SQL comment on the `zip` column: `-- DEPRECATED: use property_zip. Retained for backward compatibility during M6-0 migration.`
3. Do not drop `zip` in the M6-0 migration. Schedule its removal for a future migration after M6 is fully deployed.

### M6-0 acceptance criteria

**AC-M6-0-1:** A written source-tracing finding documents exactly which pipeline field populates `zip` and confirms the intended canonical source for `property_zip`.

**AC-M6-0-2:** An audit report is produced showing the distribution of current `zip` values by ZIP range and identifying every row where the value is non-Dallas or NULL.

**AC-M6-0-3:** A `property_zip` column exists on `public.opportunities` with a `NOT NULL` constraint or, where site ZIP is genuinely unavailable, an explicit NULL with a corresponding repair-log entry.

**AC-M6-0-4:** Zero rows in `opportunities` have a `property_zip` value outside the verified City of Dallas residential ZIP code set, unless the row has been individually reviewed and documented as an exception.

**AC-M6-0-5:** The verification query in Task B-5 is run against the live Supabase dataset and its output is included in the M6-0 completion report.

**AC-M6-0-6:** The data pipeline no longer populates `property_zip` from `PSTLZIP5` or any owner-mailing-address field. A code-level assertion or comment confirms this separation.

**AC-M6-0-7:** All existing code references to `zip` in filtering, display, and seed logic are updated to `property_zip`.

**AC-M6-0-8:** `npm run lint` and `npm run build` pass after M6-0 changes.

**Gate:** Service-area assignment and weekly-cohort generation must not be implemented until all eight M6-0 acceptance criteria are met and the founder has reviewed the audit report.

---

## C. Revised Data Model

### Existing tables (unchanged by M6)

```
profiles            — user identity
workspaces          — contractor organization boundary
memberships         — user ↔ workspace (many-to-many)
opportunities       — shared, read-only opportunity universe
lead_activity       — workspace-scoped per-opportunity status record
lead_notes          — workspace-scoped private notes
```

### Modifications to existing tables

#### opportunities

```sql
-- M6-0: Add canonical property ZIP
ALTER TABLE public.opportunities
  ADD COLUMN property_zip text,          -- canonical site-address ZIP; source: City of Dallas parcel or DCAD SITEADDRESS
  ADD COLUMN owner_mailing_zip text;     -- DCAD PSTLZIP5; kept for mailing/outreach use only; never used for geography

-- Comment the deprecated column:
COMMENT ON COLUMN public.opportunities.zip IS
  'DEPRECATED: use property_zip. Retained for backward compatibility during M6-0 migration.';

-- Index for service-area lookups:
CREATE INDEX IF NOT EXISTS opportunities_property_zip_idx ON public.opportunities(property_zip);
```

#### workspaces

```sql
-- M6: Add service-area settings and weekly target size preference
ALTER TABLE public.workspaces
  ADD COLUMN service_zip_codes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN weekly_target_size integer NOT NULL DEFAULT 25
    CHECK (weekly_target_size IN (25, 50, 100));

COMMENT ON COLUMN public.workspaces.service_zip_codes IS
  'Array of property_zip values defining this workspace service area. Set by contractor.';
COMMENT ON COLUMN public.workspaces.weekly_target_size IS
  'Contractor preferred weekly prospecting volume: 25, 50, or 100. Applied at next week rollover.';
```

### New tables

#### weekly_cohorts

```sql
CREATE TABLE public.weekly_cohorts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  week_start      date NOT NULL,        -- Monday of the ISO week; always a Monday
  target_size     integer NOT NULL      -- snapshot of weekly_target_size at generation time
    CHECK (target_size IN (25, 50, 100)),
  actual_size     integer NOT NULL,     -- actual number of opportunities assigned (may be < target_size if pool exhausted)
  pool_exhausted  boolean NOT NULL DEFAULT false,  -- true if actual_size < target_size due to empty eligible pool
  generated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, week_start)
);

COMMENT ON TABLE public.weekly_cohorts IS
  'One row per workspace per week. Represents a stable prospecting target list generated on week start.';
COMMENT ON COLUMN public.weekly_cohorts.target_size IS
  'The N requested by the contractor at generation time. Snapshot; not mutated when workspace setting changes.';
COMMENT ON COLUMN public.weekly_cohorts.actual_size IS
  'The actual number of members assigned. May be < target_size if the eligible NEW pool was exhausted.';
COMMENT ON COLUMN public.weekly_cohorts.pool_exhausted IS
  'True when actual_size < target_size because no further eligible NEW opportunities existed at generation time.';
```

#### weekly_cohort_members

```sql
CREATE TABLE public.weekly_cohort_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id       uuid NOT NULL REFERENCES public.weekly_cohorts(id) ON DELETE CASCADE,
  opportunity_id  uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  rank_position   integer NOT NULL,     -- 1-indexed rank within this cohort at generation time; lower = stronger
  added_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cohort_id, opportunity_id),
  UNIQUE (cohort_id, rank_position)
);

COMMENT ON TABLE public.weekly_cohort_members IS
  'Persisted membership of each opportunity in a weekly cohort. Never recalculated after generation.';
COMMENT ON COLUMN public.weekly_cohort_members.rank_position IS
  'Rank within this cohort at the moment of generation. 1 = strongest eligible opportunity assigned. Stable.';
```

### Design notes on the data model

**Why `service_zip_codes` lives on `workspaces` rather than a separate `service_areas` table:**
For MVP, a workspace has exactly one service area. Storing it as a `text[]` column on `workspaces` requires no join and no extra table. When multi-area support or named area profiles are needed, a `workspace_service_areas` table can be introduced in a future migration without breaking the current model. `text[]` is indexed with GIN for efficient `@>` containment checks.

**Why `weekly_target_size` lives on `workspaces`:**
It is a workspace-level preference, not a per-cohort setting. The per-cohort snapshot is captured in `weekly_cohorts.target_size` at generation time, so historical cohorts always reflect the N that was requested when they were built.

**Why cohort membership is in a separate table:**
Persisting membership in `weekly_cohort_members` rather than computing it on every load is the only way to guarantee that a Monday list does not change due to scoring, enrichment, new arrivals, or page refresh. It also enables audit and historical analysis of which opportunities were assigned to which weeks.

**Why `rank_position` is stored:**
Rank can change if rescoring occurs. By snapshotting rank at generation time, the contractor always sees the list in the order it was originally presented. Rescoring updates `opportunities` scores but does not mutate `weekly_cohort_members.rank_position`.

**Why `pool_exhausted` is a boolean column rather than just comparing sizes:**
It disambiguates the case where `actual_size < target_size` intentionally (pool was empty) versus a bug. An explicit flag surfaces this condition cleanly in the UI and in monitoring queries.

---

## D. Service-Area Model

### Definition

A service area is a set of `property_zip` values that a workspace has selected as its prospecting territory. All service-area logic operates on `property_zip` only. Owner mailing ZIP (`owner_mailing_zip`) plays no role in service-area evaluation.

### Storage

```sql
workspaces.service_zip_codes text[]   -- e.g., '{75218,75228,75243}'
```

GIN index on this column enables efficient `property_zip = ANY(service_zip_codes)` or `service_zip_codes @> ARRAY[property_zip]` evaluation.

### Contractor interaction

A contractor selects one or more ZIP codes from a list of ZIPs for which verified Dallas opportunities exist (i.e., ZIPs present in `opportunities.property_zip`). Free-text entry of arbitrary ZIPs is not permitted in MVP — only ZIPs that actually appear in the opportunity universe can be selected. This prevents a contractor from configuring a service area that returns zero results and wondering why.

No maps, geocoding, routing, or drive-time APIs are involved. ZIP code selection is a list/checkbox interface.

### Service-area constraints

- A workspace with an empty `service_zip_codes` array cannot generate a weekly cohort.
- The system should display an onboarding prompt if `service_zip_codes` is empty.
- A workspace may select any number of ZIPs present in the opportunity universe.

### Service-area and M6-0 dependency

Service-area functionality must not be presented to contractors until M6-0 has verified that `property_zip` is populated from the correct source and all existing records reflect the property's physical ZIP, not the owner's mailing ZIP. Displaying service-area selection against contaminated data would silently exclude valid Dallas opportunities or include invalid ones.

---

## E. Target-Volume Model

### Supported values

```
25
50
100
```

Stored as `workspaces.weekly_target_size`. The check constraint enforces the MVP set. The schema accommodates any integer value, so future custom sizes (e.g., 200) require only a constraint change, not a schema redesign.

### Behavior

The contractor selects their desired prospecting volume. At week generation time, the algorithm attempts to fill `target_size` eligible NEW opportunities. If fewer than `target_size` eligible opportunities exist, all available eligible opportunities are returned and `pool_exhausted = true`.

The system never fabricates opportunities, lowers data integrity standards, or recycles CONTACTED/worked properties to fill the quota.

### Target size is a preference, not a guarantee

The contractor should understand that their requested size may not be met if:
1. The service area is narrow and many properties have already been worked.
2. The total eligible universe in their service area is smaller than their target.
3. The eligible pool has been progressively depleted over several weeks of use.

When `pool_exhausted = true`, the UI should show an informational message: "Your service area has N eligible new opportunities remaining. Consider expanding your ZIP codes for future weeks."

---

## F. Weekly Target Eligibility Rules

An opportunity is eligible for inclusion in a NEW weekly prospecting cohort for a given workspace if and only if ALL of the following are true:

**F-1. Geography:** `opportunity.property_zip = ANY(workspace.service_zip_codes)`

**F-2. Never previously assigned to this workspace:** The opportunity has never appeared in any `weekly_cohort_members` row linked to any `weekly_cohort` for this workspace. Once assigned to any prior cohort, an opportunity is permanently excluded from future new-prospecting cohorts for this workspace. It remains accessible through ALL OPPORTUNITIES.

**F-3. No worked status:** The opportunity does not have a `lead_activity` record for this workspace with `status IN ('CONTACTED', 'APPOINTMENT', 'WON', 'NOT_INTERESTED')`. (If F-2 is enforced correctly, F-3 is largely redundant for assignments, but it provides a safety net against data inconsistency and explicitly encodes the business rule.)

**F-4. Supported coverage:** `opportunity.coverage_state = 'SUPPORTED'`. Out-of-coverage or unknown properties are never eligible.

### What is NOT an eligibility filter

- Opportunity strength / priority level: HIGH, MEDIUM, and LOW opportunities are all eligible. The ranking engine determines order; the contractor decides what to pursue.
- Minimum score threshold: there is no minimum score threshold for eligibility.
- Evidence confidence: all confidence levels are eligible.

---

## G. Deterministic Selection Algorithm

### Input

```
workspace_id       — identifies the workspace
week_start         — the Monday of the ISO week being generated
target_size        — from workspace.weekly_target_size (25, 50, or 100)
```

### Step 1: Identify eligible NEW opportunities

```sql
SELECT o.id, o.score, o.opportunity_strength, o.evidence_confidence, o.property_zip
FROM opportunities o
WHERE
  o.property_zip = ANY(
    SELECT service_zip_codes FROM workspaces WHERE id = :workspace_id
  )
  AND o.coverage_state = 'SUPPORTED'
  AND NOT EXISTS (
    SELECT 1
    FROM weekly_cohort_members wcm
    JOIN weekly_cohorts wc ON wcm.cohort_id = wc.id
    WHERE wc.workspace_id = :workspace_id
      AND wcm.opportunity_id = o.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM lead_activity la
    WHERE la.workspace_id = :workspace_id
      AND la.opportunity_id = o.id
      AND la.status IN ('CONTACTED', 'APPOINTMENT', 'WON', 'NOT_INTERESTED')
  );
```

### Step 2: Rank eligible opportunities

Apply the internal ranking to the eligible set. The ranking produces a deterministic ordering using the following primary and tiebreaker criteria:

| Priority | Field | Direction | Rationale |
|---|---|---|---|
| 1 | `score` | DESC | Primary opportunity quality signal |
| 2 | `evidence_confidence` | HIGH > MEDIUM > LOW | Prefer verified evidence |
| 3 | `opportunity_strength` | STRONG > MEDIUM > WEAK | Secondary quality bucket |
| 4 | `year_built` | ASC (older first) | Older properties have stronger replacement need inference |
| 5 | `id` | ASC | Stable tiebreaker; prevents non-determinism on equal rows |

The ranking is purely deterministic. It does not use random ordering, live API calls, or any non-deterministic input. The same eligible pool always produces the same ordered list.

### Step 3: Take top N

```
Take the first MIN(target_size, count(eligible)) rows from the ranked set.
```

If `count(eligible) < target_size`, take all eligible rows and set `pool_exhausted = true`.

### Step 4: Persist the cohort

```sql
-- Insert cohort header
INSERT INTO weekly_cohorts (workspace_id, week_start, target_size, actual_size, pool_exhausted)
VALUES (:workspace_id, :week_start, :target_size, :actual_size, :pool_exhausted);

-- Insert members with rank positions
INSERT INTO weekly_cohort_members (cohort_id, opportunity_id, rank_position)
SELECT :cohort_id, id, row_number() OVER (ORDER BY [ranking criteria])
FROM [eligible ranked set];
```

### Step 5: Return

Return the cohort members in rank order (rank_position ASC). This is the contractor's THIS WEEK list.

### Critical invariant

After Step 4, the cohort is frozen. Subsequent scoring updates, new property arrivals, or enrichment changes do NOT modify `weekly_cohort_members`. The list is stable for the entire week.

---

## H. Cohort / History Behavior

### Historical cohort membership

Every `weekly_cohort_members` row is a permanent historical record. It answers: "In week W, workspace X was assigned opportunity Y at rank position Z." This record is never mutated or deleted (except by workspace deletion cascade).

### Current prospect status

A property's current status in `lead_activity` is independent of its cohort history. A property can be:
- In a prior cohort and now CONTACTED (worked; no longer eligible for new cohorts)
- In a prior cohort and still NEW (was assigned but never worked; also no longer eligible, because cohort assignment exhausts its new-prospect eligibility regardless of action taken)
- Never assigned to any cohort (eligible for the next generation)

### Eligibility for future cohorts

An opportunity is eligible for a future weekly cohort if and only if it has never appeared in any `weekly_cohort_members` row for this workspace. This is a permanent, monotonically-shrinking eligibility pool. Once used, always used.

### Why previously-assigned-but-untouched properties are NOT recycled

If a contractor was given property X last week and did nothing with it, that property has already been presented as a prospecting target. Re-presenting it as a "new" target the following week would be misleading — it is not new — and would undermine cohort stability. The contractor can find previously-assigned properties via ALL OPPORTUNITIES or by reviewing prior weeks. The new-prospecting slot should go to a genuinely fresh opportunity.

### Cohort history is accessible

The UI may expose a "Previous weeks" view (later enhancement) by querying `weekly_cohorts` and `weekly_cohort_members` for the workspace. M6 does not build this view, but the data model fully supports it.

---

## I. Status / Pipeline Behavior

### Status values and their meaning

| Status | Pipeline layer | New-cohort eligible | Description |
|---|---|---|---|
| `NEW` (default) | New Prospecting | Yes, if never in a cohort | Property not yet worked by this workspace. Default state when no `lead_activity` row exists. |
| `CONTACTED` | Follow-Up Pipeline | No | Contractor has made initial contact. Graduated out of new prospecting. |
| `APPOINTMENT` | Active Opportunity | No | Appointment scheduled. Commercially significant; shown separately. |
| `WON` | Finished | No | Job won. Closed positive. |
| `NOT_INTERESTED` | Finished | No | Property declined or excluded. Closed negative. |

### Is the existing status model sufficient?

Yes, for the M6 pipeline separation. The existing `lead_activity.status` values exactly cover the required states. No new status values are needed for M6.

The critical architectural point is that cohort membership (stored in `weekly_cohort_members`) is separate from status (stored in `lead_activity`). Changing a property's status does not affect which cohort it belongs to or its rank position within that cohort. These are independent concerns.

### Status changes and THIS WEEK view

When a contractor changes a property from NEW to CONTACTED within THIS WEEK's cohort:
- The `lead_activity` record updates.
- The property remains a member of the current cohort (its `weekly_cohort_members` row is unchanged).
- The property moves from REMAINING to CONTACTED in the THIS WEEK metrics.
- The property no longer appears as an unworked item in the work queue (UI should distinguish worked vs unworked within the cohort).
- The property is permanently excluded from future cohorts.

### APPOINTMENT properties in the UI

APPOINTMENT records are commercially important and must be visible independently. They appear:
- In ALL OPPORTUNITIES with a clear APPOINTMENT status badge.
- In the THIS WEEK metrics as a distinct count (see Section J).
- NOT as "new targets" (they do not occupy a prospecting slot).

### Follow-up pipeline architecture preservation

CONTACTED properties must not disappear from the product. They are:
- Visible in ALL OPPORTUNITIES with status filter.
- Counted in workspace pipeline metrics.
- Accessible for future outreach sequence assignment (see Section N).

The data model must not make CONTACTED properties invisible or hard to retrieve. A future `outreach_sequences` table will join on `opportunity_id` + `workspace_id`, using `lead_activity.status = 'CONTACTED'` as the eligibility gate.

---

## J. Weekly Metrics Definitions

The THIS WEEK workspace view displays a five-metric strip.

### Metric definitions

**THIS WEEK'S TARGETS**
```
Count of weekly_cohort_members rows belonging to the current week's cohort for this workspace.
```
This is the cohort's `actual_size`. It does not change after generation. It is the total number of new properties the contractor was assigned this week.

**REMAINING**
```
Count of weekly_cohort_members rows in the current cohort WHERE the corresponding opportunity
either has no lead_activity row for this workspace OR has lead_activity.status = 'NEW'.
```
This tells the contractor how many of this week's targets they have not yet worked. Decreases as they contact properties.

**CONTACTED**
```
Count of lead_activity rows for this workspace WHERE status = 'CONTACTED'.
Scope: all-time workspace pipeline total, not limited to the current cohort.
```
This is the contractor's cumulative outreach count. It reflects their overall follow-up pipeline depth, which is more meaningful for workflow planning than a cohort-scoped count. The metric label should read "CONTACTED" with a sub-label "(pipeline total)".

**APPOINTMENTS**
```
Count of lead_activity rows for this workspace WHERE status = 'APPOINTMENT'.
Scope: all-time workspace pipeline total.
```
Appointments are commercially significant. They must appear as a separate metric, never combined with CONTACTED. The sub-label reads "(pipeline total)".

**WON**
```
Count of lead_activity rows for this workspace WHERE status = 'WON'.
Scope: all-time workspace pipeline total.
```
The contractor's closed-won count across all prospecting to date.

### Rationale for pipeline-total scope on CONTACTED / APPOINTMENTS / WON

Using workspace pipeline totals (rather than cohort-scoped counts) for CONTACTED/APPOINTMENTS/WON provides a more honest picture of the contractor's overall business development progress. A cohort-scoped count would reset to zero each Monday, making prior work invisible. The contractor's pipeline doesn't reset; the metrics shouldn't either.

THIS WEEK'S TARGETS and REMAINING are cohort-scoped because they specifically describe this week's new-prospecting work queue.

---

## K. Week Rollover Behavior

### Week definition

A week begins on Monday (ISO week standard). `week_start` is always a Monday date.

### Rollover trigger

Rollover occurs lazily on first access: when a contractor loads the THIS WEEK view and no cohort exists for the current ISO week, the system generates one. There is no scheduled cron job for cohort generation in M6. Lazy generation ensures the freshest eligible pool is used at the moment the contractor starts their week.

### Rollover rules

On rollover, the selection algorithm (Section G) runs with the current week's Monday as `week_start`. The following categories of properties are excluded from the new cohort:

| Category | Excluded? | Reason |
|---|---|---|
| Previously assigned to ANY prior cohort for this workspace | Yes | Cohort assignment exhausts new-prospect eligibility |
| status = CONTACTED | Yes | Graduated to follow-up pipeline |
| status = APPOINTMENT | Yes | Active opportunity; not a new prospect |
| status = WON | Yes | Closed |
| status = NOT_INTERESTED | Yes | Closed |
| property_zip not in service_zip_codes | Yes | Out of service area |
| coverage_state != SUPPORTED | Yes | Out of coverage |

Properties that were in last week's cohort and remain NEW in `lead_activity` are excluded because they were assigned last week (they are in `weekly_cohort_members`). They are not recycled.

### Pool exhaustion on rollover

If zero eligible NEW opportunities exist in the service area at rollover time:

1. Generate a `weekly_cohorts` row with `actual_size = 0` and `pool_exhausted = true`.
2. Display a clear message in the THIS WEEK view: "No new prospecting targets are available in your service area. All eligible properties in your selected ZIP codes have been assigned. To continue prospecting, expand your service area to additional ZIP codes."
3. Do NOT silently reuse CONTACTED or previously-assigned properties to fill the week.
4. Do NOT lower data integrity standards or suppress the `property_zip` filter.

### No manual regeneration

There is no "Regenerate" button in M6. The cohort generated on Monday morning is stable for the week. If future research demonstrates contractors need a refill or replacement mechanism, it will be designed deliberately in a future milestone. For now, the list is what it is.

---

## L. Mid-Week Target-Size Change Behavior

### Scenario: increase (25 → 50 or 50 → 100)

The contractor wants more targets during an active week.

**Behavior:**
1. Update `workspaces.weekly_target_size` to the new value.
2. If a cohort already exists for the current week, append additional ranked eligible NEW properties to fill the gap up to the new target size.
   - Append up to `(new_target_size - current_cohort.actual_size)` additional members.
   - Use the same deterministic ranking algorithm, excluding all already-assigned properties.
   - Insert new rows into `weekly_cohort_members` with rank positions continuing from the last rank (e.g., if current cohort has 25 members at ranks 1–25, new members receive ranks 26–50).
   - Update `weekly_cohorts.target_size` to the new value and `actual_size` to the updated count.
3. If the pool is already exhausted (no eligible properties remain), set `pool_exhausted = true` and inform the contractor.
4. The original 25 members and their rank positions are unchanged.

**Rationale:** Increasing the target mid-week is additive. Historical integrity is preserved because existing members are not reordered or removed. The contractor gets the additional targets they requested.

### Scenario: decrease (100 → 50 or 50 → 25)

The contractor decides they want fewer targets going forward.

**Behavior:**
1. Update `workspaces.weekly_target_size` to the new value.
2. The current week's cohort is NOT modified. All existing members remain in `weekly_cohort_members`. The contractor still has all 100 (or 50) of their current targets for this week.
3. The new target size takes effect at next week's rollover.
4. Display an informational note: "Your weekly target size has been updated to N. This takes effect next week. Your current list is unchanged."

**Rationale:** Decreasing targets should never delete the contractor's existing work queue mid-week. The contractor may have already started working properties in that cohort. Retroactive deletion would destroy historical records and confuse workflow.

### Target-size changes and `actual_size` / `target_size` columns

- `weekly_cohorts.target_size`: updated on increase; not updated on decrease (it reflects the target at generation time, or the upward-adjusted target after an in-week increase).
- `weekly_cohorts.actual_size`: updated to reflect the true current member count after any append.

---

## M. Mid-Week Service-Area Change Behavior

### Scenario: ZIP codes added to service area

The contractor expands their territory by adding new ZIP codes.

**Behavior:**
1. Update `workspaces.service_zip_codes` immediately.
2. The current week's cohort is NOT automatically expanded with properties from the new ZIPs.
3. The new ZIPs take effect at next week's rollover — the new eligible pool will include properties from the expanded service area.
4. Display: "Your service area has been updated. New ZIP codes will be included in next week's targets."

**Exception — explicit in-week expansion request:** If the contractor requests a target-size increase (Section L) in the same session as a ZIP expansion, the append algorithm (L, step 2) should use the updated `service_zip_codes`, which now includes the new ZIPs. This is the only case where new-ZIP properties can enter the current cohort mid-week, and only because the contractor explicitly requested more targets.

**Rationale:** Automatically injecting new-ZIP properties into a stable current cohort would change the Monday list unpredictably. The contractor should understand their current list is fixed. New territory takes effect at a defined weekly boundary.

### Scenario: ZIP codes removed from service area

The contractor narrows their territory by removing ZIP codes.

**Behavior:**
1. Update `workspaces.service_zip_codes` immediately.
2. Properties from the removed ZIPs that are already in the current week's cohort remain in the cohort. Their membership is historical and must not be destroyed.
3. The current week's `lead_activity` for those properties is unaffected.
4. Removed ZIPs take effect at next week's rollover — properties from removed ZIPs will not appear in next week's cohort.
5. Display: "ZIP code(s) removed from your service area. Properties already in your current list are unaffected. Changes take effect next week."

**Rationale:** Destroying current-cohort membership when a ZIP is removed would be unexpected and destructive. The contractor may have already started working properties from that ZIP. Retroactive removal of a Monday list property would lose work context.

### Summary of service-area change timing

| Change type | Current cohort | Next cohort |
|---|---|---|
| ZIP added | Unaffected (unless paired with explicit target-size increase) | New ZIP included |
| ZIP removed | Existing members from removed ZIP stay | Removed ZIP excluded |

---

## N. Future Outreach Compatibility

### Prospecting lifecycle

M6 does not implement outreach. However, the data model must not foreclose it. The intended future lifecycle is:

```
FIND (weekly cohort generation)
  → PRIORITIZE (ranking; contractor review)
  → CONTACT (status → CONTACTED; lead_activity record)
  → FOLLOW UP (postcard / email / SMS sequences — future)
  → APPOINTMENT (status → APPOINTMENT)
  → WIN / CLOSE (status → WON or NOT_INTERESTED)
```

This is an HVAC prospecting lifecycle, not a generic CRM.

### What M6 must preserve to enable this lifecycle

**1. CONTACTED properties must remain addressable**

`lead_activity` rows with `status = 'CONTACTED'` are the entry point to the follow-up pipeline. A future `outreach_sequences` table will query:

```sql
SELECT la.opportunity_id, o.address, o.owner_mailing_address, o.owner_mailing_zip
FROM lead_activity la
JOIN opportunities o ON o.id = la.opportunity_id
WHERE la.workspace_id = :workspace_id
  AND la.status = 'CONTACTED';
```

This query must remain efficient. The existing index on `lead_activity(workspace_id, status)` supports it.

**2. Owner mailing address must be stored separately from property geography**

`owner_mailing_address`, `owner_mailing_zip` on `opportunities` are the future postcard/direct-mail delivery fields. They must never be conflated with `property_zip` (already enforced by M6-0).

**3. `status_changed_at` must be maintained**

`lead_activity.status_changed_at` records when each status transition occurred. Outreach sequences will use this to determine whether a follow-up is overdue. Do not drop or stop updating this field.

**4. The status model must not be extended arbitrarily**

Future outreach sub-states (e.g., POSTCARD_SENT, EMAIL_1_SENT) should NOT be added as top-level `lead_activity.status` values. They belong in a separate `outreach_events` table that references `lead_activity`. The current five statuses (NEW, CONTACTED, APPOINTMENT, WON, NOT_INTERESTED) form a clean lifecycle pipeline; adding outreach states to this enum would conflate two different concepts.

**5. `weekly_cohort_members` must not be used for outreach targeting**

Outreach sequences should be driven by `lead_activity.status`, not by cohort membership. A CONTACTED property from six weeks ago is just as valid an outreach target as one from this week.

---

## O. Required Migrations / Indexes / RLS

### Migration order

All M6-0 migrations must run before any M6 service-area or cohort migrations.

#### Migration M6-0-001: Property geography integrity

```sql
-- Add canonical property ZIP column
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS property_zip text,
  ADD COLUMN IF NOT EXISTS owner_mailing_zip text;

COMMENT ON COLUMN public.opportunities.zip IS
  'DEPRECATED: use property_zip. Retained during M6-0 migration.';
COMMENT ON COLUMN public.opportunities.property_zip IS
  'Canonical site-address ZIP. Source: City of Dallas parcel layer or DCAD SITEADDRESS. Never from DCAD PSTLZIP5.';
COMMENT ON COLUMN public.opportunities.owner_mailing_zip IS
  'Owner mailing ZIP from DCAD PSTLZIP5. Used for future outreach only. Never used for geography.';

-- Index for service-area lookups
CREATE INDEX IF NOT EXISTS opportunities_property_zip_idx
  ON public.opportunities(property_zip);

-- GIN index for array containment on workspaces (added here for forward reference; also in M6-001)
```

#### Migration M6-001: Service area and weekly targets schema

```sql
-- Extend workspaces
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS service_zip_codes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS weekly_target_size integer NOT NULL DEFAULT 25
    CHECK (weekly_target_size IN (25, 50, 100));

-- GIN index for service-area containment queries
CREATE INDEX IF NOT EXISTS workspaces_service_zip_codes_gin_idx
  ON public.workspaces USING GIN(service_zip_codes);

-- Weekly cohorts
CREATE TABLE IF NOT EXISTS public.weekly_cohorts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  week_start      date NOT NULL,
  target_size     integer NOT NULL CHECK (target_size IN (25, 50, 100)),
  actual_size     integer NOT NULL,
  pool_exhausted  boolean NOT NULL DEFAULT false,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, week_start)
);

-- Weekly cohort members
CREATE TABLE IF NOT EXISTS public.weekly_cohort_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id       uuid NOT NULL REFERENCES public.weekly_cohorts(id) ON DELETE CASCADE,
  opportunity_id  uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  rank_position   integer NOT NULL,
  added_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cohort_id, opportunity_id),
  UNIQUE (cohort_id, rank_position)
);

-- Indexes
CREATE INDEX IF NOT EXISTS weekly_cohorts_workspace_week_idx
  ON public.weekly_cohorts(workspace_id, week_start DESC);

CREATE INDEX IF NOT EXISTS weekly_cohort_members_cohort_idx
  ON public.weekly_cohort_members(cohort_id, rank_position);

CREATE INDEX IF NOT EXISTS weekly_cohort_members_opportunity_idx
  ON public.weekly_cohort_members(opportunity_id, cohort_id);
-- ^ Used by eligibility filter: "has this opportunity ever been in a cohort for workspace X?"
-- The join path is: weekly_cohort_members.cohort_id → weekly_cohorts.workspace_id
-- Consider a denormalized workspace_id column on weekly_cohort_members for performance at scale:
--   ADD COLUMN workspace_id uuid REFERENCES workspaces(id)  -- optional future optimization
```

### RLS policies for new tables

```sql
-- Enable RLS
ALTER TABLE public.weekly_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_cohort_members ENABLE ROW LEVEL SECURITY;

-- weekly_cohorts: members of the workspace can read their own cohorts
CREATE POLICY cohorts_member_read ON public.weekly_cohorts
  FOR SELECT USING (public.is_workspace_member(workspace_id));

-- Only server-side (service role) inserts; no client-side cohort creation
-- No client INSERT policy on weekly_cohorts or weekly_cohort_members
-- Cohort generation runs as a server action / API route with service role

-- weekly_cohort_members: accessible if user is member of the parent cohort's workspace
CREATE POLICY cohort_members_member_read ON public.weekly_cohort_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.weekly_cohorts wc
      WHERE wc.id = cohort_id
        AND public.is_workspace_member(wc.workspace_id)
    )
  );

-- workspaces: extend existing member-read policy to cover new columns (no change needed;
-- existing policy covers all columns via SELECT *)

-- workspaces: allow members to update service_zip_codes and weekly_target_size
CREATE POLICY workspaces_member_update ON public.workspaces
  FOR UPDATE USING (public.is_workspace_member(id))
  WITH CHECK (public.is_workspace_member(id));
```

### Supplemental index recommendation

The eligibility query (Section G, Step 1) performs an anti-join against `weekly_cohort_members` via `weekly_cohorts`. At scale, this join is:

```
opportunities → (anti-join) weekly_cohort_members → weekly_cohorts (workspace_id filter)
```

If this query becomes slow as cohorts accumulate, add a denormalized `workspace_id` column to `weekly_cohort_members` with an index on `(workspace_id, opportunity_id)`. This allows the anti-join to be:

```sql
WHERE NOT EXISTS (
  SELECT 1 FROM weekly_cohort_members wcm
  WHERE wcm.workspace_id = :workspace_id
    AND wcm.opportunity_id = o.id
)
```

which is substantially faster than the two-hop join. This optimization is noted here but not required for MVP launch.

---

## P. Edge Cases

### P-1: First-time workspace setup (no service area, no cohort)

**Condition:** Contractor has just created a workspace. `service_zip_codes = '{}'` and no cohorts exist.

**Behavior:** Show a setup prompt: "Select your service ZIP codes to get started. Then choose your weekly target volume." Do not generate an empty cohort. Do not navigate to THIS WEEK until at least one ZIP is selected.

---

### P-2: Contractor requests 100 but only 73 eligible opportunities exist

**Condition:** `target_size = 100`, eligible pool = 73.

**Behavior:** Assign all 73. Set `actual_size = 73`, `pool_exhausted = true`. Show: "73 of 100 requested targets are available in your service area. Consider adding more ZIP codes to reach your full target."

---

### P-3: Pool completely exhausted — zero eligible NEW properties

**Condition:** Contractor has worked or been assigned every eligible property in their service area across previous weeks.

**Behavior:** Generate a `weekly_cohorts` row with `actual_size = 0`, `pool_exhausted = true`. Show: "No new properties are available in your service area. All eligible opportunities have been assigned. Expand your service ZIP codes to continue."

Do not recycle any previously-assigned or CONTACTED properties.

---

### P-4: Cohort already exists for current week (double-load / race condition)

**Condition:** The contractor triggers cohort generation twice simultaneously (e.g., two browser tabs opened at the same time on Monday morning).

**Behavior:** The `UNIQUE (workspace_id, week_start)` constraint on `weekly_cohorts` prevents duplicate cohort rows. The second insert fails silently; the first cohort is returned. Use an upsert with `ON CONFLICT DO NOTHING` in the generation logic, and re-fetch the existing cohort on conflict.

---

### P-5: Scoring update arrives mid-week

**Condition:** A new data refresh updates `opportunities.score` values after cohort generation.

**Behavior:** `weekly_cohort_members.rank_position` is not updated. The cohort order is frozen. The updated scores are reflected in the `opportunities` table and visible in the detail view, but the THIS WEEK list order does not change. This is intentional.

---

### P-6: New properties arrive mid-week (data pipeline adds new parcels)

**Condition:** A refresh adds new properties to `opportunities` after cohort generation.

**Behavior:** New properties are not added to the current week's cohort. They appear in ALL OPPORTUNITIES and become eligible for next week's cohort generation. This is intentional.

---

### P-7: Service area is modified to empty (all ZIPs removed)

**Condition:** Contractor removes all ZIP codes from their service area mid-week.

**Behavior:**
- Update `service_zip_codes` to `'{}'`.
- Current cohort is unaffected; existing members remain.
- Show a warning: "You have no ZIP codes in your service area. Next week's target list cannot be generated until you re-add ZIP codes."
- Next week rollover produces `actual_size = 0`, `pool_exhausted = true`.

---

### P-8: opportunity_id in current cohort is deleted from opportunities

**Condition:** A data correction removes a property from the `opportunities` table (e.g., it was incorrectly identified as a Dallas property).

**Behavior:** The `weekly_cohort_members` row cascades on delete (`ON DELETE CASCADE` via `opportunity_id → opportunities.id`). The property disappears from the cohort. `actual_size` on the `weekly_cohorts` row is now stale (too high). This should be treated as a data-correction event, not normal operation. The UI should tolerate a mismatch between `actual_size` and live member count without crashing.

---

### P-9: Contractor changes target size from 25 to 100 mid-week when 30 eligible remain

**Condition:** Current cohort has 25 members. Contractor increases to 100. Only 5 eligible NEW properties remain after excluding the 25 already assigned.

**Behavior:** Append the 5 eligible properties (ranks 26–30). Set `actual_size = 30`, `pool_exhausted = true`. Show: "5 additional targets added. No further eligible properties exist in your service area."

---

### P-10: lead_activity row disagrees with cohort membership

**Condition:** An opportunity appears in `weekly_cohort_members` but its `lead_activity.status` is CONTACTED (edge case from out-of-order writes).

**Behavior:** The property is treated as CONTACTED in the UI and metrics. Its presence in the cohort is a historical fact and does not override its current status. The CONTACTED count reflects current status; the cohort membership is unchanged.

---

### P-11: property_zip is NULL after M6-0 repair

**Condition:** A small number of opportunities have NULL `property_zip` because the site ZIP was genuinely unavailable from the source.

**Behavior:** These properties are INELIGIBLE for any service-area assignment (they cannot match any `service_zip_codes` array). They appear in ALL OPPORTUNITIES as `property_zip: null` and cannot be included in a weekly cohort. The contractor is not shown these properties as prospecting targets until the geography gap is resolved in a future data refresh.

---

### P-12: Week rollover on a Tuesday (contractor did not open the app on Monday)

**Condition:** The current ISO week has started (Monday has passed), but no cohort exists because the contractor hasn't logged in yet.

**Behavior:** Lazy generation — the cohort is generated on first THIS WEEK access regardless of the day of the week. The cohort is still anchored to that week's Monday date (`week_start = most recent Monday`). The cohort is stable for the remainder of the week.

---

## Q. Codex Implementation Milestones with Acceptance Criteria

### Gate rule

**M6-0 must pass before any other M6 milestone begins.** Codex must not write service-area selection UI, cohort generation logic, or weekly target views until M6-0 acceptance criteria are verified and the founder has reviewed the geography audit report.

---

### M6-0 — Property Geography Integrity

**Objective:** Audit and repair the property ZIP field so that service-area geography is trustworthy before it becomes operational.

**Acceptance criteria:**
- AC-M6-0-1 through AC-M6-0-8 as specified in Section B.
- The geography audit report is written to `docs/M6_GEOGRAPHY_AUDIT_REPORT.md` and includes: source-field tracing, row-count by ZIP range, list of contaminated rows, repair actions taken, post-repair verification query output.
- Founder reviews the audit report before M6-1 begins.

**Out of scope:** Service-area UI, cohort generation, weekly targets, outreach.

---

### M6-1 — Service-Area Schema and Settings

**Objective:** Add service-area and weekly-target-size settings to workspaces and allow a contractor to configure them.

**Acceptance criteria:**
- Migration M6-001 runs cleanly against the live Supabase project.
- `workspaces.service_zip_codes` and `workspaces.weekly_target_size` columns exist with correct constraints.
- A contractor can view and update their service ZIP codes via the app (list of available ZIPs derived from `SELECT DISTINCT property_zip FROM opportunities ORDER BY property_zip`).
- A contractor can select weekly target size: 25, 50, or 100.
- Service-area changes are persisted immediately via RLS-controlled UPDATE.
- Only ZIPs present in the live `opportunities.property_zip` set are offered for selection (no free-text entry of arbitrary ZIPs).
- Settings are workspace-scoped; contractor A's settings cannot affect contractor B.
- `npm run lint` and `npm run build` pass.
- RLS: a test confirms that updating `service_zip_codes` for workspace A does not affect workspace B.

**Out of scope:** Cohort generation, weekly targets UI, outreach.

---

### M6-2 — Weekly Cohort Generation

**Objective:** Implement the deterministic selection algorithm and persist weekly cohorts.

**Acceptance criteria:**
- `weekly_cohorts` and `weekly_cohort_members` tables exist with all constraints and indexes from Section O.
- The selection algorithm (Section G) is implemented as a server-side function or API route.
- When a contractor first loads THIS WEEK with a configured service area, a cohort is generated if none exists for the current ISO week.
- The cohort includes at most `target_size` opportunities, all of which:
  - have `property_zip = ANY(service_zip_codes)`,
  - have `coverage_state = 'SUPPORTED'`,
  - have never appeared in any prior `weekly_cohort_members` row for this workspace,
  - have no `lead_activity.status IN ('CONTACTED', 'APPOINTMENT', 'WON', 'NOT_INTERESTED')` for this workspace.
- Opportunities are ranked deterministically by: score DESC, evidence_confidence, opportunity_strength, year_built ASC, id ASC.
- HIGH, MEDIUM, and LOW priority opportunities all appear if they are eligible. No minimum priority threshold is applied.
- If pool < target_size, all eligible properties are returned and `pool_exhausted = true`.
- The cohort does not change on subsequent page loads (stable list verified by loading the page twice and asserting identical member sets).
- `UNIQUE (workspace_id, week_start)` prevents duplicate cohorts (concurrent generation test).
- RLS: cohort rows are only readable by workspace members.
- `npm run lint` and `npm run build` pass.

**Out of scope:** THIS WEEK UI, metrics display, rollover handling, outreach.

---

### M6-3 — THIS WEEK View and Pipeline Metrics

**Objective:** Expose the weekly cohort as the contractor's primary THIS WEEK work queue with five-metric strip.

**Acceptance criteria:**
- THIS WEEK shows the current cohort's opportunities in rank order (rank_position ASC).
- All five metrics are displayed: THIS WEEK'S TARGETS, REMAINING, CONTACTED, APPOINTMENTS, WON.
- THIS WEEK'S TARGETS = `weekly_cohorts.actual_size` (cohort-scoped).
- REMAINING = count of cohort members with status NEW / no lead_activity (cohort-scoped).
- CONTACTED = count of all `lead_activity` rows for workspace with status = CONTACTED (workspace pipeline total).
- APPOINTMENTS = count of all `lead_activity` rows for workspace with status = APPOINTMENT (workspace pipeline total).
- WON = count of all `lead_activity` rows for workspace with status = WON (workspace pipeline total).
- When `pool_exhausted = true` and `actual_size < target_size`, an informational message is displayed.
- When `service_zip_codes` is empty, an onboarding prompt is shown instead of THIS WEEK.
- When `actual_size = 0`, a "no new properties available" message is shown.
- Status changes by the contractor (NEW → CONTACTED, etc.) are reflected in REMAINING and pipeline metrics without page reload (optimistic or reactive update).
- `npm run lint` and `npm run build` pass.

**Out of scope:** Week rollover, target-size changes, service-area changes, outreach.

---

### M6-4 — Week Rollover and ALL OPPORTUNITIES Integration

**Objective:** Handle week transitions and integrate the full-service-area view.

**Acceptance criteria:**
- On the first THIS WEEK load of a new ISO week, a new cohort is generated (lazy rollover).
- The previous week's cohort remains accessible in its historical state (data only; no dedicated UI required in M6).
- CONTACTED and APPOINTMENT properties from prior weeks do not appear as new targets in the new cohort.
- Previously-assigned-but-unworked properties (in prior cohorts, still NEW status) do not appear in the new cohort.
- ALL OPPORTUNITIES shows every opportunity with `property_zip = ANY(service_zip_codes)` with current statuses.
- ALL OPPORTUNITIES supports status filtering: NEW, CONTACTED, APPOINTMENT, WON, NOT_INTERESTED.
- CONTACTED and APPOINTMENT properties are visible and accessible through ALL OPPORTUNITIES without navigating to a separate CRM tab.
- Pool exhaustion is correctly detected and communicated at rollover.
- `npm run lint` and `npm run build` pass.

**Out of scope:** Target-size changes mid-week, service-area changes mid-week, outreach.

---

### M6-5 — Target-Size and Service-Area Changes

**Objective:** Implement safe mid-week and rollover behavior for target-size and service-area changes.

**Acceptance criteria:**

**Target-size increase (mid-week):**
- Increasing target size appends additional ranked eligible NEW properties to the current cohort.
- Existing cohort members are not reordered or removed.
- New members receive rank positions continuing from the last rank.
- `weekly_cohorts.actual_size` and `target_size` are updated.
- Pool exhaustion is handled correctly (append only as many as exist).

**Target-size decrease:**
- Decreasing target size does NOT modify the current cohort.
- The change takes effect only for the next week's rollover.
- An informational message confirms the new size takes effect next week.

**Service-area ZIP added:**
- Adding a ZIP does NOT automatically add new-ZIP properties to the current cohort.
- New ZIP takes effect at next week's rollover.
- Exception: if a target-size increase is also requested, the append algorithm uses the updated service_zip_codes.

**Service-area ZIP removed:**
- Removing a ZIP does NOT remove current-cohort members from removed ZIPs.
- Removed ZIP takes effect at next week's rollover.
- An informational message is shown.

**All scenarios:**
- `npm run lint` and `npm run build` pass.
- No historical cohort members are deleted by any of the above actions.

**Out of scope:** Outreach, manual regeneration.

---

### Milestones not in M6 scope

The following are explicitly deferred and must not be implemented in any M6 milestone:

- Email sequences, postcard sequences, SMS, or any automated outreach
- A "Regenerate" or "Reset weekly list" feature
- Maps, routing, drive-time APIs, geocoding dependencies
- Polygon or radius-based service areas
- Custom campaign sizes beyond 25 / 50 / 100
- Multi-team or enterprise permissions
- A dedicated CRM pipeline tab (CONTACTED/APPOINTMENTS remain accessible through ALL OPPORTUNITIES)
- Previous-week cohort history view (data is preserved; UI is deferred)
