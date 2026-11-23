import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdminClient } from "../../../lib/supabase-admin";
import { getStripeClient } from "../../../lib/stripe";
import { errorCategory, logOperationalError } from "../../../lib/operational-log";

export const dynamic = "force-dynamic";

async function findWorkspaceId(admin: ReturnType<typeof getSupabaseAdminClient>, customerId: string | null, metadataWorkspaceId?: string | null) {
  if (metadataWorkspaceId && customerId) {
    const { data: metadataWorkspace } = await admin.from("workspaces").select("id,stripe_customer_id").eq("id", metadataWorkspaceId).maybeSingle();
    if (!metadataWorkspace || (metadataWorkspace.stripe_customer_id && metadataWorkspace.stripe_customer_id !== customerId)) return null;
  }
  if (customerId) {
    const { data } = await admin.from("workspaces").select("id").eq("stripe_customer_id", customerId).maybeSingle();
    if (data?.id) return data.id as string;
  }
  if (metadataWorkspaceId) {
    const { data } = await admin.from("workspaces").select("id,stripe_customer_id").eq("id", metadataWorkspaceId).maybeSingle();
    if (data && (!customerId || !data.stripe_customer_id || data.stripe_customer_id === customerId)) return data.id as string;
  }
  return null;
}

async function syncSubscription(admin: ReturnType<typeof getSupabaseAdminClient>, subscription: Stripe.Subscription, workspaceId: string | null) {
  const resolvedWorkspaceId = workspaceId || await findWorkspaceId(admin, typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id, subscription.metadata?.workspace_id);
  if (!resolvedWorkspaceId) throw new Error("WORKSPACE_NOT_FOUND_FOR_SUBSCRIPTION");
  const { data: existingWorkspace, error: existingWorkspaceError } = await admin
    .from("workspaces")
    .select("free_trial_consumed_at")
    .eq("id", resolvedWorkspaceId)
    .single();
  if (existingWorkspaceError || !existingWorkspace) throw new Error("WORKSPACE_NOT_FOUND_FOR_SUBSCRIPTION");
  const { error } = await admin.from("workspaces").update({
    stripe_customer_id: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    trial_start: subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString() : null,
    trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    current_period_start: subscription.items.data[0]?.current_period_start ? new Date(subscription.items.data[0].current_period_start * 1000).toISOString() : null,
    current_period_end: subscription.items.data[0]?.current_period_end ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
    subscription_updated_at: new Date().toISOString(),
    free_trial_consumed_at: existingWorkspace.free_trial_consumed_at || (subscription.trial_start ? new Date().toISOString() : null),
  }).eq("id", resolvedWorkspaceId);
  if (error) throw new Error("SUBSCRIPTION_STATE_PERSISTENCE_FAILED");
  return resolvedWorkspaceId;
}

async function syncDeletedSubscription(admin: ReturnType<typeof getSupabaseAdminClient>, subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const workspaceId = await findWorkspaceId(admin, customerId, subscription.metadata?.workspace_id);
  if (!workspaceId) throw new Error("WORKSPACE_NOT_FOUND_FOR_DELETED_SUBSCRIPTION");

  const { data: workspace, error: workspaceError } = await admin
    .from("workspaces")
    .select("stripe_subscription_id")
    .eq("id", workspaceId)
    .single();
  if (workspaceError || !workspace) throw new Error("WORKSPACE_NOT_FOUND_FOR_DELETED_SUBSCRIPTION");

  // A deleted event for an older subscription must not cancel a newer one.
  if (workspace.stripe_subscription_id && workspace.stripe_subscription_id !== subscription.id) return workspaceId;
  return syncSubscription(admin, { ...subscription, status: "canceled", cancel_at_period_end: false }, workspaceId);
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return NextResponse.json({ error: "WEBHOOK_CONFIGURATION_ERROR" }, { status: 400 });
  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "INVALID_WEBHOOK_SIGNATURE" }, { status: 400 });
  }

  try {
    const admin = getSupabaseAdminClient();
    const claimStartedAt = new Date().toISOString();
    let { error: claimError } = await admin.from("stripe_webhook_events").insert({
      stripe_event_id: event.id,
      event_type: event.type,
      workspace_id: null,
      processing_started_at: claimStartedAt,
    });
    if (claimError?.code === "23505") {
      const { data: existing } = await admin.from("stripe_webhook_events").select("processing_status,processing_started_at").eq("stripe_event_id", event.id).maybeSingle();
      if (existing?.processing_status === "processed") return NextResponse.json({ received: true, duplicate: true });
      const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      if (existing?.processing_status === "processing" && existing.processing_started_at && existing.processing_started_at < staleBefore) {
        const { data: reclaimed, error: reclaimError } = await admin
          .from("stripe_webhook_events")
          .update({ processing_started_at: claimStartedAt })
          .eq("stripe_event_id", event.id)
          .eq("processing_status", "processing")
          .lt("processing_started_at", staleBefore)
          .select("stripe_event_id")
          .maybeSingle();
        if (reclaimError) throw new Error("WEBHOOK_EVENT_CLAIM_FAILED");
        if (reclaimed) {
          // The conditional update makes stale recovery a single-winner claim.
          claimError = null;
        } else {
          return NextResponse.json({ error: "WEBHOOK_EVENT_IN_PROGRESS" }, { status: 409 });
        }
      } else {
        return NextResponse.json({ error: "WEBHOOK_EVENT_IN_PROGRESS" }, { status: 409 });
      }
    }
    if (claimError) throw new Error("WEBHOOK_EVENT_CLAIM_FAILED");

    let workspaceId: string | null = null;
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id || null;
      workspaceId = await findWorkspaceId(admin, customerId, session.metadata?.workspace_id || session.client_reference_id);
      if (!workspaceId) throw new Error("WORKSPACE_NOT_FOUND_FOR_CHECKOUT");
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (subscriptionId) {
        const subscription = await getStripeClient().subscriptions.retrieve(subscriptionId);
        workspaceId = await syncSubscription(admin, subscription, workspaceId);
      }
      await admin.from("billing_checkout_attempts").update({ state: "completed", updated_at: new Date().toISOString() }).eq("stripe_session_id", session.id).eq("state", "open");
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      await admin.from("billing_checkout_attempts").update({ state: "expired", updated_at: new Date().toISOString() }).eq("stripe_session_id", session.id).eq("state", "open");
    } else if (event.type.startsWith("customer.subscription.")) {
      const subscription = event.data.object as Stripe.Subscription;
      if (event.type === "customer.subscription.deleted") {
        workspaceId = await syncDeletedSubscription(admin, subscription);
      } else {
        // Stripe delivery order is not guaranteed; retrieve the current object so an older event cannot restore stale access.
        const currentSubscription = await getStripeClient().subscriptions.retrieve(subscription.id);
        workspaceId = await syncSubscription(admin, currentSubscription, null);
      }
    } else if (event.type === "invoice.payment_succeeded" || event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const invoiceSubscription = invoice.parent?.subscription_details?.subscription;
      const subscriptionId = typeof invoiceSubscription === "string" ? invoiceSubscription : invoiceSubscription?.id;
      if (subscriptionId) {
        const subscription = await getStripeClient().subscriptions.retrieve(subscriptionId);
        const invoiceCustomerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        const subscriptionCustomerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
        if (invoiceCustomerId && invoiceCustomerId !== subscriptionCustomerId) throw new Error("INVOICE_SUBSCRIPTION_CUSTOMER_MISMATCH");
        workspaceId = await syncSubscription(admin, subscription, null);
      }
    }

    const { error: eventError } = await admin.from("stripe_webhook_events").update({ processing_status: "processed", workspace_id: workspaceId }).eq("stripe_event_id", event.id).eq("processing_status", "processing");
    if (eventError) throw new Error("WEBHOOK_EVENT_PERSISTENCE_FAILED");
    return NextResponse.json({ received: true });
  } catch (error) {
    logOperationalError("stripe_webhook_processing", { category: errorCategory(error), event_id: event.id, event_type: event.type });
    const admin = getSupabaseAdminClient();
    await admin.from("stripe_webhook_events").delete().eq("stripe_event_id", event.id).eq("processing_status", "processing");
    return NextResponse.json({ error: "WEBHOOK_PROCESSING_FAILED" }, { status: 500 });
  }
}
