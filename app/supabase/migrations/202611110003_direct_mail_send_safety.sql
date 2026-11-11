-- M7-3: audit mode and make confirmed send attempts idempotent.
alter table public.outreach_campaigns
  add column if not exists mode text,
  add column if not exists idempotency_key text;

update public.outreach_campaigns
set mode = coalesce(mode, 'test'),
    idempotency_key = coalesce(idempotency_key, 'legacy-m7-3-' || id::text);

alter table public.outreach_campaigns
  alter column mode set default 'test',
  alter column mode set not null,
  alter column idempotency_key set not null;

alter table public.outreach_campaigns
  drop constraint if exists outreach_campaigns_mode_check;

alter table public.outreach_campaigns
  add constraint outreach_campaigns_mode_check
  check (mode in ('test', 'live'));

create unique index if not exists outreach_campaigns_idempotency_key_idx
  on public.outreach_campaigns(idempotency_key);
