import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { DALLAS_PILOT, normalizeDallasAddress, normalizeDallasRecord, parseDallasDate } from "../lib/territories/dallas.mjs";

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const SOURCE_SYSTEM = DALLAS_PILOT.sourceSystem;
const PAGE_SIZE = 5000;
const OVERLAP_DAYS = 14;
const LOCK_TIMEOUT_MS = Number(process.env.DALLAS_INGESTION_LOCK_TIMEOUT_MS) > 0 ? Number(process.env.DALLAS_INGESTION_LOCK_TIMEOUT_MS) : 30 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = Number(process.env.DALLAS_INGESTION_HEARTBEAT_INTERVAL_MS) > 0 ? Number(process.env.DALLAS_INGESTION_HEARTBEAT_INTERVAL_MS) : 5 * 60 * 1000;
const RUN_ID = randomUUID();
const isIncremental = process.argv.includes("--incremental");
const isDryRun = process.argv.includes("--dry-run");
const explicitStart = process.argv.find((arg) => arg.startsWith("--start="))?.split("=")[1];
const explicitEnd = process.argv.find((arg) => arg.startsWith("--end="))?.split("=")[1];

function log(message, details = {}) { console.log(JSON.stringify({ operation: "dallas_ingestion", message, ...details })); }
function iso(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
function subtractDays(value, days) { const d = new Date(value); d.setUTCDate(d.getUTCDate() - days); return d.toISOString(); }
function sourceDate(value) { const date = parseDallasDate(value); return date ? `${date}T00:00:00.000Z` : null; }
function zip(value) { const result = String(value ?? "").trim().replace(/\.0$/, "").padStart(5, "0"); return /^\d{5}$/.test(result) ? result : ""; }

async function fetchPage(url, attempt = 0) {
  const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "ResponseHVAC Dallas ingestion/1.0" } });
  if (response.ok) return response.json();
  if (attempt < 3 && (response.status === 429 || response.status >= 500)) { await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1))); return fetchPage(url, attempt + 1); }
  throw new Error(`Dallas OpenData request failed with status ${response.status}`);
}

function sourceUrl() {
  // issued_date is published as MM/DD/YY text, so date bounds are applied
  // after parsing rather than through lexicographic Socrata comparisons.
  const where = "(permit_type like '%Mechanical%' OR permit_type like '%mechanical%') AND zip_code in ('75224','75248','75252','75254')";
  const params = new URLSearchParams({ $select: "permit_number,permit_type,issued_date,work_description,street_address,zip_code,land_use,value", $where: where, $order: "issued_date asc, permit_number asc", $limit: String(PAGE_SIZE) });
  return `${DALLAS_PILOT.sourceUrl}?${params}`;
}
async function fetchAll() {
  const all = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await fetchPage(`${sourceUrl()}&$offset=${offset}`);
    all.push(...page); log("source_page", { offset, records: page.length });
    if (page.length < PAGE_SIZE) return all;
  }
}

async function getTerritory() {
  const { data, error } = await supabase.from("coverage_territories").select("id,territory_key,status").eq("territory_key", "dallas").single();
  if (error || !data) throw new Error("Dallas territory lookup failed");
  return data;
}
async function getCheckpoint(territoryId) {
  const { data, error } = await supabase.from("territory_ingestion_checkpoints").select("*").eq("source_system", SOURCE_SYSTEM).maybeSingle();
  if (error) throw new Error("Dallas checkpoint lookup failed");
  if (data) return data;
  if (isDryRun) return { source_system: SOURCE_SYSTEM, territory_id: territoryId, overlap_days: OVERLAP_DAYS, last_run_status: "NEVER_RUN" };
  const { data: created, error: createError } = await supabase.from("territory_ingestion_checkpoints").insert({ source_system: SOURCE_SYSTEM, territory_id: territoryId, overlap_days: OVERLAP_DAYS }).select("*").single();
  if (createError) throw new Error("Dallas checkpoint creation failed");
  return created;
}
async function updateCheckpoint(values, requireLease = false) {
  if (isDryRun) return;
  let query = supabase.from("territory_ingestion_checkpoints").update({ ...values, updated_at: new Date().toISOString() }).eq("source_system", SOURCE_SYSTEM);
  if (requireLease) query = query.eq("lease_id", RUN_ID);
  const { data, error } = await query.select("source_system").maybeSingle();
  if (error || (requireLease && !data)) throw new Error("Dallas checkpoint update failed or lease was lost");
}
async function claimCheckpoint(checkpoint) {
  if (isDryRun) return true;
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("territory_ingestion_checkpoints").update({ last_run_started_at: now, lease_id: RUN_ID, lease_heartbeat_at: now, last_run_status: "RUNNING", last_error: null, updated_at: now }).eq("source_system", SOURCE_SYSTEM).in("last_run_status", ["NEVER_RUN", "SUCCEEDED", "FAILED"]).select("source_system").maybeSingle();
  if (error) throw new Error("Dallas checkpoint claim failed");
  if (data) return true;
  const leaseTime = checkpoint.lease_heartbeat_at || checkpoint.last_run_started_at;
  const leaseAge = leaseTime ? Date.now() - new Date(leaseTime).getTime() : Number.POSITIVE_INFINITY;
  if (checkpoint.last_run_status !== "RUNNING" || leaseAge < LOCK_TIMEOUT_MS) return false;
  const reclaim = await supabase.from("territory_ingestion_checkpoints").update({ last_run_started_at: now, lease_id: RUN_ID, lease_heartbeat_at: now, last_run_status: "RUNNING", last_error: null, updated_at: now }).eq("source_system", SOURCE_SYSTEM).eq("last_run_status", "RUNNING").eq("last_run_started_at", checkpoint.last_run_started_at).eq("lease_id", checkpoint.lease_id).select("source_system").maybeSingle();
  if (reclaim.error) throw new Error("Dallas stale checkpoint reclaim failed");
  return Boolean(reclaim.data);
}
async function heartbeat() {
  if (isDryRun) return;
  const { data, error } = await supabase.from("territory_ingestion_checkpoints").update({ lease_heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("source_system", SOURCE_SYSTEM).eq("last_run_status", "RUNNING").eq("lease_id", RUN_ID).select("source_system").maybeSingle();
  if (error || !data) throw new Error("Dallas ingestion lease lost");
}
async function loadExisting() {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("opportunities").select("*").eq("source_system", SOURCE_SYSTEM).range(offset, offset + 999);
    if (error) throw new Error("Dallas opportunity lookup failed");
    rows.push(...(data || [])); if (!data || data.length < 1000) return rows;
  }
}
async function upsertRows(table, rows, conflict, chunkSize) {
  if (isDryRun || !rows.length) return;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const batch = rows.slice(i, i + chunkSize); let error;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      error = (await supabase.from(table).upsert(batch, { onConflict: conflict })).error;
      if (!error) break;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
    if (error) throw new Error(`${table} upsert failed: code=${error.code || "unknown"}; message=${String(error.message || "database write failed").slice(0, 180)}; batch_start=${i}`);
  }
}

let checkpoint; let claimed = false; let timer; let leaseLost;
try {
  const territory = await getTerritory(); checkpoint = await getCheckpoint(territory.id);
  if (isIncremental && !await claimCheckpoint(checkpoint)) throw new Error("Dallas ingestion already running");
  claimed = isIncremental;
  if (claimed) timer = setInterval(() => void heartbeat().catch((error) => { leaseLost = error; }), HEARTBEAT_INTERVAL_MS);
  const end = explicitEnd ? iso(explicitEnd) : new Date().toISOString(); if (!end) throw new Error("Invalid end date");
  let start = explicitStart ? iso(explicitStart) : "2018-01-01T00:00:00.000Z"; if (!start) throw new Error("Invalid start date");
  if (isIncremental && checkpoint.cursor_status_date) start = subtractDays(checkpoint.cursor_status_date, checkpoint.overlap_days || OVERLAP_DAYS);
  log("started", { mode: isIncremental ? "incremental" : "bounded", startDate: start.slice(0, 10), endDate: end.slice(0, 10), overlapDays: checkpoint.overlap_days || OVERLAP_DAYS, dryRun: isDryRun });
  const sourceRows = await fetchAll();
  if (leaseLost) throw leaseLost;
  // Dallas publishes issued_date but no reliable modified/status watermark.
  // Incremental runs therefore reconcile the small approved-ZIP slice in full;
  // bounded runs still honor their explicit date window for safe testing.
  const rowsInWindow = isIncremental
    ? sourceRows
    : sourceRows.filter((row) => { const date = sourceDate(row.issued_date); return date && date >= start && date <= end; });
  const existing = await loadExisting();
  const byAddress = new Map(existing.map((row) => [`${normalizeDallasAddress(row.address)}|${row.property_zip || ""}`, row]));
  const allNormalized = rowsInWindow.map((row) => normalizeDallasRecord(row, territory.id, byAddress.get(`${normalizeDallasAddress(row.street_address)}|${zip(row.zip_code)}`)));
  const classifications = {};
  for (const row of allNormalized) classifications[row.classification.eventType] = (classifications[row.classification.eventType] || 0) + 1;
  const normalized = allNormalized.filter((row) => row.classification.isEligible && row.event.source_record_id);
  const byProperty = new Map(); for (const row of normalized) { const previous = byProperty.get(row.opportunity.parcel_id); if (!previous || (row.event.event_date || "") > (previous.event.event_date || "")) byProperty.set(row.opportunity.parcel_id, row); }
  const opportunities = [...byProperty.values()].map((row) => row.opportunity);
  if (isIncremental) await heartbeat();
  await upsertRows("opportunities", opportunities, "parcel_id", 250);
  const saved = new Map();
  if (!isDryRun) for (const row of await loadExisting()) saved.set(row.parcel_id, row.id);
  else for (const row of opportunities) saved.set(row.parcel_id, `dry-run-${row.parcel_id}`);
  const events = normalized.map((row) => ({ ...row.event, opportunity_id: saved.get(row.opportunity.parcel_id) })).filter((row) => row.opportunity_id);
  if (isIncremental) await heartbeat(); await upsertRows("opportunity_evidence_events", events, "source_system,source_record_id", 100);
  const cursor = sourceRows.map((row) => ({ date: sourceDate(row.issued_date), id: String(row.permit_number || "") })).filter((value) => value.date).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).at(-1) || { date: null, id: null };
  if (isIncremental) await heartbeat();
  await updateCheckpoint({ cursor_status_date: cursor.date, cursor_source_record_id: cursor.id, last_run_completed_at: new Date().toISOString(), last_run_status: "SUCCEEDED", last_run_source_records: sourceRows.length, last_run_accepted_events: events.length, last_run_unique_properties: opportunities.length, last_run_classifications: classifications, last_error: null, lease_id: null, lease_heartbeat_at: null }, isIncremental);
  log("completed", { sourceRecords: sourceRows.length, acceptedEvents: events.length, uniqueProperties: opportunities.length, classifications, cursor });
} catch (error) {
  if (checkpoint && (claimed || !isIncremental)) await updateCheckpoint({ last_run_status: "FAILED", last_error: error instanceof Error ? error.message : "Dallas ingestion failed", lease_id: null, lease_heartbeat_at: null }, isIncremental).catch(() => {});
  log("failed", { reason: error instanceof Error ? error.message : "Dallas ingestion failed" }); process.exitCode = 1;
} finally { if (timer) clearInterval(timer); }
