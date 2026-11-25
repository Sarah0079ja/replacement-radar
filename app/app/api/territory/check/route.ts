import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../lib/supabase-admin";

function parseZips(value: unknown) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,]+/) : [];
  const zips = [...new Set(values.map((item) => String(item).trim()).filter(Boolean))];
  return zips.length > 0 && zips.length <= 25 && zips.every((zip) => /^\d{5}$/.test(zip)) ? zips : null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { zips?: unknown };
  const zips = parseZips(body.zips);
  if (!zips) return NextResponse.json({ error: "Enter one or more five-digit ZIP codes." }, { status: 400 });

  try {
    const admin = getSupabaseAdminClient();
    const { data: rows, error } = await admin
      .from("territory_zip_coverage")
      .select("zip_code,status,coverage_quality")
      .in("zip_code", zips);
    if (error) throw error;

    const byZip = new Map((rows || []).map((row) => [row.zip_code, row]));
    const supported = zips.every((zip) => byZip.get(zip)?.status === "ACTIVE");
    return NextResponse.json({
      status: supported ? "SUPPORTED" : "REVIEW_REQUIRED",
      zips,
      message: supported
        ? "Great. We can serve this territory."
        : "Let's check your territory. We may be able to activate ResponseHVAC for your service area. Send us your ZIP codes and we'll review the available property and HVAC data.",
    });
  } catch {
    return NextResponse.json({
      status: "REVIEW_REQUIRED",
      zips,
      message: "Let's check your territory. Send us your ZIP codes and we'll review the available property and HVAC data.",
    });
  }
}
