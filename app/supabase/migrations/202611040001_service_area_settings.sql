-- M6-1: workspace service-area and weekly prospect-volume settings.
-- No cohort tables or opportunity rows are created or changed in this migration.

alter table public.workspaces
  add column if not exists service_zip_codes text[] not null default '{}',
  add column if not exists weekly_target_size integer not null default 25;

alter table public.workspaces
  drop constraint if exists workspaces_weekly_target_size_check;

alter table public.workspaces
  add constraint workspaces_weekly_target_size_check
  check (weekly_target_size > 0);

create or replace function public.validate_workspace_service_zips()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from unnest(coalesce(new.service_zip_codes, '{}'::text[])) as selected_zip
    where selected_zip is null
       or selected_zip = ''
       or not exists (
         select 1
         from public.opportunities o
         where o.property_zip = selected_zip
       )
  ) then
    raise exception 'service_zip_codes must contain only supported property ZIP codes';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_workspace_service_zips on public.workspaces;
create trigger validate_workspace_service_zips
before insert or update of service_zip_codes on public.workspaces
for each row execute procedure public.validate_workspace_service_zips();

comment on column public.workspaces.service_zip_codes is
  'Contractor-selected service territory using canonical opportunities.property_zip values only.';

comment on column public.workspaces.weekly_target_size is
  'Preferred number of new prospects for a future weekly cohort. M6-1 exposes 25, 50, and 100.';

create index if not exists workspaces_service_zip_codes_gin_idx
  on public.workspaces using gin (service_zip_codes);

-- Existing workspace members may read and update only workspaces they belong to.
-- The existing RLS read policy remains in force; this policy adds settings writes
-- without changing opportunity or activity isolation.
drop policy if exists workspaces_member_update on public.workspaces;
create policy workspaces_member_update on public.workspaces
  for update
  using (public.is_workspace_member(id))
  with check (public.is_workspace_member(id));

grant update on public.workspaces to authenticated, service_role;
