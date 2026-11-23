import "server-only";

import { getSupabaseAdminClient } from "./supabase-admin";

export type AdminCustomer = {
  workspaceId: string;
  workspaceName: string;
  signupDate: string;
  primaryUserName: string;
  primaryUserEmail: string;
  serviceZips: string[];
  weeklyTarget: number;
  onboardingCompletedAt: string | null;
  subscriptionStatus: string | null;
  trialStart: string | null;
  trialEnd: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

export type AdminOverview = {
  customers: AdminCustomer[];
  metrics: {
    total: number;
    trialing: number;
    active: number;
    pastDue: number;
    cancelled: number;
    mrrCents: number;
    newSignups: number;
    trialsEndingSoon: number;
    incompleteOnboarding: number;
  };
};

type WorkspaceRow = {
  id: string;
  name: string;
  created_at: string;
  service_zip_codes: string[] | null;
  weekly_target_size: number | null;
  onboarding_completed_at: string | null;
  subscription_status: string | null;
  trial_start: string | null;
  trial_end: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

type MembershipRow = { workspace_id: string; user_id: string; created_at: string };
type ProfileRow = { id: string; full_name: string };

async function loadUsers() {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error("ADMIN_USER_DIRECTORY_UNAVAILABLE");
  return new Map(data.users.map((user) => [user.id, { email: user.email || "Email unavailable", name: String(user.user_metadata?.user_name || "Contractor") }]));
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const admin = getSupabaseAdminClient();
  const [{ data: workspaces, error: workspaceError }, { data: memberships, error: membershipError }, { data: profiles, error: profileError }, users] = await Promise.all([
    admin.from("workspaces").select("id,name,created_at,service_zip_codes,weekly_target_size,onboarding_completed_at,subscription_status,trial_start,trial_end,current_period_start,current_period_end,cancel_at_period_end,stripe_customer_id,stripe_subscription_id").order("created_at", { ascending: false }),
    admin.from("memberships").select("workspace_id,user_id,created_at").order("created_at", { ascending: true }),
    admin.from("profiles").select("id,full_name"),
    loadUsers(),
  ]);
  if (workspaceError || membershipError || profileError) throw new Error("ADMIN_DATA_UNAVAILABLE");

  const profileMap = new Map((profiles as ProfileRow[] || []).map((profile) => [profile.id, profile.full_name]));
  const primaryMembership = new Map<string, MembershipRow>();
  for (const membership of (memberships as MembershipRow[] || [])) {
    if (!primaryMembership.has(membership.workspace_id)) primaryMembership.set(membership.workspace_id, membership);
  }

  const customers = ((workspaces as WorkspaceRow[] || [])).map((workspace) => {
    const membership = primaryMembership.get(workspace.id);
    const user = membership ? users.get(membership.user_id) : undefined;
    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      signupDate: workspace.created_at,
      primaryUserName: (membership && profileMap.get(membership.user_id)) || user?.name || "Primary user unavailable",
      primaryUserEmail: user?.email || "Email unavailable",
      serviceZips: workspace.service_zip_codes || [],
      weeklyTarget: workspace.weekly_target_size || 0,
      onboardingCompletedAt: workspace.onboarding_completed_at,
      subscriptionStatus: workspace.subscription_status,
      trialStart: workspace.trial_start,
      trialEnd: workspace.trial_end,
      currentPeriodStart: workspace.current_period_start,
      currentPeriodEnd: workspace.current_period_end,
      cancelAtPeriodEnd: Boolean(workspace.cancel_at_period_end),
      stripeCustomerId: workspace.stripe_customer_id,
      stripeSubscriptionId: workspace.stripe_subscription_id,
    } satisfies AdminCustomer;
  });

  const now = Date.now();
  const sevenDays = now + 7 * 24 * 60 * 60 * 1000;
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
  const status = (customer: AdminCustomer) => customer.subscriptionStatus?.toLowerCase() || "unsubscribed";
  const metrics = {
    total: customers.length,
    trialing: customers.filter((customer) => status(customer) === "trialing").length,
    active: customers.filter((customer) => status(customer) === "active").length,
    pastDue: customers.filter((customer) => status(customer) === "past_due").length,
    cancelled: customers.filter((customer) => status(customer) === "canceled" || status(customer) === "cancelled").length,
    mrrCents: customers.filter((customer) => status(customer) === "active").length * 9900,
    newSignups: customers.filter((customer) => new Date(customer.signupDate).getTime() >= monthAgo).length,
    trialsEndingSoon: customers.filter((customer) => { const end = customer.trialEnd ? new Date(customer.trialEnd).getTime() : NaN; return status(customer) === "trialing" && Number.isFinite(end) && end >= now && end <= sevenDays; }).length,
    incompleteOnboarding: customers.filter((customer) => !customer.onboardingCompletedAt).length,
  };
  return { customers, metrics };
}

export async function getAdminCustomer(workspaceId: string) {
  const overview = await getAdminOverview();
  return overview.customers.find((customer) => customer.workspaceId === workspaceId) || null;
}
