"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase-browser";
import styles from "./checkout.module.css";

type Plan = { name: string; zips: string[] };

export default function CheckoutPage() {
  const supabase = getSupabaseBrowserClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planLoading, setPlanLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data: membership } = await supabase.from("memberships").select("workspace_id").order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (!membership?.workspace_id) { setPlanLoading(false); return; }
      const { data: workspace } = await supabase.from("workspaces").select("name,service_zip_codes").eq("id", membership.workspace_id).single();
      if (workspace) setPlan({ name: workspace.name || "Your contractor workspace", zips: Array.isArray(workspace.service_zip_codes) ? workspace.service_zip_codes : [] });
      setPlanLoading(false);
    })();
  }, [supabase]);

  async function startCheckout() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/billing/checkout", { method: "POST" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.url) {
      setError(result.error === "BILLING_CONFIGURATION_REQUIRED" ? "Billing is not configured for this environment yet." : "We could not open secure checkout. Please try again.");
      setBusy(false);
      return;
    }
    window.location.assign(result.url);
  }

  return <main className={styles.page}><section className={styles.shell} aria-labelledby="checkout-title">
    <div className={styles.introPanel}><div className={styles.brand}><span className={styles.mark}>R</span><span>ResponseHVAC</span></div><p className={styles.kicker}>YOUR TRIAL STARTS HERE</p><h1 id="checkout-title">Start your 5-day free trial.</h1><p className={styles.intro}>Your prospecting plan is configured. Continue to secure checkout to activate your ResponseHVAC workspace.</p><div className={styles.price}><strong>$99</strong><span>/ month after your 5-day free trial</span></div><p className={styles.note}>Stripe securely collects your payment method. ResponseHVAC never stores your card details.</p><button className={styles.primary} type="button" onClick={startCheckout} disabled={busy}>{busy ? "Opening secure checkout…" : "Continue to secure checkout"}<span aria-hidden="true">↗</span></button>{error && <p className={styles.error} role="alert">{error}</p>}</div>
    <aside className={styles.summary}><p className={styles.kicker}>YOUR PLAN</p>{planLoading ? <p className={styles.planLoading}>Loading your plan…</p> : plan ? <><h2>{plan.name}</h2><div className={styles.planRow}><span>Service area</span><strong>{plan.zips.length ? plan.zips.join(" · ") : "Your selected service area"}</strong></div><p className={styles.planCopy}>Your ResponseHVAC workspace prioritizes qualifying opportunities across your service area, with HVAC and property evidence to help your team decide what to work first.</p></> : <><h2>Your ResponseHVAC plan</h2><p className={styles.planCopy}>Your ResponseHVAC workspace prioritizes qualifying opportunities across your service area, with HVAC and property evidence to help your team decide what to work first.</p></>}<p className={styles.footnote}>Card required at signup. Cancel anytime through Stripe Customer Portal.</p></aside>
  </section></main>;
}
