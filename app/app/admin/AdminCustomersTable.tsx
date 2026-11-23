"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AdminCustomer } from "../lib/admin-data";
import styles from "./admin.module.css";

type Filter = "all" | "trialing" | "active" | "past_due" | "canceled" | "incomplete";

function statusLabel(value: string | null) { return value ? value.replaceAll("_", " ") : "not started"; }
function statusClass(value: string | null) { const normalized = value?.toLowerCase(); return normalized === "trialing" ? styles.statusTrialing : normalized === "active" ? styles.statusActive : normalized === "past_due" ? styles.statusPastDue : normalized === "canceled" || normalized === "cancelled" ? styles.statusCancelled : ""; }
function date(value: string | null) { if (!value) return "—"; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed); }

export default function AdminCustomersTable({ customers }: { customers: AdminCustomer[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => customers.filter((customer) => {
    const status = customer.subscriptionStatus?.toLowerCase() || "";
    const matchesFilter = filter === "all" || (filter === "incomplete" ? !customer.onboardingCompletedAt : filter === "canceled" ? status === "canceled" || status === "cancelled" : status === filter);
    const haystack = `${customer.workspaceName} ${customer.primaryUserEmail} ${customer.primaryUserName}`.toLowerCase();
    return matchesFilter && haystack.includes(query.toLowerCase().trim());
  }), [customers, filter, query]);
  const filters: Array<[Filter, string]> = [["all", "All"], ["trialing", "Trialing"], ["active", "Active"], ["past_due", "Past due"], ["canceled", "Cancelled"], ["incomplete", "Incomplete onboarding"]];
  return <>
    <div className={styles.filterBar} aria-label="Customer filters">
      <input aria-label="Search customers" placeholder="Search workspace or email" value={query} onChange={(event) => setQuery(event.target.value)} />
      {filters.map(([value, label]) => <button type="button" key={value} className={`${styles.filterButton} ${filter === value ? styles.filterButtonActive : ""}`} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
    </div>
    <div className={styles.tableWrap}>
      {filtered.length ? <table className={styles.table}><thead><tr><th>Workspace</th><th>Primary user</th><th>Signed up</th><th>Onboarding</th><th>Service area</th><th>Billing</th><th>Trial ends</th></tr></thead><tbody>{filtered.map((customer) => <tr key={customer.workspaceId}><td><Link href={`/admin/customers/${customer.workspaceId}`} className={styles.name}><strong>{customer.workspaceName}</strong><span className={styles.mono}>{customer.workspaceId.slice(0, 8)}…</span></Link></td><td><div className={styles.name}><strong>{customer.primaryUserName}</strong><span className={styles.emailText} title={customer.primaryUserEmail}>{customer.primaryUserEmail}</span></div></td><td className={styles.muted}>{date(customer.signupDate)}</td><td><span className={customer.onboardingCompletedAt ? styles.statusComplete : styles.statusIncomplete}>{customer.onboardingCompletedAt ? "Complete" : "Incomplete"}</span></td><td><span className={styles.mono}>{customer.serviceZips.length ? customer.serviceZips.join(", ") : "—"}</span><span className={styles.muted}> · {customer.weeklyTarget}/wk</span></td><td><span className={`${styles.status} ${statusClass(customer.subscriptionStatus)}`}>{statusLabel(customer.subscriptionStatus)}</span></td><td className={styles.muted}>{date(customer.trialEnd)}</td></tr>)}</tbody></table> : <div className={styles.empty}>No customers match this view.</div>}
    </div>
  </>;
}
