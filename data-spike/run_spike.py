#!/usr/bin/env python3
"""Rapid HVAC Replacement Radar data spike using aligned official/public Dallas sources.

Stdlib only. It downloads a 5,000-record City of Dallas residential parcel sample and
Dallas OpenData mechanical permits, normalizes addresses, classifies permits,
scores properties, and writes reproducible CSV/JSON artifacts.
"""
from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"
DERIVED = ROOT / "derived"
RAW.mkdir(exist_ok=True)
DERIVED.mkdir(exist_ok=True)

DCAD_QUERY = "https://maps.dcad.org/prdwa/rest/services/Property/ParcelQuery/MapServer/4/query"
DALLAS_PARCELS_QUERY = "https://services2.arcgis.com/rwnOSbfKSwyTBcwN/arcgis/rest/services/DallasTaxParcels/FeatureServer/0/query"
PERMIT_API = "https://www.dallasopendata.com/resource/e7gq-4sah.json"
SAMPLE_SIZE = 5000
TODAY = date(2026, 11, 2)


def get_json(url: str, params: dict) -> dict | list:
    query = urllib.parse.urlencode(params)
    req = urllib.request.Request(url + "?" + query, headers={"User-Agent": "HVAC-Replacement-Radar-data-spike/1.0"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                return json.load(response)
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1 + attempt)


def normalize_address(value: str | None) -> str:
    if not value:
        return ""
    s = value.upper().replace("&", " AND ")
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
    # The permit street_address may contain a trailing city/state/ZIP.
    stop = next((i for i, x in enumerate(words) if x in {"DALLAS", "TX", "TEXAS"}), len(words))
    words = words[:stop]
    return " ".join(words)


def fetch_properties() -> list[dict]:
    city_records: list[dict] = []
    offset = 0
    where = "CITY = 'DALLAS' AND ResCom = 'R' AND PROP_CL LIKE '%SINGLE FAMILY%'"
    fields = "ACCT,ST_NUM,ST_NAME,ST_TYPE,ST_DIR,CITY,COUNTY,ResCom,PROP_CL"
    while len(city_records) < SAMPLE_SIZE:
        data = get_json(DALLAS_PARCELS_QUERY, {
            "where": where,
            "outFields": fields,
            "returnGeometry": "false",
            "orderByFields": "OBJECTID ASC",
            "resultOffset": offset,
            "resultRecordCount": 1000,
            "f": "json",
        })
        rows = [x["attributes"] for x in data.get("features", [])]
        if not rows:
            break
        city_records.extend(rows)
        offset += len(rows)
        if not data.get("exceededTransferLimit"):
            break
    city_records = city_records[:SAMPLE_SIZE]
    dcad_by_id: dict[str, dict] = {}
    for i in range(0, len(city_records), 50):
        ids = [str(x.get("ACCT") or "") for x in city_records[i:i + 50] if x.get("ACCT")]
        if not ids:
            continue
        where_ids = ",".join("'" + x.replace("'", "''") + "'" for x in ids)
        data = get_json(DCAD_QUERY, {
            "where": f"PARCELID IN ({where_ids})",
            "outFields": "PARCELID,SITEADDRESS,RESYRBLT,USEDSCRP,CLASSDSCRP,OWNERNME1,PSTLCITY,PSTLZIP5,LASTUPDATE",
            "returnGeometry": "false",
            "resultRecordCount": 200,
            "f": "json",
        })
        for item in data.get("features", []):
            attrs = item["attributes"]
            dcad_by_id[str(attrs.get("PARCELID"))] = attrs
    records = []
    for city in city_records:
        parcel_id = str(city.get("ACCT") or "")
        dcad = dcad_by_id.get(parcel_id, {})
        street = " ".join(str(city.get(k) or "") for k in ("ST_NUM", "ST_NAME", "ST_TYPE", "ST_DIR")).strip()
        records.append({
            "PARCELID": parcel_id,
            "SITEADDRESS": dcad.get("SITEADDRESS") or street,
            "SITE_CITY": str(city.get("CITY") or "DALLAS").strip().upper(),
            "RESYRBLT": dcad.get("RESYRBLT"),
            "USEDSCRP": dcad.get("USEDSCRP") or "Residential",
            "CLASSDSCRP": dcad.get("CLASSDSCRP") or city.get("PROP_CL") or "SINGLE FAMILY RESIDENCES",
            "OWNERNME1": dcad.get("OWNERNME1") or "",
            "PSTLCITY": dcad.get("PSTLCITY") or city.get("CITY") or "DALLAS",
            "PSTLZIP5": dcad.get("PSTLZIP5") or "",
            "LASTUPDATE": dcad.get("LASTUPDATE") or "",
            "coverage_state": "SUPPORTED",
            "coverage_source": "City of Dallas parcel layer; CITY=DALLAS and ResCom=R",
        })
    return records


def fetch_permits() -> list[dict]:
    # Dallas OpenData has no permit-status field in the published schema.
    params = {
        "$select": "permit_number,permit_type,issued_date,work_description,street_address,zip_code,land_use,value",
        "$where": "permit_type like '%Mechanical%' OR permit_type like '%mechanical%'",
        "$limit": 50000,
        "$order": "issued_date ASC",
    }
    return get_json(PERMIT_API, params)


def parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError:
        for fmt in ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d"):
            try:
                return datetime.strptime(value[:10], fmt).date()
            except ValueError:
                pass
        return None


HVAC_TERMS = re.compile(r"\b(HVAC|A/C|AC|AIR CONDITION|CONDENSER|FURNACE|HEAT PUMP|PACKAGE UNIT|AIR HANDLER|MINI SPLIT|GAS COMPLETE SYSTEM|SPLIT GAS SYSTEM|COMPLETE SYSTEM|COIL)\b")
REPLACEMENT_TERMS = re.compile(r"\b(REPLACE|REPLACING|REPLACEMENT|CHANGE OUT|CHANGEOUT|SWAP OUT|REMOVE AND REPLACE|NEW HVAC SYSTEM|NEW AIR CONDITIONING AND HEATING SYSTEM)\b")
INSTALLATION_TERMS = re.compile(r"\b(INSTALL|INSTALLING|INSTALLATION|NEW HVAC|NEW AC|NEW AIR CONDITIONER|COMPLETE SYSTEM|NEW SINGLE FAM HVAC SYS)\b")
REPAIR_TERMS = re.compile(r"\b(REPAIR|SERVICE|TROUBLESHOOT|MAINTENANCE|RECONNECT|RELOCATE)\b")
AMBIGUOUS_TERMS = re.compile(r"\b(DUCT|DUCTWORK|VENT|VENTILATION|GAS TEST|MECHANICAL REPAIR|MEP|REFRIGERATION)\b")


def classify(permit: dict) -> str:
    text = " ".join(str(permit.get(k) or "") for k in ("permit_type", "work_description")).upper()
    has_hvac = bool(HVAC_TERMS.search(text))
    if has_hvac and REPLACEMENT_TERMS.search(text):
        return "HVAC REPLACEMENT"
    if has_hvac and INSTALLATION_TERMS.search(text):
        return "HVAC INSTALLATION"
    if has_hvac and REPAIR_TERMS.search(text):
        return "HVAC REPAIR"
    if has_hvac:
        return "AMBIGUOUS HVAC SIGNAL"
    if AMBIGUOUS_TERMS.search(text):
        return "AMBIGUOUS MECHANICAL SIGNAL"
    if "MECHANICAL" in text or "REFRIGERATION" in text:
        return "NON-HVAC MECHANICAL"
    if not permit.get("work_description"):
        return "UNKNOWN"
    return "UNKNOWN"


def score_property(prop: dict, permits: list[dict]) -> dict:
    year = int(float(prop["RESYRBLT"])) if prop.get("RESYRBLT") else None
    reasons: list[str] = []
    components = {
        "property_age": 0,
        "residential_property": 0,
        "hvac_event_staleness": 0,
        "no_newer_hvac_event": 0,
        "recent_event_penalty": 0,
    }
    if year is not None:
        if year < 1970: components["property_age"] = 18
        elif year < 1980: components["property_age"] = 15
        elif year < 1990: components["property_age"] = 12
        elif year < 2000: components["property_age"] = 9
        elif year < 2010: components["property_age"] = 6
        elif year <= 2015: components["property_age"] = 3
        if components["property_age"]:
            reasons.append(f"Property built {year} (+{components['property_age']}, inferred property-age signal)")
    if "SINGLE FAMILY" in (prop.get("CLASSDSCRP") or ""):
        components["residential_property"] = 5; reasons.append("Single-family residential (+5, verified parcel-class signal)")

    hvac_events = [x for x in permits if x.get("category") in {"HVAC REPLACEMENT", "HVAC INSTALLATION"} and parse_date(x.get("issued_date"))]
    hvac_events.sort(key=lambda x: x.get("issued_date") or "", reverse=True)
    latest = hvac_events[0] if hvac_events else None
    latest_permit = max(permits, key=lambda x: x.get("issued_date") or "") if permits else None
    event_year = None
    years_since_event = None
    if latest:
        issued = parse_date(latest.get("issued_date"))
        event_year = issued.year
        years_since_event = max(0, (TODAY - issued).days // 365)
        event_label = "HVAC replacement" if latest["category"] == "HVAC REPLACEMENT" else "HVAC installation"
        if latest["category"] == "HVAC REPLACEMENT":
            if years_since_event < 5:
                components["recent_event_penalty"] = -18
            else:
                components["hvac_event_staleness"] = min(66, 15 + (years_since_event * 3))
        else:
            if years_since_event < 5:
                components["recent_event_penalty"] = -15
            else:
                components["hvac_event_staleness"] = min(54, 12 + (years_since_event * 2))
        if years_since_event >= 10:
            components["no_newer_hvac_event"] = 8
            reasons.append(f"No newer HVAC replacement/install event found; last known event was {years_since_event} years ago (+8, absence-of-newer-event inference)")
        reasons.insert(0, f"{event_label.capitalize()} permit recorded in {event_year} (+{components['hvac_event_staleness'] + components['recent_event_penalty']}, verified source event)")
        reasons.insert(1, f"{years_since_event} years since last known HVAC event (inference from {event_year} permit)")
    elif prop.get("coverage_state") == "SUPPORTED":
        reasons.append("No HVAC replacement/install event found in supported Dallas permit records (unknown, not proof of no replacement)")
    else:
        reasons.append("Permit coverage unknown; no-match cannot be scored as absence")
    if latest_permit and latest_permit.get("category") in {"HVAC REPAIR", "AMBIGUOUS HVAC SIGNAL", "AMBIGUOUS MECHANICAL SIGNAL"} and not latest:
        reasons.append(f"{latest_permit['category'].title()} recorded in {latest_permit.get('issued_date','')[:10]} (proxy only)")
    # Ownership duration, sale date, and owner occupancy were unavailable and stay unknown.
    reasons.append("Ownership duration unknown (+0)")
    reasons.append("Owner occupancy unknown (+0)")
    score = max(0, min(100, sum(components.values())))
    if latest and latest.get("match_type") == "exact" and latest.get("issued_date"):
        evidence_confidence = "HIGH"
        reasons.append("Evidence confidence: exact normalized address match with dated HVAC event")
    elif year and prop.get("coverage_state") == "SUPPORTED":
        evidence_confidence = "MEDIUM"
        reasons.append("Evidence confidence: supported parcel and year-built data; no dated HVAC event matched")
    else:
        evidence_confidence = "LOW"
        reasons.append("Evidence confidence: limited source coverage or missing property fields")
    opportunity_strength = "STRONG" if score >= 60 else "MEDIUM" if score >= 35 else "WEAK"
    permit_zips = {
        str(permit.get("zip_code") or "").strip()
        for permit in permits
        if re.fullmatch(r"\d{5}", str(permit.get("zip_code") or "").strip())
    }
    # zip_code belongs to the matched Dallas permit's site address. It is the
    # only ZIP this stage may use for property geography. DCAD PSTLZIP5 is the
    # owner mailing ZIP and must never be used here.
    property_zip = next(iter(permit_zips)) if len(permit_zips) == 1 else ""
    return {
        "parcel_id": prop.get("PARCELID", ""),
        "address": prop.get("SITEADDRESS", ""),
        # Property city comes from the jurisdiction-aligned City of Dallas
        # parcel universe. PSTLCITY is owner mailing geography and is never a
        # property field.
        "city": prop.get("SITE_CITY") or "DALLAS",
        "property_city": prop.get("SITE_CITY") or "DALLAS",
        "owner_mailing_city": str(prop.get("PSTLCITY") or "").strip() or "",
        # Deprecated compatibility alias. Downstream consumers must use
        # property_zip. This is intentionally not populated from PSTLZIP5.
        "zip": property_zip,
        "property_zip": property_zip,
        "owner_mailing_zip": str(prop.get("PSTLZIP5") or "").strip(),
        "property_type": prop.get("CLASSDSCRP", "").strip(),
        "year_built": year or "",
        "owner_name_source_only": prop.get("OWNERNME1", ""),
        "score": score,
        "evidence_confidence": evidence_confidence,
        "opportunity_strength": opportunity_strength,
        "permit_category": latest["category"] if latest else (latest_permit["category"] if latest_permit else "NO RELEVANT PERMIT FOUND"),
        "latest_permit_date": latest.get("issued_date", "") if latest else (latest_permit.get("issued_date", "") if latest_permit else ""),
        "latest_permit_type": latest.get("permit_type", "") if latest else (latest_permit.get("permit_type", "") if latest_permit else ""),
        "latest_permit_description": latest.get("work_description", "") if latest else (latest_permit.get("work_description", "") if latest_permit else ""),
        "last_known_hvac_event_year": event_year or "",
        "estimated_years_since_last_known_hvac_event": years_since_event if years_since_event is not None else "",
        "score_components": json.dumps(components, sort_keys=True),
        "permit_status": "UNKNOWN (Dallas OpenData published schema has no status field)",
        "coverage_state": prop.get("coverage_state", "UNKNOWN"),
        "reason_1": " | ".join(reasons),
    }


def main() -> None:
    prop_cache = RAW / "dcad_properties_sample.csv"
    permit_cache = RAW / "dallas_mechanical_permits.json"
    if prop_cache.exists() and permit_cache.exists() and "coverage_state" in prop_cache.read_text()[:2000]:
        with prop_cache.open() as f:
            props = list(csv.DictReader(f))
        permits = json.loads(permit_cache.read_text())
    else:
        props = fetch_properties()
        permits = fetch_permits()
    for p in props:
        p["normalized_address"] = normalize_address(p.get("SITEADDRESS"))
    permits_by_address: dict[str, list[dict]] = defaultdict(list)
    for permit in permits:
        permit["normalized_address"] = normalize_address(permit.get("street_address"))
        permit["category"] = classify(permit)
        permit["match_type"] = "exact"
        if permit["normalized_address"]:
            permits_by_address[permit["normalized_address"]].append(permit)

    output = []
    for prop in props:
        output.append(score_property(prop, permits_by_address.get(prop["normalized_address"], [])))
    output.sort(key=lambda x: (-x["score"], x["parcel_id"]))

    with (DERIVED / "properties_scored.csv").open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(output[0].keys()))
        writer.writeheader(); writer.writerows(output)
    with (DERIVED / "top_100.csv").open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(output[0].keys()))
        writer.writeheader(); writer.writerows(output[:100])
    with (RAW / "dcad_properties_sample.csv").open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(props[0].keys()))
        writer.writeheader(); writer.writerows(props)
    with (RAW / "dallas_mechanical_permits.json").open("w") as f:
        json.dump(permits, f, indent=2)

    matched = [x for x in output if x["latest_permit_date"]]
    categories = Counter(x["permit_category"] for x in output)
    strengths = Counter(x["opportunity_strength"] for x in output)
    evidence_confidences = Counter(x["evidence_confidence"] for x in output)
    score_distribution = Counter(x["score"] for x in output)
    scored_with_hvac_event = sum(1 for x in output if x["last_known_hvac_event_year"])
    metrics = {
        "property_sample": len(output),
        "permit_records_downloaded": len(permits),
        "matched_properties": len(matched),
        "address_match_rate_percent": round(100 * len(matched) / len(output), 2) if output else 0,
        "properties_with_hvac_mechanical_history_percent": round(100 * len(matched) / len(output), 2) if output else 0,
        "categories": categories,
        "opportunity_strengths": strengths,
        "evidence_confidences": evidence_confidences,
        "score_distribution": score_distribution,
        "properties_with_historical_hvac_event": scored_with_hvac_event,
        "permit_status_field": "not published by Dallas OpenData dataset; retained as UNKNOWN",
        "coverage_states": Counter(x.get("coverage_state", "UNKNOWN") for x in output),
        "coverage_definition": "SUPPORTED means City of Dallas parcel layer CITY=DALLAS and ResCom=R; only SUPPORTED properties receive absence-of-permit points",
        "top_100_generated": len(output) >= 100,
        "sources": {
            "property": DCAD_QUERY,
            "permits": PERMIT_API,
            "retrieved_on": str(TODAY),
        },
    }
    (DERIVED / "metrics.json").write_text(json.dumps(metrics, indent=2, default=dict))
    print(json.dumps(metrics, indent=2, default=dict))
    print("\nTOP 20")
    for row in output[:20]:
        print(row["score"], row["opportunity_strength"], row["evidence_confidence"], row["address"], row["year_built"], row["permit_category"], row["last_known_hvac_event_year"])


if __name__ == "__main__":
    main()
