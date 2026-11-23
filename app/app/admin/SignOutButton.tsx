"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../lib/supabase-browser";
import styles from "./admin.module.css";

export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setBusy(true);
    await client.auth.signOut();
    router.push("/login");
  }

  return <button className={styles.signOut} type="button" onClick={signOut} disabled={busy}>{busy ? "Signing out…" : "Sign out"}<span aria-hidden="true">↗</span></button>;
}
