import { createClient } from "@supabase/supabase-js";
import { AUSTIN_PILOT, normalizeAustinRecord } from "../lib/territories/austin.mjs";

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const SOURCE_URL = "https://data.austintexas.gov/resource/3syk-w9eu.json";
const SOURCE_SYSTEM = AUSTIN_PILOT.sourceSystem;
const PAGE_SIZE = 5000;
const OVERLAP_DAYS = 14;
const APPROVED_ACTIVE_ZIPS = new Set([
  "78701", "78702", "78703", "78704", "78705", "78722", "78731",
  "78741", "78751", "78752", "78756", "78757", "78758",
]);

const isIncremental = process.argv.includes("--incremental");
const explicitStart = process.argv.find((arg) => arg.startsWith("--start="))?.split("=")[1];
const explicitEnd = process.argv.find((arg) => arg.startsWith("--end="))?.split("=")[1];

function iso(value) {
  const result = new Date(value);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
}

function subtractDays(value, days) {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() - days);
  return result.toISOString();
}

function socrataDate(value) {
  return value.slice(0, 19);
}

function log(message, details = {}) {
  console.log(JSON.stringify({ operation: "austin_ingestion", message, ...details }));
}

function socrataUrl(startDate, endDate, incremental) {
  const params = new URLSearchParams({
    $select: "permittype,permit_type_desc,permit_number,permit_class_mapped,permit_class,work_class,condominium,permit_location,description,tcad_id,issue_date,statusdate,status_current,total_existing_bldg_sqft,original_address1,original_city,original_state,original_zip,jurisdiction,project_id,masterpermitnum,latitude,longitude,contractor_trade",
    $where: `${incremental ? "statusdate" : "issue_date"} between '${socrataDate(startDate)}' and '${socrataDate(endDate)}' and permit_class_mapped = 'Residential' and jurisdiction in ('AUSTIN FULL PURPOSE','AUSTIN LTD')`,
    $order: "statusdate asc, permit_number asc",
    $limit: String(PAGE_SIZE),
  });
  return `${SOURCE_URL}?${params}`;
}

async function fetchPage(url, attempt = 0) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (response.ok) return response.json();
  if (attempt < 3 && (response.status === 429 || response.status >= 500)) {
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    return fetchPage(url, attempt + 1);
  }
  throw new Error(`Austin Socrata request failed with status ${response.status}`);
}

async function fetchAll(startDate, endDate, incremental) {
  const all = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await fetchPage(`${socrataUrl(startDate, endDate, incremental)}&$offset=${offset}`);
    all.push(...page);
    log("source_page", { offset, records: page.length });
    if (page.length < PAGE_SIZE) return all;
  }
}

async function upsertRows(table, rows, conflict) {
  const chunkSize = table === "opportunity_evidence_events" ? 100 : 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    let batch = rows.slice(i, i + chunkSize);
    let lastError;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const { error } = await supabase.from(table).upsert(batch, { onConflict: conflict });
      if (!error) {
        lastError = null;
        break;
      }
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
    if (lastError) {
      const code = typeof lastError.code === "string" ? lastError.code : "unknown";
      const message = typeof lastError.message === "string" ? lastError.message.slice(0, 180) : "database write failed";
      throw new Error(`${table} upsert failed: code=${code}; message=${message}; batch_start=${i}`);
    }
  }
}

async function getTerritory() {
  const { data, error } = await supabase
    .from("coverage_territories")
    .select("id,territory_key,status")
    .eq("territory_key", AUSTIN_PILOT.territoryKey)
    .maybeSingle();
  if (error) throw new Error("Austin territory lookup failed");
  if (data) return data;

  const { data: created, error: createError } = await supabase
    .from("coverage_territories")
    .insert({
      territory_key: AUSTIN_PILOT.territoryKey,
      display_name: "Austin city jurisdiction",
      state_code: "TX",
      timezone: "America/Chicago",
      status: "REVIEW_REQUIRED",
      data_source_key: AUSTIN_PILOT.dataSourceKey,
      adapter_key: AUSTIN_PILOT.adapterKey,
      coverage_quality: "PARTIAL",
      last_updated_at: new Date().toISOString(),
    })
    .select("id,territory_key,status")
    .single();
  if (createError) throw new Error("Austin territory creation failed");
  return created;
}

async function getCheckpoint(territoryId) {
  const { data, error } = await supabase
    .from("territory_ingestion_checkpoints")
    .select("*")
    .eq("source_system", SOURCE_SYSTEM)
    .maybeSingle();
  if (error) throw new Error("Austin checkpoint lookup failed");
  if (data) return data;

  const { data: created, error: createError } = await supabase
    .from("territory_ingestion_checkpoints")
    .insert({ source_system: SOURCE_SYSTEM, territory_id: territoryId, overlap_days: OVERLAP_DAYS })
    .select("*")
    .single();
  if (createError) throw new Error("Austin checkpoint creation failed");
  return created;
}

async function markCheckpoint(values) {
  const { error } = await supabase
    .from("territory_ingestion_checkpoints")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("source_system", SOURCE_SYSTEM);
  if (error) throw new Error("Austin checkpoint update failed");
}

function latestCursor(rows) {
  return rows
    .map((record) => ({ date: iso(record.statusdate || record.issue_date), id: String(record.permit_number || record.project_id || "") }))
    .filter((cursor) => cursor.date)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .at(-1) || { date: null, id: null };
}

const startedAt = new Date().toISOString();
let checkpoint;
try {
  const territory = await getTerritory();
  checkpoint = await getCheckpoint(territory.id);

  const endDate = explicitEnd ? iso(explicitEnd) : new Date().toISOString();
  if (!endDate) throw new Error("Invalid end date");
  let startDate = explicitStart ? iso(explicitStart) : "2018-01-01T00:00:00.000Z";
  if (!startDate) throw new Error("Invalid start date");
  if (isIncremental && checkpoint.cursor_status_date) startDate = subtractDays(checkpoint.cursor_status_date, checkpoint.overlap_days || OVERLAP_DAYS);
  const boundedBackfill = !isIncremental && (explicitStart || explicitEnd);

  await markCheckpoint({ last_run_started_at: startedAt, last_run_status: "RUNNING", last_error: null });
  log("started", { mode: isIncremental ? "incremental" : "backfill", startDate, endDate, overlapDays: checkpoint.overlap_days || OVERLAP_DAYS });

  const sourceRows = await fetchAll(startDate, endDate, isIncremental);
  const normalized = sourceRows.map((record) => normalizeAustinRecord(record, territory.id));
  const eligible = normalized.filter((row) => row.classification.isEligible);
  const opportunityByKey = new Map();
  for (const row of eligible) {
    const existing = opportunityByKey.get(row.opportunity.parcel_id);
    if (!existing || (row.event.event_date || "") > (existing.event.event_date || "")) opportunityByKey.set(row.opportunity.parcel_id, row);
  }
  const opportunities = [...opportunityByKey.values()].map((row) => row.opportunity);
  await upsertRows("opportunities", opportunities, "parcel_id");

  const savedOpportunities = [];
  for (let i = 0; i < opportunities.length; i += 500) {
    const { data, error } = await supabase.from("opportunities").select("id,parcel_id").in("parcel_id", opportunities.slice(i, i + 500).map((row) => row.parcel_id));
    if (error) throw new Error("Austin opportunity lookup failed");
    savedOpportunities.push(...(data || []));
  }
  const opportunityIds = new Map(savedOpportunities.map((row) => [row.parcel_id, row.id]));
  const events = eligible.map((row) => ({ ...row.event, opportunity_id: opportunityIds.get(row.opportunity.parcel_id) })).filter((row) => row.opportunity_id);
  await upsertRows("opportunity_evidence_events", events, "source_system,source_record_id");

  const observedZips = [...new Set(eligible.map((row) => row.event.property_zip).filter(Boolean))];
  const zipRows = observedZips.map((zip) => ({
    territory_id: territory.id,
    zip_code: zip,
    status: APPROVED_ACTIVE_ZIPS.has(zip) ? "ACTIVE" : "REVIEW_REQUIRED",
    jurisdiction_key: "austin_full_or_limited_purpose",
    data_source_key: AUSTIN_PILOT.dataSourceKey,
    coverage_quality: APPROVED_ACTIVE_ZIPS.has(zip) ? "VERIFIED" : "PARTIAL",
    last_updated_at: new Date().toISOString(),
  }));
  await upsertRows("territory_zip_coverage", zipRows, "territory_id,zip_code");

  const classifications = {};
  for (const row of normalized) classifications[row.classification.eventType] = (classifications[row.classification.eventType] || 0) + 1;
  const cursor = latestCursor(sourceRows);
  await markCheckpoint({
    cursor_status_date: boundedBackfill ? checkpoint.cursor_status_date : cursor.date,
    cursor_source_record_id: boundedBackfill ? checkpoint.cursor_source_record_id : cursor.id,
    last_run_completed_at: new Date().toISOString(),
    last_run_status: "SUCCEEDED",
    last_run_source_records: sourceRows.length,
    last_run_accepted_events: events.length,
    last_run_unique_properties: opportunities.length,
    last_run_classifications: classifications,
    last_error: null,
  });
  log("completed", { sourceRecords: sourceRows.length, acceptedEvents: events.length, uniqueProperties: opportunities.length, classifications, observedZips: observedZips.length, cursor });
} catch (error) {
  if (checkpoint) await markCheckpoint({ last_run_status: "FAILED", last_error: error instanceof Error ? error.message : "Austin ingestion failed" }).catch(() => {});
  log("failed", { reason: error instanceof Error ? error.message : "Austin ingestion failed" });
  process.exitCode = 1;
}
