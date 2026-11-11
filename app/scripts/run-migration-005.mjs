/**
 * run-migration-005.mjs
 *
 * Prints the SQL for migration 202611020005 and the URL of the Supabase SQL editor
 * so you can apply it with one copy-paste.
 *
 * Usage:
 *   node --env-file=.env.seed.local scripts/run-migration-005.mjs
 *   node --env-file=.env.local      scripts/run-migration-005.mjs
 *
 * After applying the migration, re-seed with:
 *   node --env-file=.env.seed.local scripts/seed-opportunities.mjs
 */

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url) throw new Error("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL required");
const ref = new URL(url).hostname.split(".")[0];

const sql = `-- Migration 202611020005: add enrichment columns to opportunities
alter table public.opportunities
  add column if not exists owner_name               text,
  add column if not exists owner_mailing_address    text,
  add column if not exists living_area_sqft         integer,
  add column if not exists owner_occupancy          text
    check (owner_occupancy in ('LIKELY_OWNER_OCCUPIED', 'LIKELY_ABSENTEE')),
  add column if not exists same_street_hvac_since_2021  integer not null default 0,
  add column if not exists peers_with_newer_hvac_event  integer not null default 0;`;

console.log("=== Migration 202611020005 ===");
console.log();
console.log("1. Open the Supabase SQL editor:");
console.log(`   https://supabase.com/dashboard/project/${ref}/sql/new`);
console.log();
console.log("2. Paste and run this SQL:");
console.log();
console.log(sql);
console.log();
console.log("3. After the migration succeeds, re-seed the database:");
console.log("   node --env-file=.env.seed.local scripts/seed-opportunities.mjs");
