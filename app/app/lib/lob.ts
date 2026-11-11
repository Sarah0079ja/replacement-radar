import "server-only";

import { AddressesApi, Configuration } from "@lob/lob-typescript-sdk";

export type LobMode = "test" | "live";

type LobGate = {
  liveMailEnabled?: boolean;
  liveMailCreditCents?: number;
  allowLive?: boolean;
};

export function getLobMode(gate: LobGate = {}): LobMode {
  const liveConfigured = Boolean(process.env.LOB_LIVE_API_KEY);
  const liveAllowed = gate.allowLive === true && gate.liveMailEnabled === true && (gate.liveMailCreditCents || 0) > 0;
  return liveConfigured && liveAllowed ? "live" : "test";
}

export function getLobPricePerPieceCents() {
  const configured = Number.parseInt(process.env.LOB_PRICE_PER_PIECE_CENTS || "0", 10);
  return Number.isFinite(configured) && configured >= 0 ? configured : 0;
}

export function getLobAddressesClient(mode: LobMode = "test") {
  const apiKey = mode === "live" ? process.env.LOB_LIVE_API_KEY : process.env.LOB_TEST_API_KEY;
  if (!apiKey) throw new Error(`LOB_${mode.toUpperCase()}_API_KEY_NOT_CONFIGURED`);
  return new AddressesApi(new Configuration({ username: apiKey }));
}

export async function pingLobTest() {
  const result = await getLobAddressesClient("test").list(1);
  const data = (result as { data?: unknown[] }).data;
  return { success: true, mode: "test" as const, result_count: Array.isArray(data) ? data.length : 0 };
}
