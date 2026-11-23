import "server-only";

import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripeClient() {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY_NOT_CONFIGURED");
  if (!key.startsWith("sk_test_") && !key.startsWith("sk_live_")) throw new Error("STRIPE_KEY_INVALID");
  stripeClient = new Stripe(key);
  return stripeClient;
}

export function getAppUrl() {
  const value = process.env.NEXT_PUBLIC_APP_URL;
  if (!value) throw new Error("NEXT_PUBLIC_APP_URL_NOT_CONFIGURED");
  return value.replace(/\/$/, "");
}

export function getStripePriceId() {
  const value = process.env.STRIPE_PRICE_ID;
  if (!value) throw new Error("STRIPE_PRICE_ID_NOT_CONFIGURED");
  if (!value.startsWith("price_")) throw new Error("STRIPE_PRICE_ID_INVALID");
  return value;
}

export function billingEnforcementEnabled() {
  return process.env.BILLING_ENFORCEMENT_ENABLED === "true";
}
