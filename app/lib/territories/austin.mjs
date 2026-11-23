import { scoreNormalizedEvidence } from "./scoring.mjs";

const HVAC_CONTEXT = /\b(hvac|heat\s*pump|air\s*condition(?:ing|er)?|a\/c|furnace|duct(?:work|s)?|heat\s+and\s+air)\b/i;
const NON_RESIDENTIAL = new Set(["COMMERCIAL", "MULTIFAMILY", "INDUSTRIAL"]);

function text(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function zip(value) {
  const result = text(value).replace(/\.0$/, "").padStart(5, "0");
  return /^\d{5}$/.test(result) ? result : null;
}

function date(value) {
  const result = text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : null;
}

export function classifyAustinRecord(record) {
  const permitType = text(record.permit_type_desc).toUpperCase();
  const description = text(record.description);
  const classMapped = text(record.permit_class_mapped).toUpperCase();
  const context = `${permitType} ${text(record.work_class)} ${description}`;
  const isMechanical = permitType.includes("MECHANICAL") || text(record.permittype).toUpperCase() === "MP";
  const isResidential = classMapped === "RESIDENTIAL" && !NON_RESIDENTIAL.has(text(record.permit_class).toUpperCase());

  if (!isResidential || !isMechanical) {
    return { eventType: "UNKNOWN", evidenceConfidence: "UNKNOWN", sourceConfidence: "HIGH", isEligible: false, reason: "Not a residential mechanical permit" };
  }

  const isChangeOut = /\bchange\s*out\b/i.test(text(record.work_class));
  const replacementNearHvac = /\b(?:replace(?:d|ment|ing)?|change\s*out|changeout|swap(?:ped)?)\b.{0,72}\b(?:hvac\s+(?:system|unit|equipment)|heat\s*(?:pump|and\s+air)|air\s*condition(?:ing|er)|furnace|a\/c\s+unit)\b|\b(?:hvac\s+(?:system|unit|equipment)|heat\s*(?:pump|and\s+air)|air\s*condition(?:ing|er)|furnace|a\/c\s+unit)\b.{0,72}\b(?:replace(?:d|ment|ing)?|change\s*out|changeout|swap(?:ped)?)\b|\breplace\s+or\s+modify\s+existing\s+hvac\b/i.test(context);
  const installationNearHvac = /\bnew\s+(?:central\s+)?(?:hvac|heat\s*pump|air\s*condition(?:ing|er)|furnace|a\/c(?:\s+unit)?)\b|\binstall(?:ation|ed)?\s+(?:a\s+|an\s+|the\s+|new\s+)(?:central\s+)?(?:hvac|heat\s*pump|air\s*condition(?:ing|er)|furnace|a\/c(?:\s+unit)?)\b|\b(?:hvac|heat\s*pump|air\s*condition(?:ing|er)|furnace|a\/c(?:\s+unit)?)\s+installation\b/i.test(context);
  const repairNearHvac = /\b(?:repair|service|maintenance|troubleshoot|relocat(?:e|ed|ing)|reinstall(?:ation|ed)?)\b.{0,72}\b(?:hvac|heat\s*pump|air\s*condition(?:ing|er)|furnace|a\/c|duct(?:work|s)?)\b|\b(?:hvac|heat\s*pump|air\s*condition(?:ing|er)|furnace|a\/c|duct(?:work|s)?)\b.{0,72}\b(?:repair|service|maintenance|troubleshoot|relocat(?:e|d|ing)|reinstall(?:ation|ed)?)\b/i.test(context);

  if ((isChangeOut || replacementNearHvac) && HVAC_CONTEXT.test(context)) {
    return { eventType: "HVAC_REPLACEMENT", evidenceConfidence: "VERIFIED DATA", sourceConfidence: "HIGH", isEligible: true, reason: "Residential mechanical record explicitly describes HVAC replacement/change-out" };
  }
  if (installationNearHvac) {
    return { eventType: "HVAC_INSTALLATION", evidenceConfidence: "VERIFIED DATA", sourceConfidence: "HIGH", isEligible: true, reason: "Residential mechanical record explicitly describes HVAC installation" };
  }
  if (repairNearHvac) {
    return { eventType: "HVAC_REPAIR", evidenceConfidence: "INFERENCE", sourceConfidence: "MEDIUM", isEligible: true, reason: "Residential mechanical record references HVAC repair/service" };
  }
  if (HVAC_CONTEXT.test(context)) {
    return { eventType: "AMBIGUOUS_MECHANICAL", evidenceConfidence: "INFERENCE", sourceConfidence: "MEDIUM", isEligible: true, reason: "Residential mechanical record references HVAC context without a clear event intent" };
  }
  return { eventType: "OTHER_MECHANICAL", evidenceConfidence: "UNKNOWN", sourceConfidence: "HIGH", isEligible: false, reason: "Residential mechanical record does not identify HVAC work" };
}

function normalizedPropertyKey(record) {
  const tcad = text(record.tcad_id);
  if (tcad) return `austin-tcad-${tcad}`;
  return `austin-address-${text(record.original_address1).toUpperCase().replace(/[^A-Z0-9]+/g, "-")}-${zip(record.original_zip) || "unknown"}`;
}

export function normalizeAustinRecord(record, territoryId, now = new Date()) {
  const classification = classifyAustinRecord(record);
  const eventDate = date(record.issue_date);
  const propertyZip = zip(record.original_zip);
  const city = text(record.original_city).toUpperCase() || "AUSTIN";
  const address = text(record.original_address1) || text(record.permit_location);
  const propertyType = text(record.permit_class_mapped).toUpperCase() || null;
  const sourceRecordId = text(record.permit_number) || text(record.project_id);
  const propertyKey = normalizedPropertyKey(record);
  const scoreResult = scoreNormalizedEvidence({ eventType: classification.eventType, eventDate, propertyType }, now);
  const { score, opportunityStrength: strength } = scoreResult;
  const years = classification.isEligible ? scoreResult.yearsSinceEvent : null;
  const reasons = [classification.reason];
  if (eventDate && classification.isEligible) reasons.push(`${years ?? 0} years since Austin source event (inference from permit date)`);
  if (propertyType === "RESIDENTIAL") reasons.push("Residential permit classification (verified source field)");
  if (record.total_existing_bldg_sqft && classification.isEligible) reasons.push(`Existing building area ${Number(record.total_existing_bldg_sqft).toLocaleString()} sq ft (source context)`);

  return {
    event: {
      territory_id: territoryId,
      jurisdiction_key: text(record.jurisdiction).toLowerCase().replace(/[^a-z0-9]+/g, "_") || "city_of_austin",
      source_system: "austin_socrata_issued_construction_permits",
      source_record_id: sourceRecordId,
      event_date: eventDate,
      normalized_event_type: classification.eventType,
      evidence_confidence: classification.evidenceConfidence,
      source_confidence: classification.sourceConfidence,
      property_address: address || null,
      property_city: city || null,
      property_state: text(record.original_state).toUpperCase() || "TX",
      property_zip: propertyZip,
      parcel_id: text(record.tcad_id) || null,
      square_footage: number(record.total_existing_bldg_sqft),
      raw_description: text(record.description) || null,
      source_payload: {
        permit_type: text(record.permit_type_desc) || null,
        permit_class: text(record.permit_class) || null,
        work_class: text(record.work_class) || null,
        status_current: text(record.status_current) || null,
        project_id: text(record.project_id) || null,
        master_permit_num: text(record.masterpermitnum) || null,
        latitude: number(record.latitude),
        longitude: number(record.longitude),
        tcad_id: text(record.tcad_id) || null,
      },
    },
    opportunity: {
      parcel_id: propertyKey,
      address: address || "Address unavailable",
      city,
      property_city: city,
      property_zip: propertyZip,
      property_type: propertyType,
      score,
      opportunity_strength: strength,
      evidence_confidence: classification.sourceConfidence === "HIGH" ? "HIGH" : classification.sourceConfidence === "MEDIUM" ? "MEDIUM" : "LOW",
      year_built: null,
      permit_category: classification.isEligible ? classification.eventType.replaceAll("_", " ") : "OTHER MECHANICAL",
      latest_permit_date: eventDate,
      latest_permit_type: text(record.permit_type_desc) || null,
      latest_permit_description: text(record.description) || null,
      last_known_hvac_event_year: classification.isEligible && eventDate ? Number(eventDate.slice(0, 4)) : null,
      estimated_years_since_last_known_hvac_event: years,
      source_evidence: { source: "City of Austin Issued Construction Permits", source_system: "austin_socrata_issued_construction_permits", jurisdiction: text(record.jurisdiction) || null, source_record_id: sourceRecordId, classification_reason: classification.reason, coverage_state: "SUPPORTED" },
      reasons,
      coverage_state: "SUPPORTED",
      territory_id: territoryId,
      jurisdiction_key: text(record.jurisdiction).toLowerCase().replace(/[^a-z0-9]+/g, "_") || "city_of_austin",
      source_system: "austin_socrata_issued_construction_permits",
      source_property_id: propertyKey,
      same_street_hvac_since_2021: 0,
      peers_with_newer_hvac_event: 0,
    },
    classification,
  };
}

export const AUSTIN_PILOT = Object.freeze({
  sourceSystem: "austin_socrata_issued_construction_permits",
  territoryKey: "austin_city_full_limited",
  dataSourceKey: "austin_socrata_3syk_w9eu",
  adapterKey: "austin_v1",
  startDate: "2025-01-01T00:00:00",
  endDate: "2025-12-31T23:59:59",
  jurisdictions: ["AUSTIN FULL PURPOSE", "AUSTIN LTD"],
});
