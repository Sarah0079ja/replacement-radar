"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../lib/supabase-browser";
import styles from "./onboarding.module.css";

const WEEKLY_TARGETS = [50, 100, 250] as const;
type Step = 1 | 2 | 3;
type Direction = "forward" | "back";

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [step, setStep] = useState<Step>(1);
  const [direction, setDirection] = useState<Direction>("forward");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [supportedZips, setSupportedZips] = useState<string[]>([]);
  const [selectedZips, setSelectedZips] = useState<string[]>([]);
  const [editingTerritory, setEditingTerritory] = useState(false);
  const [weeklyTarget, setWeeklyTarget] = useState<number>(50);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const [{ data: membership }, coverageResponse] = await Promise.all([
        supabase.from("memberships").select("workspace_id,created_at").order("created_at", { ascending: true }).limit(1).maybeSingle(),
        fetch("/api/territory/coverage", { cache: "no-store" }),
      ]);
      if (!membership?.workspace_id) { setError("We could not find your contractor workspace."); setLoading(false); return; }
      const coverage = coverageResponse.ok ? await coverageResponse.json() as { zips?: string[] } : { zips: [] };
      const zips = coverage.zips || [];
      const { data: workspace, error: workspaceError } = await supabase.from("workspaces").select("name,service_zip_codes,weekly_target_size").eq("id", membership.workspace_id).single();
      if (workspaceError || !workspace) { setError("We could not load your setup. Please try again."); setLoading(false); return; }
      let handedOffZips: string[] = [];
      try { handedOffZips = JSON.parse(sessionStorage.getItem("rr_service_zips") || "[]") as string[]; } catch { handedOffZips = []; }
      const configured: string[] = Array.isArray(workspace.service_zip_codes) ? workspace.service_zip_codes as string[] : [];
      const carriedZips = handedOffZips.length ? handedOffZips : configured;
      setWorkspaceId(membership.workspace_id);
      setSupportedZips(zips);
      setSelectedZips([...new Set(carriedZips.filter((zip) => zips.includes(zip)))].sort());
      setEditingTerritory(!carriedZips.length);
      setWeeklyTarget(WEEKLY_TARGETS.includes(workspace.weekly_target_size) ? workspace.weekly_target_size : 50);
      setLoading(false);
    })();
  }, [supabase]);

  const stepLabel = useMemo(() => `Step ${step} of 3`, [step]);
  const move = (next: Step, nextDirection: Direction) => { setError(""); setDirection(nextDirection); setStep(next); };
  const toggleZip = (zip: string) => setSelectedZips((current) => current.includes(zip) ? current.filter((value) => value !== zip) : [...current, zip].sort());

  async function startTrial() {
    if (!supabase || !workspaceId) return;
    setError("");
    if (!selectedZips.length) { move(1, "back"); setEditingTerritory(true); setError("Choose at least one supported service ZIP to continue."); return; }
    setSaving(true);
    const { error: updateError } = await supabase.from("workspaces").update({ service_zip_codes: selectedZips, weekly_target_size: weeklyTarget }).eq("id", workspaceId);
    if (updateError) { setSaving(false); setError("We could not save your prospecting plan. Please try again."); return; }
    const completionResponse = await fetch("/api/onboarding/complete", { method: "POST" });
    if (!completionResponse.ok) { setSaving(false); setError("Your plan was saved, but we could not finish onboarding. Please try again."); return; }
    try { sessionStorage.removeItem("rr_service_zips"); } catch { /* optional handoff only */ }
    router.push("/checkout");
}
  if (!supabase) return <main className={styles.page}><section className={styles.shell}><p className={styles.kicker}>RESPONSEHVAC</p><h1>Build your prospecting plan</h1><p className={styles.copy}>Configure Supabase to continue onboarding a contractor workspace.</p></section></main>;

  return <main className={styles.page}><section className={styles.shell} aria-labelledby="onboarding-title">
    <header className={styles.header}><div className={styles.brand}><span className={styles.mark}>R</span><span>ResponseHVAC</span></div><span className={styles.stepLabel}>{stepLabel}</span></header>
    <div className={styles.progress} aria-label={`Onboarding progress: ${stepLabel}`}><span style={{ width: `${(step / 3) * 100}%` }} /></div>
    {loading ? <div className={styles.state}>Loading your setup…</div> : <div className={`${styles.step} ${direction === "forward" ? styles.forward : styles.back}`} key={step}>
      {step === 1 && <section className={styles.moment}><div className={styles.momentCopy}><p className={styles.kicker}>A GOOD PLACE TO START</p><h1 id="onboarding-title">We found your service area.</h1><p className={styles.copy}>ResponseHVAC will use these ZIP codes to build your prospect list.</p><div className={styles.areaResult}><span className={styles.resultIcon} aria-hidden="true">✓</span><div><strong>{selectedZips.length ? `${selectedZips.length} service area${selectedZips.length === 1 ? "" : "s"} ready` : "Choose a service area"}</strong><span>{selectedZips.length ? "ResponseHVAC can serve this area" : "Select at least one supported ZIP"}</span></div></div>{editingTerritory || !selectedZips.length ? <div className={styles.zipGrid}>{supportedZips.map((zip) => <label className={`${styles.zipOption} ${selectedZips.includes(zip) ? styles.selected : ""}`} key={zip}><input type="checkbox" checked={selectedZips.includes(zip)} onChange={() => toggleZip(zip)} /><span>{zip}</span></label>)}</div> : <div className={styles.selectedZips} aria-live="polite">{selectedZips.map((zip) => <span className={styles.zipChip} key={zip}>{zip}<small>Service area</small></span>)}</div>}{!supportedZips.length && <p className={styles.notice}>We could not load available service areas. Please refresh and try again.</p>}<button className={styles.editLink} type="button" onClick={() => setEditingTerritory((current) => !current)}>{editingTerritory ? "Done editing" : "Edit service area"}</button><div className={styles.actions}><button className={styles.primary} type="button" disabled={!selectedZips.length} onClick={() => move(2, "forward")}>Looks good <span aria-hidden="true">→</span></button></div></div><div className={styles.visual}><div className={styles.visualEyebrow}>YOUR WORKING AREA</div><div className={styles.mapCard}><div className={styles.mapLines} aria-hidden="true" /><div className={styles.mapPin}>R</div><div className={styles.mapLabel}>{selectedZips[0] || "Your ZIP"}<span>Ready to build your list</span></div></div></div></section>}
      {step === 2 && <section className={styles.moment}><div className={styles.momentCopy}><p className={styles.kicker}>MAKE IT FIT YOUR WEEK</p><h1 id="onboarding-title">How many homes can your team realistically work each week?</h1><p className={styles.copy}>We&apos;ll prioritize up to this many qualifying homes across your service area each week. It&apos;s a maximum, not a guarantee.</p><div className={styles.targetList} role="radiogroup" aria-label="Weekly capacity">{WEEKLY_TARGETS.map((target) => { const label = target === 50 ? "Focused" : target === 100 ? "Growing" : "High-volume"; const displayTarget = target === 250 ? "250+" : String(target); return <label className={`${styles.targetOption} ${weeklyTarget === target ? styles.selected : ""}`} key={target}><input type="radio" name="weekly-target" checked={weeklyTarget === target} onChange={() => setWeeklyTarget(target)} /><i aria-hidden="true">{weeklyTarget === target ? "Selected" : ""}</i><strong>{displayTarget}</strong><span>{target === 250 ? "250+ homes" : "homes"}</span><small>{label}</small></label>; })}</div><p className={styles.liveNote} aria-live="polite">We&apos;ll prioritize up to {weeklyTarget === 250 ? "250+" : weeklyTarget} qualifying homes across your service area each week.</p><div className={styles.actions}><button className={styles.secondary} type="button" onClick={() => move(1, "back")}>Back</button><button className={styles.primary} type="button" onClick={() => move(3, "forward")}>Continue <span aria-hidden="true">→</span></button></div></div><div className={styles.visual}><div className={styles.visualEyebrow}>YOUR WEEKLY RHYTHM</div><div className={styles.capacityPreview}><span className={styles.capacityNumber}>{weeklyTarget === 250 ? "250+" : weeklyTarget}</span><span>qualifying homes<br />prioritized each week</span><div className={styles.previewRule}><b style={{ width: `${weeklyTarget === 50 ? 34 : weeklyTarget === 100 ? 60 : 88}%` }} /></div></div></div></section>}
      {step === 3 && <section className={styles.momentReveal}><div className={styles.revealHead}><p className={styles.kicker}>BUILT FOR YOUR TEAM</p><h1 id="onboarding-title">Your ResponseHVAC plan is ready.</h1><p className={styles.copy}>You told us where you work and what your team can handle. Here&apos;s how we&apos;ll organize your prospecting.</p></div><div className={styles.planFacts}><div><strong>{selectedZips[0] || "Your service area"}</strong><span>Service area{selectedZips.length > 1 ? "s" : ""}{selectedZips.length > 1 ? ` · +${selectedZips.length - 1}` : ""}</span></div><div><strong>{weeklyTarget === 250 ? "250+" : weeklyTarget}</strong><span>Homes per week</span></div></div><div className={styles.workflow} aria-label="How ResponseHVAC works"><div><span className={styles.workflowIcon}>01</span><strong>We prioritize</strong><p>Strong qualifying opportunities</p></div><div><span className={styles.workflowIcon}>02</span><strong>You work</strong><p>The strongest homes first</p></div><div><span className={styles.workflowIcon}>03</span><strong>You track</strong><p>Contact → Appointment → Won</p></div></div><div className={styles.preview}><div className={styles.previewHeader}><strong>Your weekly list</strong><span>Example view</span></div><div className={styles.previewRow}><span className={styles.previewDot} /><div><strong>Priority opportunity</strong><span>HVAC and property evidence</span></div><b>This week</b></div><div className={styles.previewRow}><span className={styles.previewDot} /><div><strong>Qualifying home</strong><span>Ready for your team&apos;s review</span></div><b>Next</b></div></div><div className={styles.trialBlock}><div><strong>Your plan is ready. Start working it free for 5 days.</strong><span>$99/month after your trial · Card required</span></div><button className={styles.primary} type="button" onClick={startTrial} disabled={saving}>{saving ? "Saving plan…" : "Start my 5-day trial"}<span aria-hidden="true">→</span></button></div>{error && <p className={styles.error} role="alert">{error}</p>}<button className={styles.backButton} type="button" onClick={() => move(2, "back")} disabled={saving}>← Back</button></section>}
      {error && step !== 3 && <p className={styles.error} role="alert">{error}</p>}
    </div>}
  </section></main>;
}
