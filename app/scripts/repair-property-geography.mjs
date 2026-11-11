/**
 * M6-0 live repair. Run only after migration 202611030007 is applied.
 *
 * Usage from app/:
 *   node --env-file=.env.seed.local scripts/repair-property-geography.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const repairPath = path.join(process.cwd(), "..", "data-spike", "derived", "property_geography_repair.json");
const repairs = JSON.parse(fs.readFileSync(repairPath, "utf8"));

if (repairs.length !== 307) {
  throw new Error(`Expected 307 geography repair rows, found ${repairs.length}`);
}
if (repairs.some((row) => !row.property_zip || !/^\d{5}$/.test(row.property_zip))) {
  throw new Error("Every repair row must have a verified five-digit property_zip");
}
if (repairs.some((row) => row.property_city !== "DALLAS")) {
  throw new Error("Every repair row must have canonical City of Dallas property_city");
}

for (const row of repairs) {
  const { error } = await client
    .from("opportunities")
    .update({
      city: row.property_city,
      property_city: row.property_city,
      owner_mailing_city: row.owner_mailing_city || null,
      property_zip: row.property_zip,
      owner_mailing_zip: row.owner_mailing_zip || null,
    })
    .eq("parcel_id", row.parcel_id);
  if (error) throw new Error(`${row.parcel_id}: ${error.message}`);
}

const { data, error } = await client
  .from("opportunities")
  .select("parcel_id,city,property_city,owner_mailing_city,property_zip,owner_mailing_zip")
  .order("parcel_id", { ascending: true });
if (error) throw error;
if (data.length !== 307) throw new Error(`Verification found ${data.length} opportunities, expected 307`);
if (data.some((row) => !row.property_zip || !/^\d{5}$/.test(row.property_zip))) {
  throw new Error("Verification found a missing or malformed property_zip");
}
if (data.some((row) => row.property_city !== "DALLAS" || row.city !== "DALLAS")) {
  throw new Error("Verification found a non-Dallas property city");
}

console.log(`Repaired and verified ${data.length} opportunity geography rows, including property city`);
