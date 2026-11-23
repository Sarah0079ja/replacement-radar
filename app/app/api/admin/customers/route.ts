import { NextResponse } from "next/server";
import { requireAdminApi } from "../../../lib/admin";
import { getAdminOverview } from "../../../lib/admin-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireAdminApi();
  if (!access.ok) return access.response;
  const { customers, metrics } = await getAdminOverview();
  return NextResponse.json({ customers, metrics });
}
