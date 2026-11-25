"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./territory.module.css";

export default function TerritoryPage() {
  const router = useRouter();
  const [zips, setZips] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "supported" | "review" | "sent">("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("checking");
    const response = await fetch("/api/territory/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zips }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setStatus("idle"); setError(result.error || "Enter one or more ZIP codes."); return; }
    if (result.status === "SUPPORTED") {
      try { sessionStorage.setItem("rr_service_zips", JSON.stringify(result.zips)); } catch { /* optional handoff only */ }
      setStatus("supported");
      setMessage(result.message);
    } else {
      setStatus("review");
      setMessage(result.message);
    }
}
  async function requestReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/territory/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zips, email }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setError(result.error || "We could not record that request."); return; }
    setStatus("sent");
    setMessage(result.message);
  }

  return <main className={styles.page}><section className={styles.layout} aria-labelledby="territory-title">
    <aside className={styles.story}><div><div className={styles.brand}><span className={styles.mark}>R</span><span>ResponseHVAC</span></div><div className={styles.workflow} aria-hidden="true"><span>Service area</span><i /><span>Prioritize</span><i /><span>Work first</span></div></div><div><h2>Know which homes to work first.</h2><p>ResponseHVAC helps HVAC teams turn qualifying property signals into a focused weekly work list.</p></div><div className={styles.storyFoot}><strong>Built for Texas contractors.</strong><span>Start by checking where your team works.</span></div></aside><div className={styles.card}>
    <p className={styles.kicker}>Get started</p>
    <h1 id="territory-title">Check your service area.</h1>
    <p className={styles.intro}>Enter the ZIP codes your team works. We’ll check whether ResponseHVAC can serve that territory.</p>
    <form onSubmit={check} className={styles.form}>
      <label>Service ZIP codes<input required inputMode="numeric" value={zips} onChange={(event) => setZips(event.target.value)} placeholder="75248, 75254" /></label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {message && <p className={styles.message} role="status">{message}</p>}
      {status === "supported" && <button type="button" onClick={() => router.push("/signup")}>Continue to your 5-day trial <span aria-hidden="true">→</span></button>}
      {status !== "supported" && status !== "sent" && <button type="submit" disabled={status === "checking"}>{status === "checking" ? "Checking…" : "Check territory"}<span aria-hidden="true">→</span></button>}
    </form>
    {status === "review" && <form onSubmit={requestReview} className={styles.form} style={{ marginTop: 18 }}><label>Email for territory review<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><button type="submit">Request my territory <span aria-hidden="true">→</span></button></form>}
    {status === "sent" && <p className={styles.switchLink}><Link href="/">Return to ResponseHVAC</Link></p>}
    <p className={styles.switchLink}><Link href="/login">Already have an account? Sign in</Link></p>
    </div></section></main>;
}
