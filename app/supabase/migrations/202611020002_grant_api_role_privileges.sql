-- Forward-only fix for the applied schema: table creation in the SQL editor
-- left the PostgREST roles without table privileges. RLS remains authoritative.
grant usage on schema public to authenticated, service_role;

grant select on public.profiles to authenticated, service_role;
grant select on public.workspaces to authenticated, service_role;
grant select on public.memberships to authenticated, service_role;
grant select on public.opportunities to authenticated, service_role;
grant select, insert, update on public.lead_activity to authenticated, service_role;
grant select, insert on public.lead_notes to authenticated, service_role;

grant execute on function public.is_workspace_member(uuid) to authenticated, service_role;
