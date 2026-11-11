"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../lib/supabase-browser";
import styles from "../login/login.module.css";

export default function SignupPage() {
  const router = useRouter();
  const client = getSupabaseBrowserClient();
  const [company, setCompany] = useState(""); const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(""); if (!client) { router.push("/"); return; } const { data, error: signupError } = await client.auth.signUp({ email, password, options: { data: { company_name: company, user_name: name } } }); if (signupError) { setError(signupError.message); return; } if (data.session) router.push("/"); else setMessage("Check your email to confirm your account, then sign in."); }
  return <main className={styles.page}><section className={styles.card} aria-labelledby="signup-title"><div className={styles.mark}>R</div><p className={styles.kicker}>HVAC SALES INTELLIGENCE · DALLAS</p><h1 id="signup-title">Create your contractor workspace</h1><p className={styles.intro}>Start with the Dallas replacement-opportunity list.</p>{client ? <form onSubmit={submit} className={styles.form}><label>Company name<input required value={company} onChange={(e) => setCompany(e.target.value)} /></label><label>Your name<input required value={name} onChange={(e) => setName(e.target.value)} /></label><label>Email<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>Password<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>{error && <p className={styles.error} role="alert">{error}</p>}{message && <p className={styles.message} role="status">{message}</p>}<button type="submit">Create workspace</button><p className={styles.switchLink}>Already have an account? <Link href="/login">Sign in</Link></p></form> : <div className={styles.demo}><p>Supabase is not configured, so the founder demo is available locally.</p><button onClick={() => router.push("/")}>Open founder demo</button><small>Configure Supabase public variables to enable workspace authentication.</small><p className={styles.switchLink}>Already have an account? <Link href="/login">Sign in</Link></p></div>}</section></main>;
}
