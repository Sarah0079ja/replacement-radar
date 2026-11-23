import { NextResponse } from "next/server";
import { requireAdminApi } from "../../../lib/admin";
import { getSupabaseAdminClient } from "../../../lib/supabase-admin";

export async function GET() {
  const access = await requireAdminApi();
  if (!access.ok) return access.response;

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("territory_requests")
    .select("id,requested_zip_codes,contact_email,status,requested_at,reviewed_at")
    .order("requested_at", { ascending: false });
  if (error) return NextResponse.json({ error: "TERRITORY_REQUESTS_UNAVAILABLE" }, { status: 500 });

  const byZip: Record<string, number> = {};
  for (const request of data || []) {
    for (const zip of request.requested_zip_codes || []) byZip[zip] = (byZip[zip] || 0) + 1;
  }
  return NextResponse.json({ requests: data || [], requests_by_zip: byZip });
}
