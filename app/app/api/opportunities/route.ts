import { NextResponse } from "next/server";
import { requireEligibleWorkspace } from "../../lib/billing";
import { getSupabaseServerClient } from "../../lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const supabase = await getSupabaseServerClient();
  const access = await requireEligibleWorkspace(supabase);
  if (!access.ok) return access.response;

  const { data, error } = await supabase.from("opportunities").select("*").order("score", { ascending: false });
  if (error) return NextResponse.json({ error: "Opportunity data could not be loaded" }, { status: 500 });
  return NextResponse.json(data || []);
}
