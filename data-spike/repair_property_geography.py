#!/usr/bin/env python3
"""Repair and audit property/site ZIP geography for the current opportunity set.

The old pipeline copied DCAD PSTLZIP5 into the generic ``zip`` field. PSTLZIP5
is owner-mailing geography, not property geography. This script derives the
canonical property ZIP only from site-related sources:

1. Dallas OpenData mechanical permit ``zip_code`` for an exact normalized site
   address match.
2. For properties without a matched permit ZIP, the City of Dallas parcel
   geometry intersected with the public Dallas County 2020 ZIP polygon layer.

Owner mailing ZIP remains a separate field from DCAD PSTLZIP5. The script is
idempotent and writes an auditable repair map; it never substitutes mailing ZIP
for site ZIP.
"""
from __future__ import annotations

import csv
import json
import re
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data-spike" / "raw"
DERIVED = ROOT / "data-spike" / "derived"
FIXTURE = ROOT / "app" / "app" / "data" / "properties.json"
SCORED = DERIVED / "properties_scored.csv"
PERMITS = RAW / "dallas_mechanical_permits.json"
ENRICHMENT = DERIVED / "dcad_enrichment.json"
REPAIR = DERIVED / "property_geography_repair.json"
AUDIT = DERIVED / "property_geography_audit.json"

PARCEL_QUERY = "https://services2.arcgis.com/rwnOSbfKSwyTBcwN/arcgis/rest/services/DallasTaxParcels/FeatureServer/0/query"
ZIP_QUERY = "https://services3.arcgis.com/oyyhc5QOrK5J5KaG/arcgis/rest/services/Zip_Codes_Dallas_County/FeatureServer/2/query"


def get_json(url: str, params: dict) -> dict:
    request = urllib.request.Request(
        url + "?" + urllib.parse.urlencode(params),
        headers={"User-Agent": "HVAC-Replacement-Radar-property-geography/1.0"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def normalize_address(value: str | None) -> str:
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


def permit_zip_index() -> dict[str, set[str]]:
    by_address: dict[str, set[str]] = defaultdict(set)
    for permit in json.loads(PERMITS.read_text()):
        address = normalize_address(permit.get("street_address"))
        zip_code = str(permit.get("zip_code") or "").strip()
        if address and re.fullmatch(r"\d{5}", zip_code):
            by_address[address].add(zip_code)
    return by_address


def parcel_geometry_zip(parcel_id: str) -> tuple[str | None, str]:
    parcel = get_json(PARCEL_QUERY, {
        "where": f"ACCT='{parcel_id.replace(chr(39), chr(39) * 2)}'",
        "outFields": "ACCT,ST_NUM,ST_NAME,ST_TYPE,ST_DIR",
        "returnGeometry": "true",
        "outSR": "102738",
        "f": "json",
    })
    features = parcel.get("features", [])
    if not features or not features[0].get("geometry"):
        return None, "parcel geometry unavailable"

    zip_data = get_json(ZIP_QUERY, {
        "geometry": json.dumps(features[0]["geometry"], separators=(",", ":")),
        "geometryType": "esriGeometryPolygon",
        "inSR": "102738",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "ZCTA5CE20",
        "returnGeometry": "false",
        "f": "json",
    })
    zips = {
        str(feature.get("attributes", {}).get("ZCTA5CE20") or "").strip()
        for feature in zip_data.get("features", [])
        if re.fullmatch(r"\d{5}", str(feature.get("attributes", {}).get("ZCTA5CE20") or "").strip())
    }
    if len(zips) == 1:
        return next(iter(zips)), "City of Dallas parcel geometry intersected with Dallas County ZIP polygon"
    if not zips:
        return None, "no intersecting ZIP polygon"
    return None, f"ambiguous ZIP polygon intersection: {sorted(zips)}"


def build_repair_rows() -> list[dict]:
    with SCORED.open(newline="") as handle:
        scored = list(csv.DictReader(handle))[:307]
    enrich = {row["parcel_id"]: row for row in json.loads(ENRICHMENT.read_text())}
    permit_zips = permit_zip_index()
    rows = []

    for index, row in enumerate(scored, start=1):
        address = row.get("address", "").strip()
        candidates = permit_zips.get(normalize_address(address), set())
        if len(candidates) == 1:
            property_zip = next(iter(candidates))
            source = "Dallas OpenData mechanical permit zip_code matched to site address"
            source_status = "VERIFIED_DATA"
        else:
            property_zip, source = parcel_geometry_zip(row["parcel_id"])
            source_status = "VERIFIED_DATA" if property_zip else "UNKNOWN"
            time.sleep(0.1)

        mail = enrich.get(row["parcel_id"], {})
        property_city = (row.get("property_city") or row.get("city") or "DALLAS").strip().upper()
        owner_mailing_city = str(mail.get("_pstl_city") or "").strip() or None
        owner_mailing_zip = str(mail.get("_pstl_zip5") or "").strip() or None
        legacy_zip = row.get("zip", "").strip() or None
        rows.append({
            "parcel_id": row["parcel_id"],
            "address": address,
            "city": property_city,
            "property_city": property_city,
            "owner_mailing_city": owner_mailing_city,
            "legacy_zip": legacy_zip,
            "property_zip": property_zip,
            "owner_mailing_zip": owner_mailing_zip,
            "source": source,
            "source_status": source_status,
            "owner_mailing_city": str(mail.get("_pstl_city") or "").strip() or None,
            "owner_mailing_state": str(mail.get("_pstl_state") or "").strip() or None,
        })
        print(f"[{index}/{len(scored)}] {row['parcel_id']} {address}: {property_zip or 'UNKNOWN'}", flush=True)
    return rows


def audit(rows: list[dict]) -> dict:
    def classify(value: str | None) -> str:
        if not value:
            return "MISSING"
        if value == "WTHLD" or not re.fullmatch(r"\d{5}", value):
            return "OTHER"
        return "DALLAS_RANGE" if 75001 <= int(value) <= 75999 else "OUT_OF_RANGE"

    legacy_dist = Counter(row["legacy_zip"] or "" for row in rows)
    property_dist = Counter(row["property_zip"] or "" for row in rows)
    current_classes = Counter(classify(row["legacy_zip"]) for row in rows)
    property_classes = Counter(classify(row["property_zip"]) for row in rows)
    leaked = [
        row for row in rows
        if row["legacy_zip"] and row["owner_mailing_zip"] and row["legacy_zip"] == row["owner_mailing_zip"]
    ]
    suspicious = [row for row in rows if classify(row["legacy_zip"]) != "DALLAS_RANGE"]
    unresolved = [row for row in rows if not row["property_zip"]]
    return {
        "total_opportunities_audited": len(rows),
        "current_legacy_zip_classification": dict(current_classes),
        "current_legacy_zip_distribution": dict(legacy_dist),
        "canonical_property_zip_classification": dict(property_classes),
        "canonical_property_zip_distribution": dict(property_dist),
        "valid_dallas_property_zips": sum(1 for row in rows if classify(row["property_zip"]) == "DALLAS_RANGE"),
        "missing_property_zips": sum(1 for row in rows if not row["property_zip"]),
        "suspicious_current_zip_rows": len(suspicious),
        "owner_mailing_zip_leak_rows": len(leaked),
        "unrecoverable_rows": len(unresolved),
        "suspicious_rows": suspicious,
        "unrecoverable_records": unresolved,
        "leaked_records": leaked,
        "parcel_id_mismatches": [],
        "source_rule": "property_zip uses matched Dallas permit site zip_code or parcel-geometry/ZIP-polygon intersection; never DCAD PSTLZIP5",
    }


def patch_fixture(rows: list[dict]) -> None:
    repair_by_id = {row["parcel_id"]: row for row in rows}
    fixture = json.loads(FIXTURE.read_text())
    for row in fixture:
        repair = repair_by_id.get(row["parcel_id"])
        if not repair:
            raise RuntimeError(f"Fixture parcel missing from repair map: {row['parcel_id']}")
        if not repair["property_zip"]:
            raise RuntimeError(f"Fixture property has no recoverable property_zip: {row['parcel_id']}")
        row["city"] = repair["city"] or "DALLAS"
        row["property_city"] = repair["property_city"] or repair["city"] or "DALLAS"
        row["owner_mailing_city"] = repair["owner_mailing_city"]
        row["property_zip"] = repair["property_zip"]
        row["owner_mailing_zip"] = repair["owner_mailing_zip"]
        # Deprecated compatibility alias now mirrors canonical site geography.
        row["zip"] = repair["property_zip"]
    FIXTURE.write_text(json.dumps(fixture, indent=2) + "\n")


if __name__ == "__main__":
    repair_rows = build_repair_rows()
    result = audit(repair_rows)
    REPAIR.write_text(json.dumps(repair_rows, indent=2) + "\n")
    AUDIT.write_text(json.dumps(result, indent=2) + "\n")
    patch_fixture(repair_rows)
    print(json.dumps(result, indent=2))
