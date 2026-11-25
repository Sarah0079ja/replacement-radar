import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../lib/supabase-admin";
import { getSupabaseServerClient } from "../../../lib/supabase-server";

function parseZips(value: unknown) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,]+/) : [];
  const zips = [...new Set(values.map((item) => String(item).trim()).filter(Boolean))];
  return zips.length > 0 && zips.length <= 25 && zips.every((zip) => /^\d{5}$/.test(zip)) ? zips : null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { zips?: unknown; email?: unknown; context?: unknown };
  const zips = parseZips(body.zips);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!zips || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "Enter your ZIP codes and a valid email address." }, { status: 400 });
  }

  try {
    const admin = getSupabaseAdminClient();
    const sessionClient = await getSupabaseServerClient();
    const { data: { user } } = await sessionClient.auth.getUser();
    let workspaceId: string | null = null;
    if (user) {
      const { data: membership } = await sessionClient.from("memberships").select("workspace_id").eq("user_id", user.id).order("created_at", { ascending: true }).limit(1).maybeSingle();
      workspaceId = membership?.workspace_id || null;
    }
    const { error } = await admin.from("territory_requests").insert({
      workspace_id: workspaceId,
      user_id: user?.id || null,
      requested_zip_codes: zips,
      contact_email: email || user?.email || null,
      context: typeof body.context === "string" ? body.context.trim().slice(0, 500) || null : null,
      status: "REVIEW_REQUIRED",
    });
    if (error) throw error;
    return NextResponse.json({ message: "Thanks. We received your territory request and will review it." });
  } catch {
    return NextResponse.json({ error: "We could not record that request. Please try again." }, { status: 500 });
  }
}
