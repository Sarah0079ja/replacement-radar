-- M7-4: direct-mail tracking and outreach history.
-- Forward-only. Webhook events are inserted by the trusted server path only.

alter table public.outreach_recipients
  add column if not exists mailed_at timestamptz,
  add column if not exists in_transit_at timestamptz,
  add column if not exists in_local_area_at timestamptz,
  add column if not exists processed_for_delivery_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists returned_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists failed_at timestamptz;

-- A recipient's campaign and workspace are already tied together by the
-- M7-0 integrity migration. This additional key lets event rows enforce the
-- same relationship without denormalizing another workspace identifier.
alter table public.outreach_recipients
  add constraint outreach_recipients_id_campaign_workspace_key
  unique (id, campaign_id, workspace_id);

create table if not exists public.outreach_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.outreach_campaigns(id) on delete cascade,
  recipient_id uuid not null,
  provider text not null check (provider = 'LOB'),
  provider_event_id text not null,
  provider_mail_piece_id text not null,
  event_type text not null,
  event_at timestamptz,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint outreach_events_provider_event_key unique (provider, provider_event_id),
  constraint outreach_events_recipient_integrity_fkey
    foreign key (recipient_id, campaign_id, workspace_id)
    references public.outreach_recipients (id, campaign_id, workspace_id)
    on delete cascade
);

create index if not exists outreach_events_workspace_created_idx
  on public.outreach_events(workspace_id, created_at desc);
create index if not exists outreach_events_campaign_event_idx
  on public.outreach_events(campaign_id, event_at desc);
create index if not exists outreach_events_recipient_event_idx
  on public.outreach_events(recipient_id, event_at desc);
create index if not exists outreach_events_provider_piece_idx
  on public.outreach_events(provider_mail_piece_id, event_at desc);

alter table public.outreach_events enable row level security;

drop policy if exists outreach_events_member_read on public.outreach_events;
create policy outreach_events_member_read on public.outreach_events
  for select using (public.is_workspace_member(workspace_id));

revoke all on public.outreach_events from anon, authenticated;
grant select on public.outreach_events to authenticated;
grant all on public.outreach_events to service_role;
