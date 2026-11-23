-- Serialize workspace Checkout attempts without trusting browser-generated keys.
create table if not exists public.billing_checkout_attempts (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  idempotency_key text not null unique,
  stripe_session_id text unique,
  state text not null default 'creating' check (state in ('creating', 'open', 'completed', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.billing_checkout_attempts enable row level security;
revoke all on public.billing_checkout_attempts from anon, authenticated;
grant select, insert, update, delete on public.billing_checkout_attempts to service_role;
