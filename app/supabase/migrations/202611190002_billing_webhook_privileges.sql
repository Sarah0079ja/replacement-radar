-- Allow the verified server-side Stripe webhook handler to persist and inspect
-- idempotency records without exposing webhook-event writes to client roles.
grant select, insert on public.stripe_webhook_events to service_role;
revoke update, delete on public.stripe_webhook_events from service_role;
