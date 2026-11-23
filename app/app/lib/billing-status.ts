export type KnownBillingStatus = "trialing" | "active" | "past_due" | "unpaid" | "incomplete" | "incomplete_expired" | "canceled" | "cancelled";

export function normalizeBillingStatus(status: string | null | undefined) {
  return status?.trim().toLowerCase() || null;
}

export function isBillingEligible(status: string | null | undefined) {
  const normalized = normalizeBillingStatus(status);
  return normalized === "trialing" || normalized === "active";
}

export function canStartCheckout(status: string | null | undefined) {
  const normalized = normalizeBillingStatus(status);
  return normalized === null || normalized === "canceled" || normalized === "cancelled" || normalized === "incomplete_expired";
}

export function billingRecoveryPath(status: string | null | undefined) {
  return canStartCheckout(status) ? "/checkout" : "/billing";
}
