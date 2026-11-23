-- Additive lease fields for unattended Austin ingestion ownership.
-- Existing checkpoint state and cursor values are preserved.

alter table public.territory_ingestion_checkpoints
  add column if not exists lease_id uuid,
  add column if not exists lease_heartbeat_at timestamptz;

comment on column public.territory_ingestion_checkpoints.lease_id is
  'Opaque per-run ownership token for the active ingestion lease.';

comment on column public.territory_ingestion_checkpoints.lease_heartbeat_at is
  'Last heartbeat from the current ingestion owner; stale recovery uses this value.';
