# HVAC Replacement Radar — Aligned Dallas Data Spike

**Run date:** November 2, 2026  
**Purpose:** Complete Milestone 0: align the property universe to City of Dallas permit jurisdiction, then rerun the real-data scoring pipeline.

## Result

The coverage problem discovered in the first spike is fixed for this sample.

The property universe now comes from the City of Dallas parcel layer with `CITY = 'DALLAS'`, `ResCom = 'R'`, and a single-family property class. Each parcel is enriched from the DCAD parcel-publishing layer using the shared account/parcel ID. Every sampled property is persisted with `coverage_state = SUPPORTED`.

Only `SUPPORTED` properties receive absence-of-permit scoring. The pipeline does not infer “no permit” for an out-of-coverage or unknown property.

## Required deliverables

**PROPERTY SAMPLE:** 5,000 City of Dallas residential single-family parcels  
**ADDRESS MATCH RATE:** 15.54% (777/5,000 exact normalized address joins)  
**PROPERTIES WITH HVAC/MECHANICAL HISTORY:** 777 / 5,000 (15.54%)  
**STRONG HVAC SIGNALS:** 421 matched properties classified `VERIFIED/STRONG HVAC REPLACEMENT SIGNAL`  
**AMBIGUOUS SIGNALS:** 7 matched properties classified `AMBIGUOUS MECHANICAL SIGNAL`  
**RECENT HVAC PERMITS:** 280 matched properties classified `RECENT HVAC PERMIT`  
**TOP-100 GENERATED:** YES  
**DATA PIPELINE REPRODUCIBLE:** YES  
**ESTIMATED COST:** $0 data purchase; public API usage only  
**MOST SERIOUS DATA PROBLEM:** Dallas OpenData permit history is incomplete as a historical source: only 15.54% of the aligned property sample had an exact mechanical-permit address match. This is now a valid “no relevant permit found within supported City of Dallas coverage” state, but it is not proof that no work ever occurred.

**CORE PRODUCT technically viable:** YES, for a scoped City of Dallas territory with explicit evidence and coverage labels.

## Sources used

### Supported property universe

City of Dallas tax parcel layer:

`https://services2.arcgis.com/rwnOSbfKSwyTBcwN/arcgis/rest/services/DallasTaxParcels/FeatureServer/0/query`

Selection:

- `CITY = 'DALLAS'`
- `ResCom = 'R'`
- `PROP_CL LIKE '%SINGLE FAMILY%'`

The layer supplies the city/jurisdiction alignment, account ID, street address components, city, county, residential/commercial flag, and property class.

### DCAD enrichment

DCAD parcel-publishing layer:

`https://maps.dcad.org/prdwa/rest/services/Property/ParcelQuery/MapServer/4/query`

The City of Dallas parcel `ACCT` matched DCAD `PARCELID` for the sample. DCAD supplied site address, residential year built, property class, postal ZIP where available, and owner source data. Owner name is retained only in the raw source artifact and is not used in scoring or intended for V1 display/export.

### Permit source

City of Dallas OpenData mechanical permit API:

`https://www.dallasopendata.com/resource/e7gq-4sah.json`

The pipeline retrieved 41,156 mechanical permit records and retained permit number, type, issue date, work description, address, ZIP, land use, and declared value. The published dataset did not expose permit status; status remains `UNKNOWN` rather than being invented.

## Normalization and coverage logic

Address normalization is deterministic: uppercase, punctuation removal, common suffix/directional normalization, apartment-token removal, and trimming city/state/ZIP suffixes from permit strings.

Coverage is assigned from the property source, not inferred from a permit match:

| State | Meaning | Absence-of-permit scoring |
|---|---|---|
| `SUPPORTED` | Property comes from the City of Dallas residential parcel universe used by the Dallas permit source | Allowed |
| `OUT_OF_COVERAGE` | Property is outside the supported city/jurisdiction universe | Not allowed |
| `UNKNOWN` | Jurisdiction or source identity is incomplete | Not allowed |

All 5,000 sampled properties were `SUPPORTED`. The scoring code defaults any missing state to `UNKNOWN`, preventing accidental absence scoring if another source is added incorrectly.

## Matching metrics

| Metric | Result |
|---|---:|
| City of Dallas residential properties | 5,000 |
| Dallas mechanical permit records | 41,156 |
| Exact normalized address matches | 777 |
| Address match rate | 15.54% |
| No exact mechanical permit match within supported source | 4,223 |
| Out-of-coverage properties scored as no permit | 0 |

The correct product language for the 4,223 no-match records is: “No relevant Dallas mechanical permit found within supported City of Dallas coverage.” It must not say “the HVAC system has never been replaced.”

## Classification

The classifier is deterministic and implemented in `data-spike/run_spike.py`. Strong terms include `REPLACE`, `REPLACING`, `CHANGE OUT`, `SWAP OUT`, `INSTALLATION`, `HVAC`, `CONDENSER`, `FURNACE`, `HEAT PUMP`, `AIR HANDLER`, `MINI SPLIT`, `CENTRAL AC`, and `COIL`.

| Category | Count |
|---|---:|
| `VERIFIED/STRONG HVAC REPLACEMENT SIGNAL` | 421 |
| `RECENT HVAC PERMIT` | 280 |
| `AMBIGUOUS MECHANICAL SIGNAL` | 7 |
| `UNKNOWN` | 69 |
| `NO RELEVANT PERMIT FOUND` | 4,223 |

Real descriptions included `REPLACE OR MODIFY EXISTING HVAC`, `INSTALL NEW HVAC`, `replacing a 3 ton gas complete system`, `SINGLE HVAC SYSTEM CHANGE OUT`, `New Residential HVAC Installation`, duct modifications, ventilation work, and missing descriptions.

## Original spike scoring and output

The explainable score uses property age, single-family property class, older strong HVAC permit evidence, recent HVAC permit negative evidence, ambiguous mechanical evidence, and no relevant permit inside supported coverage. Ownership duration and owner occupancy receive zero when unavailable.

The output never states that the HVAC system is a verified age. It states the year built and recorded permit evidence. Inference is labeled separately.

Generated artifacts:

- `data-spike/derived/properties_scored.csv`
- `data-spike/derived/top_100.csv`
- `data-spike/derived/metrics.json`

The top 100 was generated successfully. This run is dominated by older properties with no matching permit record, because the no-match score is valid after coverage alignment and the sample’s property-age distribution is old-heavy. A later scoring review should consider making absence-of-record weaker than an older explicit HVAC replacement record.

The original spike scoring was intentionally retained as the Milestone 0 baseline. The commercial ranking was subsequently revised so that explicit HVAC replacement/install events drive opportunity strength and no-match records receive no absence-of-record opportunity points. See [`HVAC_SCORING_REVIEW.md`](HVAC_SCORING_REVIEW.md) for the revised model and rerun results.

## Manual inspection

Twenty high-ranked records were inspected. The first ranked records were mostly older Dallas properties with no relevant permit found in the supported feed; this is logically plausible prospecting intelligence, but it is lower-evidence than an explicit historical replacement record. Matched strong examples included:

- `1423 MARSEILLE PL`, year built 1980, `REPLACE OR MODIFY EXISTING HVAC`, issued 2020.
- `1403 MARSEILLE PL`, year built 1980, `INSTALL NEW HVAC`, issued 2019.
- `828 PAVILLION PL`, year built 1980, `REPLACE OR MODIFY EXISTING HVAC`, issued 2019.
- `3232 BASIL CT`, year built 1980, `NEW HVAC`, issued 2018.
- `5610 REIGER AVE`, year built 1924, `REPLACE OR MODIFY EXISTING HVAC`, issued 2018.

The output is meaningfully more useful than random address selection because every row has a property-age signal, jurisdictional coverage state, permit history/category, confidence, and source-backed reasons. This is not conversion-lift proof.

## Reproduction

```bash
python3 data-spike/run_spike.py
```

The script uses cached raw artifacts when present. Delete the raw artifacts before a fresh acquisition. It uses only Python’s standard library and official/public endpoints.

## Milestone 0 decision

**PASS.** The supported-property universe is jurisdictionally aligned to the City of Dallas permit source, and absence-of-permit scoring is gated by `coverage_state = SUPPORTED`.

Proceed directly to MVP implementation. Keep the launch territory explicitly limited to the supported City of Dallas universe; do not imply county-wide or national coverage.
