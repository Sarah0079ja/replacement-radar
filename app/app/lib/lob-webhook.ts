import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

export function verifyLobSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  secret: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
) {
  if (!secret || !signature || !timestamp) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isInteger(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const suppliedBuffer = Buffer.from(signature.trim(), "utf8");
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export function parseProviderTimestamp(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function trackingEventTimestamp(payload: { body?: { tracking_events?: unknown }; date_created?: unknown }, currentEventType?: string) {
  const events = payload.body?.tracking_events;
  if (!Array.isArray(events)) return parseProviderTimestamp(payload.date_created);
  const eventName = currentEventType?.split(".").slice(1).join(".").replaceAll("_", " ").toLowerCase();
  const matching = events.find((event) => {
    if (!event || typeof event !== "object") return false;
    const name = (event as { name?: unknown }).name;
    return typeof name === "string" && (name.toLowerCase() === eventName || name.toLowerCase().replaceAll(" ", "_") === currentEventType?.split(".").slice(1).join("_").toLowerCase());
  });
  if (matching && typeof matching === "object") return parseProviderTimestamp((matching as { time?: unknown }).time) || parseProviderTimestamp(payload.date_created);
  const timestamps = events.map((event) => (event && typeof event === "object" ? parseProviderTimestamp((event as { time?: unknown }).time) : null)).filter((value): value is string => Boolean(value)).sort();
  return timestamps[timestamps.length - 1] || parseProviderTimestamp(payload.date_created);
}
