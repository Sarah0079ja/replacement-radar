import { scoreNormalizedEvidence } from "./scoring.mjs";

const HVAC_TERMS = /\b(?:HVAC|A\/?C|AIR\s+CONDITION(?:ING|ER)?|CONDENSER|FURNACE|HEAT\s+PUMP|PACKAGE\s+UNIT|AIR\s+HANDLER|MINI\s+SPLIT|GAS\s+COMPLETE\s+SYSTEM|SPLIT\s+GAS\s+SYSTEM|COMPLETE\s+SYSTEM|COIL)\b/i;
const REPLACEMENT_TERMS = /\b(?:REPLACE|REPLACING|REPLACEMENT|CHANGE\s*OUT|CHANGEOUT|SWAP\s*OUT|REMOVE\s+AND\s+REPLACE|NEW\s+HVAC\s+SYSTEM|NEW\s+AIR\s+CONDITIONING\s+AND\s+HEATING\s+SYSTEM)\b/i;
const INSTALLATION_TERMS = /\b(?:INSTALL|INSTALLING|INSTALLATION|NEW\s+HVAC|NEW\s+AC|NEW\s+AIR\s+CONDITIONER|COMPLETE\s+SYSTEM|NEW\s+SINGLE\s+FAM\s+HVAC\s+SYS)\b/i;
const REPAIR_TERMS = /\b(?:REPAIR|SERVICE|MAINTENANCE|TROUBLESHOOT|RELOCAT(?:E|ED|ING)|REINSTALL(?:ATION|ED)?)\b/i;

function text(value) { return value == null ? "" : String(value).trim(); }
function zip(value) { const result = text(value).replace(/\.0$/, "").padStart(5, "0"); return /^\d{5}$/.test(result) ? result : null; }

export function normalizeDallasAddress(value) { return text(value).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim(); }
export function parseDallasDate(value) {
  const match = text(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return null;
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  const result = new Date(Date.UTC(year, Number(match[1]) - 1, Number(match[2])));
  return Number.isNaN(result.getTime()) ? null : result.toISOString().slice(0, 10);
}

export function classifyDallasRecord(record) {
  const permitType = text(record.permit_type);
  const description = text(record.work_description);
  const context = `${permitType} ${description}`;
  const residential = /SINGLE\s+FAMILY|RESIDENTIAL/i.test(text(record.land_use));
  if (!residential || !/MECHANICAL/i.test(permitType)) return { eventType: "UNKNOWN", evidenceConfidence: "UNKNOWN", sourceConfidence: "HIGH", isEligible: false, reason: "Not a residential mechanical permit" };
  if (HVAC_TERMS.test(context) && REPLACEMENT_TERMS.test(context)) return { eventType: "HVAC_REPLACEMENT", evidenceConfidence: "VERIFIED DATA", sourceConfidence: "HIGH", isEligible: true, reason: "Residential Dallas mechanical permit describes HVAC replacement/change-out" };
  if (HVAC_TERMS.test(context) && INSTALLATION_TERMS.test(context)) return { eventType: "HVAC_INSTALLATION", evidenceConfidence: "VERIFIED DATA", sourceConfidence: "HIGH", isEligible: true, reason: "Residential Dallas mechanical permit describes HVAC installation" };
  if (HVAC_TERMS.test(context) && REPAIR_TERMS.test(context)) return { eventType: "HVAC_REPAIR", evidenceConfidence: "INFERENCE", sourceConfidence: "MEDIUM", isEligible: true, reason: "Residential Dallas mechanical permit references HVAC repair/service" };
  if (HVAC_TERMS.test(context)) return { eventType: "AMBIGUOUS_MECHANICAL", evidenceConfidence: "INFERENCE", sourceConfidence: "MEDIUM", isEligible: true, reason: "Residential Dallas mechanical permit contains HVAC context without clear intent" };
  return { eventType: "OTHER_MECHANICAL", evidenceConfidence: "UNKNOWN", sourceConfidence: "HIGH", isEligible: false, reason: "Residential mechanical permit does not identify HVAC work" };
}

export function normalizeDallasRecord(record, territoryId, existing = null, now = new Date()) {
  const classification = classifyDallasRecord(record);
  const eventDate = parseDallasDate(record.issued_date);
  const propertyZip = zip(record.zip_code);
  const address = text(record.street_address);
  const city = existing?.property_city || existing?.city || "DALLAS";
  const propertyKey = existing?.parcel_id || `dallas-address-${normalizeDallasAddress(address).replaceAll(" ", "-")}-${propertyZip || "unknown"}`;
  const scoreResult = scoreNormalizedEvidence({ eventType: classification.eventType, eventDate, propertyType: existing?.property_type || "RESIDENTIAL" }, now);
  const reasons = [classification.reason];
  if (eventDate) reasons.push(`${scoreResult.yearsSinceEvent ?? 0} years since Dallas source event (inference from permit date)`);
  const event = {
    territory_id: territoryId,
    jurisdiction_key: "city_of_dallas",
    source_system: "dallas_opendata_dcad",
    source_record_id: text(record.permit_number),
    event_date: eventDate,
    normalized_event_type: classification.eventType,
    evidence_confidence: classification.evidenceConfidence,
    source_confidence: classification.sourceConfidence,
    property_address: address || existing?.address || null,
    property_city: city,
    property_state: "TX",
    property_zip: propertyZip || existing?.property_zip || null,
    parcel_id: existing?.parcel_id || null,
    square_footage: existing?.living_area_sqft || null,
    raw_description: text(record.work_description) || null,
    source_payload: { permit_type: text(record.permit_type) || null, issued_date: text(record.issued_date) || null, land_use: text(record.land_use) || null, value: record.value == null ? null : Number(record.value) || null },
  };
  const opportunity = {
    parcel_id: propertyKey,
    address: existing?.address || address || "Address unavailable",
    city,
    zip: existing?.zip || null,
    property_city: existing?.property_city || city,
    property_zip: existing?.property_zip || propertyZip,
    owner_name: existing?.owner_name || null,
    owner_mailing_address: existing?.owner_mailing_address || null,
    owner_mailing_city: existing?.owner_mailing_city || null,
    owner_mailing_zip: existing?.owner_mailing_zip || null,
    living_area_sqft: existing?.living_area_sqft || null,
    owner_occupancy: existing?.owner_occupancy || null,
    property_type: existing?.property_type || (/SINGLE\s+FAMILY|RESIDENTIAL/i.test(text(record.land_use)) ? "RESIDENTIAL" : null),
    year_built: existing?.year_built || null,
    score: scoreResult.score,
    opportunity_strength: scoreResult.opportunityStrength,
    evidence_confidence: classification.sourceConfidence === "HIGH" ? "HIGH" : "MEDIUM",
    permit_category: classification.eventType.replaceAll("_", " "),
    latest_permit_date: eventDate,
    latest_permit_type: text(record.permit_type) || null,
    latest_permit_description: text(record.work_description) || null,
    last_known_hvac_event_year: eventDate ? Number(eventDate.slice(0, 4)) : null,
    estimated_years_since_last_known_hvac_event: scoreResult.yearsSinceEvent,
    source_evidence: { ...(existing?.source_evidence || {}), source: "Dallas OpenData permit evidence; DCAD property context where present", source_system: "dallas_opendata_dcad", jurisdiction: "city_of_dallas", source_record_id: text(record.permit_number), classification_reason: classification.reason, coverage_state: existing?.coverage_state || "SUPPORTED" },
    reasons,
    coverage_state: existing?.coverage_state || "SUPPORTED",
    same_street_hvac_since_2021: existing?.same_street_hvac_since_2021 ?? 0,
    peers_with_newer_hvac_event: existing?.peers_with_newer_hvac_event ?? 0,
    territory_id: territoryId,
    jurisdiction_key: "city_of_dallas",
    source_system: "dallas_opendata_dcad",
    source_property_id: propertyKey,
  };
  return { classification, event, opportunity };
}

export const DALLAS_PILOT = Object.freeze({ sourceSystem: "dallas_opendata_dcad", territoryKey: "dallas", dataSourceKey: "dallas_opendata_e7gq_4sah_dcad", adapterKey: "dallas_v1", jurisdictionKey: "city_of_dallas", sourceUrl: "https://www.dallasopendata.com/resource/e7gq-4sah.json" });
