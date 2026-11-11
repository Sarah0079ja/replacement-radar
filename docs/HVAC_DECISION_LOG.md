# HVAC Opportunity Decision Log

## 2026-11-02 — Founder selects HVAC Replacement Radar as current product direction

**Decision:** Proceed toward an MVP of the original HVAC Replacement Intelligence concept, now named **HVAC Replacement Radar**.

**Product definition:** A sales-intelligence SaaS for residential HVAC contractors that identifies and ranks properties in one supported territory that may have stronger-than-average HVAC replacement signals.

**Founder constraints recorded:**

- Do not redirect the product toward CRM reactivation.
- Begin with one geographic market; Dallas–Fort Worth remains the initial candidate.
- Prefer public data and low-cost APIs before expensive proprietary datasets.
- Equipment age may be uncertain and is not required to be known with certainty.
- Every property signal must be labeled as verified signal, inferred signal, proxy, unknown, or confidence level.
- Never represent inferred equipment age as a verified fact.
- Prospecting intelligence is probabilistic and must show visible reasons.
- No implementation, Claude delegation, dependency installation, or REA use during the feasibility spike.

**Technical feasibility decision:** DFW is feasible for a scoped first market. Dallas OpenData provides a daily machine-readable building-permit feed; Fort Worth exposes a queryable permit layer with work descriptions and dates; Dallas and Tarrant appraisal/GIS sources provide parcel/property attributes. Coverage is fragmented across municipalities, so the launch promise must explicitly cover supported Dallas/Fort Worth jurisdictions and ZIPs rather than all 11 MSA counties.

**Current gate:** Run a timeboxed data test before coding. Pass criteria are documented in [HVAC_REPLACEMENT_RADAR_FEASIBILITY.md](HVAC_REPLACEMENT_RADAR_FEASIBILITY.md).

**Recommendation:** Conditional build path: run the data test; if address/parcel joins, permit categorization, licensing review, and a preliminary signal-lift check pass, build the 3–4 week MVP.

**Evidence used:** [HVAC_LAST30DAYS.md](HVAC_LAST30DAYS.md), official Dallas OpenData, Fort Worth ArcGIS, Dallas CAD, Tarrant appraisal/GIS, Census Geocoder, Austin comparison sources, and current infrastructure pricing pages. Key source links and limitations are recorded in the feasibility document.

## Prior context

The prior research recommended a conditional direction centered on unsold estimate recovery and existing-customer replacement intelligence. The founder has explicitly superseded that product direction for the current phase and selected the original property-prospecting concept. The prior research remains evidence about market context and does not override this decision.

## 2026-11-04 — M6-1 service-area and weekly-target settings implementation

**Decision:** Implement workspace-level service-area configuration and weekly prospect-volume preferences only. Service areas use canonical `opportunities.property_zip` values; owner mailing geography is not eligible for selection. The current 307-opportunity dashboard remains unchanged until cohort generation is implemented in a later milestone.

**Storage:** `workspaces.service_zip_codes text[]` defaults to an honest empty array for existing workspaces. `workspaces.weekly_target_size integer` defaults to 25 and is constrained to positive values so future custom target sizes do not require a table redesign; the MVP UI exposes 25, 50, and 100.

**Security:** Existing workspace-member RLS read isolation is preserved. A member-only workspace update policy and a database trigger reject service ZIPs not present in canonical `opportunities.property_zip`. No opportunity, lead activity, or note rows are modified.

**Manual gate:** Migration `app/supabase/migrations/202611040001_service_area_settings.sql` must be applied to the live Supabase project before M6-1 can be marked PASS. No cohort tables or weekly target generation are included.

## 2026-11-04 — M6-2 weekly cohort generation implementation

**Decision:** Implement only the persisted weekly cohort engine. Generation is server-controlled through a `SECURITY DEFINER` RPC and `/api/this-week`; no contractor-facing THIS WEEK dashboard is included. Cohorts use Monday–Sunday weeks calculated in `America/Chicago` for the Dallas MVP.

**Safety:** Cohorts are workspace-specific, use canonical `property_zip`, permanently exclude prior assignments for that workspace, exclude CONTACTED/APPOINTMENT/WON/NOT INTERESTED statuses, and preserve deterministic rank positions. Authenticated clients receive SELECT-only access to cohort tables; generation writes are not exposed through table privileges.

**Deferred:** Cohort UI, rollover, midweek expansion, history UI, recycling/cooldown, timezone configuration, and all outreach remain future milestones.

## 2026-11-02 — Rapid public-data spike authorizes MVP build conditionally

**Experiment:** 10,000 residential DCAD parcel records were scored against 41,154 Dallas OpenData mechanical permits using a reproducible standard-library-only script. The pipeline normalized addresses, matched 835 properties, classified permit descriptions deterministically, and generated a top-100 CSV with visible reasons.

**Result:** The core transformation is technically viable. Among matched properties, 232 were strong/verified HVAC replacement signals, 310 were recent HVAC permits, and the top 20 contained 17 explicit older HVAC replacement/install records plus 3 ambiguous mechanical records.

**Critical limitation:** The exact normalized address match rate was 8.35% because the property sample was county-wide/coverage-mixed while the permit feed is City of Dallas jurisdiction data. This is a coverage alignment problem, not evidence that the product concept is unusable.

**Decision:** **AUTHORIZE MVP BUILD**, conditional on the first implementation milestone aligning supported Dallas ZIP/jurisdiction coverage to the permit source. Do not label unmatched properties “no permit found” until source coverage is known. Keep the product’s evidence/proxy/unknown labels and do not claim verified HVAC age.

**Artifacts:** [HVAC_DATA_SPIKE_RESULTS.md](HVAC_DATA_SPIKE_RESULTS.md) and `data-spike/`.

## 2026-11-02 — Founder authorizes MVP build

**Decision:** The founder authorized implementation of the first HVAC Replacement Radar MVP for Dallas, Texas.

**Milestone 0:** Passed. The supported universe is now sourced from City of Dallas residential parcels and enriched from DCAD by parcel ID. `coverage_state` is explicit; only `SUPPORTED` properties can receive absence-of-permit scoring. The aligned rerun used 5,000 properties, 41,156 mechanical permits, and produced a reproducible ranked top 100.

**Approved V1 scope:** Authentication, contractor account, Dallas supported territory selection, ranked explainable opportunity list, confidence, property detail/evidence, filters, map, CSV export, and basic internal data refresh.

**Explicit exclusions:** ServiceTitan/Housecall Pro, SMS/email outreach, homeowner enrichment, HVAC Revenue Radar, national/multi-metro coverage, complex AI agents/chatbot, direct mail, mobile app, enterprise permissions, team management, and Stripe billing.

**Implementation rule:** Continue autonomously through ordinary milestones. Pause only for material scope change, paid service, credentials, major data/legal blocker, or destructive/global system change.
## 2026-11-02 — MVP implementation started

- Founder authorized the Dallas MVP build after the aligned data spike passed.
- M1 founder-testable ranked-list shell is implemented from the real spike output. It includes explainable scores, visible source evidence, confidence/coverage labels, filters, detail view, and browser CSV export.
- A bounded Supabase Auth seam and explicit local demo login were added. No production credentials are present, so the app cannot claim production authentication yet.
- Map UI remains an explicit next milestone because the spike artifacts do not contain coordinates; the product will not fabricate map positions.
- `npm run lint` and `npm run build` pass from `app/`.

## 2026-11-02 — Scoring model revised before infrastructure

- Founder requested a commercial-value ranking review before Supabase, authentication, maps, or outreach work.
- The old model was rejected for overweighting old property age, single-family classification, and absence of a permit. The founder fixture had 126/307 rows at score 43 and 80/307 at score 40.
- The deterministic model now classifies HVAC replacement, HVAC installation, HVAC repair, ambiguous HVAC, ambiguous mechanical, and non-HVAC mechanical records.
- `last_known_hvac_event_year` and `estimated_years_since_last_known_hvac_event` are persisted as historical permit evidence and explicitly not current equipment age.
- `evidence_confidence` is separate from `opportunity_strength`.
- No-match properties receive zero absence-of-permit opportunity points; no permit match remains unknown and is never treated as proof of no replacement.
- Full aligned sample result: 5,000 scored; 623 historical HVAC replacement/install events; 18 Strong, 399 Medium, 4,583 Weak opportunities.
- Top-20 quality gate: CONDITIONAL PASS. All top 20 app-fixture rows have dated HVAC-specific evidence and exact normalized joins, but public permit history has limited depth and several ties remain.
- The app list/detail view was updated only to expose opportunity strength, evidence confidence, event year, years since known event, and source labels. No infrastructure work was started as part of this review.
## 2026-11-02 — Contractor workspace milestone implemented

- Added Supabase migration for profiles, workspaces, memberships, shared opportunities, workspace-scoped lead activity, and private notes.
- Added RLS policies requiring workspace membership for contractor activity and notes; opportunity records remain shared authenticated read-only data.
- Added signup/login/protected route flow with first-signup workspace creation through an auth trigger.
- Added lead statuses NEW, CONTACTED, APPOINTMENT, WON, and NOT INTERESTED with timestamps and workspace-specific filtering.
- Added private notes, status-aware CSV export, and compact contractor pipeline counts.
- Preserved local demo mode when Supabase credentials are unavailable.
- Excluded maps, outreach automation, CRM integrations, billing, and additional cities as authorized.
- Quality gate: lint and production build pass; RLS migration is present and statically checked, but live RLS isolation requires Sarah's Supabase project credentials for execution.
## 2026-11-02 — Supabase runtime verification and review fixes

- Seeded exactly 307 opportunities into the Supabase project.
- Runtime checks verified separate contractor workspaces, authenticated opportunity reads, workspace-private status writes, private notes, logout/login persistence, and cross-workspace isolation.
- Public disposable-account signup was rate-limited by the Supabase project during testing; authenticated login and the automatic workspace trigger were verified with confirmed test users.
- Replaced middleware convention with Next.js `proxy.ts`.
- Supabase-configured opportunity loading now shows loading/error/empty states and never silently falls back to the demo fixture.
- Workspace name and user initials are loaded from Supabase; status/note write errors are surfaced; notes use stable IDs; signup is protected; workspace selection is ordered deterministically.
- Seed credentials are now documented as seed-only in `.env.seed.local`; Sarah must manually move the existing service-role value out of `app/.env.local` because credentials were intentionally not printed or rotated.
## 2026-11-02 — Safe Supabase user deletion fix

- Confirmed live deletion failure root cause: `public.lead_notes.user_id` referenced `auth.users(id)` with `ON DELETE RESTRICT`, and one runtime test user owned one note.
- Added forward-only migration `202611020004_safe_user_deletion.sql`.
- Deleted-user note authors become `NULL` when a workspace has other members.
- A workspace with no remaining memberships is deleted by a security-definer cleanup trigger; its workspace-owned notes/activity cascade, while shared opportunities remain untouched.

## 2026-11-03 — M6-0 property geography integrity

- Audited all 307 live opportunities and confirmed the legacy `zip` field was contaminated: it exactly matched the DCAD owner mailing ZIP on all 307 rows. Seven rows had non-Dallas/withheld ZIP indicators and ten rows had owner-mailing cities displayed as property cities.
- Root cause was `run_spike.py` writing `PSTLZIP5` and `PSTLCITY` into generic property fields.
- Established `property_zip` as canonical site geography and `owner_mailing_zip` as a separate mailing field. The repair uses matched Dallas permit site ZIPs for 305 rows and City of Dallas parcel geometry intersected with public ZIP polygons for the remaining two.
- Local repair result: all 307 rows have verified property ZIPs in `75224`, `75248`, `75252`, or `75254`; no rows are unrecoverable. Scoring and ranking were not changed.
- Added migration `202611030006_property_geography.sql`, pipeline guards, local audit/repair artifacts, and a service-role repair script. Live Supabase remains pending Sarah's manual application of the migration followed by the repair command.
- **M6-0 gate: BLOCKED until live schema/data verification completes.** M6-1 and all service-area/weekly-cohort work remain prohibited.
- The later permanent weekly-cohort exclusion rule remains unchanged and is documented as an MVP policy rather than an irreversible product assumption.

## 2026-11-03 — M6-0 city follow-up

- Final live verification found that the first ZIP repair did not update the legacy `city` alias; ten rows still displayed DCAD owner-mailing cities.
- Repaired all 307 live legacy `city` values in place to the verified City of Dallas property city. Opportunity IDs, parcel IDs, scoring, HVAC evidence, lead activity, and notes were preserved.
- Added explicit pipeline fields `property_city` and `owner_mailing_city`, plus migration `202611030007_property_city.sql` and an updated in-place repair script.
- The new city migration is not yet applied in Supabase; the live schema probe confirms both canonical city columns are absent. **M6-0 remains blocked until Sarah applies the migration and reruns the repair verification.**
