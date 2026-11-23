-- Austin production activation and source-ingestion checkpointing.
-- Additive only: preserves existing opportunities, evidence, workspaces and coverage history.

create table if not exists public.territory_ingestion_checkpoints (
  source_system text primary key,
  territory_id uuid not null references public.coverage_territories(id),
  cursor_status_date timestamptz,
  cursor_source_record_id text,
  overlap_days integer not null default 14 check (overlap_days between 1 and 90),
  last_run_started_at timestamptz,
  last_run_completed_at timestamptz,
  last_run_status text not null default 'NEVER_RUN'
    check (last_run_status in ('NEVER_RUN', 'RUNNING', 'SUCCEEDED', 'FAILED')),
  last_run_source_records integer not null default 0,
  last_run_accepted_events integer not null default 0,
  last_run_unique_properties integer not null default 0,
  last_run_classifications jsonb not null default '{}'::jsonb,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.territory_ingestion_checkpoints enable row level security;
revoke all on public.territory_ingestion_checkpoints from anon, authenticated;
grant all on public.territory_ingestion_checkpoints to service_role;

comment on table public.territory_ingestion_checkpoints is
  'Trusted server-side source cursors and sanitized run summaries for territory ingestion.';

update public.coverage_territories
set last_updated_at = now(), coverage_quality = 'PARTIAL'
where territory_key = 'austin_city_full_limited';

update public.territory_zip_coverage
set status = case when zip_code in (
  '78701','78702','78703','78704','78705','78722','78731',
  '78741','78751','78752','78756','78757','78758'
) then 'ACTIVE' else 'REVIEW_REQUIRED' end,
coverage_quality = case when zip_code in (
  '78701','78702','78703','78704','78705','78722','78731',
  '78741','78751','78752','78756','78757','78758'
) then 'VERIFIED' else 'PARTIAL' end,
last_updated_at = now()
where territory_id = (select id from public.coverage_territories where territory_key = 'austin_city_full_limited');

insert into public.territory_ingestion_checkpoints (source_system, territory_id, overlap_days)
select 'austin_socrata_issued_construction_permits', id, 14
from public.coverage_territories
where territory_key = 'austin_city_full_limited'
on conflict (source_system) do nothing;
