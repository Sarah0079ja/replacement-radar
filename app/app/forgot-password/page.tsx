"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "../lib/supabase-browser";
import styles from "../login/login.module.css";

export default function ForgotPasswordPage() {
  const client = getSupabaseBrowserClient();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [linkError] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("error") === "recovery_invalid");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    if (!client) { setError("Password recovery is not configured in this environment."); setBusy(false); return; }
    const { error: resetError } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm`,
    });
    // Keep the response deliberately non-specific so the page never confirms
    // whether an email address belongs to a Replacement Radar account.
    if (resetError && !resetError.message.toLowerCase().includes("rate limit")) setSent(true);
    else if (!resetError) setSent(true);
    else setError("Please wait a moment before requesting another link.");
    setBusy(false);
  }

  return <main className={styles.singlePage}><section className={styles.singlePanel} aria-labelledby="forgot-title"><Link className={styles.brand} href="/" aria-label="Replacement Radar home"><span className={styles.brandMark}>R</span><span>Replacement Radar</span></Link><div className={styles.formIntro}><p className={styles.kicker}>PASSWORD RECOVERY</p><h1 id="forgot-title">Get back into your workspace.</h1><p className={styles.intro}>Enter your email and we&apos;ll send a secure password-reset link.</p></div>{linkError && <p className={styles.error} role="alert">This password reset link is invalid or has expired. Request a new one below.</p>}{sent ? <div className={styles.form}><p className={styles.success} role="status">If an account exists for that email, a reset link is on its way. Check your inbox and follow the link back to Replacement Radar.</p><Link className={styles.secondaryAction} href="/login">Return to sign in</Link></div> : client ? <form className={styles.form} onSubmit={submit}><div className={styles.field}><label htmlFor="recovery-email">Email</label><input id="recovery-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>{error && <p className={styles.error} role="alert">{error}</p>}<button className={styles.submit} type="submit" disabled={busy}>{busy ? "Sending link…" : "Send reset link"}<span aria-hidden="true">↗</span></button><Link className={styles.secondaryAction} href="/login">Return to sign in</Link></form> : <p className={styles.error} role="alert">Password recovery is not configured in this environment.</p>}</section></main>;
}
