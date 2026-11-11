-- Migration 202611030007: establish separate property and owner-mailing cities
-- M6-0 only. Apply after 202611030006_property_geography.sql.

alter table public.opportunities
  add column if not exists property_city text,
  add column if not exists owner_mailing_city text;

comment on column public.opportunities.property_city is
  'Canonical physical property/site city. Source: City of Dallas parcel layer CITY. Never from DCAD PSTLCITY.';

comment on column public.opportunities.owner_mailing_city is
  'Owner mailing city from DCAD PSTLCITY. Preserved for future mailing workflows only; never used for property geography.';

comment on column public.opportunities.city is
  'DEPRECATED: compatibility alias for property_city. Do not populate from DCAD PSTLCITY.';
