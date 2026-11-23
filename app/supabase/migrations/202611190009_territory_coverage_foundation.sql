-- Multi-territory foundation. Additive only; existing Dallas data remains intact.

create table if not exists public.coverage_territories (
  id uuid primary key default gen_random_uuid(),
  territory_key text not null unique,
  display_name text not null,
  state_code text not null default 'TX',
  timezone text not null default 'America/Chicago',
  status text not null default 'UNKNOWN'
    check (status in ('ACTIVE', 'REVIEW_REQUIRED', 'INACTIVE', 'UNKNOWN')),
  data_source_key text,
  adapter_key text,
  coverage_quality text not null default 'UNKNOWN'
    check (coverage_quality in ('VERIFIED', 'PARTIAL', 'UNKNOWN')),
  last_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.territory_zip_coverage (
  territory_id uuid not null references public.coverage_territories(id) on delete cascade,
  zip_code text not null check (zip_code ~ '^[0-9]{5}$'),
  status text not null default 'UNKNOWN'
    check (status in ('ACTIVE', 'REVIEW_REQUIRED', 'INACTIVE', 'UNKNOWN')),
  jurisdiction_key text,
  data_source_key text,
  coverage_quality text not null default 'UNKNOWN'
    check (coverage_quality in ('VERIFIED', 'PARTIAL', 'UNKNOWN')),
  last_updated_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (territory_id, zip_code)
);

create index if not exists territory_zip_coverage_zip_idx
  on public.territory_zip_coverage(zip_code, status);

create table if not exists public.territory_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  requested_zip_codes text[] not null check (cardinality(requested_zip_codes) > 0),
  contact_email text,
  context text,
  status text not null default 'REVIEW_REQUIRED'
    check (status in ('REVIEW_REQUIRED', 'IN_REVIEW', 'ACTIVATED', 'DECLINED')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists territory_requests_status_requested_idx
  on public.territory_requests(status, requested_at desc);

alter table public.opportunities
  add column if not exists territory_id uuid references public.coverage_territories(id),
  add column if not exists jurisdiction_key text,
  add column if not exists source_system text,
  add column if not exists source_property_id text;

create index if not exists opportunities_territory_idx
  on public.opportunities(territory_id);

create unique index if not exists opportunities_source_identity_idx
  on public.opportunities(source_system, source_property_id)
  where source_system is not null and source_property_id is not null;

alter table public.coverage_territories enable row level security;
alter table public.territory_zip_coverage enable row level security;
alter table public.territory_requests enable row level security;

revoke all on public.coverage_territories from anon, authenticated;
revoke all on public.territory_zip_coverage from anon, authenticated;
revoke all on public.territory_requests from anon, authenticated;
grant all on public.coverage_territories to service_role;
grant all on public.territory_zip_coverage to service_role;
grant all on public.territory_requests to service_role;

alter table public.workspaces
  drop constraint if exists workspaces_weekly_target_size_check;

-- Transitional bound: the next migration backfills legacy 25-home settings
-- before tightening the constraint to the supported 50/100/250 choices.
alter table public.workspaces
  add constraint workspaces_weekly_target_size_check
  check (weekly_target_size > 0 and weekly_target_size <= 250);

comment on table public.coverage_territories is
  'Internal territory/source coverage registry. Not customer-facing.';
comment on table public.territory_zip_coverage is
  'Internal ZIP-to-territory coverage mapping. A ZIP may map to multiple territories.';
comment on table public.territory_requests is
  'Customer demand for territory review; does not promise activation.';
