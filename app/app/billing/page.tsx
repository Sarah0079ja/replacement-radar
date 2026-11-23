"use client";

import { useState } from "react";
import styles from "../login/login.module.css";

export default function BillingPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function openPortal() {
    setBusy(true); setError("");
    const response = await fetch("/api/billing/portal", { method: "POST" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.url) { setError("Billing management is not available yet."); setBusy(false); return; }
    window.location.assign(result.url);
  }
  return <main className={styles.page}><section className={styles.authPanel} aria-labelledby="billing-title"><div className={styles.brand}><span className={styles.brandMark}>R</span><span>Replacement Radar</span></div><div className={styles.formIntro}><p className={styles.kicker}>BILLING STATUS</p><h1 id="billing-title">Your workspace needs billing attention.</h1><p className={styles.intro}>Your account remains safe. Use Stripe&apos;s secure customer portal to update payment details or review the subscription.</p></div>{error && <p className={styles.error} role="alert">{error}</p>}<button className={styles.submit} type="button" onClick={openPortal} disabled={busy}>{busy ? "Opening Stripe…" : "Manage billing securely"}<span aria-hidden="true">↗</span></button></section></main>;
}
