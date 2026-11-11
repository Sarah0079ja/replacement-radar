-- Safe user deletion policy:
-- * profiles and memberships already cascade from auth.users.
-- * notes in a workspace with other members remain, but their deleted author
--   is nulled rather than blocking auth.users deletion.
-- * a workspace with no memberships is removed by the cleanup trigger; its
--   workspace-owned activity/notes cascade with it.
-- * opportunities are never referenced by this cleanup and are preserved.

alter table public.lead_notes
  alter column user_id drop not null;

alter table public.lead_notes
  drop constraint if exists lead_notes_user_id_fkey;

alter table public.lead_notes
  add constraint lead_notes_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

create or replace function public.cleanup_empty_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.memberships where workspace_id = old.workspace_id
  ) then
    delete from public.workspaces where id = old.workspace_id;
  end if;
  return old;
end;
$$;

drop trigger if exists cleanup_empty_workspace_after_membership_delete on public.memberships;
create trigger cleanup_empty_workspace_after_membership_delete
after delete on public.memberships
for each row execute procedure public.cleanup_empty_workspace();
