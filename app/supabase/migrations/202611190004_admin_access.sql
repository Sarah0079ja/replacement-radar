-- Owner/operator allowlist for the read-only admin console.
-- Rows are seeded explicitly by an operator after deployment; this migration
-- never grants admin access to existing users automatically.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

revoke all on public.admin_users from public, anon, authenticated;
grant select on public.admin_users to service_role;

comment on table public.admin_users is
  'Explicit owner/operator allowlist. Read only through trusted server-side service-role code.';
