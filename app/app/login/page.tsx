"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthVideo } from "../auth/AuthVideo";
import { getSupabaseBrowserClient } from "../lib/supabase-browser";
import styles from "../auth/auth.module.css";

function GoogleMark() {
  return <svg className={styles.googleMark} viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.163-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.716v2.258h2.908c1.702-1.567 2.685-3.875 2.685-6.615Z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.955-2.18l-2.908-2.258c-.806.54-1.835.86-3.047.86-2.344 0-4.33-1.584-5.04-3.714H.955v2.332A9 9 0 0 0 9 18Z"/><path fill="#FBBC05" d="M3.96 10.708A5.41 5.41 0 0 1 3.678 9c0-.593.102-1.17.282-1.708V4.96H.955A9 9 0 0 0 0 9c0 1.454.348 2.827.955 4.04l3.005-2.332Z"/><path fill="#EA4335" d="M9 3.578c1.322 0 2.508.454 3.442 1.345l2.582-2.582C13.463.89 11.427 0 9 0A9 9 0 0 0 .955 4.96L3.96 7.292C4.67 5.162 6.656 3.578 9 3.578Z"/></svg>;
}

export default function LoginPage() {
  const router = useRouter();
  const client = getSupabaseBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(() => {
    if (typeof window === "undefined") return "";
    const value = new URLSearchParams(window.location.search).get("error");
    if (value === "oauth_failed") return "Google sign-in could not be completed. Please try again.";
    if (value === "oauth_setup") return "Your account was created, but workspace setup could not be completed. Please contact support.";
    return "";
  });
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);

  async function continueWithGoogle() {
    if (!client) { setError("Google sign-in is not configured in this environment."); return; }
    setError(""); setOauthBusy(true);
    const { error: oauthError } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback` } });
    if (oauthError) { setOauthBusy(false); setError("We could not start Google sign-in. Please try again or use email and password."); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    if (!client) { router.push("/dashboard"); return; }
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) { setError(signInError.message); return; }
    router.push("/dashboard");
  }

  return <main className={styles.page}><section className={styles.layout} aria-labelledby="login-title"><aside className={styles.story}><Link className={styles.brand} href="/" aria-label="ResponseHVAC home"><span className={styles.mark}>R</span><span>ResponseHVAC</span></Link><div className={styles.storyBody}><h2>Know which homes to work first.</h2><p className={styles.storyIntro}>ResponseHVAC turns qualifying property signals into a focused weekly prospecting list.</p><AuthVideo /></div><div className={styles.storyFoot}>A clearer next action for your team.</div></aside><div className={styles.card}><div className={styles.cardInner}><p className={styles.kicker}>Welcome back</p><h1 id="login-title">Welcome back.</h1><p className={styles.intro}>Sign in to your ResponseHVAC workspace.</p>{client ? <><button className={styles.social} type="button" onClick={continueWithGoogle} disabled={oauthBusy}><GoogleMark />{oauthBusy ? "Connecting…" : "Continue with Google"}</button><div className={styles.divider}><span>or</span></div><form onSubmit={submit} className={styles.form}><label htmlFor="email">Email<input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label htmlFor="password"><span className={styles.fieldHeading}><span>Password</span><Link href="/forgot-password">Forgot password?</Link></span><input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <p className={styles.error} role="alert">{error}</p>}<button className={styles.submit} type="submit" disabled={busy}>{busy ? "Signing in…" : "Log in"}<span aria-hidden="true">→</span></button></form></> : <div className={styles.demo}><p>Supabase is not configured, so the founder demo is available locally.</p><button className={styles.submit} type="button" onClick={() => router.push("/dashboard")}>Open founder demo<span aria-hidden="true">→</span></button><small>Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable password authentication.</small></div>}<p className={styles.switchLink}>Don&apos;t have an account? <Link href="/signup">Create account</Link></p><nav className={styles.legalLinks} aria-label="Legal"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav></div></div></section></main>;
}
