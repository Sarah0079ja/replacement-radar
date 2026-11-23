import { NextResponse } from "next/server";
import { pingLobTest } from "../../../lib/lob";
import { requireAdminApi } from "../../../lib/admin";
import { errorCategory, logOperationalError } from "../../../lib/operational-log";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unavailable in production" }, { status: 404 });
  }

  const access = await requireAdminApi();
  if (!access.ok) return access.response;

  try {
    return NextResponse.json(await pingLobTest());
  } catch (error) {
    const message = error instanceof Error ? error.message : "LOB_TEST_CONNECTION_FAILED";
    if (message === "LOB_TEST_API_KEY_NOT_CONFIGURED") {
      return NextResponse.json({ error: "Lob TEST API key is not configured" }, { status: 503 });
    }
    logOperationalError("lob_test_connectivity", { mode: "test", category: errorCategory(error) });
    return NextResponse.json({ error: "Lob test connectivity failed" }, { status: 502 });
  }
}
