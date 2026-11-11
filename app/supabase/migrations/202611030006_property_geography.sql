-- Migration 202611030006: establish separate property and owner-mailing geography
-- M6-0 only. Apply in Supabase SQL Editor before running the geography repair script.

alter table public.opportunities
  add column if not exists property_zip text,
  add column if not exists owner_mailing_zip text;

comment on column public.opportunities.property_zip is
  'Canonical physical property/site ZIP. Source: matched Dallas site-address permit zip_code or City of Dallas parcel geometry intersected with a public ZIP polygon. Never from DCAD PSTLZIP5.';

comment on column public.opportunities.owner_mailing_zip is
  'Owner mailing ZIP from DCAD PSTLZIP5. Preserved for future mailing workflows only; never used for property geography.';

comment on column public.opportunities.zip is
  'DEPRECATED: use property_zip. Retained for backward compatibility during M6-0 migration.';

create index if not exists opportunities_property_zip_idx
  on public.opportunities(property_zip);
