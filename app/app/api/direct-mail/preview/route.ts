import { NextResponse } from "next/server";
import { getLobPricePerPieceCents } from "../../../lib/lob";
import { getSupabaseServerClient } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";

type PreviewSender = {
  name?: unknown;
  address1?: unknown;
  address2?: unknown;
  city?: unknown;
  state?: unknown;
  zip?: unknown;
  phone?: unknown;
  website?: unknown;
};

type PreviewRecipient = {
  name?: unknown;
  address?: unknown;
  city?: unknown;
  state?: unknown;
  zip?: unknown;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });

  const { data: memberships, error: membershipError } = await supabase
    .from("memberships")
    .select("workspace_id,created_at")
    .order("created_at", { ascending: true })
    .order("workspace_id", { ascending: true });
  if (membershipError || !memberships?.[0]?.workspace_id) {
    return NextResponse.json({ error: "NO_WORKSPACE" }, { status: 403 });
  }

  let body: { sender?: PreviewSender; recipients?: PreviewRecipient[] };
  try {
    body = await request.json() as { sender?: PreviewSender; recipients?: PreviewRecipient[] };
  } catch {
    return NextResponse.json({ error: "INVALID_PREVIEW_REQUEST" }, { status: 400 });
  }

  const sender = body.sender;
  const recipients = body.recipients;
  const requiredSender = [sender?.name, sender?.address1, sender?.city, sender?.state, sender?.zip, sender?.phone].map(text);
  if (!sender || requiredSender.some((value) => !value)) {
    return NextResponse.json({ error: "SENDER_CONFIGURATION_INCOMPLETE" }, { status: 400 });
  }
  if (!Array.isArray(recipients) || recipients.length === 0 || recipients.length > 500) {
    return NextResponse.json({ error: "NO_VALID_RECIPIENTS" }, { status: 400 });
  }
  if (recipients.some((recipient) => !text(recipient.address) || !text(recipient.city) || !text(recipient.state) || !text(recipient.zip))) {
    return NextResponse.json({ error: "RECIPIENT_ADDRESS_INCOMPLETE" }, { status: 400 });
  }

  const perPiece = getLobPricePerPieceCents();
  if (perPiece <= 0) {
    return NextResponse.json({ error: "POSTCARD_PRICING_UNAVAILABLE" }, { status: 503 });
  }

  return NextResponse.json({
    template: "HVAC_STANDARD_6X9",
    format: "6x9",
    mode: "local-preview",
    estimated_per_piece_cost_cents: perPiece,
    estimated_total_cost_cents: perPiece * recipients.length,
  });
}
