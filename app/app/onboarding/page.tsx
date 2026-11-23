"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../login/login.module.css";

export default function OnboardingPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function finish() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/onboarding/complete", { method: "POST" });
    if (!response.ok) { const result = await response.json().catch(() => ({})); setError(result.error === "SERVICE_AREA_REQUIRED" ? "Choose at least one service ZIP in Settings before continuing." : "We could not finish setup yet. Please try again."); setBusy(false); return; }
    router.push("/dashboard");
  }

  return <main className={styles.page}><section className={styles.authPanel} aria-labelledby="onboarding-title"><div className={styles.brand}><span className={styles.brandMark}>R</span><span>Replacement Radar</span></div><div className={styles.formIntro}><p className={styles.kicker}>ONE LAST STEP</p><h1 id="onboarding-title">Set up your territory in Settings.</h1><p className={styles.intro}>Your account is active. Choose the ZIP codes your company serves and your weekly opportunity volume before opening your workspace.</p></div>{error && <p className={styles.error} role="alert">{error}</p>}<div className={styles.demo}><button className={styles.submit} type="button" onClick={() => router.push("/settings")}>Open Settings <span aria-hidden="true">↗</span></button><button className={styles.submit} type="button" onClick={finish} disabled={busy}>{busy ? "Finishing setup…" : "Complete setup"}<span aria-hidden="true">→</span></button></div></section></main>;
}
