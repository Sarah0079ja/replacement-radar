-- Austin adapter evidence storage. Forward-only and additive.
-- Keeps source events separate from the property-level opportunity projection so
-- multiple historical permits for one property remain meaningful and idempotent.

create table if not exists public.opportunity_evidence_events (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  territory_id uuid not null references public.coverage_territories(id),
  jurisdiction_key text not null,
  source_system text not null,
  source_record_id text not null,
  event_date date,
  normalized_event_type text not null
    check (normalized_event_type in (
      'HVAC_REPLACEMENT',
      'HVAC_INSTALLATION',
      'HVAC_REPAIR',
      'OTHER_MECHANICAL',
      'AMBIGUOUS_MECHANICAL',
      'UNKNOWN'
    )),
  evidence_confidence text not null
    check (evidence_confidence in ('VERIFIED DATA', 'INFERENCE', 'UNKNOWN')),
  source_confidence text not null
    check (source_confidence in ('HIGH', 'MEDIUM', 'LOW')),
  property_address text,
  property_city text,
  property_state text,
  property_zip text,
  parcel_id text,
  square_footage integer,
  raw_description text,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_system, source_record_id)
);

create index if not exists opportunity_evidence_events_opportunity_idx
  on public.opportunity_evidence_events(opportunity_id, event_date desc);

create index if not exists opportunity_evidence_events_territory_idx
  on public.opportunity_evidence_events(territory_id, event_date desc);

alter table public.opportunity_evidence_events enable row level security;
revoke all on public.opportunity_evidence_events from anon, authenticated;
grant all on public.opportunity_evidence_events to service_role;

comment on table public.opportunity_evidence_events is
  'Normalized, source-level property evidence. Raw source payload is retained only for trusted server-side ingestion and audit.';
