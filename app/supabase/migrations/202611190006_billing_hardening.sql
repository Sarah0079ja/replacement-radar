-- Production hardening for Stripe webhook recovery, trial history, and workspace billing lifecycle.
-- Forward-only and additive: no existing customer or workspace rows are deleted or rewritten.

alter table public.stripe_webhook_events
  add column if not exists processing_started_at timestamptz;

update public.stripe_webhook_events
set processing_started_at = coalesce(processing_started_at, processed_at)
where processing_status = 'processing'
  and processing_started_at is null;

create index if not exists stripe_webhook_events_processing_idx
  on public.stripe_webhook_events (processing_status, processing_started_at);

alter table public.workspaces
  add column if not exists free_trial_consumed_at timestamptz;

create or replace function public.prevent_workspace_delete_with_billing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.stripe_customer_id is not null or old.stripe_subscription_id is not null then
    raise exception using
      errcode = '23514',
      message = 'WORKSPACE_BILLING_LIFECYCLE_REQUIRED';
  end if;
  return old;
end;
$$;

drop trigger if exists prevent_workspace_delete_with_billing on public.workspaces;
create trigger prevent_workspace_delete_with_billing
before delete on public.workspaces
for each row execute function public.prevent_workspace_delete_with_billing();

revoke all on function public.prevent_workspace_delete_with_billing() from public, anon, authenticated;
grant execute on function public.prevent_workspace_delete_with_billing() to service_role;
