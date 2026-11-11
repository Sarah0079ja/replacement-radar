-- M7-0: outreach foundation only.
-- No campaign or recipient rows are created by this migration.

alter table public.workspaces
  add column if not exists mail_from_name text,
  add column if not exists mail_from_address1 text,
  add column if not exists mail_from_address2 text,
  add column if not exists mail_from_city text,
  add column if not exists mail_from_state text,
  add column if not exists mail_from_zip text,
  add column if not exists mail_from_phone text,
  add column if not exists mail_from_website text,
  add column if not exists live_mail_enabled boolean not null default false,
  add column if not exists live_mail_credit_cents integer not null default 0;

alter table public.workspaces
  drop constraint if exists workspaces_live_mail_credit_cents_check;

alter table public.workspaces
  add constraint workspaces_live_mail_credit_cents_check
  check (live_mail_credit_cents >= 0);

comment on column public.workspaces.mail_from_name is
  'Workspace sender identity used as the future direct-mail return address.';
comment on column public.workspaces.live_mail_enabled is
  'Trusted server/admin gate for live direct-mail sending; never contractor-editable.';
comment on column public.workspaces.live_mail_credit_cents is
  'Trusted server/admin credit balance for live direct-mail sending; never contractor-editable.';

-- Preserve M6-1 row isolation and column-level update hardening. Contractors
-- may edit only service-area, weekly-target, and sender-identity columns.
revoke update on public.workspaces from authenticated;
grant update (
  service_zip_codes,
  weekly_target_size,
  mail_from_name,
  mail_from_address1,
  mail_from_address2,
  mail_from_city,
  mail_from_state,
  mail_from_zip,
  mail_from_phone,
  mail_from_website
) on public.workspaces to authenticated;

create table if not exists public.outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  channel text not null check (channel = 'POSTCARD'),
  provider text not null check (provider = 'LOB'),
  status text not null check (status in ('SENDING', 'SENT', 'PARTIALLY_SENT', 'FAILED')),
  selection_rule text not null check (selection_rule in ('STRONG_ONLY', 'STRONG_AND_MEDIUM', 'CUSTOM')),
  cohort_id uuid references public.weekly_cohorts(id) on delete set null,
  template_id text,
  sender_name text not null,
  sender_address1 text not null,
  sender_address2 text,
  sender_city text not null,
  sender_state text not null,
  sender_zip text not null,
  sender_phone text not null,
  sender_website text,
  estimated_per_piece_cost_cents integer not null check (estimated_per_piece_cost_cents >= 0),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  estimated_total_cost_cents integer not null default 0 check (estimated_total_cost_cents >= 0),
  actual_total_cost_cents integer check (actual_total_cost_cents is null or actual_total_cost_cents >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists outreach_campaigns_workspace_created_idx
  on public.outreach_campaigns(workspace_id, created_at desc);
create index if not exists outreach_campaigns_cohort_idx
  on public.outreach_campaigns(cohort_id);

create table if not exists public.outreach_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.outreach_campaigns(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete restrict,
  recipient_name text,
  address1 text not null,
  address2 text,
  city text not null,
  state text not null,
  zip text not null,
  address_source text not null check (address_source in ('PROPERTY', 'OWNER_MAILING')),
  provider text not null check (provider = 'LOB'),
  provider_mail_piece_id text,
  idempotency_key text not null unique,
  status text not null check (status in ('PENDING', 'SENDING', 'MAILED', 'IN_TRANSIT', 'IN_LOCAL_AREA', 'DELIVERED', 'RETURNED', 'CANCELLED', 'FAILED')),
  failure_reason text,
  actual_cost_cents integer check (actual_cost_cents is null or actual_cost_cents >= 0),
  expected_delivery date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outreach_recipients_campaign_idx
  on public.outreach_recipients(campaign_id, created_at);
create index if not exists outreach_recipients_workspace_idx
  on public.outreach_recipients(workspace_id, status);
create index if not exists outreach_recipients_opportunity_idx
  on public.outreach_recipients(opportunity_id, created_at desc);
create index if not exists outreach_recipients_provider_piece_idx
  on public.outreach_recipients(provider, provider_mail_piece_id);

alter table public.outreach_campaigns enable row level security;
alter table public.outreach_recipients enable row level security;

drop policy if exists outreach_campaigns_member_read on public.outreach_campaigns;
create policy outreach_campaigns_member_read on public.outreach_campaigns
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists outreach_recipients_member_read on public.outreach_recipients;
create policy outreach_recipients_member_read on public.outreach_recipients
  for select using (public.is_workspace_member(workspace_id));

revoke all on public.outreach_campaigns from anon, authenticated;
grant select on public.outreach_campaigns to authenticated;
grant all on public.outreach_campaigns to service_role;

revoke all on public.outreach_recipients from anon, authenticated;
grant select on public.outreach_recipients to authenticated;
grant all on public.outreach_recipients to service_role;
