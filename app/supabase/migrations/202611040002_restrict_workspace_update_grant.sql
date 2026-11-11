-- M6-1 security hardening: restrict authenticated workspace updates to settings.
-- The existing workspaces_member_update RLS policy remains responsible for
-- row-level workspace isolation. service_role retains its existing access.

revoke update on public.workspaces from authenticated;

grant update (service_zip_codes, weekly_target_size)
on public.workspaces
to authenticated;
