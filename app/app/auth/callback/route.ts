import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "../../lib/supabase-server";

function redirect(request: NextRequest, path: string) {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const origin = configuredOrigin ? new URL(configuredOrigin).origin : request.nextUrl.origin;
  return NextResponse.redirect(new URL(path, origin));
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const supabase = await getSupabaseServerClient();

  if (!code) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return redirect(request, "/login?error=oauth_failed");
  } else {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return redirect(request, "/login?error=oauth_failed");
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect(request, "/login?error=oauth_failed");

  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("workspace_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (membershipError || !membership?.workspace_id) return redirect(request, "/login?error=oauth_setup");

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("service_zip_codes,onboarding_completed_at")
    .eq("id", membership.workspace_id)
    .single();
  if (workspaceError || !workspace) return redirect(request, "/login?error=oauth_setup");

  const configured = Boolean(workspace.onboarding_completed_at)
    || (Array.isArray(workspace.service_zip_codes) && workspace.service_zip_codes.length > 0);
  return redirect(request, configured ? "/dashboard" : "/onboarding");
}
