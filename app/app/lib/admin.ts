import "server-only";

import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "./supabase-server";
import { getSupabaseAdminClient } from "./supabase-admin";

export type AdminContext = { user: User };

async function resolveAdmin(): Promise<AdminContext | null> {
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const admin = getSupabaseAdminClient();
  const { data, error: adminError } = await admin
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminError || !data) return null;
  return { user };
}

/** Page guard: admin authorization is an explicit server-side allowlist. */
export async function requireAdminPage(): Promise<AdminContext> {
  const context = await resolveAdmin();
  if (!context) {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login?next=%2Fadmin");
    redirect("/dashboard");
  }
  return context;
}

/** API guard: no redirects and no admin data for ordinary customers. */
export async function requireAdminApi(): Promise<
  | { ok: true; context: AdminContext }
  | { ok: false; response: NextResponse }
> {
  const context = await resolveAdmin();
  if (!context) {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user
      ? { ok: false, response: NextResponse.json({ error: "ADMIN_ACCESS_REQUIRED" }, { status: 403 }) }
      : { ok: false, response: NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 }) };
  }
  return { ok: true, context };
}
