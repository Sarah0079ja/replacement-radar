# HVAC Replacement Radar — Technical Feasibility Spike

**Decision context:** Founder-selected direction: build toward the original HVAC Replacement Radar concept. This document is a pre-build technical feasibility assessment, not an implementation plan already in progress.

**Assessment date:** November 2, 2026  
**Target build team:** Sarah + Claude Code + Codex  
**Target MVP window:** 2–4 weeks after the build decision

## Executive verdict

**Launch market:** Dallas–Fort Worth, initially with explicit supported coverage for Dallas and Fort Worth municipal areas and selected ZIP codes. Do not promise complete coverage of every DFW suburb or all 11 MSA counties in V1.

**MVP build difficulty:** MODERATE  
**Estimated MVP build time:** 3–4 focused weeks, assuming one engineer-founder and no permit-data vendor integration  
**Estimated initial monthly data/infra cost:** approximately $50–$200 before meaningful customer volume  
**Can 10K–50K properties be scored automatically?** YES  
**Can we build without expensive proprietary data?** YES  
**Can the product provide meaningfully better prospecting than a random address list?** NOT YET PROVEN; technically plausible and testable with a small backtest/customer pilot

**Final recommendation:** RUN ONE SPECIFIC DATA TEST FIRST, then build if the test confirms usable address matching and non-random signal separation. This is a narrow, one-week data test—not a reason to reject the concept or restart market research.

The essential test is: ingest a representative sample of Dallas and Fort Worth residential parcels, join the last 10–15 years of municipal permit records, classify HVAC/mechanical descriptions, and inspect whether the top-scoring 10–20% has materially more useful HVAC-related evidence than a random sample. The test should use deterministic rules and manually review at least 200 records.

## 1. Market selection

### Recommended market: Dallas–Fort Worth

The Dallas–Fort Worth–Arlington MSA consists of 11 counties: Collin, Dallas, Denton, Ellis, Hunt, Johnson, Kaufman, Parker, Rockwall, Tarrant, and Wise. The Texas Comptroller’s regional description confirms these county groupings and also shows the scale and growth of the market. [Texas Comptroller — Metroplex Region](https://comptroller.texas.gov/economy/economic-data/regions/2022/metroplex.php)

For the product, “DFW” should be treated as a commercial market label, while the data contract is narrower:

1. **V1 supported coverage:** City of Dallas and City of Fort Worth permit jurisdictions, joined to the relevant parcel/appraisal data.
2. **V1 territory selection:** supported ZIP codes, with a visible coverage badge; no silent implication that every DFW municipality is covered.
3. **Later expansion:** selected Collin, Denton, Tarrant, Dallas, and other municipal permit sources only after each source passes the same ingestion and terms test.

This is preferable to claiming county-wide DFW coverage from incomplete permit data. In Dallas County alone, many local governments issue permits; a third-party coverage page lists 32 local governments. That fragmentation is a real operating consideration, even though the Dallas city source itself is strong. [Dallas County permit reports](https://www.dallascounty.org/departments/duas/permit-reports.php)

### Why not change the launch market?

Austin is the strongest alternative considered. Its city open-data feed includes building, electrical, mechanical, and plumbing permits, issue dates, location, descriptions, valuation, units, and a Travis CAD ID; it is technically attractive. [Austin issued construction permits](https://data.austintexas.gov/Building-and-Development/Issued-Construction-Permits/3syk-w9eu/about_data)

Phoenix/Maricopa has unusually accessible assessor downloads, including residential construction year, building type, parcel information, and sales affidavits. [Maricopa County data requests](https://www.maricopa.gov/509/Data-Requests), [Maricopa Assessor data downloads](https://www.mcassessor.maricopa.gov/page/data_sales/)

Neither alternative is materially better enough to justify moving the founder-selected candidate: DFW has a large HVAC market, relevant official permit feeds in both core cities, useful appraisal/GIS sources, and a local customer-validation advantage. Austin can be the second market if the DFW data test fails; Phoenix is a later option if assessor-first scoring becomes more important than permit depth.

## 2. DFW source map

### Free public data — preferred for V1

| MVP field | Source | Access method | Cost | License/reuse | Coverage | Reliability |
|---|---|---|---:|---|---|---|
| Property address, parcel ID, geometry, year built, property class, living area, air-conditioning/heating indicators where present | Dallas Central Appraisal District | Bulk appraisal/GIS data downloads; CAD data-products page lists current/prior appraisal files and GIS parcel products | $0 download observed | Public data, but CAD-specific download terms and redistribution language must be reviewed before product resale; retain source/field provenance | Dallas County appraisal territory | Good for parcel/property attributes; annual/periodic appraisal cadence; not a verified HVAC install record. [DCAD Data Products](https://www.dallascad.org/dataproducts.aspx), [DCAD GIS products](https://dcadwebdev.dallascad.org/GISDataProducts.aspx) |
| Property address, parcel ID, geometry, year built, central heat/air flags | Tarrant Appraisal District / Tarrant County GIS | TAD distributed downloads and county ArcGIS services | $0 observed | Confirm current TAD download terms before redistribution; use attribution and disclaimer | Tarrant County | Good for parcel attributes; annual/periodic; the exposed county layer includes `YEAR_BUILT`, `CENTRAL_HE`, and `CENTRAL_AI`. [Tarrant parcel layer](https://mapit.tarrantcounty.com/arcgis/rest/services/Tax/TCProperty/MapServer/layers), [TAD data layout](https://www.tad.org/content/forms/PropertyData%26PropertyLocationLayouts.pdf) |
| Dallas city permit number, type, issue date, location/address, description, permit status/other fields as actually present | City of Dallas OpenData, Socrata dataset `e7gq-4sah` | Socrata SODA JSON/CSV API; daily dataset | $0 | Dallas OpenData says open data is available for everyone to use and republish; keep attribution, source URL, retrieval timestamp, and disclaimer | City of Dallas; permit history from January 2018 to present according to the published dataset description | Strongest V1 permit source; daily updates; description quality varies and coverage is city jurisdiction only. [Dallas OpenData FAQ](https://www.dallasopendata.com/stories/s/Dallas-ODP-FAQs/f7vs-a4ap/), [Dallas permit dataset](https://www.dallasopendata.com/resource/e7gq-4sah.json) |
| Fort Worth permit number, permit type/category, work description, address, application/issue/final/close dates, status, coordinates, residential/commercial use | City of Fort Worth Development Services GIS/ArcGIS | ArcGIS REST FeatureServer/MapServer query; JSON/GeoJSON/PBF; official full-data download also available | $0 | Fort Worth open-data terms require acceptance, source attribution when data is transferred/used for an end user, and prominent no-warranty language; do not imply city endorsement. [Fort Worth terms](https://mapit.fortworthtexas.gov/disclaimer.pdf) | City of Fort Worth permit layer; not the entire metro | Good technical access and rich fields; field semantics and historical depth need sample validation. [Fort Worth permit layer](https://mapit.fortworthtexas.gov/ags/rest/services/CIVIC/Permits/MapServer/0), [Fort Worth issued permits](https://www.fortworthtexas.gov/departments/development-services/permits/issued) |
| Address geocoding / lat-long | U.S. Census Geocoder | REST API; batch supports up to 10,000 addresses | $0 | Federal public service; follow service-use guidance and rate-limit requests | U.S. addresses | Adequate for batch geocoding; interpolated results can be approximate. [Census Geocoder documentation](https://www.census.gov/programs-surveys/geography/technical-documentation/complete-technical-documentation/census-geocoder.html) |
| ZIP, tract, owner-occupancy proxy, housing age distributions for calibration—not individual-property truth | U.S. Census ACS/TIGER | Census API and TIGER/Geocoder services | $0 | Public federal data | National | Useful for market context and calibration; not a substitute for parcel-level ownership or install data |

### Low-cost API / infrastructure options

| Need | Candidate | Expected V1 use | Expected cost |
|---|---|---|---:|
| Interactive map tiles and geocoding fallback | Mapbox GL JS + tiles/geocoding | Map display and address search; batch geocode with Census first | Low tens of dollars or less at MVP usage; verify current account quotas before launch. [Mapbox pricing](https://www.mapbox.com/pricing) |
| Hosting | Vercel | Next.js app and scheduled route/worker triggers | Hobby is $0 for non-commercial development; Pro is $20/month and is the sensible commercial baseline. [Vercel pricing](https://vercel.com/pricing) |
| Database/auth/storage | Supabase | Postgres, Row Level Security, Auth, storage for source files | Free for spike; budget approximately $25/month for Pro at commercial launch, plus usage if it grows. [Supabase pricing](https://supabase.com/pricing) |
| Scheduled ingestion | Vercel Cron, GitHub Actions, or a small scheduled worker | Daily/weekly pull, normalization, scoring refresh | $0–$25/month initially; use idempotent jobs and retry logs |
| Address normalization | Local deterministic normalization plus Census geocoder | Avoid expensive enrichment and reduce vendor dependence | $0 initially |

### Expensive or avoid for V1

Avoid CoreLogic/ATTOM/PropertyRadar-type proprietary property feeds, national permit aggregators, owner phone/email append services, and paid “HVAC replacement propensity” datasets until a pilot proves that the public-data score creates lift. They may improve convenience, but they would turn a technically simple one-market product into a data-licensing and margin problem.

## 3. HVAC permit feasibility

### What the public sources can support

Dallas’s official permit dataset is machine-readable and updated daily. The published dataset is described as covering permits from January 2018 to present and includes permit type, issue date, contractor, valuation, work description, land use, and property location. The V1 ingestion should query and retain the raw record, not only a derived label. [Dallas permit dataset description](https://www.datenus.com/data/building-permits-gttbwi)

Fort Worth exposes fields directly useful to this product: permit type/category, work description, address, applied date, issue date, final date, close date, status, residential/commercial use, coordinates, and job value. The work-description field is up to 4,000 characters, which is sufficient for keyword classification when present. [Fort Worth permit layer schema](https://mapit.fortworthtexas.gov/ags/rest/services/CIVIC/Permits/MapServer/0)

### Deterministic classification

Normalize descriptions to uppercase, strip punctuation, and classify in this order:

1. **Verified recent HVAC permit** — source permit category/type is mechanical/HVAC and description contains a strong replacement/install term such as `REPLACE`, `REPLACEMENT`, `CHANGE OUT`, `NEW HVAC`, `NEW AC`, `NEW AIR CONDITIONER`, `CONDENSER`, `FURNACE`, `HEAT PUMP`, `PACKAGE UNIT`, or `AIR HANDLER`, with an issue date inside the last 0–5 years.
2. **Older HVAC-related permit** — same strong classification with issue date older than 5 years.
3. **Ambiguous mechanical permit** — mechanical category/type but description is missing, generic, or includes terms such as `DUCT`, `GAS TEST`, `VENT`, `MECHANICAL`, `REPAIR`, or `ALTERATION` without clear replacement evidence.
4. **No relevant permit found** — the supported source was searched and no HVAC/mechanical record matched the parcel/address.
5. **Unknown** — source does not cover the address, address matching failed, or the record is too incomplete to classify.

These categories describe records, not equipment condition. A recent permit is evidence against immediate replacement prospecting, not proof that the system is new or functional. No relevant permit is absence of evidence, not evidence that the system is old.

### Expected inconsistency

Permit records will vary by jurisdiction, filing practice, description quality, address formatting, and whether work was permitted. A “mechanical” permit can include ductwork, gas work, ventilation, or non-HVAC work. An HVAC replacement can also be unpermitted, filed under a generic category, or missing from the public feed. The product should expose the raw description and source, preserve the classification reason, and use `unknown` whenever the system cannot support a stronger label.

The useful V1 goal is not perfect classification. It is a repeatable, inspectable separation between strong HVAC evidence, weak mechanical evidence, and no evidence found.

## 4. Can 10K–50K properties be scored?

Yes. A 10K–50K property slice is small for Postgres and can be scored with SQL or a TypeScript batch job. The scalable unit is a territory/ZIP batch, not one request per property.

### Required normalized property record

```text
property_id
parcel_id
normalized_address
city
state
zip
latitude
longitude
property_type
year_built
effective_year_built (optional)
living_area_sqft (optional)
owner_occupancy_flag (optional; proxy only)
last_sale_date (optional)
source_system
source_record_id
source_retrieved_at
data_quality_status
```

### Explainable V1 score

Use a 0–100 score. Show every component and its source label in the UI.

| Signal | Points | Rule | Label |
|---|---:|---|---|
| Property age | 0–25 | Year built ≤1999: 25; 2000–2009: 15; 2010–2015: 7; newer: 0; unknown: 0 | Inferred signal / proxy |
| Latest relevant HVAC permit age | -20 to 25 | Verified replacement/install in last 5 years: -20; 6–9 years: 5; 10–14 years: 15; 15+ years: 25; no relevant permit found: 8; unknown: 0 | Verified signal or absence-of-record signal |
| Mechanical-permit ambiguity | 0–8 | Older ambiguous mechanical record: 8; recent ambiguous record: 2; none: 0 | Proxy |
| Ownership duration | 0–15 | Last sale >10 years: 15; 5–10 years: 8; <5 years: 3; unknown: 0 | Inferred signal |
| Owner-occupancy proxy | 0–10 | Homestead/owner-occupancy flag: 10; unknown: 0 | Proxy, never verified occupancy |
| Residential single-family match | 0–10 | Explicit single-family/residential: 10; other residential: 4; unknown: 0 | Verified or inferred property type |
| Data completeness/confidence | 0–7 | Address + parcel + year built + permit join: 7; three of four: 4; less: 0 | Confidence modifier |

Do not apply a positive “no permit” score unless the supported source coverage and address match are strong. Store `permit_search_scope` so the UI can say “no relevant permit found in Dallas city records since 2018,” not “no HVAC replacement ever.”

### Confidence

- **High:** parcel/address matched; property type and year built present; permit source covers the jurisdiction; at least one relevant record or a documented search with no match.
- **Medium:** parcel and address matched but permit history is partial, description ambiguous, or one major field is missing.
- **Low:** geocoded/address-only match, uncertain jurisdiction, missing year built, or failed parcel crosswalk.

Each score must show reasons such as: “Year built 1996 (+25, Dallas CAD, inferred property age),” “No relevant HVAC permit found in Dallas city feed since 2018 (+8, absence of record),” and “Owner-occupancy unavailable (0, unknown).” Never write “HVAC is 30 years old.”

## 5. Smallest useful MVP

### Contractor workflow

1. Contractor creates an account.
2. Contractor selects a supported market and one or more supported ZIP codes.
3. System shows a ranked table with score, address, property type, year built, latest HVAC-permit category/date, confidence, and top reasons.
4. Contractor filters by score band, ZIP, property type, confidence, and permit category.
5. Contractor opens a property detail page showing raw evidence, source links/labels, permit history, scoring breakdown, and an explicit “inferred / proxy / unknown” legend.
6. Contractor views selected results on a map.
7. Contractor selects rows and exports a CSV containing address, ZIP, coordinates, score, confidence, reason codes, and source timestamps.

### Explicitly out of scope

No homeowner names, phone numbers, email append, cold outreach automation, property intelligence beyond the low-cost scoring signals, engineering inspection claims, AI-generated replacement predictions, CRM integrations, route optimization, territory exclusivity, maps beyond a basic ranked map, multi-market expansion, or general CRM functionality.

## 6. Recommended architecture

### Application

- Next.js + TypeScript, deployed on Vercel.
- Supabase Postgres with Supabase Auth and Row Level Security.
- One shared database with `organization_id` on every tenant-owned table.
- Mapbox GL JS for the map; use Census geocoding first and cache coordinates.
- Server-side API routes for all data access and exports.

### Ingestion

Use small, idempotent scheduled jobs:

1. Download/query Dallas Socrata permits daily.
2. Query Fort Worth ArcGIS permits daily or weekly, depending on observed update behavior.
3. Import CAD parcel/appraisal files on a documented cadence; V1 can be monthly or quarterly if the source is annual.
4. Normalize addresses deterministically.
5. Match permits to parcels by parcel ID where available, otherwise normalized address plus city/ZIP and geocode proximity.
6. Classify permits using versioned keyword rules.
7. Recompute scores only for changed properties and store the scoring-rule version.

Do not introduce a queue, microservice, ML pipeline, or vector database. A Postgres job table plus scheduled worker is enough. If a job fails, record the source, request window, error, retry count, and last successful ingest.

### Core tables

- `organizations`
- `users` / Supabase Auth identity mapping
- `territories` and `organization_territories`
- `properties`
- `property_sources`
- `permits`
- `property_permits`
- `property_scores`
- `score_reasons`
- `exports`
- `ingestion_runs`
- `audit_events`

Never store a score without a source snapshot, scoring-rule version, computed timestamp, and reason rows.

### Security and privacy

- Enforce tenant isolation with Supabase RLS; test cross-tenant reads explicitly.
- Keep source files/private exports in private storage buckets.
- Do not expose CAD owner names or personal data in V1 unless a later legal review explicitly authorizes it.
- Export only property prospecting fields needed by the contractor.
- Encrypt data in transit and rely on managed encryption at rest.
- Add rate limits to login, search, export, and ingestion endpoints.
- Maintain source attribution, retrieval timestamps, and data-use terms in the product and documentation.
- Treat the output as marketing intelligence, not an appraisal, inspection, safety determination, or guarantee.

## 7. Cost model

These are planning ranges, not vendor quotes. They assume public data, cached coordinates, modest usage, and no proprietary parcel/permit feed.

| Customer count | Public/property data | Hosting/database | Maps/geocoding | Scheduled processing/monitoring | Estimated total/month |
|---:|---:|---:|---:|---:|---:|
| 1–10 | $0–$25 | $45–$60 | $0–$25 | $0–$25 | **$50–$135** |
| 50 | $0–$75 | $60–$100 | $10–$75 | $10–$50 | **$80–$300** |
| 100 | $0–$150 | $75–$175 | $25–$200 | $25–$100 | **$125–$625** |

At $399/month, 100 customers would produce $39,900 MRR; even the high end of this narrow infrastructure estimate leaves strong gross-margin room. The important caveat is not compute cost—it is the future cost of expanding coverage to many municipalities and buying proprietary data. V1 economics are attractive only if the product keeps its one-market, public-data boundary.

## 8. Real blockers vs. testable unknowns

### Fundamental blockers

None identified for a one-market, public-data MVP, provided the launch is scoped to supported municipal coverage and uses attribution/disclaimer requirements.

### Testable unknowns

1. **Address/parcel join rate:** Can at least 90% of a 10K–50K residential sample be joined to a parcel and geocoded reliably?
2. **Permit classification precision:** In a manually reviewed sample, can strong replacement/install terms achieve useful precision without excessive false positives?
3. **Permit coverage:** How much of the selected Dallas/Fort Worth ZIP territory is actually covered by the city source rather than another municipality?
4. **History depth:** How many years of records are available in each official source after download/API access, versus only what the UI displays?
5. **Field stability:** Do field names, pagination, and update behavior remain stable for 30 days?
6. **Signal lift:** Do top-quartile scores contain more older properties, older HVAC-related permits, or contractor-validated prospects than random addresses?
7. **CAD reuse terms:** Can the relevant Dallas and Tarrant source terms support a commercial SaaS display/export of derived scores? Obtain written confirmation if the terms are ambiguous.
8. **Owner-occupancy availability:** Is a defensible parcel-level homestead/occupancy flag accessible? If not, omit the signal rather than buy a dataset.
9. **Customer usefulness:** Can five HVAC contractors identify useful prospecting targets from the evidence view without asking for unsupported certainty?

## 9. Specific data test before build

Timebox: 5 business days.

### Test inputs

- 5,000–10,000 residential parcels from Dallas and Fort Worth ZIPs likely to be served by residential HVAC contractors.
- Dallas city permits from the official Socrata API.
- Fort Worth permits from the official ArcGIS layer or full download.
- One current Dallas CAD or Tarrant parcel/appraisal sample.

### Test outputs

- Join-rate report: parcel, address, geocode, and permit match percentages.
- Permit taxonomy report: counts of verified recent, older HVAC-related, ambiguous mechanical, no relevant permit found, and unknown.
- Manual review of 200 permit/property records.
- Ranked score table with visible reasons.
- Random-vs-top-quartile comparison across year built, permit evidence, and data completeness.
- Terms checklist and source-attribution plan.

### Pass criteria

- ≥90% of sampled target properties have a stable address/parcel/geocode identity.
- ≥70% have usable year-built/property-type data.
- ≥60% of target-city permits can be classified into the five categories without manual intervention.
- At least one top-quartile signal differs materially from random sampling; exact lift threshold can be refined with the contractor pilot.
- No unresolved license prohibition on commercial display of derived scores.

If the data test passes, proceed to MVP milestones. If join or permit quality fails only in one city, launch the other city within DFW rather than abandoning the concept. If both cities fail the pass criteria, run the same test in Austin before making a no-build decision.

## 10. Implementation milestones after the data test

### Milestone 1 — Lock data contract and source terms

**Objective:** Freeze the supported DFW coverage, source URLs, fields, update cadence, attribution, and disclaimers.

**Likely files/components:** `docs/data-contract.md`, `docs/source-terms.md`, ingestion configuration, source adapters.

**Acceptance criteria:** Dallas/Fort Worth coverage boundaries are explicit; every MVP field maps to a source or is marked unknown; source terms and attribution are recorded; no unsupported field is required.

**Tests:** Source fixture checks; schema-drift test; terms checklist review.

**Dependencies:** Data test pass.

**Out of scope:** New markets, paid data vendors, owner contact enrichment.

### Milestone 2 — Create normalized property and permit ingestion

**Objective:** Load representative parcel/property and permit data into Postgres with raw provenance.

**Likely files/components:** `supabase/migrations/*`, `src/ingestion/*`, source fixtures, ingestion-run UI/logs.

**Acceptance criteria:** Repeatable import; idempotent upsert; source record IDs preserved; failed runs visible; retrieval timestamps stored.

**Tests:** Fixture ingestion, duplicate prevention, retry, pagination, malformed-record handling.

**Dependencies:** Milestone 1.

**Out of scope:** Scoring UI, exports, multiple databases.

### Milestone 3 — Address normalization and permit classification

**Objective:** Match permits to properties and classify permit evidence deterministically.

**Likely files/components:** `src/data/address-normalize.ts`, `src/data/permit-classifier.ts`, crosswalk tables.

**Acceptance criteria:** Every match records method/confidence; classifier returns one of the five approved categories; raw description remains available; unknown is allowed.

**Tests:** Golden fixtures for `AC replacement`, `new HVAC`, `condenser`, `furnace`, `heat pump`, duct-only, generic mechanical, and missing descriptions.

**Dependencies:** Milestone 2.

**Out of scope:** LLM classification, predictive ML, manual review workflow.

### Milestone 4 — Scoring and reason engine

**Objective:** Compute versioned 0–100 scores and visible reasons.

**Likely files/components:** `src/scoring/*`, `property_scores`, `score_reasons`, SQL indexes.

**Acceptance criteria:** Scores are deterministic; every point is explainable; confidence is separate from opportunity score; “unknown” and “no permit found” are not conflated.

**Tests:** Rule-table unit tests, score snapshots, boundary dates, missing-field tests, regression fixtures.

**Dependencies:** Milestone 3.

**Out of scope:** AI recommendations, opaque ranking, engagement predictions.

### Milestone 5 — Authentication, tenancy, and territory selection

**Objective:** Allow a contractor organization to select supported ZIPs and see only permitted data.

**Likely files/components:** Supabase Auth, RLS migrations, onboarding pages, territory tables.

**Acceptance criteria:** Sign-up/login works; organization isolation is enforced; unsupported ZIPs are clearly labeled; selected territory persists.

**Tests:** RLS positive/negative tests, session expiry, invite/access tests, unsupported territory tests.

**Dependencies:** Milestone 2.

**Out of scope:** SSO, complex roles, reseller accounts.

### Milestone 6 — Ranked table and property evidence view

**Objective:** Make the score useful to a contractor without overclaiming.

**Likely files/components:** dashboard, filters, property detail route, source/evidence components.

**Acceptance criteria:** Table sorts by score; filters work; detail shows evidence, source, date, label, confidence, permit description, and disclaimer; stale data timestamp is visible.

**Tests:** Query/filter tests, accessibility basics, empty/unknown states, screenshot review.

**Dependencies:** Milestones 4–5.

**Out of scope:** Outreach, CRM, homeowner identity, route planning.

### Milestone 7 — Basic map and CSV export

**Objective:** Support geographic review and contractor handoff.

**Likely files/components:** Mapbox map, export API, export history.

**Acceptance criteria:** Selected properties display on a map; map respects territory/filter; CSV contains only approved fields and source timestamps; exports are tenant-scoped and logged.

**Tests:** Map load/failure state, export column contract, large export pagination, unauthorized export test.

**Dependencies:** Milestone 6.

**Out of scope:** Route optimization, territory heatmaps, direct mail, CRM sync.

### Milestone 8 — Pilot hardening and data-operations runbook

**Objective:** Operate one market reliably with five pilot contractors.

**Likely files/components:** monitoring, source-health dashboard, support docs, billing gate.

**Acceptance criteria:** Daily/weekly jobs alert on failure; stale-source badge appears; manual rerun exists; source attribution is visible; five pilot users can complete the workflow and report useful targets.

**Tests:** 30-day replay where possible, outage simulation, source schema change, backup/restore, tenant isolation audit.

**Dependencies:** Milestones 1–7.

**Out of scope:** General availability across the full MSA, advanced billing, mobile app, AI features.

## Final build/no-build recommendation

**LAUNCH MARKET:** Dallas–Fort Worth, with Dallas and Fort Worth municipal coverage first  
**MVP BUILD DIFFICULTY:** MODERATE  
**ESTIMATED MVP BUILD TIME:** 3–4 weeks after the data test  
**ESTIMATED INITIAL MONTHLY DATA/INFRA COST:** $50–$200  
**CAN 10K–50K PROPERTIES BE SCORED AUTOMATICALLY?** YES  
**CAN WE BUILD WITHOUT EXPENSIVE PROPRIETARY DATA?** YES  
**CAN THE PRODUCT PROVIDE MEANINGFULLY BETTER PROSPECTING THAN A RANDOM ADDRESS LIST?** NOT YET PROVEN  
**FUNDAMENTAL BLOCKERS:** None identified for a scoped one-market MVP  
**TESTABLE UNKNOWNS:** join rate, permit coverage/history, classifier precision, source terms, signal lift, contractor usefulness  
**FINAL RECOMMENDATION:** RUN ONE SPECIFIC DATA TEST FIRST; if it passes, BUILD MVP

The data is imperfect, but that is compatible with the founder’s chosen product. The product promise must be “ranked prospecting signals with evidence and confidence,” never “verified HVAC age” or “a home definitely needs replacement.”
