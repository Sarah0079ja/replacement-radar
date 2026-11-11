-- M7-0 follow-up: ensure every recipient belongs to the same workspace as its campaign.
-- This migration is intentionally forward-only and does not alter the original
-- outreach foundation migration.

do $$
begin
  if exists (
    select 1
    from public.outreach_recipients r
    join public.outreach_campaigns c on c.id = r.campaign_id
    where r.workspace_id <> c.workspace_id
  ) then
    raise exception 'Cannot add campaign/workspace foreign key: mismatched outreach recipients exist';
  end if;
end
$$;

alter table public.outreach_campaigns
  add constraint outreach_campaigns_id_workspace_id_key
  unique (id, workspace_id);

alter table public.outreach_recipients
  drop constraint outreach_recipients_campaign_id_fkey;

alter table public.outreach_recipients
  add constraint outreach_recipients_campaign_workspace_fkey
  foreign key (campaign_id, workspace_id)
  references public.outreach_campaigns (id, workspace_id)
  on delete cascade;
