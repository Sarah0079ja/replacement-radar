import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const source = path.join(process.cwd(), "app", "data", "properties.json");
const rows = JSON.parse(fs.readFileSync(source, "utf8")).map((row) => ({
  parcel_id: row.parcel_id,
  address: row.address,
  // city is retained as a compatibility alias; property_city is canonical.
  city: row.property_city || row.city || "DALLAS",
  property_city: row.property_city || row.city || "DALLAS",
  owner_mailing_city: row.owner_mailing_city || null,
  // property_zip is the canonical site geography. The deprecated zip alias
  // is intentionally not used for seeding.
  property_zip: row.property_zip || null,
  owner_mailing_zip: row.owner_mailing_zip || null,
  property_type: row.property_type || null,
  score: row.score,
  opportunity_strength: row.opportunity_strength,
  evidence_confidence: row.evidence_confidence,
  year_built: row.year_built || null,
  permit_category: row.permit_category,
  latest_permit_date: row.latest_permit_date || null,
  latest_permit_type: row.latest_permit_type || null,
  latest_permit_description: row.latest_permit_description || null,
  last_known_hvac_event_year: row.last_known_hvac_event_year || null,
  estimated_years_since_last_known_hvac_event: row.estimated_years_since_last_known_hvac_event || null,
  owner_name: row.owner_name || null,
  owner_mailing_address: row.owner_mailing_address || null,
  living_area_sqft: row.living_area_sqft || null,
  owner_occupancy: row.owner_occupancy || null,
  same_street_hvac_since_2021: row.same_street_hvac_since_2021 ?? 0,
  peers_with_newer_hvac_event: row.peers_with_newer_hvac_event ?? 0,
  source_evidence: { source: "Dallas OpenData + DCAD", coverage_state: row.coverage_state },
  reasons: row.reasons,
  coverage_state: row.coverage_state,
}));
const { error } = await client.from("opportunities").upsert(rows, { onConflict: "parcel_id" });
if (error) throw error;
console.log(`Seeded ${rows.length} opportunities`);
