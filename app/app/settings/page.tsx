"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../lib/supabase-browser";
import loginStyles from "../login/login.module.css";
import styles from "./settings.module.css";

const WEEKLY_TARGETS = [50, 100, 250] as const;
type SettingsSection = "service-area" | "weekly-capacity" | "business-mailing";

type ExpansionResult = {
  reason?: string;
  newly_added?: number;
  cohort?: { actual_size: number; target_size: number; pool_exhausted: boolean } | null;
};

type SenderSettings = {
  name: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  website: string;
};

function buildSavedMessage(result: ExpansionResult) {
  if (result.reason === "NO_CURRENT_COHORT") return "Settings saved. Your new target applies when you open This Week.";
  if (result.reason === "NO_SERVICE_AREA") return "Settings saved. Add ZIP codes to your service area to generate prospects.";
  if ((result.newly_added || 0) > 0 && result.cohort?.pool_exhausted) return `Settings saved. ${result.newly_added} new prospects added — that's all available in your area right now.`;
  if ((result.newly_added || 0) > 0) return `Settings saved. ${result.newly_added} new prospects added to this week.`;
  return "Settings saved.";
}

export default function SettingsPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [supportedZips, setSupportedZips] = useState<string[]>([]);
  const [selectedZips, setSelectedZips] = useState<string[]>([]);
  const [editingTerritory, setEditingTerritory] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSection>("service-area");
  const [weeklyTarget, setWeeklyTarget] = useState<number>(50);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [sender, setSender] = useState<SenderSettings>({ name: "", address1: "", address2: "", city: "", state: "TX", zip: "", phone: "", website: "" });

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data: memberships, error: membershipError } = await supabase
        .from("memberships")
        .select("workspace_id,created_at")
        .order("created_at", { ascending: true })
        .order("workspace_id", { ascending: true });
      const workspace = memberships?.[0]?.workspace_id;
      if (membershipError || !workspace) {
        setError("We could not load your contractor workspace.");
        setLoading(false);
        return;
      }

      const [{ data: workspaceRow, error: workspaceError }, coverageResponse] = await Promise.all([
        supabase.from("workspaces").select("name,service_zip_codes,weekly_target_size,mail_from_name,mail_from_address1,mail_from_address2,mail_from_city,mail_from_state,mail_from_zip,mail_from_phone,mail_from_website").eq("id", workspace).single(),
        fetch("/api/territory/coverage", { cache: "no-store" }),
      ]);
      if (workspaceError || !workspaceRow) {
        setError("We could not load your service-area settings. Please try again.");
        setLoading(false);
        return;
      }

      let zips: string[] = [];
      if (coverageResponse.ok) {
        const coverage = await coverageResponse.json() as { zips?: string[] };
        zips = coverage.zips || [];
      } else {
        setError("We could not load your service-area coverage. Please try again.");
      }
      const configured = (workspaceRow.service_zip_codes || []).filter((zip: string) => zips.includes(zip));
      setWorkspaceId(workspace);
      setSupportedZips(zips);
      setSelectedZips(configured);
      setEditingTerritory(configured.length === 0);
      setWeeklyTarget(WEEKLY_TARGETS.includes(workspaceRow.weekly_target_size) ? workspaceRow.weekly_target_size : 50);
      setSender({
        name: workspaceRow.mail_from_name || "",
        address1: workspaceRow.mail_from_address1 || "",
        address2: workspaceRow.mail_from_address2 || "",
        city: workspaceRow.mail_from_city || "",
        state: workspaceRow.mail_from_state || "TX",
        zip: workspaceRow.mail_from_zip || "",
        phone: workspaceRow.mail_from_phone || "",
        website: workspaceRow.mail_from_website || "",
      });
      setLoading(false);
    })();
  }, [supabase]);

  const selectionLabel = useMemo(() => selectedZips.length ? `${selectedZips.length} ZIP code${selectedZips.length === 1 ? "" : "s"} selected` : "No ZIP codes selected yet", [selectedZips]);
  const toggleZip = (zip: string) => {
    setSavedMessage("");
    setSelectedZips((current) => current.includes(zip) ? current.filter((value) => value !== zip) : [...current, zip].sort());
  };

  async function saveSettings() {
    if (!supabase || !workspaceId) return;
    setSaving(true);
    setSavedMessage("");
    setError("");
    const { error: updateError } = await supabase.from("workspaces").update({
      service_zip_codes: selectedZips,
      weekly_target_size: weeklyTarget,
      mail_from_name: sender.name.trim(),
      mail_from_address1: sender.address1.trim(),
      mail_from_address2: sender.address2.trim() || null,
      mail_from_city: sender.city.trim(),
      mail_from_state: sender.state.trim().toUpperCase(),
      mail_from_zip: sender.zip.trim(),
      mail_from_phone: sender.phone.trim(),
      mail_from_website: sender.website.trim() || null,
    }).eq("id", workspaceId);
    if (updateError) {
      setSaving(false);
      setError("Settings could not be saved. Please try again.");
      return;
    }
    try {
      const expansionResponse = await fetch("/api/this-week/expand", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ new_target: weeklyTarget }), cache: "no-store" });
      const expansionResult = await expansionResponse.json() as ExpansionResult & { error?: string };
      if (!expansionResponse.ok) {
        setError("Settings saved, but your weekly prospect list could not be updated. Please try again.");
        return;
      }
      setSavedMessage(buildSavedMessage(expansionResult));
    } catch {
      setError("Settings saved, but your weekly prospect list could not be updated. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!supabase) return <main className={loginStyles.page}><section className={loginStyles.card}><p className={loginStyles.kicker}>RESPONSEHVAC</p><h1>Settings need Supabase</h1><p className={loginStyles.intro}>Configure Supabase to save service-area settings for a contractor workspace.</p><button className={loginStyles.button} onClick={() => router.push("/dashboard")}>Back to This Week</button></section></main>;

  const sectionItems: { id: SettingsSection; label: string }[] = [
    { id: "service-area", label: "Service area" },
    { id: "weekly-capacity", label: "Weekly capacity" },
    { id: "business-mailing", label: "Business & mailing" },
  ];

  return <main className={styles.page}>
    <div className={styles.shell}>
      <header className={styles.topline}><button className={styles.backLink} type="button" onClick={() => router.push("/dashboard")}>← ResponseHVAC</button><span>Workspace settings</span></header>
      <section className={styles.header} aria-labelledby="settings-title"><h1 id="settings-title">Settings</h1><p className={styles.intro}>Manage your service area, weekly capacity, and business details.</p></section>
      <div className={styles.settingsLayout}>
        <nav className={styles.nav} aria-label="Settings sections">
          <p className={styles.navLabel}>Workspace</p>
          {sectionItems.map((item) => <button className={`${styles.navItem} ${activeSection === item.id ? styles.navItemActive : ""}`} type="button" key={item.id} onClick={() => setActiveSection(item.id)} aria-current={activeSection === item.id ? "page" : undefined}>{item.label}<span aria-hidden="true">→</span></button>)}
        </nav>
        <div className={styles.content}>
          <p className={styles.contentContext}>{sectionItems.find((item) => item.id === activeSection)?.label}</p>
          {loading ? <div className={styles.state} role="status">Loading workspace settings…</div> : <>
            {activeSection === "service-area" && <section className={styles.section} aria-labelledby="service-area-heading"><div className={styles.sectionHead}><div><h2 id="service-area-heading">Service area</h2><p>Choose the ZIP codes ResponseHVAC uses for your weekly list.</p></div><span className={styles.count} aria-live="polite">{selectionLabel}</span></div>{selectedZips.length > 0 && !editingTerritory ? <div className={styles.selectedZips} aria-label="Selected service ZIP codes">{selectedZips.map((zip) => <span className={styles.zipChip} key={zip}>{zip}</span>)}</div> : <div className={styles.zipGrid}>{supportedZips.map((zip) => <label className={`${styles.zipOption} ${selectedZips.includes(zip) ? styles.selected : ""}`} key={zip}><input type="checkbox" checked={selectedZips.includes(zip)} onChange={() => toggleZip(zip)} /><span>{zip}</span></label>)}</div>}<button className={styles.textButton} type="button" onClick={() => setEditingTerritory((current) => !current)}>{editingTerritory ? "Done editing" : "Edit service area"}</button><p className={styles.note}>Added ZIP codes take effect when you save. Removed ZIP codes won&apos;t affect this week&apos;s assignments.</p></section>}
            {activeSection === "weekly-capacity" && <section className={`${styles.section} ${styles.capacitySection}`} aria-labelledby="weekly-target-heading"><div className={styles.sectionHead}><div><h2 id="weekly-target-heading">Weekly capacity</h2><p>Set the maximum number of qualifying homes your team can work each week.</p></div></div><div className={styles.targetOptions} role="radiogroup" aria-labelledby="weekly-target-heading">{WEEKLY_TARGETS.map((target) => <label className={`${styles.targetOption} ${weeklyTarget === target ? styles.selected : ""}`} key={target}><input type="radio" name="weekly-target" value={target} checked={weeklyTarget === target} onChange={() => { setWeeklyTarget(target); setSavedMessage(""); }} /><i aria-hidden="true" /><strong>{target === 250 ? "250+" : target}</strong><span>{target === 250 ? "250+ homes" : "homes / week"}</span><small>{target === 50 ? "Focused" : target === 100 ? "Growing" : "High-volume"}</small></label>)}</div><p className={styles.note}>This is a working maximum, not a guaranteed number of opportunities.</p></section>}
            {activeSection === "business-mailing" && <section className={styles.section} aria-labelledby="sender-heading"><div className={styles.sectionHead}><div><h2 id="sender-heading">Business and mailing information</h2><p>These details are used as the return address when you send direct mail from ResponseHVAC.</p></div></div><div className={styles.form}><label><span>Business / sender name <b>*</b></span><input value={sender.name} onChange={(event) => setSender({ ...sender, name: event.target.value })} /></label><label><span>Address line 1 <b>*</b></span><input value={sender.address1} onChange={(event) => setSender({ ...sender, address1: event.target.value })} /></label><label><span>Address line 2</span><input value={sender.address2} onChange={(event) => setSender({ ...sender, address2: event.target.value })} /></label><div className={styles.formRow}><label><span>City <b>*</b></span><input value={sender.city} onChange={(event) => setSender({ ...sender, city: event.target.value })} /></label><label><span>State <b>*</b></span><input value={sender.state} maxLength={2} onChange={(event) => setSender({ ...sender, state: event.target.value.toUpperCase() })} /></label><label><span>ZIP <b>*</b></span><input value={sender.zip} onChange={(event) => setSender({ ...sender, zip: event.target.value })} /></label></div><label><span>Phone <b>*</b></span><input type="tel" value={sender.phone} onChange={(event) => setSender({ ...sender, phone: event.target.value })} /></label><label><span>Website</span><input type="url" value={sender.website} onChange={(event) => setSender({ ...sender, website: event.target.value })} placeholder="https://" /></label></div></section>}
            {error && <p className={styles.error} role="alert">{error}</p>}{savedMessage && <p className={styles.success} role="status">{savedMessage}</p>}
            <div className={styles.actions}><button className={styles.primary} type="button" onClick={saveSettings} disabled={saving}>{saving ? "Saving…" : "Save settings"}</button><button className={styles.secondary} type="button" onClick={() => router.push("/dashboard")}>Back to This Week</button></div>
          </>}
        </div>
      </div>
    </div>
  </main>;
}
