-- Security fix: close the cross-workspace opportunity data exposure.
--
-- opportunities_authenticated_read (202611020001) allowed ANY authenticated
-- user to select ANY row in public.opportunities, including owner name,
-- owner mailing address, and every territory's evidence fields. The
-- dashboard's "All Opportunities" view relies on `select("*")` against this
-- table, so that broad policy made the entire multi-territory dataset
-- readable by any signed-in contractor, in any workspace, regardless of
-- their service ZIPs, weekly cohort, or workspace membership.
--
-- This migration replaces that policy with the same eligibility boundary
-- already enforced server-side inside generate_current_week_cohort() and
-- append_to_current_week_cohort(): a workspace may see an opportunity if it
-- currently matches that workspace's own service ZIPs and is in supported
-- coverage, OR if the opportunity has already been assigned to one of that
-- workspace's weekly cohorts, OR if the workspace already has lead_activity
-- against it (so previously-worked properties stay visible even if service
-- ZIPs are later changed). The same predicate is used for activity/note
-- writes so those tables cannot be used to bootstrap access to an arbitrary
-- opportunity.
--
-- Membership is resolved server-side from auth.uid() against
-- public.memberships; a client can never supply or spoof a workspace_id to
-- gain access. Admin access is unaffected: the admin console reads through
-- the service-role client, which is not subject to this (or any) RLS
-- policy. The SECURITY DEFINER weekly-cohort RPCs are likewise unaffected,
-- since they execute as their owning role and remain the primary,
-- unchanged, workspace-scoped read path for the weekly list.
--
-- Additive/forward-only: no data is deleted, no existing opportunity,
-- evidence, cohort, activity, or note rows are touched. Dallas and Austin
-- opportunities and their evidence are preserved as-is.

create or replace function public.can_workspace_access_opportunity(
  target_workspace uuid,
  target_opportunity uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships membership
    join public.workspaces workspace on workspace.id = membership.workspace_id
    join public.opportunities opportunity on opportunity.id = target_opportunity
    where membership.workspace_id = target_workspace
      and membership.user_id = auth.uid()
      and (
        (
          opportunity.coverage_state = 'SUPPORTED'
          and opportunity.property_zip = any(coalesce(workspace.service_zip_codes, '{}'::text[]))
        )
        or exists (
          select 1
          from public.weekly_cohort_members cohort_member
          join public.weekly_cohorts cohort on cohort.id = cohort_member.cohort_id
          where cohort_member.opportunity_id = opportunity.id
            and cohort.workspace_id = target_workspace
        )
        or exists (
          select 1
          from public.lead_activity activity
          where activity.opportunity_id = opportunity.id
            and activity.workspace_id = target_workspace
        )
      )
  );
$$;

revoke all on function public.can_workspace_access_opportunity(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_workspace_access_opportunity(uuid, uuid) to authenticated, service_role;

create index if not exists memberships_user_workspace_idx
  on public.memberships(user_id, workspace_id);

create index if not exists lead_activity_opportunity_workspace_idx
  on public.lead_activity(opportunity_id, workspace_id);

drop policy if exists opportunities_authenticated_read on public.opportunities;
drop policy if exists opportunities_workspace_scoped_read on public.opportunities;

create policy opportunities_workspace_scoped_read on public.opportunities
  for select using (
    exists (
      select 1
      from public.memberships membership
      where membership.user_id = auth.uid()
        and public.can_workspace_access_opportunity(membership.workspace_id, opportunities.id)
    )
  );

drop policy if exists activity_member_insert on public.lead_activity;
create policy activity_member_insert on public.lead_activity
  for insert with check (
    public.is_workspace_member(workspace_id)
    and public.can_workspace_access_opportunity(workspace_id, opportunity_id)
  );

drop policy if exists activity_member_update on public.lead_activity;
create policy activity_member_update on public.lead_activity
  for update
  using (public.is_workspace_member(workspace_id))
  with check (
    public.is_workspace_member(workspace_id)
    and public.can_workspace_access_opportunity(workspace_id, opportunity_id)
  );

drop policy if exists notes_member_insert on public.lead_notes;
create policy notes_member_insert on public.lead_notes
  for insert with check (
    public.is_workspace_member(workspace_id)
    and user_id = auth.uid()
    and public.can_workspace_access_opportunity(workspace_id, opportunity_id)
  );

comment on policy opportunities_workspace_scoped_read on public.opportunities is
  'Workspace-scoped read: current service-ZIP + supported coverage match, OR prior weekly-cohort assignment, OR existing lead_activity for the caller''s own workspace. Activity and note writes use the same predicate to prevent authorization bootstrap.';
