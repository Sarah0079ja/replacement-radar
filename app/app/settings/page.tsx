"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../lib/supabase-browser";
import styles from "../login/login.module.css";

const WEEKLY_TARGETS = [25, 50, 100] as const;

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
  if (result.reason === "NO_CURRENT_COHORT") return "Settings saved. New target applies when you open This Week.";
  if (result.reason === "NO_SERVICE_AREA") return "Settings saved. Add ZIP codes to your service area to generate prospects.";
  if ((result.newly_added || 0) > 0 && result.cohort?.pool_exhausted) {
    return `Settings saved. ${result.newly_added} new prospects added — that's all available in your area right now.`;
  }
  if ((result.newly_added || 0) > 0) return `Settings saved. ${result.newly_added} new prospects added to this week.`;
  return "Settings saved.";
}

export default function SettingsPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("Contractor workspace");
  const [supportedZips, setSupportedZips] = useState<string[]>([]);
  const [selectedZips, setSelectedZips] = useState<string[]>([]);
  const [weeklyTarget, setWeeklyTarget] = useState<number>(25);
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

      const [{ data: workspaceRow, error: workspaceError }, { data: opportunities, error: opportunityError }] = await Promise.all([
        supabase.from("workspaces").select("name,service_zip_codes,weekly_target_size,mail_from_name,mail_from_address1,mail_from_address2,mail_from_city,mail_from_state,mail_from_zip,mail_from_phone,mail_from_website").eq("id", workspace).single(),
        supabase.from("opportunities").select("property_zip"),
      ]);
      if (workspaceError || opportunityError || !workspaceRow) {
        setError("We could not load your service-area settings. Please try again.");
        setLoading(false);
        return;
      }

      const opportunityRows = (opportunities || []) as Array<{ property_zip: string | null }>;
      const zips = Array.from(new Set(opportunityRows.map((row) => row.property_zip).filter((zip): zip is string => Boolean(zip)))).sort();
      const configured = (workspaceRow.service_zip_codes || []).filter((zip: string) => zips.includes(zip));
      setWorkspaceId(workspace);
      setWorkspaceName(workspaceRow.name || "Contractor workspace");
      setSupportedZips(zips);
      setSelectedZips(configured);
      setWeeklyTarget(workspaceRow.weekly_target_size || 25);
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

  const selectionLabel = useMemo(() => {
    if (!selectedZips.length) return "No ZIP codes selected yet";
    return `${selectedZips.length} ZIP code${selectedZips.length === 1 ? "" : "s"} selected`;
  }, [selectedZips]);

  const toggleZip = (zip: string) => {
    setSavedMessage("");
    setSelectedZips((current) => current.includes(zip) ? current.filter((value) => value !== zip) : [...current, zip].sort());
  };

  const saveSettings = async () => {
    if (!supabase || !workspaceId) return;
    setSaving(true);
    setSavedMessage("");
    setError("");
    const { error: updateError } = await supabase
      .from("workspaces")
      .update({
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
      })
      .eq("id", workspaceId);
    setSaving(false);
    if (updateError) {
      setError("Settings could not be saved. Please try again.");
      setSaving(false);
      return;
    }
    try {
      const expansionResponse = await fetch("/api/this-week/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_target: weeklyTarget }),
        cache: "no-store",
      });
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
  };

  if (!supabase) {
    return <main className={styles.page}><section className={styles.card}><p className={styles.kicker}>REPLACEMENT RADAR</p><h1>Settings need Supabase</h1><p className={styles.intro}>Configure Supabase to save service-area settings for a contractor workspace.</p><button className={styles.button} onClick={() => router.push("/")}>Back to This Week</button></section></main>;
  }

  return (
    <main className="settings-page">
      <div className="settings-shell">
        <div className="settings-topline">
          <button className="settings-back" onClick={() => router.push("/")}>← Replacement Radar</button>
          <span>Dallas contractor workspace</span>
        </div>
        <section className="settings-header">
          <p className="eyebrow"><span className="eyebrow-dot" /> WORKSPACE SETTINGS</p>
          <h1>Set up your prospecting territory</h1>
          <p className="settings-intro">Tell us where {workspaceName} works and how many new homes your team wants to focus on each week.</p>
        </section>

        {loading ? <div className="settings-state">Loading workspace settings…</div> : (
          <>
            <section className="settings-section" aria-labelledby="service-area-heading">
              <div className="settings-section-heading">
                <div><h2 id="service-area-heading">Where do you work?</h2><p>Select the Dallas ZIP codes your company serves.</p></div>
                <span className="settings-count">{selectionLabel}</span>
              </div>
              <div className="zip-grid">
                {supportedZips.map((zip) => (
                  <label className={`zip-option ${selectedZips.includes(zip) ? "zip-option-selected" : ""}`} key={zip}>
                    <input type="checkbox" checked={selectedZips.includes(zip)} onChange={() => toggleZip(zip)} />
                    <span>{zip}</span>
                  </label>
                ))}
              </div>
              <p className="settings-note">Added ZIP codes take effect when you save. If your current list is below your target, new prospects from the added area will be included immediately. Removed ZIP codes won&apos;t affect this week&apos;s assignments.</p>
            </section>

            <section className="settings-section" aria-labelledby="weekly-target-heading">
              <div className="settings-section-heading"><div><h2 id="weekly-target-heading">Homes to work each week</h2><p>Choose how many new prospects you want in your weekly work list.</p></div></div>
              <div className="target-options">
                {WEEKLY_TARGETS.map((target) => (
                  <label className={`target-option ${weeklyTarget === target ? "target-option-selected" : ""}`} key={target}>
                    <input type="radio" name="weekly-target" value={target} checked={weeklyTarget === target} onChange={() => { setWeeklyTarget(target); setSavedMessage(""); }} />
                    <span><strong>{target}</strong><small>homes / week</small></span>
                  </label>
                ))}
              </div>
              <p className="settings-note">Increasing your target adds more prospects to this week. Decreasing it applies next Monday.</p>
            </section>

            <section className="settings-section" aria-labelledby="sender-heading">
              <div className="settings-section-heading"><div><h2 id="sender-heading">Return address for direct mail</h2><p>This address will appear as the return address on postcards you send. Use your business mailing address.</p></div></div>
              <div className="sender-form">
                <label><span>Business / sender name *</span><input value={sender.name} onChange={(event) => setSender({ ...sender, name: event.target.value })} /></label>
                <label><span>Address line 1 *</span><input value={sender.address1} onChange={(event) => setSender({ ...sender, address1: event.target.value })} /></label>
                <label><span>Address line 2</span><input value={sender.address2} onChange={(event) => setSender({ ...sender, address2: event.target.value })} /></label>
                <div className="sender-form-row"><label><span>City *</span><input value={sender.city} onChange={(event) => setSender({ ...sender, city: event.target.value })} /></label><label><span>State *</span><input value={sender.state} maxLength={2} onChange={(event) => setSender({ ...sender, state: event.target.value.toUpperCase() })} /></label><label><span>ZIP *</span><input value={sender.zip} onChange={(event) => setSender({ ...sender, zip: event.target.value })} /></label></div>
                <label><span>Phone *</span><input type="tel" value={sender.phone} onChange={(event) => setSender({ ...sender, phone: event.target.value })} /></label>
                <label><span>Website</span><input type="url" value={sender.website} onChange={(event) => setSender({ ...sender, website: event.target.value })} placeholder="https://" /></label>
              </div>
            </section>

            {error && <p className="settings-error" role="alert">{error}</p>}
            {savedMessage && <p className="settings-success" role="status">{savedMessage}</p>}
            <div className="settings-actions"><button className="primary-button" onClick={saveSettings} disabled={saving}>{saving ? "Saving…" : "Save settings"}</button><button className="secondary-button" onClick={() => router.push("/")}>Back to This Week</button></div>
          </>
        )}
      </div>
    </main>
  );
}
