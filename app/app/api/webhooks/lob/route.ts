import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../lib/supabase-admin";
import { trackingEventTimestamp, verifyLobSignature } from "../../../lib/lob-webhook";

export const dynamic = "force-dynamic";

type LobEvent = {
  id?: unknown;
  reference_id?: unknown;
  date_created?: unknown;
  event_type?: { id?: unknown } | unknown;
  body?: { id?: unknown; tracking_events?: unknown };
};

const STATUS_ORDER: Record<string, number> = {
  PENDING: 0,
  SENDING: 1,
  MAILED: 2,
  IN_TRANSIT: 3,
  IN_LOCAL_AREA: 4,
  DELIVERED: 5,
  RETURNED: 6,
  CANCELLED: 7,
  FAILED: 7,
};

const EVENT_MAP: Record<string, { status?: string; timestampColumn?: string }> = {
  "postcard.mailed": { status: "MAILED", timestampColumn: "mailed_at" },
  "postcard.in_transit": { status: "IN_TRANSIT", timestampColumn: "in_transit_at" },
  "postcard.in_local_area": { status: "IN_LOCAL_AREA", timestampColumn: "in_local_area_at" },
  "postcard.processed_for_delivery": { status: "IN_LOCAL_AREA", timestampColumn: "processed_for_delivery_at" },
  "postcard.delivered": { status: "DELIVERED", timestampColumn: "delivered_at" },
  "postcard.returned_to_sender": { status: "RETURNED", timestampColumn: "returned_at" },
  "postcard.deleted": { status: "CANCELLED", timestampColumn: "cancelled_at" },
  "postcard.rejected": { status: "FAILED", timestampColumn: "failed_at" },
};

function eventType(payload: LobEvent) {
  if (payload.event_type && typeof payload.event_type === "object") {
    const event = payload.event_type as { id?: unknown };
    return typeof event.id === "string" ? event.id : "";
  }
  return typeof payload.event_type === "string" ? payload.event_type : "";
}

function providerPieceId(payload: LobEvent) {
  if (typeof payload.reference_id === "string" && payload.reference_id.trim()) return payload.reference_id;
  if (typeof payload.body?.id === "string" && payload.body.id.trim()) return payload.body.id;
  return "";
}

function shouldAdvance(current: string, next: string) {
  if (next === "RETURNED" && current !== "RETURNED" && current !== "CANCELLED") return true;
  if (current === "RETURNED" || current === "DELIVERED" || current === "CANCELLED") return false;
  if (current === "FAILED" && next !== "FAILED") return false;
  return (STATUS_ORDER[next] ?? 0) >= (STATUS_ORDER[current] ?? 0);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const valid = verifyLobSignature(
    rawBody,
    request.headers.get("lob-signature"),
    request.headers.get("lob-signature-timestamp"),
    process.env.LOB_WEBHOOK_SECRET,
  );
  if (!valid) return NextResponse.json({ error: "INVALID_WEBHOOK_SIGNATURE" }, { status: 401 });

  let payload: LobEvent;
  try { payload = JSON.parse(rawBody) as LobEvent; } catch { return NextResponse.json({ error: "INVALID_WEBHOOK_PAYLOAD" }, { status: 400 }); }
  const providerEventId = typeof payload.id === "string" ? payload.id : "";
  const pieceId = providerPieceId(payload);
  const type = eventType(payload);
  if (!providerEventId || !pieceId || !type) return NextResponse.json({ accepted: false, reason: "INVALID_WEBHOOK_PAYLOAD" }, { status: 400 });

  let admin;
  try { admin = getSupabaseAdminClient(); } catch { return NextResponse.json({ error: "SERVER_CONFIGURATION_ERROR" }, { status: 500 }); }
  const { data: recipient, error: recipientError } = await admin
    .from("outreach_recipients")
    .select("id,campaign_id,workspace_id,provider_mail_piece_id,status,mailed_at,in_transit_at,in_local_area_at,processed_for_delivery_at,delivered_at,returned_at,cancelled_at,failed_at")
    .eq("provider", "LOB")
    .eq("provider_mail_piece_id", pieceId)
    .maybeSingle();
  if (recipientError) return NextResponse.json({ error: "RECIPIENT_LOOKUP_FAILED" }, { status: 500 });
  if (!recipient) return NextResponse.json({ accepted: false, reason: "UNKNOWN_PROVIDER_PIECE" }, { status: 200 });

  const eventAt = trackingEventTimestamp(payload, type);
  const { error: eventError } = await admin.from("outreach_events").insert({
    workspace_id: recipient.workspace_id,
    campaign_id: recipient.campaign_id,
    recipient_id: recipient.id,
    provider: "LOB",
    provider_event_id: providerEventId,
    provider_mail_piece_id: pieceId,
    event_type: type,
    event_at: eventAt,
  });
  const duplicate = eventError?.code === "23505";
  if (eventError && !duplicate) {
    return NextResponse.json({ error: "EVENT_CREATE_FAILED" }, { status: 500 });
  }

  const mapped = EVENT_MAP[type];
  const currentTimestamp = mapped?.timestampColumn ? (recipient as Record<string, string | null | undefined>)[mapped.timestampColumn] : null;
  const shouldUpdateTimestamp = Boolean(eventAt && (!currentTimestamp || new Date(eventAt).getTime() > new Date(currentTimestamp).getTime()));
  if (mapped?.status && shouldAdvance(recipient.status, mapped.status)) {
    const update: Record<string, string> = { status: mapped.status, updated_at: new Date().toISOString() };
    if (mapped.timestampColumn && shouldUpdateTimestamp) update[mapped.timestampColumn] = eventAt!;
    const { error: updateError } = await admin.from("outreach_recipients").update(update).eq("id", recipient.id).eq("workspace_id", recipient.workspace_id);
    if (updateError) return NextResponse.json({ error: "RECIPIENT_UPDATE_FAILED" }, { status: 500 });
  } else if (mapped?.timestampColumn && shouldUpdateTimestamp) {
    const { error: timestampError } = await admin.from("outreach_recipients").update({ [mapped.timestampColumn]: eventAt, updated_at: new Date().toISOString() }).eq("id", recipient.id).eq("workspace_id", recipient.workspace_id);
    if (timestampError) return NextResponse.json({ error: "RECIPIENT_UPDATE_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ accepted: true, duplicate, event_type: type });
}
