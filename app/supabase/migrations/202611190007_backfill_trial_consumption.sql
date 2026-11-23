-- Preserve historical trial usage when the billing-hardening marker is introduced.
-- A recorded trial_start is authoritative evidence that the free trial began.
update public.workspaces
set free_trial_consumed_at = coalesce(trial_start, subscription_updated_at, now())
where free_trial_consumed_at is null
  and trial_start is not null;
