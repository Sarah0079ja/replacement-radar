import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createTestPostcard, type RecipientSnapshot, type SenderSnapshot } from "../../../lib/direct-mail";
import { getLobPricePerPieceCents } from "../../../lib/lob";
import { getSupabaseAdminClient } from "../../../lib/supabase-admin";
import { getSupabaseServerClient } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";

const RECENT_MAIL_STATUSES = ["PENDING", "SENDING", "MAILED", "IN_TRANSIT", "IN_LOCAL_AREA", "DELIVERED", "RETURNED"];
const SELECTION_RULES = ["STRONG_ONLY", "STRONG_AND_MEDIUM", "CUSTOM"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SendRequest = {
  opportunity_ids?: unknown;
  selection_rule?: unknown;
  confirmation?: unknown;
  acknowledge_recent_mail?: unknown;
  mode?: unknown;
};

type WorkspaceRow = {
  id: string;
  name: string;
  mail_from_name: string | null;
  mail_from_address1: string | null;
  mail_from_address2: string | null;
  mail_from_city: string | null;
  mail_from_state: string | null;
  mail_from_zip: string | null;
  mail_from_phone: string | null;
  mail_from_website: string | null;
  live_mail_enabled: boolean;
  live_mail_credit_cents: number;
};

type OpportunityRow = {
  id: string;
  address: string | null;
  property_city: string | null;
  property_zip: string | null;
  owner_name: string | null;
  owner_occupancy: string | null;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function errorCode(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 160) : "UNKNOWN_ERROR";
}

function usableOwnerName(value: string | null) {
  return Boolean(value?.trim() && !/WITHHELD|WTHLD/i.test(value));
}

function recipientName(opportunity: OpportunityRow) {
  if (opportunity.owner_occupancy === "LIKELY_ABSENTEE") return "Current Resident";
  return usableOwnerName(opportunity.owner_name) ? opportunity.owner_name!.trim() : "Current Resident";
}

function currentChicagoWeekStart() {
  // Dallas-MVP behavior. Make this configurable per workspace/market later.
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - dayOfWeek + 1);
  return date.toISOString().slice(0, 10);
}

function isValidLobKey(value: string | undefined, prefix: "test" | "live") {
  return Boolean(value && new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value));
}

function resolveMode(requestedMode: "test" | "live", workspace: WorkspaceRow) {
  if (requestedMode === "test") {
    if (!isValidLobKey(process.env.LOB_TEST_API_KEY, "test")) return { error: "INVALID_TEST_KEY" as const };
    return { mode: "test" as const };
  }

  if (process.env.LOB_ALLOW_LIVE_SEND !== "true") return { error: "LIVE_SEND_DISABLED" as const };
  if (!isValidLobKey(process.env.LOB_LIVE_API_KEY, "live")) return { error: "INVALID_LIVE_KEY" as const };
  if (!workspace.live_mail_enabled) return { error: "LIVE_MAIL_NOT_ENABLED" as const };
  if (workspace.live_mail_credit_cents <= 0) return { error: "INSUFFICIENT_LIVE_CREDIT" as const };
  // M7-3 deliberately keeps live sending disabled until an atomic credit
  // reservation/deduction path is added. TEST mode is fully supported.
  return { error: "LIVE_SEND_DISABLED" as const };
}

function safeProviderFailure(error: unknown) {
  const message = errorCode(error);
  if (message.includes("LOB_TEST_API_KEY_NOT_CONFIGURED") || message.includes("INVALID_TEST_KEY")) return "Lob TEST mode is not configured.";
  if (message.includes("timeout") || message.includes("TIMEOUT")) return "Lob did not respond in time.";
  return "Lob rejected this postcard.";
}

function idempotencyKey(workspaceId: string, cohortId: string, opportunityIds: string[], mode: string, selectionRule: string) {
  return `m7-3:${createHash("sha256").update(JSON.stringify({ workspaceId, cohortId, opportunityIds: [...opportunityIds].sort(), mode, selectionRule })).digest("hex")}`;
}

export async function POST(request: Request) {
  const userClient = await getSupabaseServerClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });

  let body: SendRequest;
  try { body = await request.json() as SendRequest; } catch { return NextResponse.json({ error: "INVALID_SEND_REQUEST" }, { status: 400 }); }

  if (body.confirmation !== true) return NextResponse.json({ error: "EXPLICIT_CONFIRMATION_REQUIRED" }, { status: 400 });
  const rawIds = body.opportunity_ids;
  const opportunityIds = Array.isArray(rawIds) ? Array.from(new Set(rawIds.filter((value): value is string => typeof value === "string" && UUID_RE.test(value)))) : [];
  if (!opportunityIds.length || opportunityIds.length > 500 || opportunityIds.length !== (Array.isArray(rawIds) ? rawIds.length : 0)) return NextResponse.json({ error: "INVALID_RECIPIENT_SELECTION" }, { status: 400 });
  const selectionRule = SELECTION_RULES.includes(body.selection_rule as typeof SELECTION_RULES[number]) ? body.selection_rule as typeof SELECTION_RULES[number] : "CUSTOM";
  const requestedMode = body.mode === "live" ? "live" : "test";

  const { data: memberships, error: membershipError } = await userClient.from("memberships").select("workspace_id,created_at").order("created_at", { ascending: true }).order("workspace_id", { ascending: true });
  const workspaceId = memberships?.[0]?.workspace_id;
  if (membershipError || !workspaceId) return NextResponse.json({ error: "NO_WORKSPACE" }, { status: 403 });

  let admin;
  try { admin = getSupabaseAdminClient(); } catch { return NextResponse.json({ error: "SERVER_CONFIGURATION_ERROR" }, { status: 500 }); }
  const weekStart = currentChicagoWeekStart();
  const { data: cohort, error: cohortError } = await admin.from("weekly_cohorts").select("id,workspace_id,week_start").eq("workspace_id", workspaceId).eq("week_start", weekStart).maybeSingle();
  if (cohortError) return NextResponse.json({ error: "COHORT_LOOKUP_FAILED" }, { status: 500 });
  if (!cohort) return NextResponse.json({ error: "NO_CURRENT_COHORT" }, { status: 409 });

  const { data: members, error: memberError } = await admin.from("weekly_cohort_members").select("opportunity_id").eq("cohort_id", cohort.id).in("opportunity_id", opportunityIds);
  if (memberError) return NextResponse.json({ error: "COHORT_LOOKUP_FAILED" }, { status: 500 });
  if ((members || []).length !== opportunityIds.length) return NextResponse.json({ error: "OPPORTUNITY_NOT_IN_CURRENT_COHORT" }, { status: 403 });

  const { data: workspace, error: workspaceError } = await admin.from("workspaces").select("id,name,mail_from_name,mail_from_address1,mail_from_address2,mail_from_city,mail_from_state,mail_from_zip,mail_from_phone,mail_from_website,live_mail_enabled,live_mail_credit_cents").eq("id", workspaceId).single<WorkspaceRow>();
  if (workspaceError || !workspace) return NextResponse.json({ error: "WORKSPACE_LOOKUP_FAILED" }, { status: 500 });
  const mode = resolveMode(requestedMode, workspace);
  if (mode.error) return NextResponse.json({ error: mode.error }, { status: 400 });

  const senderValues = [workspace.mail_from_name, workspace.mail_from_address1, workspace.mail_from_city, workspace.mail_from_state, workspace.mail_from_zip, workspace.mail_from_phone].map(clean);
  if (senderValues.some((value) => !value)) return NextResponse.json({ error: "SENDER_CONFIGURATION_INCOMPLETE" }, { status: 400 });
  const sender: SenderSnapshot = { name: senderValues[0], address1: senderValues[1], address2: workspace.mail_from_address2 ? clean(workspace.mail_from_address2) : null, city: senderValues[2], state: senderValues[3], zip: senderValues[4], phone: senderValues[5], website: workspace.mail_from_website ? clean(workspace.mail_from_website) : null };

  const { data: opportunities, error: opportunityError } = await admin.from("opportunities").select("id,address,property_city,property_zip,owner_name,owner_occupancy").in("id", opportunityIds);
  if (opportunityError || !opportunities || opportunities.length !== opportunityIds.length) return NextResponse.json({ error: "OPPORTUNITY_LOOKUP_FAILED" }, { status: 500 });
  const opportunityMap = new Map((opportunities as OpportunityRow[]).map((opportunity) => [opportunity.id, opportunity]));
  const snapshots: RecipientSnapshot[] = [];
  for (const opportunityId of opportunityIds) {
    const opportunity = opportunityMap.get(opportunityId)!;
    if (!clean(opportunity.address)) return NextResponse.json({ error: "RECIPIENT_ADDRESS_INCOMPLETE", opportunity_id: opportunityId }, { status: 422 });
    if (!clean(opportunity.property_city)) return NextResponse.json({ error: "RECIPIENT_CITY_INCOMPLETE", opportunity_id: opportunityId }, { status: 422 });
    if (!clean(opportunity.property_zip)) return NextResponse.json({ error: "RECIPIENT_ZIP_INCOMPLETE", opportunity_id: opportunityId }, { status: 422 });
    snapshots.push({ opportunityId, name: recipientName(opportunity), address1: clean(opportunity.address), address2: null, city: clean(opportunity.property_city), state: "TX", zip: clean(opportunity.property_zip) });
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentRows, error: recentError } = await admin.from("outreach_recipients").select("opportunity_id,created_at,status").eq("workspace_id", workspaceId).in("opportunity_id", opportunityIds).gte("created_at", cutoff).in("status", RECENT_MAIL_STATUSES).order("created_at", { ascending: false });
  if (recentError) return NextResponse.json({ error: "RECENT_MAIL_LOOKUP_FAILED" }, { status: 500 });
  const recent = new Map<string, string>();
  for (const row of recentRows || []) if (!recent.has(row.opportunity_id)) recent.set(row.opportunity_id, row.created_at);
  if (recent.size && body.acknowledge_recent_mail !== true) return NextResponse.json({ error: "RECENT_MAIL_CONFIRMATION_REQUIRED", recent_opportunity_ids: [...recent.keys()] }, { status: 409 });

  const key = idempotencyKey(workspaceId, cohort.id, opportunityIds, mode.mode, selectionRule);
  const { data: existing } = await admin.from("outreach_campaigns").select("id,status,mode,recipient_count,estimated_total_cost_cents,actual_total_cost_cents,created_at,completed_at").eq("workspace_id", workspaceId).eq("idempotency_key", key).maybeSingle();
  let campaign = existing;
  const price = getLobPricePerPieceCents();
  if (!Number.isInteger(price) || price <= 0 || price > 100000) return NextResponse.json({ error: "POSTCARD_PRICING_UNAVAILABLE" }, { status: 503 });
  const estimatedTotal = price * snapshots.length;
  if (!campaign) {
    const { data: created, error: campaignError } = await admin.from("outreach_campaigns").insert({ workspace_id: workspaceId, channel: "POSTCARD", provider: "LOB", mode: mode.mode, idempotency_key: key, status: "SENDING", selection_rule: selectionRule, cohort_id: cohort.id, template_id: "HVAC_STANDARD_6X9_INLINE", sender_name: sender.name, sender_address1: sender.address1, sender_address2: sender.address2, sender_city: sender.city, sender_state: sender.state, sender_zip: sender.zip, sender_phone: sender.phone, sender_website: sender.website, estimated_per_piece_cost_cents: price, recipient_count: snapshots.length, estimated_total_cost_cents: estimatedTotal }).select("id,status,mode,recipient_count,estimated_total_cost_cents,actual_total_cost_cents,created_at,completed_at").single();
    if (campaignError && campaignError.code !== "23505") return NextResponse.json({ error: "CAMPAIGN_CREATE_FAILED" }, { status: 500 });
    campaign = created;
    if (!campaign) {
      const { data: recovered } = await admin.from("outreach_campaigns").select("id,status,mode,recipient_count,estimated_total_cost_cents,actual_total_cost_cents,created_at,completed_at").eq("workspace_id", workspaceId).eq("idempotency_key", key).single();
      campaign = recovered;
    }
  }
  if (!campaign) return NextResponse.json({ error: "CAMPAIGN_RECOVERY_FAILED" }, { status: 500 });

  const recipientRows = snapshots.map((snapshot) => ({ campaign_id: campaign!.id, workspace_id: workspaceId, opportunity_id: snapshot.opportunityId, recipient_name: snapshot.name, address1: snapshot.address1, address2: snapshot.address2, city: snapshot.city, state: snapshot.state, zip: snapshot.zip, address_source: "PROPERTY", provider: "LOB", idempotency_key: `m7-3:${campaign!.id}:${snapshot.opportunityId}`, status: "PENDING" }));
  const { error: recipientInsertError } = await admin.from("outreach_recipients").upsert(recipientRows, { onConflict: "idempotency_key", ignoreDuplicates: true });
  if (recipientInsertError) return NextResponse.json({ error: "RECIPIENT_CREATE_FAILED" }, { status: 500 });

  const { data: recipients, error: recipientLookupError } = await admin.from("outreach_recipients").select("id,opportunity_id,recipient_name,address1,address2,city,state,zip,address_source,provider_mail_piece_id,status,failure_reason,actual_cost_cents").eq("campaign_id", campaign.id).order("created_at", { ascending: true });
  if (recipientLookupError || !recipients) return NextResponse.json({ error: "RECIPIENT_LOOKUP_FAILED" }, { status: 500 });

  if (campaign.status !== "SENT") {
    for (const recipient of recipients) {
      if (recipient.status === "MAILED" && recipient.provider_mail_piece_id) continue;
      const snapshot = snapshots.find((item) => item.opportunityId === recipient.opportunity_id);
      if (!snapshot) continue;
      await admin.from("outreach_recipients").update({ status: "SENDING", failure_reason: null, updated_at: new Date().toISOString() }).eq("id", recipient.id);
      try {
        const providerPostcard = await createTestPostcard(sender, snapshot, `m7-3:${campaign.id}:${snapshot.opportunityId}`);
        await admin.from("outreach_recipients").update({ status: "MAILED", provider_mail_piece_id: providerPostcard.id, updated_at: new Date().toISOString() }).eq("id", recipient.id);
      } catch (providerError) {
        await admin.from("outreach_recipients").update({ status: "FAILED", failure_reason: safeProviderFailure(providerError), updated_at: new Date().toISOString() }).eq("id", recipient.id);
      }
    }
  }

  const { data: finalRecipients, error: finalRecipientError } = await admin.from("outreach_recipients").select("id,opportunity_id,recipient_name,address1,address2,city,state,zip,address_source,provider_mail_piece_id,status,failure_reason,actual_cost_cents").eq("campaign_id", campaign.id).order("created_at", { ascending: true });
  if (finalRecipientError || !finalRecipients) return NextResponse.json({ error: "CAMPAIGN_STATUS_LOOKUP_FAILED" }, { status: 500 });
  const successful = finalRecipients.filter((recipient) => recipient.status === "MAILED").length;
  const failed = finalRecipients.filter((recipient) => recipient.status === "FAILED").length;
  const finalStatus = successful === finalRecipients.length ? "SENT" : successful > 0 ? "PARTIALLY_SENT" : failed === finalRecipients.length ? "FAILED" : "SENDING";
  if (finalStatus !== "SENDING") await admin.from("outreach_campaigns").update({ status: finalStatus, completed_at: new Date().toISOString() }).eq("id", campaign.id);

  return NextResponse.json({ campaign: { ...campaign, status: finalStatus, mode: mode.mode }, recipients: finalRecipients, estimated_per_piece_cost_cents: price, estimated_total_cost_cents: estimatedTotal });
}
