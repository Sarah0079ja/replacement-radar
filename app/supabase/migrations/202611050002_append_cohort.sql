-- M6-5: append additional prospects to the current persisted cohort.
-- Initial/new-week generation remains owned by generate_current_week_cohort().

create or replace function public.append_to_current_week_cohort(p_new_target integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_workspace uuid;
  current_week_start date;
  selected_zips text[];
  cohort_uuid uuid;
  cohort_target integer;
  cohort_actual integer;
  cohort_pool_exhausted boolean;
  eligible_count integer := 0;
  additional_needed integer := 0;
  newly_added integer := 0;
  max_rank integer := 0;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  if p_new_target is null or p_new_target < 1 or p_new_target > 500 then
    raise exception 'INVALID_TARGET';
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

  select w.service_zip_codes
    into selected_zips
  from public.workspaces w
  where w.id = caller_workspace;

  if coalesce(array_length(selected_zips, 1), 0) = 0 then
    return jsonb_build_object('cohort', null, 'members', '[]'::jsonb, 'newly_added', 0, 'reason', 'NO_SERVICE_AREA');
  end if;

  -- Serialize all expansion requests for this workspace/week.
  select c.id, c.target_size, c.actual_size, c.pool_exhausted
    into cohort_uuid, cohort_target, cohort_actual, cohort_pool_exhausted
  from public.weekly_cohorts c
  where c.workspace_id = caller_workspace
    and c.week_start = current_week_start
  for update;

  if cohort_uuid is null then
    return jsonb_build_object('cohort', null, 'members', '[]'::jsonb, 'newly_added', 0, 'reason', 'NO_CURRENT_COHORT');
  end if;

  if p_new_target > cohort_actual then
    additional_needed := p_new_target - cohort_actual;

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

    select coalesce(max(member.rank_position), 0)
      into max_rank
    from public.weekly_cohort_members member
    where member.cohort_id = cohort_uuid;

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
        )::integer as appended_rank
      from eligible
    )
    insert into public.weekly_cohort_members (cohort_id, opportunity_id, rank_position)
    select cohort_uuid, ranked.id, max_rank + ranked.appended_rank
    from ranked
    where ranked.appended_rank <= additional_needed
    on conflict (cohort_id, opportunity_id) do nothing;

    get diagnostics newly_added = row_count;

    update public.weekly_cohorts
    set target_size = p_new_target,
        actual_size = cohort_actual + newly_added,
        pool_exhausted = eligible_count < additional_needed
    where id = cohort_uuid;
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
            'opportunity', jsonb_build_object(
              'id', o.id,
              'parcel_id', o.parcel_id,
              'address', o.address,
              'property_city', o.property_city,
              'property_zip', o.property_zip,
              'property_type', o.property_type,
              'opportunity_strength', o.opportunity_strength,
              'evidence_confidence', o.evidence_confidence,
              'year_built', o.year_built,
              'permit_category', o.permit_category,
              'latest_permit_date', o.latest_permit_date,
              'latest_permit_type', o.latest_permit_type,
              'latest_permit_description', o.latest_permit_description,
              'last_known_hvac_event_year', o.last_known_hvac_event_year,
              'estimated_years_since_last_known_hvac_event', o.estimated_years_since_last_known_hvac_event,
              'reasons', o.reasons,
              'owner_name', o.owner_name,
              'owner_mailing_address', o.owner_mailing_address,
              'living_area_sqft', o.living_area_sqft,
              'owner_occupancy', o.owner_occupancy,
              'coverage_state', o.coverage_state
            )
          ) order by member.rank_position
        ) filter (where member.id is not null),
        '[]'::jsonb
      ),
      'newly_added', newly_added
    )
    from public.weekly_cohorts c
    left join public.weekly_cohort_members member on member.cohort_id = c.id
    left join public.opportunities o on o.id = member.opportunity_id
    where c.id = cohort_uuid
    group by c.id, c.workspace_id, c.week_start, c.target_size, c.actual_size, c.pool_exhausted, c.generated_at
  );
end;
$$;

revoke all on function public.append_to_current_week_cohort(integer) from public;
grant execute on function public.append_to_current_week_cohort(integer) to authenticated, service_role;

comment on function public.append_to_current_week_cohort(integer) is
  'M6-5 server-controlled append-only expansion of the current America/Chicago weekly cohort.';
