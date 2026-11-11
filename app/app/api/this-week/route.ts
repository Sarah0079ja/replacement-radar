import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase.rpc("generate_current_week_cohort");
  if (error) {
    if (error.message.includes("AUTHENTICATION_REQUIRED")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error.message.includes("NO_WORKSPACE")) {
      return NextResponse.json({ error: "No contractor workspace is available" }, { status: 403 });
    }
    console.error("Weekly cohort generation failed", error);
    return NextResponse.json({ error: "Weekly prospect list could not be generated" }, { status: 500 });
  }

  return NextResponse.json(data);
}
