import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase-server";
import { pingLobTest } from "../../../lib/lob";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unavailable in production" }, { status: 404 });
  }

  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json(await pingLobTest());
  } catch (error) {
    const message = error instanceof Error ? error.message : "LOB_TEST_CONNECTION_FAILED";
    if (message === "LOB_TEST_API_KEY_NOT_CONFIGURED") {
      return NextResponse.json({ error: "Lob TEST API key is not configured" }, { status: 503 });
    }
    console.error("Lob test connectivity failed", { message });
    return NextResponse.json({ error: "Lob test connectivity failed" }, { status: 502 });
  }
}
