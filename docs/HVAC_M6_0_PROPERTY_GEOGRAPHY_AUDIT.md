# HVAC Replacement Radar — M6-0 Property Geography Integrity

**Date:** November 3, 2026  
**Scope:** Property/site geography only. No service-area or weekly-target implementation.

## A. Root cause

The contamination originated in `data-spike/run_spike.py`. The City of Dallas parcel request supplied the physical parcel universe and `SITEADDRESS`, but the transformation wrote DCAD `PSTLZIP5` into the generic `zip` output field. `PSTLZIP5` is the DCAD owner mailing ZIP.

The same record also used DCAD `PSTLCITY` as the app `city` field. That caused owner mailing cities such as San Jose, Redondo Beach, Weston, Frisco, and Colleyville to appear as property cities.

The contamination then propagated through:

`run_spike.py` → `properties_scored.csv` → `export_app_fixture.py` → `properties.json` → `seed-opportunities.mjs` → Supabase `opportunities.zip` / `city`.

The owner mailing data itself was not bad data. The bug was the loss of the property-versus-mailing distinction.

## B. Source of truth

Canonical property geography is now derived only from site-related sources:

1. Dallas OpenData mechanical permit `zip_code`, when an exact normalized permit/site-address match exists.
2. For properties without a matched permit ZIP, the City of Dallas parcel geometry intersected with the public Dallas County 2020 ZIP polygon layer.

The DCAD fields are separated as follows:

- `SITEADDRESS`: physical property/site address.
- City of Dallas parcel `CITY`: physical property city; the supported universe is Dallas.
- `PSTLADDRESS`, `PSTLCITY`, `PSTLSTATE`, `PSTLZIP5`, `PSTLZIP4`: owner mailing geography.

`PSTLZIP5` is never used for `property_zip`.

## C. Full data audit

The live Supabase table was audited before repair.

| Measure | Result |
|---|---:|
| Opportunities audited | 307 |
| Current `zip` values in first-pass 75001–75999 range | 300 |
| Current `zip` values outside that range | 6 |
| Current non-numeric/withheld ZIP values | 1 |
| Current missing ZIP values | 0 |
| Rows where current `zip` exactly equaled owner mailing ZIP | 307 |
| Rows with contaminated/non-Dallas current ZIP indicators | 7 |
| Rows with contaminated current city values | 10 |
| Parcel-ID mismatches against the current top-307 source set | 0 |

Current legacy ZIP distribution:

```text
75248: 270, 75254: 18, 75224: 2, 75379: 2, 75252: 2,
75219: 1, 75230: 1, 75229: 1, 75032: 1, 75072: 1, 75034: 1,
76034: 1, 78013: 1, 90278: 1, 95124: 1, 33327: 1,
09096: 1, WTHLD: 1
```

After deterministic local repair, the canonical property ZIP distribution is:

```text
75248: 285
75254: 18
75224: 3
75252: 1
```

All 307 canonical property ZIPs are in the verified Dallas parcel/ZIP intersection set. No property ZIP is missing or unrecoverable.

## D. Contaminated records

Seven live rows had a non-Dallas or withheld legacy ZIP:

| Parcel ID | Property address | Legacy ZIP | Owner mailing location | Repaired property ZIP |
|---|---|---|---|---|
| `00000470701000000` | 523 LACEWOOD DR | 76034 | COLLEYVILLE, TX | 75224 |
| `00000820507140000` | 16701 DUNDRENNAN LN | 78013 | COMFORT, TX | 75248 |
| `00000820515000000` | 7702 BANTRY LN | WTHLD | Withheld | 75248 |
| `00000820515160000` | 7736 BANTRY LN | 90278 | REDONDO BEACH, CA | 75248 |
| `00000820752600000` | 17209 GRAYSTONE DR | 95124 | SAN JOSE, CA | 75248 |
| `00000821044460000` | 16209 HAVENGLEN DR | 33327 | WESTON, FL | 75248 |
| `00000820484320000` | 16114 SHADYBANK DR | 09096 | APO, AE | 75248 |

Ten rows had a non-Dallas current `city` value because `PSTLCITY` was used as property city. The corrected pipeline uses the City of Dallas parcel `CITY` field and produces `DALLAS` for the supported universe.

## E. Repairs made

- `data-spike/run_spike.py`
  - Uses City of Dallas parcel `CITY` for property city.
  - Derives `property_zip` from matched site-address permit ZIPs.
  - Stores DCAD `PSTLZIP5` as `owner_mailing_zip` only.
  - Keeps `zip` only as a deprecated compatibility alias.
- `data-spike/repair_property_geography.py`
  - Audits all 307 current opportunity source rows.
  - Resolves the two no-permit rows through parcel-geometry/ZIP-polygon intersection.
  - Writes the auditable repair map and audit artifacts.
  - Updates the local fixture without discarding owner mailing data.
- `data-spike/export_app_fixture.py`
  - Requires `property_zip` in scored data.
  - Uses the verified repair map for fallback rows.
  - Emits warnings rather than substituting owner mailing ZIP.
- `app/app/data/properties.json`
  - Local fixture now has `property_zip` and `owner_mailing_zip` separately.
  - Deprecated `zip` mirrors canonical property geography for compatibility.
- `app/app/page.tsx`
  - Property display, search, drawer, and CSV use `property_zip`.
- `app/scripts/seed-opportunities.mjs`
  - Seeds `property_zip` and `owner_mailing_zip`; does not seed geography from deprecated `zip`.
- `app/scripts/repair-property-geography.mjs`
  - Safe, service-role-only forward repair for all 307 live rows after migration.
- `app/supabase/migrations/202611030006_property_geography.sql`
  - Adds `property_zip`, `owner_mailing_zip`, comments, and an index.
  - Does not weaken RLS or alter scoring.

## F. Owner mailing data

Owner mailing geography remains separate and intact. The enrichment source contains mailing city/state/ZIP, and the app continues to display the composite owner mailing address. The new `owner_mailing_zip` field preserves the ZIP explicitly for future mailing workflows.

Withheld DCAD values are not reconstructed. They remain withheld/unknown.

## G. Live Supabase status

The 307 live rows are **not yet corrected** because the new column migration requires manual application in Supabase SQL Editor. The exact required file is:

`app/supabase/migrations/202611030006_property_geography.sql`

After applying it, run from `app/`:

```bash
node --env-file=.env.seed.local scripts/repair-property-geography.mjs
```

Then optionally reseed the current fixture:

```bash
node --env-file=.env.seed.local scripts/seed-opportunities.mjs
```

The repair script updates only `property_zip` and `owner_mailing_zip`, verifies 307 rows, and does not delete or replace opportunities.

## H. Verification

Local pipeline verification:

- 307 source opportunities audited: PASS
- 307 recoverable canonical property ZIPs: PASS
- 0 unrecoverable property ZIPs: PASS
- Canonical ZIPs limited to `75224`, `75248`, `75252`, `75254`: PASS
- Owner mailing ZIP preserved separately: PASS
- City of Dallas property city restored: PASS
- Parcel IDs aligned between source and live set: PASS
- Scoring/ranking algorithm changed: NO
- HVAC permit/event attachment changed: NO
- Local app fixture contains 305 deduplicated properties with canonical geography: PASS

Application/build verification is pending the migration because the current TypeScript type is generated from the local fixture while the live schema does not yet expose `property_zip`. The code path and fixture are prepared for the migration.

## I. M6-0 verdict

**BLOCKED — M6-1 must not begin**

The local source repair passes the geography integrity test, but live Supabase still needs one explicit manual action: apply `202611030006_property_geography.sql`, then run the repair script and verify the live 307-row distribution. No M6-1 work should begin until that verification is complete.

The later architecture rule that a property is permanently excluded after appearing in a weekly cohort is unchanged. It should remain documented as an MVP policy, not treated as an irreversible product assumption. No cohort behavior was implemented here.

## Follow-up city repair

The first live ZIP repair intentionally updated only `property_zip` and `owner_mailing_zip`. Final verification exposed that the legacy `city` alias still contained ten DCAD mailing cities. Those 307 legacy `city` values were then repaired in place from the verified City of Dallas parcel universe; no opportunity, activity, or note rows were deleted.

The pipeline now emits explicit `property_city` and `owner_mailing_city` fields. Migration `202611030007_property_city.sql` must still be applied manually before the canonical city fields can be persisted in Supabase. Until that migration and the updated repair script are run, the M6-0 gate remains blocked even though the legacy `city` display alias is corrected.
