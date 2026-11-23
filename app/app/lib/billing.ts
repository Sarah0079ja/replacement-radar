import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { billingEnforcementEnabled } from "./stripe";
import { isBillingEligible } from "./billing-status";

export type BillingState = {
  workspaceId: string;
  status: string | null;
  onboardingCompletedAt: string | null;
  stripeCustomerId: string | null;
};

export type EligibleWorkspace = {
  user: User;
  workspace: BillingState;
};

export type WorkspaceAccessResult =
  | { ok: true; context: EligibleWorkspace }
  | { ok: false; response: NextResponse };

export async function getUserBillingState(supabase: SupabaseClient, userId: string): Promise<BillingState | null> {
  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (membershipError || !membership?.workspace_id) return null;

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id,subscription_status,onboarding_completed_at,stripe_customer_id")
    .eq("id", membership.workspace_id)
    .single();
  if (workspaceError || !workspace) return null;

  return {
    workspaceId: workspace.id,
    status: workspace.subscription_status,
    onboardingCompletedAt: workspace.onboarding_completed_at,
    stripeCustomerId: workspace.stripe_customer_id,
  };
}

/** Resolve paid product access from the authenticated membership, never client input. */
export async function requireEligibleWorkspace(supabase: SupabaseClient): Promise<WorkspaceAccessResult> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { ok: false, response: NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 }) };
  }

  const workspace = await getUserBillingState(supabase, user.id);
  if (!workspace) {
    return { ok: false, response: NextResponse.json({ error: "NO_WORKSPACE" }, { status: 403 }) };
  }

  if (billingEnforcementEnabled() && !isBillingEligible(workspace.status)) {
    return { ok: false, response: NextResponse.json({ error: "BILLING_REQUIRED" }, { status: 402 }) };
  }

  return { ok: true, context: { user, workspace } };
}
