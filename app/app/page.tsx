"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "./lib/supabase-browser";
import properties from "./data/properties.json";

type Property = (typeof properties)[number];
type OccupancyStatus = "LIKELY_OWNER_OCCUPIED" | "LIKELY_ABSENTEE" | null;
type Status = "NEW" | "CONTACTED" | "APPOINTMENT" | "WON" | "NOT INTERESTED";
type Note = { id: string; body: string };
type View = "this-week" | "opportunities" | "map";
type WeekFilter = "ALL" | "TODO" | "WORKED";

type CohortOpportunity = {
  id: string;
  parcel_id: string;
  address: string;
  property_city: string | null;
  property_zip: string | null;
  property_type: string | null;
  opportunity_strength: "STRONG" | "MEDIUM" | "WEAK";
  evidence_confidence: "HIGH" | "MEDIUM" | "LOW";
  year_built: number | null;
  permit_category: string | null;
  latest_permit_date: string | null;
  latest_permit_type: string | null;
  latest_permit_description: string | null;
  last_known_hvac_event_year: number | null;
  estimated_years_since_last_known_hvac_event: number | null;
  reasons: unknown;
  owner_name: string | null;
  owner_mailing_address: string | null;
  living_area_sqft: number | null;
  owner_occupancy: OccupancyStatus;
  coverage_state: string;
};

type CohortMember = {
  id: string;
  opportunity_id: string;
  rank_position: number;
  added_at: string;
  opportunity: CohortOpportunity;
};

type CohortResponse = {
  cohort: {
    id: string;
    workspace_id: string;
    week_start: string;
    target_size: number;
    actual_size: number;
    pool_exhausted: boolean;
    generated_at: string;
  } | null;
  members: CohortMember[];
  reason?: string;
};

const CURRENT_YEAR = 2026;
const SHOW_OWNER_DETAILS = process.env.NEXT_PUBLIC_SHOW_OWNER_DETAILS !== "false";
const statuses: Status[] = ["NEW", "CONTACTED", "APPOINTMENT", "WON", "NOT INTERESTED"];
const categoryLabels: Record<string, string> = {
  "HVAC REPLACEMENT": "HVAC replacement",
  "HVAC INSTALLATION": "HVAC installation",
  "HVAC REPAIR": "HVAC repair",
  "AMBIGUOUS HVAC SIGNAL": "Ambiguous HVAC",
  "AMBIGUOUS MECHANICAL SIGNAL": "Ambiguous mechanical",
  "NON-HVAC MECHANICAL": "Non-HVAC mechanical",
  "NO RELEVANT PERMIT FOUND": "No HVAC event found",
};

type EnrichedProperty = Property & {
  owner_name?: string | null;
  owner_mailing_address?: string | null;
  living_area_sqft?: number | null;
  owner_occupancy?: OccupancyStatus;
  same_street_hvac_since_2021?: number;
  peers_with_newer_hvac_event?: number;
};

function isWithheld(value: string | null | undefined) {
  return Boolean(value && /WITHHELD|WTHLD/i.test(value));
}

function safeOwnerValue(value: string | null | undefined, fallback: string) {
  if (isWithheld(value)) return "Withheld by DCAD";
  return value || fallback;
}

function safeOccupancy(property: EnrichedProperty): OccupancyStatus {
  if (isWithheld(property.owner_name) || isWithheld(property.owner_mailing_address)) return null;
  return property.owner_occupancy ?? null;
}

function priorityLabel(strength: Property["opportunity_strength"]) {
  return strength === "STRONG" ? "HIGH PRIORITY" : strength === "MEDIUM" ? "MEDIUM PRIORITY" : "LOW PRIORITY";
}

function priorityTone(strength: Property["opportunity_strength"]) {
  return strength === "STRONG" ? "high" : strength === "MEDIUM" ? "medium" : "low";
}

function formatPermitDate(value: string | null | undefined) {
  if (!value) return "Date unavailable";
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return value;
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(year, Number(match[1]) - 1, Number(match[2])));
}

function formatElapsedYears(years: number | null | undefined) {
  if (years === null || years === undefined) return "Elapsed time unavailable";
  if (years < 1) return "Less than 1 year ago";
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

function hvacEventLabel(property: Property) {
  if (property.permit_category === "HVAC INSTALLATION") return "Installation";
  if (property.permit_category === "HVAC REPLACEMENT") return "Replacement";
  return categoryLabels[property.permit_category] || "HVAC record";
}

function propertyCity(property: Property) {
  return (property as Property & { property_city?: string | null }).property_city || property.city || "Unknown city";
}

function contractorSummary(property: Property) {
  const clauses: string[] = [];
  if (property.year_built && property.year_built < 2000) clauses.push(`Older Dallas home built ${property.year_built}`);
  else if (property.year_built) clauses.push(`Dallas home built ${property.year_built}`);
  if (property.last_known_hvac_event_year) clauses.push(`with a recorded HVAC ${hvacEventLabel(property).toLowerCase()} from ${property.last_known_hvac_event_year}`);
  else clauses.push("with no recorded HVAC replacement permit in supported Dallas records since 2018");
  const streetActivity = (property as EnrichedProperty).same_street_hvac_since_2021 ?? 0;
  if (streetActivity > 0) clauses.push("and recent HVAC activity on the same street");
  return `${clauses.join(" ")}.`;
}

const demoRows = properties as Property[];

function EvidenceTag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "verified" | "inference" | "unknown" | "neutral" }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "C";
}

function cohortProperty(member: CohortMember): Property {
  // The weekly API intentionally returns a contractor-safe projection rather
  // than a full opportunity row. Add only the compatibility aliases needed by
  // the existing presentation components; never reconstruct internal score data.
  return { ...member.opportunity, city: member.opportunity.property_city || "DALLAS", property_zip: member.opportunity.property_zip || "", property_type: member.opportunity.property_type || "" } as unknown as Property;
}

function formatWeekRange(weekStart: string) {
  const start = new Date(`${weekStart}T12:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  const startLabel = monthDay.format(start);
  const endLabel = monthDay.format(end);
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${startLabel}–${end.getDate()}, ${end.getFullYear()}`;
  }
  if (start.getFullYear() === end.getFullYear()) {
    return `${startLabel}–${endLabel}, ${end.getFullYear()}`;
  }
  const fullDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${fullDate.format(start)}–${fullDate.format(end)}`;
}

function downloadCsv(rows: Property[], statusFor: (parcel: string) => Status) {
  const headers = [
    "address", "city", "property_zip", "priority", "last_hvac_record_date", "hvac_record_type",
    "event_year", "years_since_event", "year_built", "living_area_sqft",
    "owner_name", "owner_mailing_address", "owner_occupancy",
    "same_street_hvac_since_2021", "lead_status",
  ];
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      [
        row.address, row.city, row.property_zip, priorityLabel(row.opportunity_strength), row.latest_permit_date,
        hvacEventLabel(row), row.last_known_hvac_event_year,
        row.estimated_years_since_last_known_hvac_event,
        row.year_built, (row as EnrichedProperty).living_area_sqft ?? "",
        SHOW_OWNER_DETAILS ? safeOwnerValue((row as EnrichedProperty).owner_name, "") : "",
        SHOW_OWNER_DETAILS ? safeOwnerValue((row as EnrichedProperty).owner_mailing_address, "") : "",
        safeOccupancy(row as EnrichedProperty) ?? "", (row as EnrichedProperty).same_street_hvac_since_2021 ?? 0,
        statusFor(row.parcel_id),
      ]
        .map((value) => JSON.stringify(value ?? ""))
        .join(",")
    ),
  ].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "hvac-replacement-radar-dallas.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function MobileProspectCard({ property, status, onOpen, variant = "default" }: { property: Property; status: Status; onOpen: () => void; variant?: "default" | "weekly" }) {
  const enriched = property as EnrichedProperty;
  const occupancy = safeOccupancy(enriched);
  const streetActivity = enriched.same_street_hvac_since_2021 ?? 0;
  const statusClass = `status-${status.toLowerCase().replaceAll(" ", "-")}`;

  if (variant === "weekly") {
    return (
      <button type="button" className={`mobile-prospect-card weekly-compact-card ${statusClass}`} onClick={onOpen}>
        <div className="weekly-compact-top">
          <div className="mobile-card-property">
            <strong>{property.address}</strong>
            <span>{propertyCity(property)}, TX {property.property_zip}</span>
          </div>
          <div className="weekly-compact-badges">
            <span className={`priority-label priority-${priorityTone(property.opportunity_strength)}`}>{priorityLabel(property.opportunity_strength)}</span>
            <span className="status-label">{status}</span>
          </div>
        </div>
        <div className="weekly-compact-hvac">
          <span className="mobile-card-label">Last HVAC</span>
          <strong>{property.latest_permit_date ? `${formatPermitDate(property.latest_permit_date)} · ${formatElapsedYears(property.estimated_years_since_last_known_hvac_event).replace(" ago", "")}` : "No recorded event"}</strong>
          <small>{property.latest_permit_date ? hvacEventLabel(property) : "Current system unknown"}</small>
        </div>
        <div className="weekly-compact-context">Built {property.year_built || "Unknown"} · {enriched.living_area_sqft ? `${enriched.living_area_sqft.toLocaleString()} sq ft` : "Size unavailable"}</div>
        <span className="mobile-card-action">View property <span aria-hidden="true">→</span></span>
      </button>
    );
  }

  return (
    <button type="button" className={`mobile-prospect-card ${statusClass}`} onClick={onOpen}>
      <div className="mobile-card-header">
        <div className="mobile-card-property">
          <strong>{property.address}</strong>
          <span>{propertyCity(property)}, TX {property.property_zip}</span>
        </div>
        <span className={`priority-label priority-${priorityTone(property.opportunity_strength)}`}>{priorityLabel(property.opportunity_strength)}</span>
      </div>
      <div className="mobile-card-meta"><span className="status-label">{status}</span></div>
      <div className="mobile-card-section mobile-card-hvac">
        <span className="mobile-card-label">Last HVAC record</span>
        {property.latest_permit_date ? (
          <>
            <strong>{formatPermitDate(property.latest_permit_date)} <span>· {formatElapsedYears(property.estimated_years_since_last_known_hvac_event)}</span></strong>
            <small>{hvacEventLabel(property)}</small>
          </>
        ) : (
          <>
            <strong>No recorded event</strong>
            <small>Since 2018 coverage start · Current system unknown</small>
          </>
        )}
      </div>
      <div className="mobile-card-context">
        <div className="mobile-card-section">
          <span className="mobile-card-label">Home</span>
          <strong>{enriched.living_area_sqft ? `${enriched.living_area_sqft.toLocaleString()} sq ft` : "Size unavailable"}</strong>
          <small>Built {property.year_built || "Unknown"}</small>
        </div>
        <div className="mobile-card-section">
          <span className="mobile-card-label">Owner</span>
          <strong>{SHOW_OWNER_DETAILS ? safeOwnerValue(enriched.owner_name, "Owner unavailable") : "Owner details hidden"}</strong>
          <small>{occupancy === "LIKELY_OWNER_OCCUPIED" ? "Likely owner occupied" : occupancy === "LIKELY_ABSENTEE" ? "Likely absentee owner" : "Occupancy unknown"}{occupancy && <em> · Inferred</em>}</small>
        </div>
      </div>
      <div className="mobile-card-local">
        <span className="mobile-card-label">Local activity</span>
        <strong>{streetActivity > 0 ? `${streetActivity} HVAC ${streetActivity === 1 ? "record" : "records"} on this street since 2021` : "No local signal recorded"}</strong>
      </div>
      <span className="mobile-card-action">View property <span aria-hidden="true">→</span></span>
    </button>
  );
}

function WeeklySkeleton() {
  return (
    <div className="weekly-skeleton-list" aria-label="Loading weekly prospects">
      {[1, 2, 3, 4].map((item) => <div className="weekly-skeleton-row" key={item}><span /><span /><span /><span /></div>)}
    </div>
  );
}

function ThisWeekView({
  cohort,
  members,
  reason,
  loading,
  error,
  filter,
  onFilter,
  onRetry,
  onSettings,
  onSignIn,
  statusFor,
  onOpen,
  onStatus,
  pipelineCounts,
}: {
  cohort: CohortResponse["cohort"];
  members: CohortMember[];
  reason?: string;
  loading: boolean;
  error: string;
  filter: WeekFilter;
  onFilter: (filter: WeekFilter) => void;
  onRetry: () => void;
  onSettings: () => void;
  onSignIn: () => void;
  statusFor: (parcel: string) => Status;
  onOpen: (property: Property) => void;
  onStatus: (property: Property, status: Status) => void;
  pipelineCounts: Record<Status, number>;
}) {
  const MOBILE_PAGE_SIZE = 5;
  const [mobilePage, setMobilePage] = useState(1);
  const membersWithProperties = members.map((member) => ({ member, property: cohortProperty(member) }));
  const remaining = membersWithProperties.filter(({ property }) => statusFor(property.parcel_id) === "NEW").length;
  const filteredMembers = membersWithProperties.filter(({ property }) => {
    const status = statusFor(property.parcel_id);
    return filter === "ALL" || (filter === "TODO" && status === "NEW") || (filter === "WORKED" && status !== "NEW");
  });
  const workedCount = membersWithProperties.length - remaining;
  const mobilePageCount = Math.max(1, Math.ceil(filteredMembers.length / MOBILE_PAGE_SIZE));
  const currentMobilePage = Math.min(mobilePage, mobilePageCount);
  const mobileStart = (currentMobilePage - 1) * MOBILE_PAGE_SIZE;
  const mobileMembers = filteredMembers.slice(mobileStart, mobileStart + MOBILE_PAGE_SIZE);
  const mobileRangeStart = filteredMembers.length ? mobileStart + 1 : 0;
  const mobileRangeEnd = Math.min(mobileStart + MOBILE_PAGE_SIZE, filteredMembers.length);

  return (
    <section className="this-week-view" aria-labelledby="this-week-heading" aria-busy={loading}>
      <div className="title-row weekly-title-row">
        <div>
          <div className="eyebrow">SUPPORTED TERRITORY <span className="eyebrow-dot" /> DALLAS, TX</div>
          <h1 id="this-week-heading">This Week{cohort ? ` · ${formatWeekRange(cohort.week_start)}` : ""}</h1>
          <p className="intro">Your weekly prospect list. Work through these before next Monday.</p>
        </div>
      </div>

      {loading ? (
        <>
          <div className="weekly-progress-strip weekly-loading-strip" aria-label="Loading weekly progress"><span /><span /><span /><span /><span /></div>
          <WeeklySkeleton />
        </>
      ) : error ? (
        <div className="weekly-state weekly-error" role="alert">
          <strong>{error}</strong>
          <button className="primary-button" onClick={error.includes("session") ? onSignIn : onRetry}>{error.includes("session") ? "Sign in" : "Try again"}</button>
        </div>
      ) : reason === "NO_SERVICE_AREA" ? (
        <div className="weekly-state" role="status">
          <strong>No service area configured</strong>
          <span>Before we can generate your weekly prospect list, tell us where your team works.</span>
          <button className="primary-button" onClick={onSettings}>Set up your territory <span aria-hidden="true">→</span></button>
        </div>
      ) : cohort && cohort.actual_size === 0 && cohort.pool_exhausted ? (
        <div className="weekly-state" role="status">
          <strong>All available prospects have been assigned</strong>
          <span>Your service area has no new eligible properties remaining. Every qualifying home in your selected ZIPs has appeared in a previous weekly list.</span>
          <button className="secondary-button" onClick={onSettings}>Update service area <span aria-hidden="true">→</span></button>
        </div>
      ) : cohort ? (
        <>
          <section className="weekly-progress-strip" aria-label="This week's progress">
            <div><span>PROSPECTS THIS WEEK</span><strong>{cohort.actual_size}</strong></div>
            <div><span>REMAINING</span><strong>{remaining}</strong></div>
            <div><span>CONTACTED <em>pipeline total</em></span><strong>{pipelineCounts.CONTACTED}</strong></div>
            <div><span>APPOINTMENTS <em>pipeline total</em></span><strong>{pipelineCounts.APPOINTMENT}</strong></div>
            <div><span>WON <em>pipeline total</em></span><strong>{pipelineCounts.WON}</strong></div>
          </section>
          {cohort.pool_exhausted && cohort.actual_size > 0 && cohort.actual_size < cohort.target_size && (
            <div className="weekly-shortage" role="status"><div><strong>{cohort.actual_size} of {cohort.target_size} targets available</strong><span>Your service area has {cohort.actual_size} new eligible properties. Consider adding ZIP codes to reach your full target.</span></div><button className="secondary-button" onClick={onSettings}>Update service area</button></div>
          )}
          <div className="weekly-filter-bar" aria-label="Weekly prospect filters">
            {([[
              "ALL", `All ${members.length}`
            ], [
              "TODO", `To Do ${remaining}`
            ], [
              "WORKED", `Worked ${workedCount}`
            ]] as Array<[WeekFilter, string]>).map(([value, label]) => (
              <button key={value} type="button" className={filter === value ? "weekly-filter-active" : ""} aria-pressed={filter === value} onClick={() => { onFilter(value); setMobilePage(1); }}>{label}</button>
            ))}
          </div>
          <div className="weekly-table-wrap">
            <table className="weekly-table">
              <thead><tr><th>Property</th><th>Priority</th><th>Last HVAC record</th><th>Home</th><th>Status</th><th aria-label="Details" /></tr></thead>
              <tbody>
                {filteredMembers.map(({ member, property }) => {
                  const status = statusFor(property.parcel_id);
                  return <tr key={member.id} className={`weekly-row status-${status.toLowerCase().replaceAll(" ", "-")}`} onClick={() => onOpen(property)}>
                    <td><div className="address">{property.address}</div><div className="subline">{propertyCity(property)}, TX {property.property_zip}</div></td>
                    <td><span className={`priority-label priority-${priorityTone(property.opportunity_strength)}`}>{priorityLabel(property.opportunity_strength)}</span></td>
                    <td className="hvac-record-cell">{property.latest_permit_date ? <><strong>{formatPermitDate(property.latest_permit_date)}</strong><span>{formatElapsedYears(property.estimated_years_since_last_known_hvac_event)}</span><small>{hvacEventLabel(property)}</small></> : <><strong>No recorded event</strong><span>Since 2018 coverage start</span><small>Current system unknown</small></>}</td>
                    <td className="home-context-cell"><strong>{(property as EnrichedProperty).living_area_sqft ? `${(property as EnrichedProperty).living_area_sqft?.toLocaleString()} sq ft` : "Size unavailable"}</strong><span>Built {property.year_built || "Unknown"}</span></td>
                    <td><select aria-label={`Status for ${property.address}`} value={status} onClick={(event) => event.stopPropagation()} onChange={(event) => onStatus(property, event.target.value as Status)}>{statuses.map((value) => <option key={value}>{value}</option>)}</select></td>
                    <td><button className="row-arrow" aria-label={`Open ${property.address}`} onClick={(event) => { event.stopPropagation(); onOpen(property); }}>→</button></td>
                  </tr>;
                })}
              </tbody>
            </table>
            {filteredMembers.length > 0 && <div className="weekly-mobile-range">Showing {mobileRangeStart}–{mobileRangeEnd} of {filteredMembers.length}</div>}
            <div className="weekly-mobile-list" aria-label="Mobile weekly prospect list">
              {mobileMembers.map(({ member, property }) => <MobileProspectCard key={member.id} property={property} status={statusFor(property.parcel_id)} variant="weekly" onOpen={() => onOpen(property)} />)}
            </div>
            {filteredMembers.length > MOBILE_PAGE_SIZE && <div className="weekly-mobile-pagination" aria-label="Weekly prospect pagination">
              <button type="button" aria-label="Previous prospects" disabled={currentMobilePage === 1} onClick={() => setMobilePage((page) => Math.max(1, page - 1))}>← Previous</button>
              <span>Page {currentMobilePage} of {mobilePageCount}</span>
              <button type="button" aria-label="Next prospects" disabled={currentMobilePage === mobilePageCount} onClick={() => setMobilePage((page) => Math.min(mobilePageCount, page + 1))}>Next →</button>
            </div>}
            {filteredMembers.length === 0 && <div className="empty-state"><strong>No homes in this view.</strong><span>Use All or To Do to see the rest of this week&apos;s list.</span></div>}
          </div>
        </>
      ) : null}
    </section>
  );
}

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = getSupabaseBrowserClient();
  const requestedView = searchParams.get("view");
  const [view, setView] = useState<View>(() => supabase && requestedView === "opportunities" ? "opportunities" : supabase ? "this-week" : "opportunities");
  const [query, setQuery] = useState("");
  const [opportunityStrength, setOpportunityStrength] = useState("ALL");
  const [confidence, setConfidence] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [occupancyFilter, setOccupancyFilter] = useState("ALL");
  const [hvacAgeFilter, setHvacAgeFilter] = useState("ALL");
  const [localActivityFilter, setLocalActivityFilter] = useState("ALL");
  const [propertyTypeFilter, setPropertyTypeFilter] = useState("ALL");
  const [selected, setSelected] = useState<Property | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [opportunityRows, setOpportunityRows] = useState<Property[]>(supabase ? [] : demoRows);
  const [loadingOpportunities, setLoadingOpportunities] = useState(Boolean(supabase));
  const [opportunityError, setOpportunityError] = useState("");
  const [leadStatuses, setLeadStatuses] = useState<Record<string, Status>>(() =>
    !supabase && typeof window !== "undefined"
      ? JSON.parse(localStorage.getItem("radar-lead-statuses") || "{}")
      : {}
  );
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("Contractor workspace");
  const [userInitials, setUserInitials] = useState("C");
  const [opportunityIds, setOpportunityIds] = useState<Record<string, string>>({});
  const [writeError, setWriteError] = useState("");
  const [cohort, setCohort] = useState<CohortResponse["cohort"]>(null);
  const [cohortMembers, setCohortMembers] = useState<CohortMember[]>([]);
  const [cohortReason, setCohortReason] = useState<string | undefined>();
  const [cohortLoading, setCohortLoading] = useState(Boolean(supabase));
  const [cohortError, setCohortError] = useState("");
  const [weekFilter, setWeekFilter] = useState<WeekFilter>("ALL");

  const statusFor = useCallback((parcel: string) => leadStatuses[parcel] || "NEW", [leadStatuses]);

  // Whether any properties have been enriched with occupancy data
  const hasOccupancyData = useMemo(
    () => opportunityRows.some((p) => (p as Property & { owner_occupancy?: string | null }).owner_occupancy),
    [opportunityRows]
  );

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const identity = user?.user_metadata?.user_name || user?.email || "Contractor";
      setUserInitials(initials(identity));
      const { data: opps, error } = await supabase.from("opportunities").select("*").order("score", { ascending: false });
      setLoadingOpportunities(false);
      if (error) {
        setOpportunityError("We could not load the Dallas opportunity data. Check your Supabase connection and try again.");
        return;
      }
      setOpportunityRows((opps || []) as Property[]);
      const { data: memberships } = await supabase.from("memberships").select("workspace_id").order("created_at", { ascending: true }).order("workspace_id", { ascending: true }).limit(1);
      const workspace = memberships?.[0]?.workspace_id;
      if (!workspace) return;
      setWorkspaceId(workspace);
      const { data: workspaceRow } = await supabase.from("workspaces").select("name").eq("id", workspace).single();
      if (workspaceRow?.name) setWorkspaceName(workspaceRow.name);
      const idsByParcel = Object.fromEntries((opps || []).map((row: { parcel_id: string; id: string }) => [row.parcel_id, row.id]));
      setOpportunityIds(idsByParcel);
      const { data: activity } = await supabase.from("lead_activity").select("opportunity_id,status").eq("workspace_id", workspace);
      const parcelById = Object.fromEntries(Object.entries(idsByParcel).map(([parcel, id]) => [id, parcel]));
      const activityByParcel = Object.fromEntries((activity || []).map((row: { opportunity_id: string; status: Status }) => [parcelById[row.opportunity_id], row.status]));
      if (Object.keys(activityByParcel).length) setLeadStatuses((current) => ({ ...current, ...activityByParcel }));
    })();
  }, [supabase]);

  const loadCohort = useCallback(async () => {
    if (!supabase) {
      setCohortLoading(false);
      return;
    }
    setCohortLoading(true);
    setCohortError("");
    try {
      const response = await fetch("/api/this-week", { cache: "no-store" });
      const payload = await response.json() as CohortResponse & { error?: string };
      if (response.status === 401) {
        setCohortError("Your session has expired. Please sign in again.");
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Weekly prospect list could not be loaded.");
      setCohort(payload.cohort);
      setCohortMembers(payload.members || []);
      setCohortReason(payload.reason);
      const extraIds = Object.fromEntries((payload.members || []).map((member) => [member.opportunity.parcel_id, member.opportunity.id]));
      setOpportunityIds((previous) => ({ ...previous, ...extraIds }));
    } catch {
      setCohortError("Your weekly prospect list could not be loaded.");
    } finally {
      setCohortLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    (async () => { await loadCohort(); })();
  }, [loadCohort]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    (async () => {
      if (supabase && workspaceId && opportunityIds[selected.parcel_id]) {
        const { data, error } = await supabase.from("lead_notes").select("id,body,created_at").eq("workspace_id", workspaceId).eq("opportunity_id", opportunityIds[selected.parcel_id]).order("created_at", { ascending: false });
        if (error) { setWriteError("We could not load private notes."); return; }
        if (active) setNotes((data || []).map((row: { id: string; body: string }) => ({ id: row.id, body: row.body })));
      } else {
        await Promise.resolve();
        if (active) {
          const local = JSON.parse(localStorage.getItem(`radar-notes-${selected.parcel_id}`) || "[]");
          setNotes(local.map((note: string | Note, index: number) => typeof note === "string" ? { id: `local-${index}-${note}`, body: note } : note));
        }
      }
    })();
    return () => { active = false; };
  }, [selected, supabase, workspaceId, opportunityIds]);

  const setStatus = async (property: Property, status: Status) => {
    setWriteError("");
    const next = { ...leadStatuses, [property.parcel_id]: status };
    if (supabase) {
      if (!workspaceId || !opportunityIds[property.parcel_id]) {
        setSelected(property);
        setWriteError("This workspace is not ready for lead updates yet.");
        return;
      }
      const { error } = await supabase.from("lead_activity").upsert(
        { workspace_id: workspaceId, opportunity_id: opportunityIds[property.parcel_id], status, status_changed_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { onConflict: "workspace_id,opportunity_id" }
      );
      if (error) { setSelected(property); setWriteError("Status could not be saved. Please try again."); return; }
    } else {
      localStorage.setItem("radar-lead-statuses", JSON.stringify(next));
    }
    setLeadStatuses(next);
  };

  const addNote = async () => {
    if (!selected || !noteDraft.trim()) return;
    setWriteError("");
    const text = noteDraft.trim();
    if (supabase) {
      if (!workspaceId || !opportunityIds[selected.parcel_id]) { setWriteError("This workspace is not ready for notes yet."); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setWriteError("Your session expired. Please sign in again."); return; }
      const { data, error } = await supabase.from("lead_notes").insert({ workspace_id: workspaceId, opportunity_id: opportunityIds[selected.parcel_id], user_id: user.id, body: text }).select("id,body").single();
      if (error || !data) { setWriteError("Note could not be saved. Please try again."); return; }
      setNotes((current) => [{ id: data.id, body: data.body }, ...current]);
    } else {
      const key = `radar-notes-${selected.parcel_id}`;
      const next = [
        { id: `local-${Date.now()}`, body: text },
        ...JSON.parse(localStorage.getItem(key) || "[]").map((note: string | Note, index: number) =>
          typeof note === "string" ? { id: `local-${index}-${note}`, body: note } : note
        ),
      ];
      localStorage.setItem(key, JSON.stringify(next));
      setNotes(next);
    }
    setNoteDraft("");
  };

  const logout = async () => {
    if (supabase) await supabase.auth.signOut();
    router.push("/login");
  };

  const filtered = useMemo(
    () =>
      opportunityRows.filter((property) => {
        const haystack = `${property.address} ${propertyCity(property)} ${property.property_zip} ${property.parcel_id}`.toLowerCase();
        const p = property as EnrichedProperty;
        const occupancy = safeOccupancy(p);
        const occupancyMatch =
          occupancyFilter === "ALL" ||
          (occupancyFilter === "LIKELY_OWNER_OCCUPIED" && occupancy === "LIKELY_OWNER_OCCUPIED") ||
          (occupancyFilter === "LIKELY_ABSENTEE" && occupancy === "LIKELY_ABSENTEE") ||
          (occupancyFilter === "UNKNOWN" && !occupancy);
        const yearsSince = property.estimated_years_since_last_known_hvac_event;
        const hvacAgeMatch =
          hvacAgeFilter === "ALL" ||
          (hvacAgeFilter === "5_PLUS" && yearsSince !== null && yearsSince !== undefined && yearsSince >= 5) ||
          (hvacAgeFilter === "10_PLUS" && yearsSince !== null && yearsSince !== undefined && yearsSince >= 10) ||
          (hvacAgeFilter === "NO_RECORD" && !property.last_known_hvac_event_year);
        const streetActivity = p.same_street_hvac_since_2021 ?? 0;
        const localActivityMatch =
          localActivityFilter === "ALL" ||
          (localActivityFilter === "ACTIVE" && streetActivity > 0) ||
          (localActivityFilter === "HIGH" && streetActivity >= 3) ||
          (localActivityFilter === "NONE" && streetActivity === 0);
        const propertyTypeMatch = propertyTypeFilter === "ALL" ||
          (propertyTypeFilter === "SINGLE_FAMILY" && property.property_type.includes("SINGLE FAMILY")) ||
          (propertyTypeFilter === "OTHER" && !property.property_type.includes("SINGLE FAMILY"));
        return (
          haystack.includes(query.toLowerCase()) &&
          (opportunityStrength === "ALL" || property.opportunity_strength === opportunityStrength) &&
          (confidence === "ALL" || property.evidence_confidence === confidence) &&
          (category === "ALL" || property.permit_category === category) &&
          (statusFilter === "ALL" || statusFor(property.parcel_id) === statusFilter) &&
          occupancyMatch && hvacAgeMatch && localActivityMatch && propertyTypeMatch
        );
      }),
    [opportunityRows, query, opportunityStrength, confidence, category, statusFilter, occupancyFilter, hvacAgeFilter, localActivityFilter, propertyTypeFilter, statusFor]
  );

  const count = (status: Status) => opportunityRows.filter((property) => statusFor(property.parcel_id) === status).length;
  const pipelineCounts = useMemo(() => {
    const statusCount = (status: Status) => opportunityRows.filter((property) => (leadStatuses[property.parcel_id] || "NEW") === status).length;
    return {
      NEW: statusCount("NEW"),
      CONTACTED: statusCount("CONTACTED"),
      APPOINTMENT: statusCount("APPOINTMENT"),
      WON: statusCount("WON"),
      "NOT INTERESTED": statusCount("NOT INTERESTED"),
    };
  }, [leadStatuses, opportunityRows]);
  const highPriority = opportunityRows.filter((property) => property.opportunity_strength === "STRONG").length;
  const ownerOccupied = opportunityRows.filter((property) => safeOccupancy(property as EnrichedProperty) === "LIKELY_OWNER_OCCUPIED").length;
  // Homes to target = ranked HIGH or MEDIUM opportunities that have not been won or rejected in this workspace.
  const homesToTarget = opportunityRows.filter((property) =>
    ["STRONG", "MEDIUM"].includes(property.opportunity_strength) &&
    !["WON", "NOT INTERESTED"].includes(statusFor(property.parcel_id))
  ).length;
  const resetFilters = () => {
    setQuery("");
    setOpportunityStrength("ALL");
    setConfidence("ALL");
    setStatusFilter("ALL");
    setCategory("ALL");
    setOccupancyFilter("ALL");
    setHvacAgeFilter("ALL");
    setLocalActivityFilter("ALL");
    setPropertyTypeFilter("ALL");
  };

  return (
    <div className="app-frame">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">R</div>
          <div>
            <div className="brand-name">Replacement Radar</div>
            <div className="brand-subtitle">HVAC sales intelligence</div>
          </div>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-switcher"><span className="workspace-dot" /> {supabase ? workspaceName : "Demo workspace"}</div>
        <nav aria-label="Primary navigation" className="primary-nav">
          {supabase && <button className={`nav-item ${view === "this-week" ? "nav-active" : ""}`} onClick={() => setView("this-week")}>▸ This Week <span className="nav-count">{cohort?.actual_size ?? "—"}</span></button>}
          <button className={`nav-item ${view === "opportunities" ? "nav-active" : ""}`} onClick={() => setView("opportunities")}>≡ All Opportunities <span className="nav-count">{filtered.length}</span></button>
          {supabase && <button className="nav-item" onClick={() => router.push("/direct-mail")}>✉ Direct Mail</button>}
          {supabase && <button className="nav-item" onClick={() => router.push("/settings")}>⚙ Settings</button>}
        </nav>
        <div className="sidebar-bottom">
          <div className="coverage-note">
            <span className="status-dot" /> Dallas coverage active
            <div className="coverage-detail">City of Dallas parcel universe</div>
          </div>
          <button className="nav-item quiet" onClick={logout}>↪ Sign out</button>
          <div className="account-row">
            <div className="avatar">{supabase ? userInitials : "S"}</div>
            <div>
              <div className="account-name">{supabase ? workspaceName : "Founder workspace"}</div>
              <div className="account-role">Private lead activity</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="sheet">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open navigation" onClick={() => setMenuOpen(!menuOpen)}>≡</button>
          <div className="breadcrumbs">
            <span>Dallas</span>
            <span className="breadcrumb-separator">/</span>
            <strong>{view === "this-week" ? "This week" : view === "map" ? "Map" : "All opportunities"}</strong>
          </div>
          <div className="topbar-actions">
            <span className="refresh-note">Data refreshed Nov 2, 2026</span>
            <div className="top-avatar">{supabase ? userInitials : "S"}</div>
          </div>
        </header>

        <div className="content">
          {view !== "this-week" && <>
          <section className="title-row">
            <div>
              <div className="eyebrow">SUPPORTED TERRITORY <span className="eyebrow-dot" /> DALLAS, TX</div>
              <h1>Dallas prospecting workspace</h1>
              <p className="intro">Homes to focus on this week, prioritized by recorded HVAC history and local replacement signals.</p>
            </div>
            <div className="title-actions"><button className="secondary-button" onClick={() => downloadCsv(filtered, statusFor)}>Export CSV <span>↓</span></button></div>
          </section>

          <section className="signal-strip" aria-label="Prospecting workspace summary">
            <div className="signal-stat" title="High and medium priority opportunities not marked Won or Not Interested in this workspace"><span className="stat-label">Homes to target</span><strong>{homesToTarget}</strong></div>
            <div className="signal-stat"><span className="stat-label">High priority</span><strong>{highPriority}</strong></div>
            <div className="signal-stat"><span className="stat-label">Owner occupied</span><strong>{ownerOccupied}</strong><span className="stat-tail">inferred</span></div>
            <div className="signal-stat"><span className="stat-label">New prospects</span><strong>{count("NEW")}</strong></div>
            <div className="signal-stat"><span className="stat-label">Appointments</span><strong>{count("APPOINTMENT")}</strong></div>
          </section>
          </>}

          {view === "this-week" ? (
            <ThisWeekView
              cohort={cohort}
              members={cohortMembers}
              reason={cohortReason}
              loading={cohortLoading}
              error={cohortError}
              filter={weekFilter}
              onFilter={setWeekFilter}
              onRetry={() => void loadCohort()}
              onSettings={() => router.push("/settings")}
              onSignIn={() => router.push("/login")}
              statusFor={statusFor}
              onOpen={setSelected}
              onStatus={setStatus}
              pipelineCounts={pipelineCounts}
            />
          ) : opportunityError ? (
            <div className="empty-state" role="alert">
              <strong>{opportunityError}</strong>
              <span>No demo data was shown because Supabase is configured.</span>
            </div>
          ) : loadingOpportunities ? (
            <div className="empty-state"><strong>Loading Dallas opportunities…</strong></div>
          ) : view === "map" ? (
            <MapView onBack={() => setView("opportunities")} rows={filtered} />
          ) : (
            <>
              <section className="filter-bar" aria-label="Opportunity filters">
                <label className="search-control">
                  <span>⌕</span>
                  <input aria-label="Search addresses" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search address or parcel ID" />
                </label>
                <label>
                  <span className="filter-label">Priority</span>
                  <select value={opportunityStrength} onChange={(e) => setOpportunityStrength(e.target.value)}>
                    <option value="ALL">All priorities</option>
                    <option value="STRONG">High priority</option>
                    <option value="MEDIUM">Medium priority</option>
                    <option value="WEAK">Low priority</option>
                  </select>
                </label>
                {hasOccupancyData && (
                  <label>
                    <span className="filter-label">Owner occupancy</span>
                    <select value={occupancyFilter} onChange={(e) => setOccupancyFilter(e.target.value)}>
                      <option value="ALL">All properties</option>
                      <option value="LIKELY_OWNER_OCCUPIED">Likely owner occupied</option>
                      <option value="LIKELY_ABSENTEE">Likely absentee owner</option>
                      <option value="UNKNOWN">Occupancy unknown</option>
                    </select>
                  </label>
                )}
                <label>
                  <span className="filter-label">Lead status</span>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="ALL">All statuses</option>
                    {statuses.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </label>
                <details className="secondary-filters">
                  <summary>More filters</summary>
                  <div className="secondary-filter-grid">
                    <label>
                      <span className="filter-label">Last HVAC record</span>
                      <select value={hvacAgeFilter} onChange={(e) => setHvacAgeFilter(e.target.value)}>
                        <option value="ALL">Any record age</option>
                        <option value="5_PLUS">5+ years ago</option>
                        <option value="10_PLUS">10+ years ago</option>
                        <option value="NO_RECORD">No recorded event</option>
                      </select>
                    </label>
                    <label>
                      <span className="filter-label">Local HVAC activity</span>
                      <select value={localActivityFilter} onChange={(e) => setLocalActivityFilter(e.target.value)}>
                        <option value="ALL">Any local signal</option>
                        <option value="ACTIVE">Activity on street</option>
                        <option value="HIGH">3+ records on street</option>
                        <option value="NONE">No local signal</option>
                      </select>
                    </label>
                    <label>
                      <span className="filter-label">Property type</span>
                      <select value={propertyTypeFilter} onChange={(e) => setPropertyTypeFilter(e.target.value)}>
                        <option value="ALL">All property types</option>
                        <option value="SINGLE_FAMILY">Single-family</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </label>
                    <label>
                      <span className="filter-label">Evidence/source</span>
                      <select value={category} onChange={(e) => setCategory(e.target.value)}>
                        <option value="ALL">All evidence</option>
                        {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span className="filter-label">Evidence confidence</span>
                      <select value={confidence} onChange={(e) => setConfidence(e.target.value)}>
                        <option value="ALL">All levels</option>
                        <option value="HIGH">High</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="LOW">Low</option>
                      </select>
                    </label>
                  </div>
                </details>
                <button className="reset-button" onClick={resetFilters}>
                  Reset
                </button>
              </section>

              <section className="list-section">
                <div className="section-heading">
                  <div>
                    <h2>Homes to work</h2>
                    <p>Start with high-priority homes, then work down the list.</p>
                  </div>
                  <span className="sort-note">Priority order <span>↓</span></span>
                </div>
                <div className="mobile-prospect-list" aria-label="Mobile opportunity list">
                  {filtered.map((property) => (
                    <MobileProspectCard
                      key={property.parcel_id}
                      property={property}
                      status={statusFor(property.parcel_id)}
                      onOpen={() => setSelected(property)}
                    />
                  ))}
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Property</th>
                        <th>Priority</th>
                        <th>Last HVAC record</th>
                        <th>Home</th>
                        <th>Owner / occupancy</th>
                        <th>Local signal</th>
                        <th>Status</th>
                        <th aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((property) => (
                        <tr key={property.parcel_id} onClick={() => setSelected(property)} className="property-row">
                          <td>
                            <div className="address">{property.address}</div>
                            <div className="subline">{propertyCity(property)}, TX {property.property_zip}</div>
                          </td>
                          <td>
                            <span className={`priority-label priority-${priorityTone(property.opportunity_strength)}`}>{priorityLabel(property.opportunity_strength)}</span>
                          </td>
                          <td className="hvac-record-cell">
                            {property.latest_permit_date ? <><strong>{formatPermitDate(property.latest_permit_date)}</strong><span>{formatElapsedYears(property.estimated_years_since_last_known_hvac_event)}</span><small>{hvacEventLabel(property)}</small></> : <><strong>No recorded event</strong><span>Since 2018 coverage start</span><small>Current system unknown</small></>}
                          </td>
                          <td className="home-context-cell">
                            <strong>{(property as EnrichedProperty).living_area_sqft ? `${(property as EnrichedProperty).living_area_sqft?.toLocaleString()} sq ft` : "Size unavailable"}</strong>
                            <span>Built {property.year_built || "Unknown"}</span>
                            <small>{property.property_type.includes("SINGLE FAMILY") ? "Single-family" : property.property_type}</small>
                          </td>
                          <td className="owner-context-cell">
                            <strong>{SHOW_OWNER_DETAILS ? safeOwnerValue((property as EnrichedProperty).owner_name, "Owner unavailable") : "Owner details hidden"}</strong>
                            {safeOccupancy(property as EnrichedProperty) ? <span>{safeOccupancy(property as EnrichedProperty) === "LIKELY_OWNER_OCCUPIED" ? "Likely owner occupied" : "Likely absentee owner"} <em>Inferred</em></span> : <span>Occupancy unknown</span>}
                          </td>
                          <td className="local-signal-cell">
                            {(property as EnrichedProperty).same_street_hvac_since_2021 ? <><strong>{(property as EnrichedProperty).same_street_hvac_since_2021} HVAC records</strong><span>On this street since 2021</span></> : <><strong>No local signal</strong><span>Recorded in current data</span></>}
                          </td>
                          <td>
                            <select
                              aria-label={`Status for ${property.address}`}
                              value={statusFor(property.parcel_id)}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setStatus(property, e.target.value as Status)}
                            >
                              {statuses.map((status) => <option key={status}>{status}</option>)}
                            </select>
                          </td>
                          <td><button className="row-arrow" aria-label={`Open ${property.address}`}>→</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filtered.length === 0 && (
                    <div className="empty-state">
                      <strong>No homes match these filters.</strong>
                      <button className="secondary-button empty-clear-button" onClick={resetFilters}>Clear filters</button>
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </main>

      {selected && (
        <PropertyDetail
          property={selected}
          status={statusFor(selected.parcel_id)}
          onStatus={(status) => setStatus(selected, status)}
          notes={notes}
          noteDraft={noteDraft}
          setNoteDraft={setNoteDraft}
          addNote={addNote}
          writeError={writeError}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

export default function Home() {
  return <Suspense fallback={<main className="app-frame"><div className="sheet"><div className="content"><div className="empty-state">Loading workspace…</div></div></div></main>}><HomeContent /></Suspense>;
}

// ---------------------------------------------------------------------------
// Map view placeholder
// ---------------------------------------------------------------------------

function MapView({ onBack, rows }: { onBack: () => void; rows: Property[] }) {
  return (
    <section className="map-placeholder">
      <div className="map-header">
        <div>
          <button className="back-link" onClick={onBack}>← Back to list</button>
          <h2>Dallas opportunity map</h2>
          <p>{rows.length} properties ready to plot after map provider connection.</p>
        </div>
        <EvidenceTag tone="unknown">Map integration next</EvidenceTag>
      </div>
      <div className="map-surface">
        <div className="map-grid" />
        <div className="map-message">
          <div className="map-mark">⌖</div>
          <strong>Geographic view is next</strong>
          <span>Map integration is intentionally excluded from this milestone.</span>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// HVAC Timeline
// ---------------------------------------------------------------------------

function HvacTimeline({ property }: { property: Property }) {
  const eventYear = property.last_known_hvac_event_year as number | null;
  if (!eventYear) {
    return (
      <div className="timeline-no-event">
        <p>No recorded HVAC replacement permit found in the Dallas permit feed (2018 to present).</p>
        <p className="timeline-caveat">Absence of a permit record does not prove the system was never replaced.</p>
      </div>
    );
  }
  // Use the stored value calculated from the exact permit date, not a year-only subtraction.
  // Year-only subtraction (2026 - eventYear) overstates by 1 for permits issued after Nov 3
  // in their respective year (e.g. a Dec 2018 permit is only 7 completed years, not 8).
  const gapYears = (property.estimated_years_since_last_known_hvac_event as number | null) ?? (CURRENT_YEAR - eventYear);
  const isReplacement = property.permit_category === "HVAC REPLACEMENT";
  const eventLabel = isReplacement ? "recorded HVAC replacement" : "recorded HVAC installation";

  return (
    <div className="hvac-timeline">
      <div className="timeline-event">
        <span className="timeline-year">{eventYear}</span>
        <span className="timeline-divider">—</span>
        <span className="timeline-desc">{eventLabel}</span>
      </div>
      <div className="timeline-gap-row">
        <div className="timeline-rule" />
        <span className="timeline-gap-label">{gapYears} {gapYears === 1 ? "year" : "years"}</span>
      </div>
      <div className="timeline-event timeline-present">
        <span className="timeline-year">{CURRENT_YEAR}</span>
        <span className="timeline-divider">—</span>
        <span className="timeline-desc">present</span>
      </div>
      <p className="timeline-note">
        No newer HVAC replacement or installation permit found since {eventYear}.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nearby HVAC Activity
// ---------------------------------------------------------------------------

function NearbyActivity({ property }: { property: Property }) {
  const p = property as Property & {
    same_street_hvac_since_2021?: number;
    peers_with_newer_hvac_event?: number;
  };
  const streetCount = p.same_street_hvac_since_2021 ?? 0;
  const peersNewer = p.peers_with_newer_hvac_event ?? 0;

  if (streetCount === 0 && peersNewer === 0) return null;

  return (
    <div className="nearby-activity">
      {streetCount > 0 && (
        <p className="nearby-stat">
          <strong>{streetCount}</strong>{" "}
          {streetCount === 1 ? "property" : "properties"} on this street{" "}
          {streetCount === 1 ? "has" : "have"} recorded HVAC activity since 2021.
        </p>
      )}
      {peersNewer > 0 && (
        <p className="nearby-stat">
          <strong>{peersNewer}</strong> comparable{" "}
          {peersNewer === 1 ? "property has" : "properties have"} a more recent HVAC replacement record on this street.
        </p>
      )}
      <p className="nearby-caveat">
        Nearby activity is local-market context. It does not indicate this property&rsquo;s equipment condition.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview Grid
// ---------------------------------------------------------------------------

function OverviewItem({ label, value, tag }: { label: string; value: React.ReactNode; tag?: React.ReactNode }) {
  return (
    <div className="overview-item">
      <dt className="overview-label">{label}</dt>
      <dd className="overview-value">
        {tag && <>{tag} </>}
        {value}
      </dd>
    </div>
  );
}

function PropertyOverview({ property }: { property: Property }) {
  const p = property as Property & {
    owner_name?: string | null;
    owner_mailing_address?: string | null;
    living_area_sqft?: number | null;
    owner_occupancy?: OccupancyStatus;
  };

  const livingArea = (p.living_area_sqft ?? null) as number | null;
  const occupancy = safeOccupancy(p);
  const occupancyLabel =
    occupancy === "LIKELY_OWNER_OCCUPIED" ? "Likely owner occupied"
    : occupancy === "LIKELY_ABSENTEE" ? "Likely absentee owner"
    : "Not available";
  return (
    <dl className="overview-grid">
      <OverviewItem
        label="Property type"
        value={property.property_type.includes("SINGLE FAMILY") ? "Single-family residential" : property.property_type}
      />
      <OverviewItem
        label="Living area"
        value={livingArea ? `${livingArea.toLocaleString()} sq ft` : "Not available"}
      />
      <OverviewItem
        label="Current owner"
        value={SHOW_OWNER_DETAILS ? safeOwnerValue(p.owner_name, "Not available") : "Owner details hidden"}
      />
      <OverviewItem
        label="Mailing address"
        value={SHOW_OWNER_DETAILS ? safeOwnerValue(p.owner_mailing_address, "Not available") : "Owner details hidden"}
      />
      <OverviewItem
        label="Owner occupancy"
        value={
          occupancy
            ? <><span>{occupancyLabel}</span><span className="inferred-label">Inferred</span></>
            : occupancyLabel
        }
      />
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Property detail drawer
// ---------------------------------------------------------------------------

function PropertyDetail({
  property, status, onStatus, notes, noteDraft, setNoteDraft, addNote, writeError, onClose,
}: {
  property: Property;
  status: Status;
  onStatus: (status: Status) => void;
  notes: Note[];
  noteDraft: string;
  setNoteDraft: (value: string) => void;
  addNote: () => void;
  writeError: string;
  onClose: () => void;
}) {
  const p = property as EnrichedProperty;
  const occupancy = safeOccupancy(p);
  const hasNearby = (p.same_street_hvac_since_2021 ?? 0) > 0 || (p.peers_with_newer_hvac_event ?? 0) > 0;
  const [sourceEvidenceOpen, setSourceEvidenceOpen] = useState(false);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <aside className="detail-panel" role="dialog" aria-modal="true" aria-labelledby="detail-title">

        {/* Header */}
        <div className="detail-header">
          <div>
            <div className="eyebrow">PROPERTY DETAIL <span className="eyebrow-dot" /> {property.coverage_state}</div>
            <h2 id="detail-title">{property.address}</h2>
            <p>{propertyCity(property)}, TX {property.property_zip}</p>
          </div>
          <button className="close-button" onClick={onClose} aria-label="Close detail">×</button>
        </div>

        <div className="detail-priority-row">
          <span className={`priority-label priority-${priorityTone(property.opportunity_strength)}`}>{priorityLabel(property.opportunity_strength)}</span>
          <span className="detail-priority-note">Priority is based on recorded HVAC and property signals.</span>
        </div>

        <div className="standout-section">
          <span className="detail-kicker">WHY THIS HOME STANDS OUT</span>
          <p>{contractorSummary(property)}</p>
        </div>

        <div className="detail-section hvac-highlight-section">
          <h3>Last HVAC record</h3>
          {property.latest_permit_date ? (
            <div className="hvac-highlight">
              <strong>{formatPermitDate(property.latest_permit_date)}</strong>
              <span>{formatElapsedYears(property.estimated_years_since_last_known_hvac_event)}</span>
              <small>{hvacEventLabel(property)}</small>
            </div>
          ) : (
            <div className="hvac-highlight hvac-highlight-unknown">
              <strong>No recorded HVAC event</strong>
              <span>Since 2018 coverage start</span>
              <small>Current system unknown</small>
            </div>
          )}
          <p className="hvac-caveat">This is the last recorded public event, not verified current equipment age.</p>
        </div>

        <div className="detail-section">
          <h3>Home and ownership</h3>
          <PropertyOverview property={property} />
        </div>

        {/* Lead status */}
        <div className="detail-section">
          <h3>Lead status</h3>
          <select value={status} onChange={(e) => onStatus(e.target.value as Status)}>
            {statuses.map((value) => <option key={value}>{value}</option>)}
          </select>
        </div>

        {/* HVAC Timeline */}
        <div className="detail-section">
          <h3>HVAC event timeline</h3>
          <HvacTimeline property={property} />
        </div>

        <div className="detail-section source-evidence-section">
          <h3 className="source-evidence-heading">Source evidence</h3>
          <button
            type="button"
            className="source-evidence-toggle"
            aria-expanded={sourceEvidenceOpen}
            aria-controls="source-evidence-content"
            onClick={() => setSourceEvidenceOpen((open) => !open)}
          >
            <span>Source evidence</span>
            <span aria-hidden="true">{sourceEvidenceOpen ? "▴" : "▾"}</span>
          </button>
          <div id="source-evidence-content" className={`source-evidence-content ${sourceEvidenceOpen ? "source-evidence-open" : ""}`}>
            <div className="evidence-stack">
            <div className="source-row">
              <EvidenceTag tone="verified">VERIFIED DATA</EvidenceTag>
              <div>
                <strong>Property year built</strong>
                <span>{property.year_built || "Unknown"}</span>
                <small>DCAD parcel record</small>
              </div>
            </div>
            {SHOW_OWNER_DETAILS && <div className="source-row">
              <EvidenceTag tone={p.owner_name && !isWithheld(p.owner_name) ? "verified" : "unknown"}>{p.owner_name && !isWithheld(p.owner_name) ? "VERIFIED DATA" : "UNKNOWN"}</EvidenceTag>
              <div>
                <strong>Current owner record</strong>
                <span>{safeOwnerValue(p.owner_name, "Not available")}</span>
                <small>DCAD owner record</small>
              </div>
            </div>}
            {SHOW_OWNER_DETAILS && <div className="source-row">
              <EvidenceTag tone={p.owner_mailing_address && !isWithheld(p.owner_mailing_address) ? "verified" : "unknown"}>{p.owner_mailing_address && !isWithheld(p.owner_mailing_address) ? "VERIFIED DATA" : "UNKNOWN"}</EvidenceTag>
              <div>
                <strong>Owner mailing address</strong>
                <span>{safeOwnerValue(p.owner_mailing_address, "Not available")}</span>
                <small>DCAD postal record</small>
              </div>
            </div>}
            <div className="source-row">
              <EvidenceTag tone={occupancy ? "inference" : "unknown"}>{occupancy ? "INFERENCE" : "UNKNOWN"}</EvidenceTag>
              <div>
                <strong>Owner occupancy</strong>
                <span>{occupancy === "LIKELY_OWNER_OCCUPIED" ? "Likely owner occupied" : occupancy === "LIKELY_ABSENTEE" ? "Likely absentee owner" : "Not available"}</span>
                <small>Derived from mailing/site address comparison</small>
              </div>
            </div>
            <div className="source-row">
              <EvidenceTag tone={property.latest_permit_description ? "verified" : "unknown"}>
                {property.latest_permit_description ? "VERIFIED DATA" : "UNKNOWN"}
              </EvidenceTag>
              <div>
                <strong>Dallas mechanical permit</strong>
                <span>{property.latest_permit_description || "No HVAC replacement/install event found"}</span>
                <small>{property.latest_permit_date ? `Issued ${property.latest_permit_date.slice(0, 10)}` : "Dallas OpenData"}</small>
              </div>
            </div>
            <div className="source-row">
              <EvidenceTag tone={property.last_known_hvac_event_year ? "inference" : "unknown"}>
                {property.last_known_hvac_event_year ? "INFERENCE" : "UNKNOWN"}
              </EvidenceTag>
              <div>
                <strong>Years since known HVAC event</strong>
                <span>
                  {property.estimated_years_since_last_known_hvac_event
                    ? `${property.estimated_years_since_last_known_hvac_event} years since ${property.last_known_hvac_event_year}`
                    : "Cannot be estimated"}
                </span>
                <small>Not verified current equipment age</small>
              </div>
            </div>
            <div className="source-row">
              <EvidenceTag tone="unknown">UNKNOWN</EvidenceTag>
              <div>
                <strong>Current installed system</strong>
                <span>Cannot be verified from public records</span>
              </div>
            </div>
            <div className="source-row">
              <EvidenceTag tone={property.evidence_confidence === "HIGH" ? "verified" : property.evidence_confidence === "MEDIUM" ? "inference" : "unknown"}>{property.evidence_confidence === "HIGH" ? "VERIFIED DATA" : property.evidence_confidence === "MEDIUM" ? "INFERENCE" : "UNKNOWN"}</EvidenceTag>
              <div>
                <strong>Evidence quality</strong>
                <span>{property.evidence_confidence || "Not available"}</span>
                <small>Source and address-match assessment</small>
              </div>
            </div>
            </div>
          </div>
        </div>

        {/* Nearby HVAC Activity */}
        {hasNearby && (
          <div className="detail-section">
            <h3>Nearby HVAC activity</h3>
            <NearbyActivity property={property} />
          </div>
        )}

        {/* Private notes */}
        <div className="detail-section">
          <h3>Private workspace note</h3>
          {writeError && <p className="error-message" role="alert">{writeError}</p>}
          <textarea
            aria-label="Private note"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Add a note about this opportunity"
            maxLength={2000}
          />
          <button className="primary-button" onClick={addNote}>Add note</button>
          {notes.map((note) => <p className="note-item" key={note.id}>{note.body}</p>)}
        </div>

        <div className="detail-footer">
          <span className="mono-id">Parcel {property.parcel_id}</span>
          <button className="secondary-button" onClick={onClose}>Close</button>
        </div>

      </aside>
    </div>
  );
}
