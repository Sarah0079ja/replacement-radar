import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase-server";
import { getSupabaseAdminClient } from "../../../lib/supabase-admin";
import { getAppUrl, getStripeClient, getStripePriceId } from "../../../lib/stripe";
import { canStartCheckout, isBillingEligible, normalizeBillingStatus } from "../../../lib/billing-status";
import { errorCategory, logOperationalError } from "../../../lib/operational-log";

export const dynamic = "force-dynamic";

type CheckoutAttempt = {
  workspace_id: string;
  idempotency_key: string;
  stripe_session_id: string | null;
  state: "creating" | "open" | "completed" | "expired";
  updated_at: string;
};

function sleep(milliseconds: number) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

async function readCheckoutAttempt(admin: ReturnType<typeof getSupabaseAdminClient>, workspaceId: string) {
  const { data, error } = await admin.from("billing_checkout_attempts").select("workspace_id,idempotency_key,stripe_session_id,state,updated_at").eq("workspace_id", workspaceId).maybeSingle<CheckoutAttempt>();
  if (error) throw new Error("CHECKOUT_ATTEMPT_READ_FAILED");
  return data;
}

async function claimFreshAttempt(admin: ReturnType<typeof getSupabaseAdminClient>, workspaceId: string, expectedState?: CheckoutAttempt["state"]) {
  const idempotencyKey = `checkout-${workspaceId}-${randomUUID()}`;
  let query = admin.from("billing_checkout_attempts").update({ idempotency_key: idempotencyKey, stripe_session_id: null, state: "creating", updated_at: new Date().toISOString() }).eq("workspace_id", workspaceId);
  if (expectedState) query = query.eq("state", expectedState);
  const { data, error } = await query.select("workspace_id,idempotency_key,stripe_session_id,state,updated_at").maybeSingle<CheckoutAttempt>();
  if (error) throw new Error("CHECKOUT_ATTEMPT_CLAIM_FAILED");
  return data;
}

async function acquireCheckoutAttempt(admin: ReturnType<typeof getSupabaseAdminClient>, stripe: Stripe, workspaceId: string): Promise<{ owner: true; idempotencyKey: string } | { url: string } | { retry: true }> {
  const idempotencyKey = `checkout-${workspaceId}-${randomUUID()}`;
  const { data: inserted, error: insertError } = await admin.from("billing_checkout_attempts").insert({ workspace_id: workspaceId, idempotency_key: idempotencyKey, state: "creating" }).select("workspace_id,idempotency_key,stripe_session_id,state,updated_at").maybeSingle<CheckoutAttempt>();
  if (inserted) return { owner: true, idempotencyKey: inserted.idempotency_key };
  if (insertError?.code !== "23505") throw new Error("CHECKOUT_ATTEMPT_CREATE_FAILED");

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const existing = await readCheckoutAttempt(admin, workspaceId);
    if (!existing) {
      await sleep(100);
      continue;
    }
    if (existing.stripe_session_id) {
      const session = await stripe.checkout.sessions.retrieve(existing.stripe_session_id);
      if (session.status === "open" && session.url) return { url: session.url };
      const reclaimed = await claimFreshAttempt(admin, workspaceId, existing.state);
      if (reclaimed) return { owner: true, idempotencyKey: reclaimed.idempotency_key };
      continue;
    }
    const age = Date.now() - new Date(existing.updated_at).getTime();
    if (existing.state === "creating" && age < 5000) {
      await sleep(100);
      continue;
    }
    if (existing.state === "creating") {
      // Keep the original key after an ambiguous provider response; Stripe can safely deduplicate a retry.
      const { data: reclaimed, error } = await admin.from("billing_checkout_attempts").update({ updated_at: new Date().toISOString() }).eq("workspace_id", workspaceId).eq("state", "creating").lt("updated_at", new Date(Date.now() - 5000).toISOString()).select("idempotency_key").maybeSingle<{ idempotency_key: string }>();
      if (error) throw new Error("CHECKOUT_ATTEMPT_CLAIM_FAILED");
      if (reclaimed) return { owner: true, idempotencyKey: reclaimed.idempotency_key };
    } else {
      const reclaimed = await claimFreshAttempt(admin, workspaceId, existing.state);
      if (reclaimed) return { owner: true, idempotencyKey: reclaimed.idempotency_key };
    }
  }
  return { retry: true };
}

export async function POST() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });

    const { data: membership, error: membershipError } = await supabase.from("memberships").select("workspace_id").eq("user_id", user.id).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (membershipError || !membership?.workspace_id) return NextResponse.json({ error: "WORKSPACE_NOT_FOUND" }, { status: 403 });

    const admin = getSupabaseAdminClient();
    const { data: workspace, error: workspaceError } = await admin.from("workspaces").select("id,name,stripe_customer_id,subscription_status,stripe_subscription_id,free_trial_consumed_at").eq("id", membership.workspace_id).single();
    if (workspaceError || !workspace) return NextResponse.json({ error: "WORKSPACE_NOT_FOUND" }, { status: 404 });
    const billingStatus = normalizeBillingStatus(workspace.subscription_status);
    if (isBillingEligible(billingStatus) || ["past_due", "unpaid", "incomplete"].includes(billingStatus || "")) {
      return NextResponse.json({ error: "SUBSCRIPTION_ALREADY_EXISTS" }, { status: 409 });
    }
    if (!canStartCheckout(billingStatus)) return NextResponse.json({ error: "BILLING_STATE_REQUIRES_MANAGEMENT" }, { status: 409 });

    const stripe = getStripeClient();
    let customerId = workspace.stripe_customer_id as string | null;
    if (customerId) {
      await stripe.customers.update(customerId, { metadata: { workspace_id: workspace.id, supabase_user_id: user.id } });
    } else {
      const customer = await stripe.customers.create({ name: workspace.name, email: user.email || undefined, metadata: { workspace_id: workspace.id, supabase_user_id: user.id } }, { idempotencyKey: `customer-${workspace.id}` });
      customerId = customer.id;
      const { error: customerPersistError } = await admin.from("workspaces").update({ stripe_customer_id: customerId, subscription_updated_at: new Date().toISOString() }).eq("id", workspace.id);
      if (customerPersistError) return NextResponse.json({ error: "BILLING_PERSISTENCE_FAILED" }, { status: 500 });
    }

    const openSessions = await stripe.checkout.sessions.list({ customer: customerId, limit: 10, status: "open" });
    const existing = openSessions.data.find((session) => session.mode === "subscription" && session.metadata?.workspace_id === workspace.id);
    if (existing?.url) return NextResponse.json({ url: existing.url });

    const appUrl = getAppUrl();
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      customer: customerId,
      client_reference_id: workspace.id,
      line_items: [{ price: getStripePriceId(), quantity: 1 }],
      payment_method_collection: "always",
      subscription_data: {
        ...(workspace.free_trial_consumed_at ? {} : { trial_period_days: 5 }),
        metadata: { workspace_id: workspace.id, supabase_user_id: user.id },
      },
      metadata: { workspace_id: workspace.id, supabase_user_id: user.id },
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/checkout/cancel`,
    };
    const attempt = await acquireCheckoutAttempt(admin, stripe, workspace.id);
    if ("url" in attempt) return NextResponse.json({ url: attempt.url });
    if ("retry" in attempt) return NextResponse.json({ error: "CHECKOUT_ATTEMPT_IN_PROGRESS" }, { status: 409 });
    const session = await stripe.checkout.sessions.create(sessionParams, { idempotencyKey: attempt.idempotencyKey });

    if (!session.url) return NextResponse.json({ error: "CHECKOUT_URL_UNAVAILABLE" }, { status: 502 });
    const { error: attemptPersistError } = await admin.from("billing_checkout_attempts").update({ stripe_session_id: session.id, state: "open", updated_at: new Date().toISOString() }).eq("workspace_id", workspace.id).eq("idempotency_key", attempt.idempotencyKey).eq("state", "creating");
    if (attemptPersistError) return NextResponse.json({ error: "BILLING_PERSISTENCE_FAILED" }, { status: 500 });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    logOperationalError("stripe_checkout", { category: errorCategory(error) });
    const code = error instanceof Error ? error.message : "CHECKOUT_UNAVAILABLE";
    if (code.includes("NOT_CONFIGURED") || code.includes("INVALID") || code.includes("TEST_KEY")) return NextResponse.json({ error: "BILLING_CONFIGURATION_REQUIRED" }, { status: 503 });
    return NextResponse.json({ error: "CHECKOUT_UNAVAILABLE" }, { status: 502 });
  }
}
