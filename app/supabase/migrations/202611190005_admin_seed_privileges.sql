-- Allow the trusted server/operator path to seed the explicit admin allowlist.
-- Client roles remain fully revoked; no application route exposes this write.
grant insert on public.admin_users to service_role;
