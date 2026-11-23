"use client";

import { useState } from "react";
import styles from "../login/login.module.css";

export default function CheckoutPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <main className={styles.page}>
      <section className={styles.authPanel} aria-labelledby="checkout-title">
        <div className={styles.brand}><span className={styles.brandMark}>R</span><span>Replacement Radar</span></div>
        <div className={styles.formIntro}>
          <p className={styles.kicker}>YOUR TRIAL STARTS HERE</p>
          <h1 id="checkout-title">A sharper week starts with your territory.</h1>
          <p className={styles.intro}>Start a 5-day trial for $99/month after the trial. Stripe securely collects your card before the trial begins.</p>
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.demo}>
          <button className={styles.submit} type="button" onClick={startCheckout} disabled={busy}>{busy ? "Opening secure checkout…" : "Continue to secure checkout"}<span aria-hidden="true">↗</span></button>
          <small>Your card is handled by Stripe. No card details are stored by Replacement Radar.</small>
        </div>
        <p className={styles.footnote}>5-day trial · one plan · Texas HVAC intelligence</p>
      </section>
    </main>
  );
}
