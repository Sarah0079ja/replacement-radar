"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "../login/login.module.css";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [validating, setValidating] = useState(true);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetch("/api/auth/recovery", { cache: "no-store" }).then((response) => response.json()).then((result) => setValid(Boolean(result.valid))).catch(() => setValid(false)).finally(() => setValidating(false)); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    setBusy(true);
    const response = await fetch("/api/auth/recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password, confirmPassword }) });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(result.error === "RECOVERY_SESSION_REQUIRED" ? "This reset link is expired or invalid. Request a new one." : result.error === "PASSWORDS_DO_NOT_MATCH" ? "Passwords do not match." : "We could not update your password. Request a new reset link and try again."); return; }
    setSuccess(true);
    setTimeout(() => router.push("/login"), 1600);
  }

  return <main className={styles.singlePage}><section className={styles.singlePanel} aria-labelledby="reset-title"><Link className={styles.brand} href="/" aria-label="ResponseHVAC home"><span className={styles.brandMark}>R</span><span>ResponseHVAC</span></Link><div className={styles.formIntro}><p className={styles.kicker}>SET NEW PASSWORD</p><h1 id="reset-title">Choose a new password.</h1><p className={styles.intro}>Use at least 8 characters. Your reset session is temporary and can only update your own account.</p></div>{validating ? <p className={styles.intro}>Checking your secure reset session…</p> : success ? <div className={styles.form}><p className={styles.success} role="status">Your password has been updated. Returning you to sign in…</p><Link className={styles.secondaryAction} href="/login">Go to sign in now</Link></div> : valid ? <form className={styles.form} onSubmit={submit}><div className={styles.field}><label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} /></div><div className={styles.field}><label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></div>{error && <p className={styles.error} role="alert">{error}</p>}<button className={styles.submit} type="submit" disabled={busy}>{busy ? "Updating password…" : "Update password"}<span aria-hidden="true">↗</span></button></form> : <div className={styles.form}><p className={styles.error} role="alert">This password-reset link is expired or invalid.</p><Link className={styles.secondaryAction} href="/forgot-password">Request a new reset link</Link></div>}</section></main>;
}
