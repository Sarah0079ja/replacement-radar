# HVAC Replacement Radar — Dallas Ownership Enrichment Investigation

**Date:** November 2, 2026  
**Scope:** Read-only investigation; no production scoring, schema, or UI changes.  
**Test universe:** The current 307 supported Dallas opportunities.

## Executive conclusion

DCAD can enrich the current Dallas opportunity universe with a current owner name, owner postal/mailing address, site address, and a conservative owner-occupancy proxy. The live DCAD ParcelPublishing ArcGIS layer returned all 307 parcel IDs and exposed these fields programmatically.

The same live layer does **not** expose a deed date, sale date, ownership start date, or change-of-ownership date. Its `LASTUPDATE` field is a layer-record update timestamp, not a transaction date. `LGLSTARTDT` was present in the response schema but null for all 307 tested properties. Exact ownership duration therefore remains unknown unless we add a separate historical appraisal/deed-record ingestion process.

The ownership fields are public but personal/property data. They should remain source evidence for internal prospecting and require a legal/product review before owner names or mailing addresses are displayed or exported.

## Sources and access

### DCAD live parcel service — preferred current enrichment source

**Source:** [DCAD ParcelPublishing ArcGIS layer](https://maps.dcad.org/prdwa/rest/services/Property/ParcelQuery/MapServer/4)  
**Access:** ArcGIS REST `query` endpoint, batched by `PARCELID`; `outFields` supports the fields below.  
**Cost:** Free public endpoint observed.  
**Programmatic:** Yes. The layer reports Query/Data capabilities, advanced queries, and a 4,000-record maximum response. No public rate limit was identified; production ingestion should throttle, cache, and retry rather than issue per-property live requests.  
**Coverage:** 307/307 test properties matched by parcel ID (100%).  
**Freshness:** DCAD's map documentation says contemporary map changes are published nightly; this is not a promise that every ownership record changes nightly. The layer's `LASTUPDATE` is not a sale/deed date.

DCAD's [official map help](https://maps.dcad.org/prd/dpm/help.htm) defines the owner name as the owner on the last deed filed and the owner address as the mailing address appearing on the last deed filed. It also states that the service can return parcel, site address, owner, and mailing information.

### DCAD appraisal/data-product downloads

**Source:** [DCAD Data Products](https://www.dallascad.org/dataproducts.aspx) and [GIS Data Products](https://www.dallascad.org/GISDataProducts.aspx).  
**Access:** Large downloadable ZIP files, including current/prior appraisal data and historic parcel products. Each archive includes field documentation.  
**Cost:** Free download observed.  
**Programmatic:** Downloadable, but large and batch-oriented rather than a small request API.  
**Potential use:** Annual snapshots can potentially identify the first year in which the current owner appears, creating an **observed owner-change window**, not an exact deed date. This was not added to production and was not treated as an ownership-duration result in this investigation.

### Dallas County Clerk deed records

**Source:** [Dallas County Clerk Recording Division](https://www.dallascounty.org/government/county-clerk/recording/) and [official record search](https://dallas.tx.ds.search.govos.com/).  
**Access:** Public web search by grantor/grantee/document/date; bulk data requests are directed to the County Clerk.  
**Cost:** Individual online searches and document purchases may have fees; no free, documented bulk API suitable for V1 was identified.  
**Programmatic/scale:** Not demonstrated as a stable free API. Automated full deed-history enrichment would require a separate access/terms test and likely county coordination.  
**Reliability:** Deed records are the authoritative transaction source, but matching grantor/grantee records to parcel IDs and selecting conveyances is substantially more complex than the current DCAD join.

## Field-by-field assessment

| Field | Exact source / access | Public + programmatic | Test coverage / match | Reliability | Verified or inference | V1 scale decision |
|---|---|---|---|---|---|---|
| Current property owner | DCAD `OWNERNME1`, `OWNERNME2` via ParcelPublishing REST query | Yes / yes | 307/307 parcel matches; 100% non-empty owner name in test | Good as DCAD's current record; not guaranteed real-time or legal title | Verified source record | Obtain in ingestion, keep display/export decision separate |
| Site/property address | DCAD `SITEADDRESS` | Yes / yes | 307/307 non-empty | Good, with DCAD's documented municipal-address caveats | Verified source record | Already used; retain provenance |
| Owner mailing address | DCAD `PSTLADDRESS`, `PSTLCITY`, `PSTLSTATE`, `PSTLZIP5`, `PSTLZIP4` | Yes / yes | 307/307 returned; 306 usable; 1 explicitly withheld | Good as last-deed mailing address; not proof of residence | Verified source record | Obtain internally; do not call it residence address |
| Most recent deed/sale/change date | Not in live ParcelPublishing fields; Dallas County Clerk records are separate | Public records exist / no free stable API demonstrated | 0/307 date values from live DCAD service | Exact date requires deed-record access and conveyance matching | Would be verified only from deed records | Do not add to V1 without a separate data-access test |
| Estimated ownership duration | Derived from a verified sale/deed date or annual DCAD owner snapshots | Not currently available from live API | 0/307 exact durations; 307 unknown | Exact duration cannot be inferred from current owner alone | Inference if based on annual snapshots; unknown today | Do not score yet |
| Owner occupancy | Compare DCAD postal address to DCAD site address after conservative normalization | Source fields public / derivation is local | 306 usable comparisons; 1 withheld/unknown | Useful proxy, not verified occupancy; formatting can create false differences | Inference | Candidate filter/signal after validation |
| Living area | DCAD `RESFLRAREA` | Yes / yes | 307/307 non-empty in test | Good parcel improvement attribute; not an HVAC-condition fact | Verified source, ranking use is inference | Candidate secondary signal |
| Structure type / stories | DCAD `RESSTRTYP` | Yes / yes | 307/307 non-empty in test | Good descriptive attribute; weak replacement-likelihood evidence by itself | Verified source, ranking use is inference | Candidate context/filter, not a major score driver |
| Neighborhood code | DCAD `NGHBRHDCD` | Yes / yes | 307/307 non-empty in test | Stable grouping/calibration field; not a direct HVAC signal | Verified source, use is inference | Useful for analysis, not initial score |
| Improvement and land values | DCAD `IMPVALUE`, `LNDVALUE` | Yes / yes | 307/307 non-empty in test | Appraisal values are useful context but can be noisy and are not replacement need | Verified source, ranking use is inference | Consider only after customer validation |

## Enrichment test against the current 307 properties

### Method

1. Read the existing 307 parcel IDs from `app/app/data/properties.json`.
2. Queried DCAD ParcelPublishing in batches using `PARCELID`.
3. Requested owner, site, postal, update, and related fields.
4. Compared site and postal addresses after uppercasing and removing punctuation/whitespace. This is intentionally conservative and does not treat a mailing address as a verified residence.

### Results

| Result | Count |
|---|---:|
| Existing opportunities | 307 |
| DCAD parcel matches | 307 |
| Current owner name non-empty | 307 |
| Site address non-empty | 307 |
| Postal/mailing record returned | 307 |
| Usable mailing address | 306 |
| Likely owner occupied | 290 |
| Likely absentee owner | 16 |
| Unknown | 1 |
| Exact ownership duration available | 0 |

The one unknown was an explicit withheld postal address. The 16 likely absentee records had a usable postal address that did not match the site address under compact normalization. This is an address-based inference only. It can include a homeowner who uses another mailing address, an owner with a second residence, a trust/entity, or a formatting/matching artifact.

### Ownership-duration distribution

No ownership-duration distribution can honestly be reported from the current live source:

- Exact duration values: **0/307**
- Unknown for duration: **307/307**
- `LGLSTARTDT`: null for all 307 queried records
- `LASTUPDATE`: populated for 306/307, but it is a DCAD record update field and must not be used as a sale or ownership date

Annual DCAD appraisal snapshots could support a future `owner_first_observed_year` or `ownership_change_window` field. That would not equal exact ownership duration and should be labeled as an inferred window.

## Commercial interpretation

Absentee ownership should not automatically be treated as a negative. It may represent landlords, investors, second-home owners, or owners who are simply easier to reach through a non-site mailing address. For an HVAC contractor, absentee properties could be commercially useful for a different message and workflow, while owner-occupied properties may have a different conversion profile.

The clean product treatment is to expose two independent filters/signals later:

- **Likely owner occupied** — postal/site address match; inferred
- **Likely absentee owner** — usable postal/site mismatch; inferred
- **Unknown** — withheld, missing, or ambiguous data

Do not label these as homeowner status or verified occupancy.

## Recommendation for scoring

### Ownership duration

**Do not add to the production score yet.** The live source provides no date. If annual snapshot testing later produces a stable observed window, start with a small weight such as **0–8 points**, with unknown receiving **0**, and show the year/window as inference. Do not award a large score for long tenure until outcome data shows it improves prioritization.

### Owner occupancy

**Candidate for a later filter first, score second.** The proxy is available at useful coverage, but the test universe is small and homogeneous: 290 likely owner occupied, 16 likely absentee, 1 unknown. A future controlled test could use **0–5 points** for likely owner occupied, **0–5 points** for likely absentee only if contractor interviews indicate absentee opportunities are valuable, and **0** for unknown. Do not force a positive/negative direction before customer evidence.

### Other high-value free signals

The most practical next candidates are living area, structure type, and an observed ownership-change window from annual DCAD snapshots. Living area may help contractors prioritize likely job value, but it is not evidence that replacement is needed. Appraisal values and neighborhood code are better treated as filters or analysis dimensions than strong ranking factors until validated.

## Current UI recommendation

Remove the lines:

- `Ownership duration unknown (+0)`
- `Owner occupancy unknown (+0)`

from “Why this property ranked” while those fields remain unknown and contribute zero points. They do not explain the current ranking. If the fields are later added, show them in a separate data-completeness or optional-signal section with explicit `UNKNOWN` / `INFERENCE` labels, not as ranking reasons.

## Decision

**Ownership enrichment is technically feasible for current owner, postal address, site address, and an occupancy proxy.** Exact ownership duration is not currently feasible from the live DCAD API at the intended simplicity/cost. No production scoring change is authorized by this investigation.

## Expanded competitor-informed enrichment investigation

The following signals were evaluated because comparable property-intelligence products commonly combine sale recency, property characteristics, owner/occupancy proxies, and local activity context. These are data-feasibility findings only; none changes the current score.

### Sale, deed, and property-characteristic fields

| Proposed field or signal | Classification | Source / access | Coverage and reliability | Update / cost / scale |
|---|---|---|---|---|
| Most recent property sale date | **UNKNOWN** from current live source | Dallas County Clerk official records search; DCAD live ParcelPublishing has no sale/deed date field | Public deed records exist, but no free stable bulk API was demonstrated. 0/307 dates available from the live DCAD query | County Clerk search is public but interactive; bulk access needs a separate county/terms test. Not V1-scale-ready |
| Most recent recorded sale price | **UNKNOWN** | County Clerk deed documents/index; DCAD appraisal data is not a transaction-price feed | No sale prices available from the current 307 records. Appraised/market value is not sale price | Would require deed-document/index extraction or a licensed transaction feed; avoid for V1 |
| Deed/ownership-transfer date | **UNKNOWN** from live DCAD API | Dallas County Clerk deed records; annual/current DCAD ownership files may show current ownership but not necessarily transaction date | Exact date not available in current ParcelPublishing fields; `LGLSTARTDT` was null for all 307 | County records may be timely, but a reliable automated transfer-date pipeline is unproven |
| Current owner | **VERIFIED DATA** | DCAD `OWNERNME1`/`OWNERNME2` via ArcGIS REST | 307/307 matched and non-empty in the test; represents DCAD's last-deed owner record, not a title guarantee | Free public endpoint; batchable with caching |
| Owner mailing address | **VERIFIED DATA** | DCAD `PSTLADDRESS`, `PSTLCITY`, `PSTLSTATE`, `PSTLZIP5`, `PSTLZIP4` | 307/307 returned; 306 usable and 1 withheld | Free public endpoint; batchable. Treat as mailing address, not residence |
| Property/site address | **VERIFIED DATA** | DCAD `SITEADDRESS`; City of Dallas parcel layer also supplies street components | 307/307 in the enrichment test | Free public services; current map updates are published frequently, but address stewardship remains municipal |
| Living area / square footage | **VERIFIED DATA** | DCAD `RESFLRAREA` via ParcelPublishing; DCAD appraisal records document living-area attributes | 307/307 non-null in the live query; values still need validation for zero/placeholder cases | Free and batchable. Useful for job-size/context, not proof of HVAC need |
| Bedrooms / bathrooms | **UNKNOWN in the live API; testable in bulk appraisal data** | DCAD's 2026 Mass Appraisal Report says residential records capture bedrooms, full baths, and half baths. The live ParcelPublishing layer queried for this test does not expose them. DCAD's downloadable appraisal archives include field documentation | Coverage and field names were not verified against the large current ZIP; do not assume availability in production | Free download observed, but archive ingestion and field-layout validation are required |
| Appraised/improvement/land value | **VERIFIED DATA** | DCAD `IMPVALUE`, `LNDVALUE`, market-value fields | 307/307 non-empty in the live query | Free and batchable; use as optional property context, not a direct replacement signal |

DCAD's published [2026 Mass Appraisal Report](https://www.dallascad.org/webForms/MASSAPPRAISAL/Mass_Appraisal_Report.pdf) confirms that its residential appraisal records capture living area, bedrooms, full/half baths, heating, air conditioning, and other characteristics. That documents collection by DCAD, but it does not prove that every field is exposed through the live API or that every downloaded record is populated. The current product must keep those fields unknown until the bulk-file layout and coverage are tested.

### HVAC absence signals

The existing Dallas OpenData permit artifact contains 41,156 mechanical records covering 2018–2026, including 16,454 classified HVAC replacements and 5,794 classified HVAC installations. The source is machine-readable, but the record descriptions and permit filing behavior remain imperfect.

The defensible signals are:

- **“No recorded HVAC replacement/install permit found in the supported Dallas permit feed since 2018”** — derived signal, only after a supported address/parcel search and a documented source start date.
- **“No recorded HVAC replacement/install permit in the last X years”** — derived signal, where the source was searched for the relevant property and the permit coverage is supported.
- **“No recorded permit found since construction”** — generally **not supported**. The feed does not cover the full life of the property, and no permit is not proof that replacement did not occur.

For the existing 5,000-property spike universe, 4,223 properties were classified as having no relevant HVAC permit found in the 2018–2026 source window, while 623 had an exact matched HVAC replacement/install event. This supports a source-window absence label, not an equipment-age claim.

For the current 307 opportunity fixture, the sample is intentionally concentrated on scored HVAC-event properties: 305 have a last known event older than five years, two are within five years, and none is more than ten years old under the current permit history. This is a property-sample characteristic, not a market-wide distribution.

### Nearby HVAC replacement activity

The existing permit dataset is sufficient for a first local-activity signal, with important distinctions:

| Signal | Classification | Can current artifacts support it? | Test result / limitation |
|---|---|---|---|
| HVAC replacements on the same street | **DERIVED SIGNAL** | Yes, by normalized street key | All 307 current opportunities had at least one same-street classified HVAC permit; counts ranged from 1 to 25 records. This is activity context, not proof that the target is similar |
| Same-street replacements in last 5 years | **DERIVED SIGNAL** | Yes, using permit issue year | 247/307 current opportunities had at least one same-street classified HVAC record from 2021 onward |
| Same-street replacements in last 10 years | **DERIVED SIGNAL** | Yes, using permit issue year | 307/307 current opportunities had at least one same-street classified HVAC record from 2016 onward; the feed starts in 2018, so this effectively means since source start |
| Replacements within a defined radius | **DERIVED SIGNAL** after geometry enrichment | Not from the current permit JSON alone; yes after joining addresses to City of Dallas parcel geometry or cached geocodes | City parcel REST returns polygon geometry. Compute centroids locally and use PostGIS/Haversine; no per-property paid map API is required |
| Nearby comparable homes with newer HVAC events | **DERIVED SIGNAL** after property/permit spatial join | Partially testable now on same-street peers; radius version needs coordinates | Among the 307 records, 233 had a same-street peer with a known event year; 106 had at least one peer with a more recent event. This is a small, same-street comparison and should remain contextual |
| Percent of nearby comparable homes with newer HVAC events | **DERIVED SIGNAL** after defining denominator | Yes after spatial join and comparable-property rules | Use only when the denominator is large enough; otherwise label insufficient local sample rather than outputting a percentage |

The current permit JSON has addresses but no coordinates. The City of Dallas parcel source already used in the spike can return geometry, as can other public parcel services. A first implementation can join permit addresses to parcel addresses where possible, compute parcel centroids locally, and retain a `location_match_confidence`. Census geocoding can be a fallback with caching. This avoids a paid geocoding call for every property.

### Recently sold + aging HVAC

The reliable result today is **not computable**, not zero.

- Properties with a verified sale date in the current Dallas fixture: **0/307**
- Properties that can therefore be reliably identified as sold in the last 30, 60, or 90 days: **0** identifiable records
- True qualifying property count: **unknown**

The aging-HVAC half is computable as a source-relative signal, but the sale half is not. A future query can implement:

```text
sale_date >= today - 30/60/90 days
AND (last_known_hvac_event_year <= cutoff OR no recorded HVAC event found in the supported source window)
```

It must not run until the sale date has a verified source and a parcel-level match. DCAD's current appraisal data can reflect ownership changes after processing, and DCAD advises contacting it if ownership is not reflected after 90 days from deed filing. That is not timely enough to promise a reliable 30-day sold trigger. The County Clerk index may be more current, but a free, stable, automated bulk feed was not established.

### Distance from a contractor's business address

This is feasible without an expensive maps API for every property:

- Contractor business address geocode: **DERIVED SIGNAL**, geocode once using Census or a low-cost provider and cache the result.
- Property coordinates: **DERIVED SIGNAL**, derive parcel centroids from City of Dallas polygon geometry or a cached geocoder result.
- Straight-line distance in miles: **DERIVED SIGNAL**, calculate locally with PostGIS `ST_DWithin`/`ST_Distance` or Haversine.
- Drive-time minutes: **UNKNOWN for the simplest MVP**, because it needs a routing graph/provider. It can be a later optional feature using a low-cost routing service or self-hosted OSRM.

The initial contractor rule should be “within X miles,” not “within X minutes.”

## Rules the data can eventually support

The following rule inputs are technically feasible at different confidence levels:

| Rule | Status |
|---|---|
| Within X miles of business | Feasible derived signal after geometry/centroid ingestion |
| HVAC event older than X years | Feasible derived signal where a classified event exists |
| No recorded HVAC replacement permit within X years | Feasible source-relative derived signal; never treat as proof of no replacement |
| Recently sold | Not yet feasible reliably; requires deed/sale-date source |
| Likely owner occupied | Feasible inferred proxy from postal/site comparison |
| Exclude likely rentals | Feasible only as an inferred occupancy filter; never verified tenancy |
| Minimum opportunity score | Already supported by current product |
| Specific property types | Supported by DCAD classification fields |
| Bedrooms/bathrooms | Testable from bulk appraisal files, not live API-confirmed |

## Highest-value additions

The 3–5 additions most likely to improve the product without turning it into a CRM are:

1. **Cached parcel coordinates + radius-based HVAC activity** — turns same-street context into a genuine geographic signal and enables contractor-distance rules.
2. **Source-relative “no recorded HVAC event in the last X years”** — useful as a transparent filter when paired with coverage dates and the existing last-known-event signal.
3. **Nearby recent HVAC activity** — a neighborhood/cluster signal that can identify local replacement waves without claiming the target system is old.
4. **Living area / property-size context** — helps contractors prioritize likely job value and filter property types; keep its ranking weight modest.
5. **Owner-occupancy proxy** — expose as a filter first. Keep likely absentee properties available because landlords/investors may be commercially valuable; do not decide the direction of its score without customer evidence.

Sale recency is commercially attractive but should not be one of the next MVP additions until the deed/sale source passes a specific automated-access, match-rate, freshness, and terms test. Exact sale price and bedrooms/bathrooms are lower priority than coordinates, transparent permit-window absence, and local HVAC activity.
