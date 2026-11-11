-- M6-2: persisted weekly cohort generation.
-- Cohort generation is server-controlled through generate_current_week_cohort().

alter table public.workspaces
  drop constraint if exists workspaces_weekly_target_size_check;

alter table public.workspaces
  add constraint workspaces_weekly_target_size_check
  check (weekly_target_size > 0 and weekly_target_size <= 500);

create table if not exists public.weekly_cohorts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  week_start date not null,
  target_size integer not null check (target_size > 0),
  actual_size integer not null check (actual_size >= 0),
  pool_exhausted boolean not null default false,
  generated_at timestamptz not null default now(),
  unique (workspace_id, week_start)
);

create table if not exists public.weekly_cohort_members (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.weekly_cohorts(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  rank_position integer not null check (rank_position >= 1),
  added_at timestamptz not null default now(),
  unique (cohort_id, opportunity_id),
  unique (cohort_id, rank_position)
);

create index if not exists weekly_cohorts_workspace_week_idx
  on public.weekly_cohorts(workspace_id, week_start desc);

create index if not exists weekly_cohort_members_cohort_rank_idx
  on public.weekly_cohort_members(cohort_id, rank_position);

create index if not exists weekly_cohort_members_opportunity_cohort_idx
  on public.weekly_cohort_members(opportunity_id, cohort_id);

alter table public.weekly_cohorts enable row level security;
alter table public.weekly_cohort_members enable row level security;

drop policy if exists cohorts_member_read on public.weekly_cohorts;
create policy cohorts_member_read on public.weekly_cohorts
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists cohort_members_member_read on public.weekly_cohort_members;
create policy cohort_members_member_read on public.weekly_cohort_members
  for select using (
    exists (
      select 1
      from public.weekly_cohorts wc
      where wc.id = cohort_id
        and public.is_workspace_member(wc.workspace_id)
    )
  );

-- Make the client surface read-only. The SECURITY DEFINER RPC below is the
-- only authenticated generation path and runs with the function owner's rights.
revoke all on public.weekly_cohorts from anon, authenticated;
revoke all on public.weekly_cohort_members from anon, authenticated;
grant select on public.weekly_cohorts to authenticated;
grant select on public.weekly_cohort_members to authenticated;
grant all on public.weekly_cohorts to service_role;
grant all on public.weekly_cohort_members to service_role;

create or replace function public.generate_current_week_cohort()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_workspace uuid;
  current_week_start date;
  selected_zips text[];
  requested_target integer;
  cohort_uuid uuid;
  eligible_count integer;
  assigned_count integer;
  inserted_new_cohort boolean := false;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select m.workspace_id
    into caller_workspace
  from public.memberships m
  where m.user_id = auth.uid()
  order by m.created_at asc, m.workspace_id asc
  limit 1;

  if caller_workspace is null then
    raise exception 'NO_WORKSPACE';
  end if;

  -- Dallas MVP behavior. Make the market/workspace timezone configurable later.
  current_week_start := (
    (now() at time zone 'America/Chicago')::date
    - (extract(isodow from (now() at time zone 'America/Chicago'))::integer - 1)
  );

  select w.service_zip_codes, w.weekly_target_size
    into selected_zips, requested_target
  from public.workspaces w
  where w.id = caller_workspace;

  if coalesce(array_length(selected_zips, 1), 0) = 0 then
    return jsonb_build_object('cohort', null, 'members', '[]'::jsonb, 'reason', 'NO_SERVICE_AREA');
  end if;

  -- The unique key is the idempotency/concurrency guard. A losing request only
  -- reads the winner's already-committed cohort and never inserts members.
  insert into public.weekly_cohorts (workspace_id, week_start, target_size, actual_size, pool_exhausted)
  values (caller_workspace, current_week_start, requested_target, 0, false)
  on conflict (workspace_id, week_start) do nothing
  returning id into cohort_uuid;

  if cohort_uuid is not null then
    inserted_new_cohort := true;

    select count(*)::integer
      into eligible_count
    from public.opportunities o
    where o.property_zip = any(selected_zips)
      and o.coverage_state = 'SUPPORTED'
      and not exists (
        select 1
        from public.weekly_cohort_members old_member
        join public.weekly_cohorts old_cohort on old_cohort.id = old_member.cohort_id
        where old_cohort.workspace_id = caller_workspace
          and old_member.opportunity_id = o.id
      )
      and not exists (
        select 1
        from public.lead_activity activity
        where activity.workspace_id = caller_workspace
          and activity.opportunity_id = o.id
          and activity.status in ('CONTACTED', 'APPOINTMENT', 'WON', 'NOT INTERESTED')
      );

    assigned_count := least(eligible_count, requested_target);

    with eligible as (
      select o.id, o.score, o.evidence_confidence, o.opportunity_strength, o.year_built
      from public.opportunities o
      where o.property_zip = any(selected_zips)
        and o.coverage_state = 'SUPPORTED'
        and not exists (
          select 1
          from public.weekly_cohort_members old_member
          join public.weekly_cohorts old_cohort on old_cohort.id = old_member.cohort_id
          where old_cohort.workspace_id = caller_workspace
            and old_member.opportunity_id = o.id
        )
        and not exists (
          select 1
          from public.lead_activity activity
          where activity.workspace_id = caller_workspace
            and activity.opportunity_id = o.id
            and activity.status in ('CONTACTED', 'APPOINTMENT', 'WON', 'NOT INTERESTED')
        )
    ), ranked as (
      select eligible.id,
        row_number() over (
          order by eligible.score desc,
            case eligible.evidence_confidence
              when 'HIGH' then 1
              when 'MEDIUM' then 2
              when 'LOW' then 3
              else 4
            end,
            case eligible.opportunity_strength
              when 'STRONG' then 1
              when 'MEDIUM' then 2
              when 'WEAK' then 3
              else 4
            end,
            eligible.year_built asc nulls last,
            eligible.id asc
        )::integer as rank_position
      from eligible
    )
    insert into public.weekly_cohort_members (cohort_id, opportunity_id, rank_position)
    select cohort_uuid, ranked.id, ranked.rank_position
    from ranked
    where ranked.rank_position <= requested_target;

    update public.weekly_cohorts
    set actual_size = assigned_count,
        pool_exhausted = eligible_count < requested_target
    where id = cohort_uuid;
  else
    select c.id
      into cohort_uuid
    from public.weekly_cohorts c
    where c.workspace_id = caller_workspace
      and c.week_start = current_week_start;
  end if;

  return (
    select jsonb_build_object(
      'cohort', jsonb_build_object(
        'id', c.id,
        'workspace_id', c.workspace_id,
        'week_start', c.week_start,
        'target_size', c.target_size,
        'actual_size', c.actual_size,
        'pool_exhausted', c.pool_exhausted,
        'generated_at', c.generated_at
      ),
      'members', coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', member.id,
            'opportunity_id', member.opportunity_id,
            'rank_position', member.rank_position,
            'added_at', member.added_at,
            'opportunity', to_jsonb(o)
          ) order by member.rank_position
        ) filter (where member.id is not null),
        '[]'::jsonb
      )
    )
    from public.weekly_cohorts c
    left join public.weekly_cohort_members member on member.cohort_id = c.id
    left join public.opportunities o on o.id = member.opportunity_id
    where c.id = cohort_uuid
    group by c.id, c.workspace_id, c.week_start, c.target_size, c.actual_size, c.pool_exhausted, c.generated_at
  );
end;
$$;

revoke all on function public.generate_current_week_cohort() from public;
grant execute on function public.generate_current_week_cohort() to authenticated, service_role;

comment on function public.generate_current_week_cohort() is
  'M6-2 server-controlled, America/Chicago weekly cohort generation. Do not call from the browser with elevated credentials.';
