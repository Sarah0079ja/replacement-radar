-- Backfill the existing Dallas territory and migrate legacy weekly settings.
-- No opportunity, cohort, activity, note, or workspace rows are deleted.

insert into public.coverage_territories (
  territory_key, display_name, state_code, timezone, status,
  data_source_key, adapter_key, coverage_quality, last_updated_at
)
values (
  'dallas', 'Dallas', 'TX', 'America/Chicago', 'ACTIVE',
  'dallas_opendata_dcad', 'dallas_v1', 'VERIFIED', now()
)
on conflict (territory_key) do update set
  display_name = excluded.display_name,
  state_code = excluded.state_code,
  timezone = excluded.timezone,
  status = excluded.status,
  data_source_key = excluded.data_source_key,
  adapter_key = excluded.adapter_key,
  coverage_quality = excluded.coverage_quality,
  last_updated_at = excluded.last_updated_at;

insert into public.territory_zip_coverage (
  territory_id, zip_code, status, jurisdiction_key,
  data_source_key, coverage_quality, last_updated_at
)
select t.id, z.zip_code, 'ACTIVE', 'city_of_dallas',
  'dallas_opendata_dcad', 'VERIFIED', now()
from public.coverage_territories t
cross join (values ('75224'), ('75248'), ('75252'), ('75254')) as z(zip_code)
where t.territory_key = 'dallas'
on conflict (territory_id, zip_code) do update set
  status = excluded.status,
  jurisdiction_key = excluded.jurisdiction_key,
  data_source_key = excluded.data_source_key,
  coverage_quality = excluded.coverage_quality,
  last_updated_at = excluded.last_updated_at;

update public.opportunities o
set territory_id = t.id,
    jurisdiction_key = coalesce(o.jurisdiction_key, 'city_of_dallas'),
    source_system = coalesce(o.source_system, 'dallas_opendata_dcad'),
    source_property_id = coalesce(o.source_property_id, o.parcel_id)
from public.coverage_territories t
where t.territory_key = 'dallas'
  and o.territory_id is null;

update public.workspaces
set weekly_target_size = 50
where weekly_target_size = 25;

alter table public.workspaces
  alter column weekly_target_size set default 50;

alter table public.workspaces
  drop constraint if exists workspaces_weekly_target_size_check;

alter table public.workspaces
  add constraint workspaces_weekly_target_size_check
  check (weekly_target_size in (50, 100, 250));
