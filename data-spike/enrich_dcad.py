#!/usr/bin/env python3
"""Fetch extended DCAD parcel fields for the current 307 opportunity properties.

Produces: data-spike/derived/dcad_enrichment.json

Fields fetched from DCAD ParcelPublishing:
  PARCELID, OWNERNME1, OWNERNME2, PSTLADDRESS, PSTLCITY, PSTLSTATE, PSTLZIP5, PSTLZIP4,
  RESFLRAREA, SITEADDRESS

Owner-occupancy proxy: compare PSTLADDRESS to SITEADDRESS after conservative normalization.
This is an address-based inference only — not verified occupancy or residence.

Run this once; cache persists. Then re-run export_app_fixture.py to update the app fixture.

Usage:
    python3 data-spike/enrich_dcad.py

Note: This makes live requests to the DCAD ArcGIS service. Use throttled batching
and cache the result. Production ingestion should not issue per-property live requests.
"""
from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
properties_file = ROOT / "app" / "app" / "data" / "properties.json"
output_file = ROOT / "data-spike" / "derived" / "dcad_enrichment.json"

DCAD_QUERY = "https://maps.dcad.org/prdwa/rest/services/Property/ParcelQuery/MapServer/4/query"
BATCH_SIZE = 50
THROTTLE_SECONDS = 0.5


def get_json(url: str, params: dict) -> dict:
    query = urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url + "?" + query,
        headers={"User-Agent": "HVAC-Replacement-Radar-enrichment/1.0"},
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                return json.load(response)
        except Exception as exc:
            if attempt == 2:
                raise
            print(f"  Retrying after error: {exc}")
            time.sleep(1 + attempt)


def normalize_compact(value: str | None) -> str:
    """
    Compact normalization for address comparison.

    Strategy:
      1. Uppercase everything.
      2. Expand common full-word forms to standard abbreviations so both sides
         end up in the same form regardless of which spelling DCAD chose.
         Handles: directionals (NORTH/N, NORTHEAST/NE, etc.),
         street suffixes (STREET/ST, DRIVE/DR, AVENUE/AVE, ROAD/RD, …),
         and unit-type words (APARTMENT/APT, SUITE/STE, UNIT/UNIT).
      3. Strip all non-alphanumeric characters (punctuation, spaces, hyphens).
         This makes "N." == "N", "DR." == "DR", "75254-1234" == "752541234", etc.

    Removing spaces collapses multi-word street names consistently: "OAK BLUFF"
    and "OAKBLUFF" both become "OAKBLUFF", which is conservative (may match
    distinct streets) but avoids false absentee classifications from minor
    spacing differences in DCAD data.
    """
    if not value:
        return ""
    s = str(value).upper()

    # Street suffix full → abbreviated (word-boundary safe)
    suffix_map = [
        ("STREET", "ST"),
        ("AVENUE", "AVE"),
        ("BOULEVARD", "BLVD"),
        ("DRIVE", "DR"),
        ("ROAD", "RD"),
        ("LANE", "LN"),
        ("COURT", "CT"),
        ("CIRCLE", "CIR"),
        ("PLACE", "PL"),
        ("PARKWAY", "PKWY"),
        ("HIGHWAY", "HWY"),
        ("TRAIL", "TRL"),
        ("EXPRESSWAY", "EXPY"),
        ("TERRACE", "TER"),
        ("PASS", "PASS"),
    ]
    for full, abbr in suffix_map:
        s = re.sub(rf"\b{full}\b", abbr, s)

    # Compound directionals first (before single-letter expansions)
    compound_dir = [
        ("NORTHEAST", "NE"), ("NORTHWEST", "NW"),
        ("SOUTHEAST", "SE"), ("SOUTHWEST", "SW"),
    ]
    for full, abbr in compound_dir:
        s = re.sub(rf"\b{full}\b", abbr, s)

    # Single-letter directionals
    single_dir = [
        ("NORTH", "N"), ("SOUTH", "S"), ("EAST", "E"), ("WEST", "W"),
    ]
    for full, abbr in single_dir:
        s = re.sub(rf"\b{full}\b", abbr, s)

    # Unit-type words — normalize to a consistent form so "APT 2A" and
    # "UNIT 2A" are treated the same and don't create false mismatches.
    unit_map = [
        ("APARTMENT", "APT"), ("SUITE", "STE"),
    ]
    for full, abbr in unit_map:
        s = re.sub(rf"\b{full}\b", abbr, s)

    # Remove all non-alphanumeric characters (spaces, punctuation, hyphens, #)
    s = re.sub(r"[^A-Z0-9]", "", s)
    return s


def street_portion(compact: str) -> str:
    """
    Given a compact-normalized address string, return only the street
    address portion by stripping any city/state/zip suffix.

    DCAD PSTLADDRESS should be street-line only, but as a defensive measure
    this removes trailing tokens that look like TX + zip codes.

    Example: "7232OAKBLUFFDRDALLAUSTX75254" → "7232OAKBLUFFDR"
    (TX followed by 5 digits is treated as the start of city/state/zip)
    """
    # Find the pattern TX followed by 5 digits and strip from that point
    m = re.search(r"TX\d{5}", compact)
    if m:
        return compact[:m.start()].rstrip("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    # Also strip a standalone 5- or 9-digit zip at the very end
    stripped = re.sub(r"\d{5}(\d{4})?$", "", compact).rstrip()
    # If "TX" is now at the end, strip it and any trailing city tokens
    # (crude: remove trailing uppercase-letter runs that aren't part of the
    #  address proper — only activate when the string ends TX or similar)
    return stripped


def format_mailing_address(attrs: dict) -> str | None:
    """Build a single mailing address string from DCAD postal fields."""
    street = (attrs.get("PSTLADDRESS") or "").strip()
    city = (attrs.get("PSTLCITY") or "").strip()
    state = (attrs.get("PSTLSTATE") or "").strip()
    zip5 = (attrs.get("PSTLZIP5") or "").strip()
    zip4 = (attrs.get("PSTLZIP4") or "").strip()

    if not street:
        return None

    zip_full = f"{zip5}-{zip4}" if zip4 else zip5
    parts = [p for p in [street, city, state, zip_full] if p]
    return ", ".join(parts) if parts else None


def occupancy_proxy(site_address: str | None, pstl_address: str | None) -> str | None:
    """
    Compare postal address to site address to infer owner-occupancy.

    Returns:
        "LIKELY_OWNER_OCCUPIED" — addresses match after normalization
        "LIKELY_ABSENTEE"       — usable postal address that does not match
        None                    — withheld, missing, or ambiguous data

    Matching strategy (most-to-least specific):
      1. Exact compact match.
      2. If the postal address's compact form *starts with* the site compact
         form (≥ 8 chars), treat as a match. This handles the case where
         PSTLADDRESS contains a full address line including city/state/zip
         on one line rather than just the street portion.
      3. If neither matches, classify as LIKELY_ABSENTEE.

    If site_norm is very short (< 6 chars after normalization) the comparison
    is too ambiguous; return None rather than forcing a classification.

    This is an inference based on address fields only — not verified occupancy.
    It can include owners with a second mailing address, trusts/entities, or
    formatting artifacts that survive normalization.
    """
    site_norm = normalize_compact(site_address)
    pstl_full_norm = normalize_compact(pstl_address)

    if not site_norm or not pstl_full_norm:
        return None

    # Guard against very short site addresses that could spuriously match
    if len(site_norm) < 6:
        return None

    # Also compute the street-portion of the postal address (strips trailing
    # city/state/zip if they appear in the compact form)
    pstl_street_norm = street_portion(pstl_full_norm)

    # Test 1: exact match
    if site_norm == pstl_full_norm or site_norm == pstl_street_norm:
        return "LIKELY_OWNER_OCCUPIED"

    # Test 2: postal starts with site (postal has extra city/state/zip appended)
    if pstl_full_norm.startswith(site_norm) and len(site_norm) >= 8:
        return "LIKELY_OWNER_OCCUPIED"

    # Test 3: site starts with postal street portion (site has extra data)
    if pstl_street_norm and site_norm.startswith(pstl_street_norm) and len(pstl_street_norm) >= 8:
        return "LIKELY_OWNER_OCCUPIED"

    return "LIKELY_ABSENTEE"


def main() -> None:
    properties = json.loads(properties_file.read_text())
    parcel_ids = [p["parcel_id"] for p in properties]
    site_addresses = {p["parcel_id"]: p["address"] for p in properties}

    print(f"Enriching {len(parcel_ids)} parcel IDs from DCAD ParcelPublishing…")

    results: list[dict] = []
    for i in range(0, len(parcel_ids), BATCH_SIZE):
        batch = parcel_ids[i:i + BATCH_SIZE]
        where_ids = ",".join("'" + pid.replace("'", "''") + "'" for pid in batch)
        data = get_json(DCAD_QUERY, {
            "where": f"PARCELID IN ({where_ids})",
            "outFields": (
                "PARCELID,OWNERNME1,OWNERNME2,"
                "PSTLADDRESS,PSTLCITY,PSTLSTATE,PSTLZIP5,PSTLZIP4,"
                "RESFLRAREA,SITEADDRESS"
            ),
            "returnGeometry": "false",
            "resultRecordCount": BATCH_SIZE + 10,
            "f": "json",
        })

        for feature in data.get("features", []):
            attrs = feature["attributes"]
            parcel_id = str(attrs.get("PARCELID") or "")
            site_addr = site_addresses.get(parcel_id) or attrs.get("SITEADDRESS") or ""
            pstl_addr = (attrs.get("PSTLADDRESS") or "").strip() or None

            owner_name = " ".join(
                filter(None, [
                    (attrs.get("OWNERNME1") or "").strip(),
                    (attrs.get("OWNERNME2") or "").strip(),
                ])
            ) or None

            living_area = attrs.get("RESFLRAREA")
            try:
                living_area = int(float(living_area)) if living_area else None
            except (ValueError, TypeError):
                living_area = None

            mailing_address = format_mailing_address(attrs)
            occupancy = occupancy_proxy(site_addr, pstl_addr)

            results.append({
                "parcel_id": parcel_id,
                "owner_name": owner_name,
                "owner_mailing_address": mailing_address,
                "living_area_sqft": living_area,
                "owner_occupancy": occupancy,
                # Keep raw postal fields for audit/debugging
                "_pstl_raw": pstl_addr,
                "_pstl_city": (attrs.get("PSTLCITY") or "").strip() or None,
                "_pstl_state": (attrs.get("PSTLSTATE") or "").strip() or None,
                "_pstl_zip5": (attrs.get("PSTLZIP5") or "").strip() or None,
            })

        print(
            f"  Batch {i // BATCH_SIZE + 1}: "
            f"{min(i + BATCH_SIZE, len(parcel_ids))}/{len(parcel_ids)} processed"
        )
        if i + BATCH_SIZE < len(parcel_ids):
            time.sleep(THROTTLE_SECONDS)

    # Summary
    matched = len(results)
    owner_occ = sum(1 for r in results if r["owner_occupancy"] == "LIKELY_OWNER_OCCUPIED")
    absentee = sum(1 for r in results if r["owner_occupancy"] == "LIKELY_ABSENTEE")
    unknown_occ = sum(1 for r in results if r["owner_occupancy"] is None)
    has_area = sum(1 for r in results if r["living_area_sqft"])

    print(f"\nResults:")
    print(f"  Matched parcel IDs: {matched}/{len(parcel_ids)}")
    print(f"  Likely owner occupied: {owner_occ}")
    print(f"  Likely absentee owner: {absentee}")
    print(f"  Unknown / withheld: {unknown_occ}")
    print(f"  Living area populated: {has_area}/{matched}")

    output_file.write_text(json.dumps(results, indent=2) + "\n")
    print(f"\nSaved to {output_file}")
    print("Re-run export_app_fixture.py to update the app fixture.")


if __name__ == "__main__":
    main()
