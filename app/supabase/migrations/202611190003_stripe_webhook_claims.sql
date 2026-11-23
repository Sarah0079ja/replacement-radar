-- Make Stripe webhook claiming atomic while preserving retryability after failure.
alter table public.stripe_webhook_events
  add column if not exists processing_status text not null default 'processing';

update public.stripe_webhook_events
set processing_status = 'processed'
where processing_status = 'processing';

alter table public.stripe_webhook_events
  add constraint stripe_webhook_events_processing_status_check
  check (processing_status in ('processing', 'processed'));

drop policy if exists stripe_webhook_events_member_read on public.stripe_webhook_events;
revoke all on public.stripe_webhook_events from anon, authenticated;
grant select, insert, update, delete on public.stripe_webhook_events to service_role;
