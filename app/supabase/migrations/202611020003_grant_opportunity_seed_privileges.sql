-- The seed uses upsert, which requires INSERT and UPDATE privileges in
-- addition to SELECT. RLS remains enabled and opportunities are still
-- read-only to authenticated application users because no client INSERT or
-- UPDATE policy exists.
grant insert, update on public.opportunities to service_role;
