# HVAC Replacement Radar — Supabase Setup

This milestone adds Supabase Auth, one contractor workspace per signup, shared Dallas opportunities, and workspace-private lead activity/notes.

## Setup

1. Create a Supabase project.
2. In the Supabase SQL editor, run `app/supabase/migrations/202611020001_replacement_radar.sql`, followed by the forward-only API-role privilege fix at `app/supabase/migrations/202611020002_grant_api_role_privileges.sql`.
3. Copy `app/.env.example` to `app/.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. For seeding only, copy `app/.env.seed.example` to `app/.env.seed.local` and set `SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY`. Keep the service-role key out of `.env.local`; it is never needed by the browser application and must not use a `NEXT_PUBLIC_` prefix.
5. From `app/`, run `npm run seed:opportunities`.
6. Start with `npm run dev`.

If a user is deleted, run `app/supabase/migrations/202611020004_safe_user_deletion.sql` after the base migrations. It makes note authors nullable on deletion and removes only workspaces that have no remaining memberships. Shared opportunities are never deleted.

The seed command upserts the current 307-row founder-test fixture into the shared `opportunities` table. The scoring model is unchanged; the fixture is generated from `data-spike/derived/properties_scored.csv` by `python3 data-spike/export_app_fixture.py`.

## Auth behavior

With public Supabase variables present, `/signup` collects company name, user name, email, and password. A database trigger creates a workspace, profile, and membership. `/login`, `/signup`, and `/` are protected by the Next.js `proxy.ts` session guard. With variables absent, the existing local founder demo remains available.

## Tenant isolation

`opportunities` is shared read-only system data for authenticated users. `lead_activity` and `lead_notes` are scoped by `workspace_id`; every policy checks membership through `is_workspace_member`. Notes additionally require `user_id = auth.uid()`. Contractor statuses and notes therefore cannot be read or written across organizations through the Supabase client.

## M6-1 workspace settings

Apply `app/supabase/migrations/202611040001_service_area_settings.sql` in the Supabase SQL Editor after the M6-0 migrations. It adds `workspaces.service_zip_codes` (default `{}`) and `workspaces.weekly_target_size` (default `25`), plus a member-only update policy. The database trigger accepts only ZIPs already present in `opportunities.property_zip`; owner mailing ZIPs are never eligible. Open `/settings` after signing in to configure the workspace. Weekly cohort generation is not part of this migration.

## Explicitly not included

Maps, SMS/email, CRM integrations, Stripe, subscriptions, payments, additional cities, paid data, and complex team permissions remain out of scope.

## M6-2 weekly cohort generation

Apply `app/supabase/migrations/202611040003_weekly_cohorts.sql` after the M6-1 migrations. The migration creates the persisted cohort tables, read-only authenticated RLS policies, and the server-controlled `generate_current_week_cohort()` RPC. The API route is `/api/this-week`. This milestone does not add a THIS WEEK dashboard or cohort-generation UI.
