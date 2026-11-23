-- Billing foundation: workspace-owned Stripe customer/subscription state.
-- Stripe remains the billing source of truth; these fields are a synchronized
-- authorization snapshot and are writable only through the trusted server path.

alter table public.workspaces
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text,
  add column if not exists trial_start timestamptz,
  add column if not exists trial_end timestamptz,
  add column if not exists current_period_start timestamptz,
  add column if not exists current_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists subscription_updated_at timestamptz,
  add column if not exists onboarding_completed_at timestamptz;

create unique index if not exists workspaces_stripe_customer_id_key
  on public.workspaces (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists workspaces_stripe_subscription_id_key
  on public.workspaces (stripe_subscription_id)
  where stripe_subscription_id is not null;

create table if not exists public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  processed_at timestamptz not null default now()
);

create index if not exists stripe_webhook_events_workspace_idx
  on public.stripe_webhook_events (workspace_id, processed_at desc);

alter table public.stripe_webhook_events enable row level security;

drop policy if exists stripe_webhook_events_member_read on public.stripe_webhook_events;
create policy stripe_webhook_events_member_read on public.stripe_webhook_events
  for select using (workspace_id is not null and public.is_workspace_member(workspace_id));

revoke insert, update, delete on public.stripe_webhook_events from anon, authenticated;
