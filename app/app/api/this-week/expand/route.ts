import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { new_target?: unknown };
  try {
    body = await request.json() as { new_target?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const newTarget = body.new_target;
  if (typeof newTarget !== "number" || !Number.isInteger(newTarget) || newTarget < 1 || newTarget > 500) {
    return NextResponse.json({ error: "Invalid weekly target" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("append_to_current_week_cohort", { p_new_target: newTarget });
  if (error) {
    if (error.message.includes("AUTHENTICATION_REQUIRED")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message.includes("NO_WORKSPACE")) return NextResponse.json({ error: "No contractor workspace is available" }, { status: 403 });
    if (error.message.includes("INVALID_TARGET")) return NextResponse.json({ error: "Invalid weekly target" }, { status: 400 });
    console.error("Weekly cohort expansion failed", error);
    return NextResponse.json({ error: "Weekly prospect list could not be expanded" }, { status: 500 });
  }

  return NextResponse.json(data);
}
