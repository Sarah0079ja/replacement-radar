-- Add enrichment columns missing from the opportunities table.
--
-- These fields are produced by enrich_dcad.py → export_app_fixture.py and exist
-- in app/app/data/properties.json, but were never added to the Supabase schema.
-- The seed script was also not populating them.
--
-- Without these columns the app shows "Not available" for owner, mailing address,
-- living area, and occupancy on every property — regardless of which property is
-- selected — because select("*") returns rows with no enrichment fields at all.

alter table public.opportunities
  add column if not exists owner_name               text,
  add column if not exists owner_mailing_address    text,
  add column if not exists living_area_sqft         integer,
  add column if not exists owner_occupancy          text
    check (owner_occupancy in ('LIKELY_OWNER_OCCUPIED', 'LIKELY_ABSENTEE')),
  add column if not exists same_street_hvac_since_2021  integer not null default 0,
  add column if not exists peers_with_newer_hvac_event  integer not null default 0;
