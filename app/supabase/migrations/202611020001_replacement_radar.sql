create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  parcel_id text not null unique,
  address text not null,
  city text not null default 'DALLAS',
  zip text,
  property_type text,
  score integer not null check (score between 0 and 100),
  opportunity_strength text not null check (opportunity_strength in ('STRONG', 'MEDIUM', 'WEAK')),
  evidence_confidence text not null check (evidence_confidence in ('HIGH', 'MEDIUM', 'LOW')),
  year_built integer,
  permit_category text,
  latest_permit_date text,
  latest_permit_type text,
  latest_permit_description text,
  last_known_hvac_event_year integer,
  estimated_years_since_last_known_hvac_event integer,
  source_evidence jsonb not null default '{}'::jsonb,
  reasons jsonb not null default '[]'::jsonb,
  coverage_state text not null default 'SUPPORTED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  status text not null default 'NEW' check (status in ('NEW', 'CONTACTED', 'APPOINTMENT', 'WON', 'NOT INTERESTED')),
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, opportunity_id)
);

create table if not exists public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists lead_activity_workspace_idx on public.lead_activity(workspace_id, status);
create index if not exists lead_notes_workspace_opportunity_idx on public.lead_notes(workspace_id, opportunity_id, created_at desc);

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.memberships where workspace_id = target_workspace and user_id = auth.uid()); $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare new_workspace uuid;
begin
  insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'user_name', 'Contractor')) on conflict (id) do nothing;
  insert into public.workspaces (name) values (coalesce(nullif(new.raw_user_meta_data->>'company_name', ''), 'HVAC contractor workspace')) returning id into new_workspace;
  insert into public.memberships (workspace_id, user_id) values (new_workspace, new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.memberships enable row level security;
alter table public.opportunities enable row level security;
alter table public.lead_activity enable row level security;
alter table public.lead_notes enable row level security;

create policy profiles_self on public.profiles for select using (id = auth.uid());
create policy workspaces_member_read on public.workspaces for select using (public.is_workspace_member(id));
create policy memberships_self_read on public.memberships for select using (user_id = auth.uid());
create policy opportunities_authenticated_read on public.opportunities for select using (auth.uid() is not null);
create policy activity_member_read on public.lead_activity for select using (public.is_workspace_member(workspace_id));
create policy activity_member_insert on public.lead_activity for insert with check (public.is_workspace_member(workspace_id));
create policy activity_member_update on public.lead_activity for update using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy notes_member_read on public.lead_notes for select using (public.is_workspace_member(workspace_id));
create policy notes_member_insert on public.lead_notes for insert with check (public.is_workspace_member(workspace_id) and user_id = auth.uid());
