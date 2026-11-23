"use client";

import { FormEvent, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "../lib/supabase-browser";
import styles from "./login.module.css";

const TERRITORY_MARKERS = [
  [12, 24], [20, 42], [28, 18], [34, 57], [42, 31], [48, 16], [55, 42], [63, 23], [72, 35], [82, 18],
  [88, 47], [16, 70], [25, 84], [38, 75], [48, 64], [58, 82], [69, 68], [78, 86], [90, 72], [8, 52],
  [31, 39], [45, 91], [61, 55], [74, 53], [84, 61], [53, 54],
] as const;

function TerritoryVisualization() {
  return (
    <div className={styles.sceneWrap} aria-hidden="true">
      <div className={styles.sceneMeta}><span>THIS WEEK</span><span>Texas</span></div>
      <div className={styles.territoryFrame}>
        <div className={styles.territoryGrid} />
        <div className={styles.markerField}>
          {TERRITORY_MARKERS.map(([left, top], index) => (
            <span
              key={String(left) + "-" + String(top)}
              className={index === 25 ? styles.focusMarker : styles.propertyMarker}
              style={{ "--left": String(left) + "%", "--top": String(top) + "%", "--delay": String((index % 7) * 0.08) + "s" } as CSSProperties}
            />
          ))}
        </div>
        <div className={styles.focusLine} />
        <div className={styles.focusAddress}><span>7310 LARKSPUR LN</span><strong>HIGH PRIORITY</strong></div>
        <div className={styles.evidencePanel}>
          <div className={styles.evidenceHead}><span>7310 LARKSPUR LN</span><b>HIGH PRIORITY</b></div>
          <p>WHY THIS HOME STANDS OUT</p>
          <div className={styles.evidenceRow}><span className={styles.verifiedDot} /><span>Recorded HVAC replacement</span><strong>Aug 3, 2012</strong></div>
          <div className={styles.evidenceLegend}><span>VERIFIED DATA</span><span>INFERENCE</span><span>UNKNOWN</span></div>
        </div>
        <div className={styles.workList}>
          <div className={styles.listLabel}>NEXT ACTION</div>
          <div className={styles.workRow}><span className={styles.rowMark} /><span>7310 Larkspur Ln</span><b>HIGH PRIORITY</b><em>NEW</em></div>
          <div className={styles.workRow + " " + styles.backRow}><span className={styles.rowMark} /><span>Property opportunity</span><b>MEDIUM</b><em>NEW</em></div>
          <div className={styles.workRow + " " + styles.backRow}><span className={styles.rowMark} /><span>Property opportunity</span><b>STRONG</b><em>NEW</em></div>
        </div>
      </div>
      <div className={styles.sceneCaption}><span className={styles.captionRule} /><span>From territory to next action</span></div>
    </div>
  );
}

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
    if (!client) { router.push("/dashboard"); return; }
    setBusy(true);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) { setError(signInError.message); return; }
    router.push("/dashboard");
  }

  return (
    <main className={styles.page}>
      <section className={styles.authPanel} aria-labelledby="login-title">
        <Link className={styles.brand} href="/" aria-label="Replacement Radar home"><span className={styles.brandMark}>R</span><span>Replacement Radar</span></Link>
        <div className={styles.formIntro}><p className={styles.kicker}>WELCOME BACK</p><h1 id="login-title">Pick up where you left off.</h1><p className={styles.intro}>Sign in to your Replacement Radar account.</p></div>
        {client ? (
          <form onSubmit={submit} className={styles.form}>
            <div className={styles.field}><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
            <div className={styles.field}><div className={styles.fieldHeading}><label htmlFor="password">Password</label><Link href="/forgot-password">Forgot password?</Link></div><input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <button className={styles.submit} type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}<span aria-hidden="true">↗</span></button>
            <p className={styles.switchLink}>Don&apos;t have an account? <Link href="/signup">Create contractor workspace</Link></p>
          </form>
        ) : (
          <div className={styles.demo}><p>Supabase is not configured, so the founder demo is available locally.</p><button className={styles.submit} onClick={() => router.push("/dashboard")}>Open founder demo<span aria-hidden="true">↗</span></button><small>Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable password authentication.</small></div>
        )}
        <p className={styles.footnote}>Texas HVAC prospecting intelligence.</p>
      </section>
      <aside className={styles.visualPanel} aria-label="Replacement Radar territory visualization"><TerritoryVisualization /></aside>
    </main>
  );
}
