import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase-server";
import { getSupabaseAdminClient } from "../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  const { data: membership, error: membershipError } = await supabase.from("memberships").select("workspace_id").eq("user_id", user.id).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (membershipError || !membership?.workspace_id) return NextResponse.json({ error: "WORKSPACE_NOT_FOUND" }, { status: 403 });
  const admin = getSupabaseAdminClient();
  const { data: workspace, error: workspaceError } = await admin.from("workspaces").select("service_zip_codes").eq("id", membership.workspace_id).single();
  if (workspaceError || !workspace) return NextResponse.json({ error: "WORKSPACE_NOT_FOUND" }, { status: 404 });
  if (!Array.isArray(workspace.service_zip_codes) || workspace.service_zip_codes.length === 0) return NextResponse.json({ error: "SERVICE_AREA_REQUIRED" }, { status: 422 });
  const { error } = await admin.from("workspaces").update({ onboarding_completed_at: new Date().toISOString() }).eq("id", membership.workspace_id);
  if (error) return NextResponse.json({ error: "ONBOARDING_PERSISTENCE_FAILED" }, { status: 500 });
  return NextResponse.json({ completed: true });
}
