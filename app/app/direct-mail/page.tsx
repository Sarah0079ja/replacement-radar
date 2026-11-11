"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../lib/supabase-browser";

type OccupancyStatus = "LIKELY_OWNER_OCCUPIED" | "LIKELY_ABSENTEE" | null;
type Priority = "STRONG" | "MEDIUM" | "WEAK";

type CohortOpportunity = {
  id: string;
  parcel_id: string;
  address: string | null;
  property_city: string | null;
  property_zip: string | null;
  opportunity_strength: Priority;
  evidence_confidence: "HIGH" | "MEDIUM" | "LOW";
  year_built: number | null;
  permit_category: string | null;
  latest_permit_date: string | null;
  latest_permit_type: string | null;
  latest_permit_description: string | null;
  last_known_hvac_event_year: number | null;
  estimated_years_since_last_known_hvac_event: number | null;
  owner_name: string | null;
  owner_occupancy: OccupancyStatus;
  living_area_sqft: number | null;
};

type CohortMember = {
  id: string;
  rank_position: number;
  opportunity: CohortOpportunity;
};

type CohortResponse = {
  cohort: { actual_size: number; target_size: number; week_start: string } | null;
  members: CohortMember[];
  reason?: string;
};

type SenderSettings = {
  name: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  website: string | null;
};

type RecentMail = { created_at: string; status: string };

const RECENT_MAIL_STATUSES = ["PENDING", "SENDING", "MAILED", "IN_TRANSIT", "IN_LOCAL_AREA", "DELIVERED", "RETURNED"];

function priorityLabel(priority: Priority) {
  return priority === "STRONG" ? "HIGH PRIORITY" : priority === "MEDIUM" ? "MEDIUM PRIORITY" : "LOW PRIORITY";
}

function priorityTone(priority: Priority) {
  return priority === "STRONG" ? "high" : priority === "MEDIUM" ? "medium" : "low";
}

function hvacLabel(opportunity: CohortOpportunity) {
  if (opportunity.permit_category === "HVAC REPLACEMENT") return "Replacement";
  if (opportunity.permit_category === "HVAC INSTALLATION") return "Installation";
  if (opportunity.permit_category === "HVAC REPAIR") return "Repair";
  return opportunity.permit_category || "HVAC record";
}

function displayDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function usableOwnerName(value: string | null) {
  return Boolean(value?.trim() && !/WITHHELD|WTHLD/i.test(value));
}

function recipientName(opportunity: CohortOpportunity) {
  if (opportunity.owner_occupancy === "LIKELY_ABSENTEE") return "Current Resident";
  if (usableOwnerName(opportunity.owner_name)) return opportunity.owner_name!.trim();
  return "Current Resident";
}

function mailingIssue(opportunity: CohortOpportunity) {
  if (!opportunity.address?.trim()) return "Missing property address";
  if (!opportunity.property_city?.trim()) return "Missing property city";
  if (!opportunity.property_zip?.trim()) return "Missing property ZIP";
  return null;
}

function senderComplete(sender: SenderSettings | null) {
  return Boolean(sender?.name?.trim() && sender.address1?.trim() && sender.city?.trim() && sender.state?.trim() && sender.zip?.trim() && sender.phone?.trim());
}

function isRecentlyMailed(recent: RecentMail | undefined) {
  return Boolean(recent);
}

function DirectMailNav({ router, workspaceName }: { router: ReturnType<typeof useRouter>; workspaceName: string }) {
  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <div className="brand-mark" aria-hidden="true">R</div>
        <div><div className="brand-name">Replacement Radar</div><div className="brand-subtitle">HVAC sales intelligence</div></div>
      </div>
      <div className="workspace-label">WORKSPACE</div>
      <div className="workspace-switcher"><span className="workspace-dot" /> {workspaceName}</div>
      <nav aria-label="Primary navigation" className="primary-nav">
        <button className="nav-item" onClick={() => router.push("/")}>▸ This Week</button>
        <button className="nav-item" onClick={() => router.push("/?view=opportunities")}>≡ All Opportunities</button>
        <button className="nav-item nav-active" aria-current="page">✉ Direct Mail</button>
        <button className="nav-item" onClick={() => router.push("/settings")}>⚙ Settings</button>
      </nav>
      <div className="sidebar-bottom">
        <div className="coverage-note"><span className="status-dot" /> Dallas coverage active<div className="coverage-detail">City of Dallas parcel universe</div></div>
      </div>
    </aside>
  );
}

export default function DirectMailPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cohort, setCohort] = useState<CohortResponse["cohort"]>(null);
  const [members, setMembers] = useState<CohortMember[]>([]);
  const [reason, setReason] = useState<string | undefined>();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sender, setSender] = useState<SenderSettings | null>(null);
  const [workspaceName, setWorkspaceName] = useState("Dallas contractor workspace");
  const [recentMail, setRecentMail] = useState<Record<string, RecentMail>>({});

  const loadBuilder = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/this-week", { cache: "no-store" });
      const payload = await response.json() as CohortResponse & { error?: string };
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Weekly prospect list could not be loaded.");
      setCohort(payload.cohort);
      setMembers(payload.members || []);
      setReason(payload.reason);

      const { data: memberships, error: membershipError } = await supabase
        .from("memberships")
        .select("workspace_id,created_at")
        .order("created_at", { ascending: true })
        .order("workspace_id", { ascending: true });
      const workspaceId = memberships?.[0]?.workspace_id;
      if (membershipError || !workspaceId) throw new Error("We could not load your contractor workspace.");

      const { data: workspace, error: workspaceError } = await supabase
        .from("workspaces")
        .select("name,mail_from_name,mail_from_address1,mail_from_address2,mail_from_city,mail_from_state,mail_from_zip,mail_from_phone,mail_from_website")
        .eq("id", workspaceId)
        .single();
      if (workspaceError) throw new Error("We could not load your sender settings.");
      setWorkspaceName(workspace.name || "Dallas contractor workspace");
      setSender({
        name: workspace.mail_from_name,
        address1: workspace.mail_from_address1,
        address2: workspace.mail_from_address2,
        city: workspace.mail_from_city,
        state: workspace.mail_from_state,
        zip: workspace.mail_from_zip,
        phone: workspace.mail_from_phone,
        website: workspace.mail_from_website,
      });

      const ids = (payload.members || []).map((member) => member.opportunity.id);
      if (ids.length) {
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: mailed, error: mailedError } = await supabase
          .from("outreach_recipients")
          .select("opportunity_id,created_at,status")
          .in("opportunity_id", ids)
          .gte("created_at", cutoff)
          .in("status", RECENT_MAIL_STATUSES)
          .order("created_at", { ascending: false });
        if (mailedError) throw new Error("We could not check recent mailing activity.");
        const recent = Object.fromEntries((mailed || []).map((row: { opportunity_id: string; created_at: string; status: string }) => [row.opportunity_id, { created_at: row.created_at, status: row.status }]));
        setRecentMail(recent);
      } else {
        setRecentMail({});
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Direct Mail could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  const availableMembers = useMemo(() => members.filter((member) => !mailingIssue(member.opportunity)), [members]);
  const selectedMembers = useMemo(() => members.filter((member) => selectedIds.has(member.opportunity.id)), [members, selectedIds]);
  const senderIsComplete = senderComplete(sender);

  const openBuilder = () => {
    setBuilderOpen(true);
    void loadBuilder();
  };

  const selectByPriority = (allowed: Priority[]) => {
    setSelectedIds(new Set(availableMembers.filter((member) => allowed.includes(member.opportunity.opportunity_strength)).map((member) => member.opportunity.id)));
  };

  const toggleSelection = (opportunityId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(opportunityId)) next.delete(opportunityId);
      else next.add(opportunityId);
      return next;
    });
  };

  return (
    <div className="app-frame">
      {supabase && <DirectMailNav router={router} workspaceName={workspaceName} />}
      <main className="sheet">
        <header className="topbar">
          <div className="breadcrumbs"><span>Dallas</span><span className="breadcrumb-separator">/</span><strong>Direct Mail</strong></div>
          <div className="topbar-actions"><span className="refresh-note">M7 · targeted postcard workflow</span></div>
        </header>
        <div className="content">
          <section className="title-row direct-mail-title">
            <div><div className="eyebrow">OUTREACH WORKSPACE <span className="eyebrow-dot" /> PROPERTY ADDRESS MAILING</div><h1>Direct Mail</h1><p className="intro">Choose homes from this week’s list to prepare for a targeted postcard campaign.</p></div>
            {!builderOpen && supabase && <div className="title-actions"><button className="primary-button" onClick={openBuilder}>New Campaign <span aria-hidden="true">→</span></button></div>}
          </section>

          {!supabase ? (
            <div className="direct-mail-empty" role="status"><strong>Direct Mail requires a contractor workspace</strong><span>Connect Supabase and sign in to prepare postcards from a weekly prospect list.</span></div>
          ) : !builderOpen ? (
            <section className="direct-mail-empty" aria-labelledby="campaign-empty-heading"><p className="eyebrow">CAMPAIGNS</p><strong id="campaign-empty-heading">No campaigns yet</strong><span>Your first campaign will start with homes from the current weekly prospect list. Nothing is created until a later confirmed-send step.</span><button className="primary-button" onClick={openBuilder}>New Campaign <span aria-hidden="true">→</span></button></section>
          ) : (
            <section className="campaign-builder" aria-busy={loading}>
              <div className="builder-toolbar"><div><p className="eyebrow">NEW CAMPAIGN · CURRENT WEEK ONLY</p><h2>Choose homes to mail</h2><p>Select from the persisted This Week cohort. Selection stays on this device until postcard preview is available.</p></div><button className="secondary-button" onClick={() => { setBuilderOpen(false); setSelectedIds(new Set()); }}>Back to campaigns</button></div>

              {loading ? <div className="direct-mail-state" role="status">Loading this week’s prospects…</div> : error ? <div className="direct-mail-state direct-mail-error" role="alert"><strong>{error}</strong><button className="secondary-button" onClick={() => void loadBuilder()}>Try again</button></div> : reason === "NO_SERVICE_AREA" ? <div className="direct-mail-state" role="status"><strong>No service area configured</strong><span>Set up your territory before choosing homes for a mailing.</span><button className="secondary-button" onClick={() => router.push("/settings")}>Set up territory →</button></div> : !cohort ? <div className="direct-mail-state" role="status"><strong>No current weekly list</strong><span>Open This Week to generate the current prospect list before creating a mailing.</span><button className="secondary-button" onClick={() => router.push("/")}>Open This Week →</button></div> : (
                <>
                  {!senderIsComplete && <div className="sender-warning" role="status"><div><strong>Complete your return address before postcard preview.</strong><span>Direct Mail uses your business sender identity. You can still review and select homes now.</span></div><button className="secondary-button" onClick={() => router.push("/settings")}>Open Settings →</button></div>}
                  <div className="builder-summary"><div><span className="stat-label">SELECTED RECIPIENTS</span><strong>{selectedMembers.length}</strong></div><span>{members.length} homes in this week’s cohort</span></div>
                  <div className="quick-select" aria-label="Quick selection"><span className="filter-label">Quick select</span><button type="button" onClick={() => selectByPriority(["STRONG"])}>Strong only</button><button type="button" onClick={() => selectByPriority(["STRONG", "MEDIUM"])}>Strong + Medium</button><button type="button" onClick={() => setSelectedIds(new Set())}>Clear</button></div>
                  <div className="mailing-opportunity-list" aria-label="Current weekly opportunities">
                    {members.map((member) => {
                      const opportunity = member.opportunity;
                      const issue = mailingIssue(opportunity);
                      const recent = recentMail[opportunity.id];
                      const checked = selectedIds.has(opportunity.id);
                      return <label className={`mailing-opportunity ${checked ? "mailing-opportunity-selected" : ""} ${issue ? "mailing-opportunity-disabled" : ""}`} key={member.id}>
                        <input type="checkbox" checked={checked} disabled={Boolean(issue)} onChange={() => toggleSelection(opportunity.id)} />
                        <div className="mailing-opportunity-main"><div className="mailing-opportunity-heading"><strong>{opportunity.address || "Property address unavailable"}</strong><span className={`priority-label priority-${priorityTone(opportunity.opportunity_strength)}`}>{priorityLabel(opportunity.opportunity_strength)}</span></div><span className="mailing-opportunity-location">{opportunity.property_city || "City unavailable"}, TX {opportunity.property_zip || "ZIP unavailable"}</span><span className="mailing-opportunity-context">{opportunity.latest_permit_date ? `${displayDate(opportunity.latest_permit_date)} · ${hvacLabel(opportunity)}` : "No recorded HVAC event"}{opportunity.year_built ? ` · Built ${opportunity.year_built}` : ""}</span>{issue ? <span className="mailing-availability">{issue}</span> : recent && <span className="recent-mail-warning">Mailed recently · {displayDate(recent.created_at)}</span>}</div>
                      </label>;
                    })}
                  </div>
                  <section className="recipient-review" aria-labelledby="recipient-review-heading"><div className="recipient-review-heading"><div><p className="eyebrow">REVIEW</p><h3 id="recipient-review-heading">Selected recipients: {selectedMembers.length}</h3></div><span>Physical property address only</span></div>{selectedMembers.length ? <div className="recipient-review-list">{selectedMembers.map((member) => { const opportunity = member.opportunity; const recent = recentMail[opportunity.id]; return <div className="recipient-review-row" key={member.id}><div><strong>{recipientName(opportunity)}</strong><span>{opportunity.address}, {opportunity.property_city}, TX {opportunity.property_zip}</span></div><div className="recipient-review-meta"><span className={`priority-label priority-${priorityTone(opportunity.opportunity_strength)}`}>{priorityLabel(opportunity.opportunity_strength)}</span>{isRecentlyMailed(recent) && <span className="recent-mail-warning">Mailed recently</span>}</div></div>; })}</div> : <p className="recipient-review-empty">Select homes above to review the intended recipients.</p>}</section>
                  <div className="builder-next-step"><div><strong>Postcard preview comes next</strong><span>Selection and recipient review are ready for M7-2. No campaign or recipient records have been created.</span></div><button className="primary-button" disabled={!senderIsComplete || selectedMembers.length === 0}>Continue to postcard <span aria-hidden="true">→</span></button></div>
                </>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
