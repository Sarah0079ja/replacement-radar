import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase-server";
import { getSupabaseAdminClient } from "../../../lib/supabase-admin";

export async function GET() {
  const session = await getSupabaseServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });

  try {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from("territory_zip_coverage")
      .select("zip_code,status")
      .eq("status", "ACTIVE")
      .order("zip_code");
    if (error) throw error;
    return NextResponse.json({ zips: [...new Set((data || []).map((row) => row.zip_code))] });
  } catch {
    return NextResponse.json({ error: "COVERAGE_UNAVAILABLE" }, { status: 503 });
  }
}
