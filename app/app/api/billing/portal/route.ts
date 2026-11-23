import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase-server";
import { getStripeClient, getAppUrl } from "../../../lib/stripe";
import { errorCategory, logOperationalError } from "../../../lib/operational-log";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    const { data: membership } = await supabase.from("memberships").select("workspace_id").eq("user_id", user.id).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!membership?.workspace_id) return NextResponse.json({ error: "WORKSPACE_NOT_FOUND" }, { status: 403 });
    const { data: workspace } = await supabase.from("workspaces").select("stripe_customer_id").eq("id", membership.workspace_id).single();
    if (!workspace?.stripe_customer_id) return NextResponse.json({ error: "BILLING_NOT_STARTED" }, { status: 409 });
    const session = await getStripeClient().billingPortal.sessions.create({ customer: workspace.stripe_customer_id, return_url: `${getAppUrl()}/settings` });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    logOperationalError("stripe_customer_portal", { category: errorCategory(error) });
    return NextResponse.json({ error: "PORTAL_UNAVAILABLE" }, { status: 503 });
  }
}
