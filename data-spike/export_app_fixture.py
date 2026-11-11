#!/usr/bin/env python3
"""Export enriched app fixture with owner data, nearby HVAC stats, and cleaned reasons.

Run this after run_spike.py (and optionally after enrich_dcad.py for full enrichment).

Scoring changes (v2 – Nov 2026):
  - HVAC staleness now uses exact elapsed days from the permit date rather than
    truncated whole years. Two 2018 permits several months apart will score
    differently.
  - Added living_area_pts (max +3) as a small commercial-value tiebreaker.
    This represents potential opportunity size, NOT equipment-condition evidence.
  - Removed owner occupancy and nearby HVAC activity from the numeric score.
    Both remain as contextual signals in the fixture and UI.
  - no_newer_hvac_event (+8 when >= 10 years) kept in formula but currently
    dormant — no property in the 307 yet reaches 10 years since first permit.

Deduplication:
  - DCAD sometimes issues two parcel accounts (main account + improvement
    sub-account) for the same physical address. These appear identical: same
    address, owner, permit, and living area. Only the trailing suffix of the
    parcel ID differs (...200000 vs ...201000 pattern).
  - We keep the primary record (lower parcel ID, first encountered after
    sorting) and attach the duplicate parcel IDs as `_duplicate_parcel_ids`
    for audit. One row per physical address reaches the contractor-facing
    fixture.
"""
import csv
import json
import re
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
source = ROOT / "data-spike" / "derived" / "properties_scored.csv"
permits_file = ROOT / "data-spike" / "raw" / "dallas_mechanical_permits.json"
enrichment_file = ROOT / "data-spike" / "derived" / "dcad_enrichment.json"
geography_repair_file = ROOT / "data-spike" / "derived" / "property_geography_repair.json"
target = ROOT / "app" / "app" / "data" / "properties.json"

TODAY = date(2026, 11, 3)
PERMIT_SOURCE_START_YEAR = 2018


# ---------------------------------------------------------------------------
# Address normalization (mirrors run_spike.py)
# ---------------------------------------------------------------------------

def normalize_address(value):
    if not value:
        return ""
    s = str(value).upper().replace("&", " AND ")
    s = re.sub(r"\b(APT|UNIT|STE|SUITE|#)\s*[A-Z0-9-]+\b", " ", s)
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    replacements = {
        "STREET": "ST", "AVENUE": "AVE", "BOULEVARD": "BLVD",
        "DRIVE": "DR", "ROAD": "RD", "LANE": "LN", "COURT": "CT",
        "CIRCLE": "CIR", "PLACE": "PL", "PARKWAY": "PKWY",
        "HIGHWAY": "HWY", "TRAIL": "TRL", "EXPRESSWAY": "EXPY",
        "NORTH": "N", "SOUTH": "S", "EAST": "E", "WEST": "W",
    }
    words = [replacements.get(x, x) for x in s.split()]
    stop = next((i for i, x in enumerate(words) if x in {"DALLAS", "TX", "TEXAS"}), len(words))
    return " ".join(words[:stop])


def street_key(normalized_address):
    """Strip leading house number to get the street portion."""
    parts = normalized_address.split()
    i = 0
    while i < len(parts) and parts[i].isdigit():
        i += 1
    return " ".join(parts[i:])


def parse_permit_date(value):
    """Parse MM/DD/YY, MM/DD/YYYY, or ISO date strings to a date object."""
    if not value:
        return None
    s = str(value).strip()
    if "/" in s:
        parts = s.split("/")
        if len(parts) == 3:
            try:
                m, d, y = int(parts[0]), int(parts[1]), int(parts[2])
                if y < 100:
                    y = 2000 + y if y < 50 else 1900 + y
                return date(y, m, d)
            except (ValueError, TypeError):
                pass
    if len(s) >= 10 and s[4:5] == "-":
        try:
            return date.fromisoformat(s[:10])
        except ValueError:
            pass
    return None


def permit_year(issued_date):
    """Parse year from various date formats."""
    if not issued_date:
        return None
    s = str(issued_date)
    if len(s) >= 4 and s[4:5] == "-":
        try:
            return int(s[:4])
        except ValueError:
            pass
    if "/" in s:
        parts = s.split("/")
        if len(parts) == 3:
            year_str = parts[2][:4].strip()
            try:
                y = int(year_str)
                if y < 100:
                    return 2000 + y if y < 50 else 1900 + y
                return y
            except ValueError:
                pass
    return None


def number(value):
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return value


# ---------------------------------------------------------------------------
# v2 Scoring
# ---------------------------------------------------------------------------

def _age_pts(year_built):
    """Points for property age from verified DCAD year-built field."""
    if not year_built:
        return 0
    try:
        y = int(float(year_built))
    except (ValueError, TypeError):
        return 0
    if y < 1970:
        return 18
    if y < 1980:
        return 15
    if y < 1990:
        return 12
    if y < 2000:
        return 9
    if y < 2010:
        return 6
    if y <= 2015:
        return 3
    return 0


def _staleness_pts(permit_date_str, permit_category):
    """
    HVAC staleness using exact elapsed days (not truncated years).

    Returns (staleness, recent_penalty, no_newer, years_exact, days).
    years_exact is None if no date is available.
    """
    pd = parse_permit_date(permit_date_str)
    if pd is None:
        return 0, 0, 0, None, None

    days = (TODAY - pd).days
    years_exact = days / 365.25
    is_replacement = permit_category == "HVAC REPLACEMENT"

    recent_penalty = 0
    staleness = 0
    no_newer = 0

    if years_exact < 5:
        recent_penalty = -18 if is_replacement else -15
    else:
        if is_replacement:
            staleness = min(48, round(15 + years_exact * 3))
        else:
            staleness = min(38, round(12 + years_exact * 2))
        if years_exact >= 10:
            no_newer = 8

    return staleness, recent_penalty, no_newer, years_exact, days


def _living_area_pts(sqft):
    """
    Commercial-value tiebreaker for living area.
    Larger homes have larger HVAC systems and higher average job value.
    This is NOT evidence the system needs replacement sooner.
    Max +3 pts — intentionally small so it only breaks ties, never overrides
    the core replacement-readiness signals.
    """
    if not sqft:
        return 0
    try:
        s = int(sqft)
    except (ValueError, TypeError):
        return 0
    if s >= 4000:
        return 3
    if s >= 2500:
        return 2
    if s >= 1500:
        return 1
    return 0


def rescore(row, sqft):
    """
    Compute v2 opportunity score.

    Score components (all positive unless recent_event_penalty applies):
      property_age        0–18   verified DCAD year-built
      residential_property  5    single-family parcel class
      hvac_event_staleness  0–48  exact elapsed days from permit date
      recent_event_penalty  −15/−18  if event < 5 years ago
      no_newer_hvac_event   0 or 8  dormant until 10-year threshold
      living_area           0–3   commercial-value tiebreaker

    NOT in score: owner_occupancy, nearby HVAC activity, peers_with_newer.
    """
    a = _age_pts(row.get("year_built"))
    res = 5 if "SINGLE FAMILY" in (row.get("property_type") or "") else 0
    stale, penalty, no_newer, years_exact, days = _staleness_pts(
        row.get("latest_permit_date"), row.get("permit_category")
    )
    la = _living_area_pts(sqft)

    raw = a + res + stale + penalty + no_newer + la
    score = max(0, min(100, raw))

    components = {
        "property_age": a,
        "residential_property": res,
        "hvac_event_staleness": stale,
        "recent_event_penalty": penalty,
        "no_newer_hvac_event": no_newer,
        "living_area": la,
    }
    return score, components, years_exact, days


def _build_reasons(row, components, years_exact, sqft):
    """Generate human-readable reason lines for the v2 score."""
    reasons = []
    event_year = number(row.get("last_known_hvac_event_year") or "")
    permit_cat = row.get("permit_category", "")
    years_display = int(years_exact) if years_exact is not None else None

    stale = components["hvac_event_staleness"]
    penalty = components["recent_event_penalty"]
    net = stale + penalty

    if event_year and permit_cat in ("HVAC REPLACEMENT", "HVAC INSTALLATION"):
        label = "HVAC replacement" if permit_cat == "HVAC REPLACEMENT" else "HVAC installation"
        reasons.append(
            f"{label.capitalize()} permit recorded in {event_year} "
            f"(+{net}, verified source event)"
        )
        if years_display is not None:
            reasons.append(
                f"{years_display} years since last known HVAC event "
                f"(inference from exact {row.get('latest_permit_date', '')} permit date)"
            )
    elif row.get("coverage_state") == "SUPPORTED":
        reasons.append(
            "No HVAC replacement/install event found in supported Dallas permit records "
            "(unknown, not proof of no replacement)"
        )
    else:
        reasons.append(
            "Permit coverage unknown; no-match cannot be scored as absence"
        )

    no_newer = components["no_newer_hvac_event"]
    if no_newer > 0:
        reasons.append(
            f"No newer HVAC replacement/install event found; last known event was "
            f"{years_display} years ago (+{no_newer}, absence-of-newer-event inference)"
        )

    a = components["property_age"]
    year_built = row.get("year_built")
    if a and year_built:
        try:
            yb = int(float(year_built))
            reasons.append(f"Property built {yb} (+{a}, inferred property-age signal)")
        except (ValueError, TypeError):
            pass

    res = components["residential_property"]
    if res:
        reasons.append(f"Single-family residential (+{res}, verified parcel-class signal)")

    la = components["living_area"]
    if la and sqft:
        reasons.append(
            f"Living area {sqft:,} sq ft (+{la}, commercial-value tiebreaker"
            f" — represents potential job size, not equipment-condition evidence)"
        )

    if row.get("latest_permit_date"):
        reasons.append(
            "Evidence confidence: exact normalized address match with dated HVAC event"
        )
    elif year_built and row.get("coverage_state") == "SUPPORTED":
        reasons.append(
            "Evidence confidence: supported parcel and year-built data; "
            "no dated HVAC event matched"
        )
    else:
        reasons.append(
            "Evidence confidence: limited source coverage or missing property fields"
        )

    return reasons


# ---------------------------------------------------------------------------
# Load permits and build street indices
# ---------------------------------------------------------------------------
permits = []
if permits_file.exists():
    permits = json.loads(permits_file.read_text())

street_hvac_since_2021 = defaultdict(set)
street_all_hvac = defaultdict(set)

for permit in permits:
    cat = permit.get("category", "")
    if cat not in ("HVAC REPLACEMENT", "HVAC INSTALLATION"):
        continue
    norm = permit.get("normalized_address") or normalize_address(
        permit.get("street_address", "")
    )
    sk = street_key(norm)
    if not sk or not norm:
        continue
    year = permit_year(permit.get("issued_date"))
    if year:
        street_all_hvac[sk].add(norm)
        if year >= 2021:
            street_hvac_since_2021[sk].add(norm)


# ---------------------------------------------------------------------------
# Load enrichment
# ---------------------------------------------------------------------------
enrichment = {}
if enrichment_file.exists():
    for entry in json.loads(enrichment_file.read_text()):
        enrichment[entry["parcel_id"]] = entry

geography_repair = {}
if geography_repair_file.exists():
    geography_repair = {
        entry["parcel_id"]: entry
        for entry in json.loads(geography_repair_file.read_text())
    }


# ---------------------------------------------------------------------------
# Load scored properties
# ---------------------------------------------------------------------------
with source.open(newline="") as handle:
    rows = list(csv.DictReader(handle))[:307]

if not rows or "property_zip" not in rows[0]:
    raise RuntimeError(
        "properties_scored.csv is missing property_zip. Re-run run_spike.py; "
        "never restore property geography from the deprecated zip/PSTLZIP5 field."
    )


# ---------------------------------------------------------------------------
# First pass: build output rows with v2 score
# ---------------------------------------------------------------------------
output = []
for row in rows:
    owner_name = (row.get("owner_name_source_only") or "").strip() or None

    enrich = enrichment.get(row["parcel_id"], {})
    owner_mailing_address = enrich.get("owner_mailing_address") or None
    owner_mailing_city = (enrich.get("_pstl_city") or "").strip() or None
    owner_mailing_zip = (enrich.get("_pstl_zip5") or "").strip() or None
    sqft = number(enrich.get("living_area_sqft") or "")
    owner_occupancy = enrich.get("owner_occupancy") or None

    norm_addr = normalize_address(row["address"].strip())
    sk = street_key(norm_addr)
    same_street_count = len(street_hvac_since_2021.get(sk, set()))

    score, components, years_exact, days = rescore(row, sqft)

    opportunity_strength = (
        "STRONG" if score >= 60 else "MEDIUM" if score >= 35 else "WEAK"
    )

    if row.get("latest_permit_date"):
        evidence_confidence = "HIGH"
    elif row.get("year_built") and row.get("coverage_state") == "SUPPORTED":
        evidence_confidence = "MEDIUM"
    else:
        evidence_confidence = "LOW"

    event_year = number(row.get("last_known_hvac_event_year") or "")
    permit_date_parsed = parse_permit_date(row.get("latest_permit_date"))
    if permit_date_parsed:
        years_since_display = (TODAY - permit_date_parsed).days // 365
    else:
        years_since_display = number(row.get("estimated_years_since_last_known_hvac_event") or "")

    reasons = _build_reasons(row, components, years_exact, sqft)

    geography = geography_repair.get(row["parcel_id"], {})
    property_zip = (row.get("property_zip") or geography.get("property_zip") or "").strip() or None
    property_city = (row.get("property_city") or row.get("city") or "DALLAS").strip().upper()
    if not property_zip:
        print(f"WARNING: no verified property_zip for {row['parcel_id']} {row['address']}; retaining NULL")
    if property_zip and owner_mailing_zip and property_zip == owner_mailing_zip:
        mailing_city = (enrich.get("_pstl_city") or "").strip().upper()
        mailing_state = (enrich.get("_pstl_state") or "").strip().upper()
        if mailing_city not in {"", "DALLAS"} or mailing_state not in {"", "TX"}:
            print(
                f"WARNING: property_zip equals owner_mailing_zip for {row['parcel_id']} "
                f"but mailing location is {mailing_city}, {mailing_state}"
            )

    output.append({
        "parcel_id": row["parcel_id"],
        "address": row["address"].strip(),
        # Keep city as a deprecated compatibility alias for property_city.
        "city": property_city,
        "property_city": property_city,
        "owner_mailing_city": owner_mailing_city,
        # Keep zip only as a deprecated compatibility alias. The canonical
        # property geography is always the site-derived property_zip below.
        "zip": property_zip,
        "property_zip": property_zip,
        "owner_mailing_zip": owner_mailing_zip,
        "property_type": row["property_type"].strip(),
        "year_built": number(row["year_built"]),
        "owner_name": owner_name,
        "owner_mailing_address": owner_mailing_address,
        "living_area_sqft": sqft,
        "owner_occupancy": owner_occupancy,
        "score": score,
        "evidence_confidence": evidence_confidence,
        "opportunity_strength": opportunity_strength,
        "permit_category": row["permit_category"],
        "latest_permit_date": row["latest_permit_date"],
        "latest_permit_type": row["latest_permit_type"],
        "latest_permit_description": row["latest_permit_description"],
        "last_known_hvac_event_year": event_year,
        "estimated_years_since_last_known_hvac_event": years_since_display,
        "score_components": components,
        "coverage_state": row["coverage_state"],
        "reasons": reasons,
        "same_street_hvac_since_2021": same_street_count,
        "peers_with_newer_hvac_event": 0,  # filled in second pass
        "_sk": sk,
        "_event_year": event_year,
    })


# ---------------------------------------------------------------------------
# Second pass: peers_with_newer_hvac_event
# ---------------------------------------------------------------------------
street_event_years: dict[str, list[int]] = defaultdict(list)
for item in output:
    if item["_sk"] and item["_event_year"]:
        street_event_years[item["_sk"]].append(item["_event_year"])

for item in output:
    this_year = item["_event_year"]
    sk_ = item["_sk"]
    if this_year and sk_:
        peers = sum(1 for y in street_event_years[sk_] if y > this_year)
    elif sk_:
        peers = len(street_event_years[sk_])
    else:
        peers = 0
    item["peers_with_newer_hvac_event"] = peers

for item in output:
    del item["_sk"]
    del item["_event_year"]


# ---------------------------------------------------------------------------
# Deduplication: one row per physical address
# ---------------------------------------------------------------------------
# DCAD issues two parcel accounts (main + improvement sub-account) for some
# properties. These are identical on every meaningful field; only the parcel
# ID suffix differs. We keep the primary record (first seen after sorting by
# parcel_id) and attach the secondary parcel IDs as _duplicate_parcel_ids.
output.sort(key=lambda x: x["parcel_id"])

seen_physical: dict[tuple, dict] = {}
dedup_output = []
dupe_count = 0

for item in output:
    key = (
        item["address"].upper().strip(),
        (item["owner_name"] or "").upper().strip(),
        (item["latest_permit_date"] or "").strip(),
    )
    if key in seen_physical:
        seen_physical[key].setdefault("_duplicate_parcel_ids", []).append(
            item["parcel_id"]
        )
        dupe_count += 1
    else:
        seen_physical[key] = item
        dedup_output.append(item)

# Final sort: score descending, then parcel_id for stability
dedup_output.sort(key=lambda x: (-x["score"], x["parcel_id"]))

target.write_text(json.dumps(dedup_output, indent=2) + "\n")

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
score_dist = Counter(x["score"] for x in dedup_output)
strength_dist = Counter(x["opportunity_strength"] for x in dedup_output)

print(f"Exported {len(dedup_output)} rows to {target}")
print(f"  Duplicates removed: {dupe_count} (DCAD sub-account records for same physical address)")
print(f"  Owner name populated: {sum(1 for x in dedup_output if x['owner_name'])}/{len(dedup_output)}")
print(f"  Owner occupancy enriched: {sum(1 for x in dedup_output if x['owner_occupancy'])}/{len(dedup_output)}")
print(f"  Living area enriched: {sum(1 for x in dedup_output if x['living_area_sqft'])}/{len(dedup_output)}")
print(f"  Unique scores: {len(score_dist)}")
print(f"  Score distribution: {dict(sorted(score_dist.items(), reverse=True))}")
print(f"  Opportunity strength: {dict(strength_dist)}")
print(
    f"  Properties with same-street HVAC since 2021: "
    f"{sum(1 for x in dedup_output if x['same_street_hvac_since_2021'] > 0)}/{len(dedup_output)}"
)
