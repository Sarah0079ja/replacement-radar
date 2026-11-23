// Shared normalized-evidence scorer. Territory adapters classify and normalize
// source records; this function keeps the product score independent of the city
// or source system that supplied the evidence.
export function yearsSinceEvent(dateValue, now = new Date()) {
  if (!dateValue) return null;
  const event = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(event.getTime())) return null;
  return Math.max(0, now.getUTCFullYear() - event.getUTCFullYear() - (now.getUTCMonth() < event.getUTCMonth() || (now.getUTCMonth() === event.getUTCMonth() && now.getUTCDate() < event.getUTCDate()) ? 1 : 0));
}

export function scoreNormalizedEvidence({ eventType, eventDate, propertyType }, now = new Date()) {
  const age = yearsSinceEvent(eventDate, now) ?? 0;
  const staleEventSignal = Math.min(35, Math.max(0, age * 5));
  const eventSignal = {
    HVAC_REPLACEMENT: 25,
    HVAC_INSTALLATION: 18,
    HVAC_REPAIR: 8,
    AMBIGUOUS_MECHANICAL: 4,
  }[eventType] || 0;
  const residentialSignal = propertyType === "RESIDENTIAL" ? 5 : 0;
  const score = Math.min(100, eventSignal + staleEventSignal + residentialSignal);
  return {
    score,
    opportunityStrength: score >= 60 ? "STRONG" : score >= 40 ? "MEDIUM" : "WEAK",
    yearsSinceEvent: yearsSinceEvent(eventDate, now),
  };
}
