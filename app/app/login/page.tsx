"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "../lib/supabase-browser";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const client = getSupabaseBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!client) {
      router.push("/");
      return;
    }
    setBusy(true);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.push("/");
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="login-title">
        <div className={styles.mark}>R</div>
        <p className={styles.kicker}>HVAC SALES INTELLIGENCE · DALLAS</p>
        <h1 id="login-title">Sign in to Replacement Radar</h1>
        <p className={styles.intro}>Review explainable replacement opportunities in your supported territory.</p>
        {client ? (
          <form onSubmit={submit} className={styles.form}>
            <label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
            <p className={styles.switchLink}>Don&apos;t have an account? <Link href="/signup">Create contractor workspace</Link></p>
          </form>
        ) : (
          <div className={styles.demo}>
            <p>Supabase is not configured, so the founder demo is available locally.</p>
            <button onClick={() => router.push("/")}>Open founder demo</button>
            <small>Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable password authentication.</small>
          </div>
        )}
      </section>
    </main>
  );
}
