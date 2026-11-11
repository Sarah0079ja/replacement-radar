-- Production-readiness safety primitives for direct-mail sending.
-- LIVE provider execution remains hard-disabled in application code.

alter table public.outreach_recipients
  add column if not exists send_claim_token text,
  add column if not exists send_claimed_at timestamptz,
  add column if not exists send_attempt_count integer not null default 0;

alter table public.outreach_recipients
  drop constraint if exists outreach_recipients_send_attempt_count_check;

alter table public.outreach_recipients
  add constraint outreach_recipients_send_attempt_count_check
  check (send_attempt_count >= 0);

create table if not exists public.outreach_credit_reservations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- The send path derives this from globally unique workspace/cohort/opportunity UUIDs,
  -- so a global key is intentional and keeps commit/release lookups unambiguous.
  operation_key text not null unique,
  amount_cents integer not null check (amount_cents > 0),
  status text not null check (status in ('RESERVED', 'COMMITTED', 'RELEASED')),
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);

create index if not exists outreach_credit_reservations_workspace_idx
  on public.outreach_credit_reservations(workspace_id, created_at desc);

alter table public.outreach_credit_reservations enable row level security;
revoke all on public.outreach_credit_reservations from anon, authenticated;
grant all on public.outreach_credit_reservations to service_role;

create or replace function public.claim_outreach_recipient_send(
  p_recipient_id uuid,
  p_claim_token text,
  p_stale_after_seconds integer default 900
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_row public.outreach_recipients%rowtype;
  stale_before timestamptz;
begin
  if p_recipient_id is null or nullif(trim(p_claim_token), '') is null then
    return 'INVALID_CLAIM';
  end if;

  stale_before := now() - make_interval(secs => greatest(1, p_stale_after_seconds));

  select * into recipient_row
  from public.outreach_recipients
  where id = p_recipient_id
  for update;

  if not found then return 'NOT_FOUND'; end if;

  if recipient_row.provider_mail_piece_id is not null
     or recipient_row.status in ('MAILED', 'IN_TRANSIT', 'IN_LOCAL_AREA', 'DELIVERED', 'RETURNED') then
    return 'COMPLETED';
  end if;

  if recipient_row.status = 'SENDING' then
    if recipient_row.send_claim_token = p_claim_token then return 'CLAIMED'; end if;
    if recipient_row.send_claimed_at is null or recipient_row.send_claimed_at < stale_before then
      update public.outreach_recipients
      set send_claim_token = p_claim_token,
          send_claimed_at = now(),
          send_attempt_count = send_attempt_count + 1,
          updated_at = now()
      where id = p_recipient_id;
      return 'CLAIMED_RETRY';
    end if;
    return 'IN_PROGRESS';
  end if;

  if recipient_row.status not in ('PENDING', 'FAILED') then return 'NOT_ELIGIBLE'; end if;

  update public.outreach_recipients
  set status = 'SENDING',
      failure_reason = null,
      send_claim_token = p_claim_token,
      send_claimed_at = now(),
      send_attempt_count = send_attempt_count + 1,
      updated_at = now()
  where id = p_recipient_id;

  return 'CLAIMED';
end;
$$;

create or replace function public.reserve_outreach_credit(
  p_workspace_id uuid,
  p_operation_key text,
  p_amount_cents integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation_row public.outreach_credit_reservations%rowtype;
  reservation_id uuid;
  reservation_created boolean := false;
  updated_workspace uuid;
begin
  if p_workspace_id is null or nullif(trim(p_operation_key), '') is null or p_amount_cents is null or p_amount_cents <= 0 then
    return 'INVALID_RESERVATION';
  end if;

  insert into public.outreach_credit_reservations (workspace_id, operation_key, amount_cents, status)
  values (p_workspace_id, p_operation_key, p_amount_cents, 'RESERVED')
  on conflict (operation_key) do nothing
  returning id into reservation_id;

  select * into reservation_row
  from public.outreach_credit_reservations
  where operation_key = p_operation_key
  for update;

  if reservation_row.workspace_id <> p_workspace_id or reservation_row.amount_cents <> p_amount_cents then
    return 'OPERATION_CONFLICT';
  end if;
  reservation_created := reservation_id is not null;
  if not reservation_created then
    if reservation_row.status = 'RESERVED' then return 'RESERVED'; end if;
    return reservation_row.status;
  end if;

  update public.workspaces
  set live_mail_credit_cents = live_mail_credit_cents - p_amount_cents
  where id = p_workspace_id
    and live_mail_enabled = true
    and live_mail_credit_cents >= p_amount_cents
  returning id into updated_workspace;

  if updated_workspace is null then
    delete from public.outreach_credit_reservations where id = reservation_row.id;
    return 'INSUFFICIENT_CREDIT';
  end if;

  return 'RESERVED';
end;
$$;

create or replace function public.commit_outreach_credit(p_operation_key text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare reservation_row public.outreach_credit_reservations%rowtype;
begin
  select * into reservation_row from public.outreach_credit_reservations where operation_key = p_operation_key for update;
  if not found then return 'NOT_FOUND'; end if;
  if reservation_row.status = 'COMMITTED' then return 'COMMITTED'; end if;
  if reservation_row.status = 'RELEASED' then return 'ALREADY_RELEASED'; end if;
  update public.outreach_credit_reservations set status = 'COMMITTED', finalized_at = now() where id = reservation_row.id;
  return 'COMMITTED';
end;
$$;

create or replace function public.release_outreach_credit(p_operation_key text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare reservation_row public.outreach_credit_reservations%rowtype;
begin
  select * into reservation_row from public.outreach_credit_reservations where operation_key = p_operation_key for update;
  if not found then return 'NOT_FOUND'; end if;
  if reservation_row.status = 'RELEASED' then return 'RELEASED'; end if;
  if reservation_row.status = 'COMMITTED' then return 'ALREADY_COMMITTED'; end if;
  update public.workspaces set live_mail_credit_cents = live_mail_credit_cents + reservation_row.amount_cents where id = reservation_row.workspace_id;
  update public.outreach_credit_reservations set status = 'RELEASED', finalized_at = now() where id = reservation_row.id;
  return 'RELEASED';
end;
$$;

revoke all on function public.claim_outreach_recipient_send(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.reserve_outreach_credit(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.commit_outreach_credit(text) from public, anon, authenticated;
revoke all on function public.release_outreach_credit(text) from public, anon, authenticated;
grant execute on function public.claim_outreach_recipient_send(uuid, text, integer) to service_role;
grant execute on function public.reserve_outreach_credit(uuid, text, integer) to service_role;
grant execute on function public.commit_outreach_credit(text) to service_role;
grant execute on function public.release_outreach_credit(text) to service_role;
