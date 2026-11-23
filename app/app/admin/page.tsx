import Link from "next/link";
import { requireAdminPage } from "../lib/admin";
import { getAdminOverview } from "../lib/admin-data";
import AdminShell from "./AdminShell";
import styles from "./admin.module.css";

export const dynamic = "force-dynamic";

function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100); }
function status(value: string | null) { return value ? value.replaceAll("_", " ") : "not started"; }
function statusClass(value: string | null) { const normalized = value?.toLowerCase(); return normalized === "trialing" ? styles.statusTrialing : normalized === "active" ? styles.statusActive : normalized === "past_due" ? styles.statusPastDue : normalized === "canceled" || normalized === "cancelled" ? styles.statusCancelled : ""; }
function date(value: string | null) { if (!value) return "—"; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(parsed); }

export default async function AdminOverviewPage() {
  await requireAdminPage();
  const { customers, metrics } = await getAdminOverview();
  const recent = [...customers].sort((a, b) => new Date(b.signupDate).getTime() - new Date(a.signupDate).getTime()).slice(0, 5);
  const lifecycle = [["Incomplete onboarding", metrics.incompleteOnboarding, "needs setup"], ["Trialing", metrics.trialing, "in a trial"], ["Active", metrics.active, "paying customers"], ["Cancelled", metrics.cancelled, "no longer active"]];
  const attention = [["Trials ending soon", metrics.trialsEndingSoon, "next 7 days", metrics.trialsEndingSoon ? "warning" : "quiet"], ["Past due", metrics.pastDue, "billing follow-up", metrics.pastDue ? "attention" : "quiet"], ["Incomplete onboarding", metrics.incompleteOnboarding, "service area missing", metrics.incompleteOnboarding ? "warning" : "quiet"]] as const;

  return (
    <AdminShell current="overview">
      <header className={styles.topbar}>
        <div><p className={styles.eyebrow}>OPERATIONS / OVERVIEW</p><h1 className={styles.title}>Replacement Radar Admin</h1><p className={styles.subtle}>Business overview, customers and subscription health.</p></div>
        <Link className={styles.primaryLink} href="/admin/customers">View customers <span aria-hidden="true">↗</span></Link>
      </header>

      <section className={styles.kpiGrid} aria-label="Business metrics">
        <div className={styles.kpi}><span className={styles.kpiIcon}>◎</span><div><span className={styles.kpiLabel}>Total customers</span><strong className={styles.kpiValue}>{metrics.total}</strong><span className={styles.kpiNote}>workspaces</span></div></div>
        <div className={styles.kpi}><span className={styles.kpiIcon}>◌</span><div><span className={styles.kpiLabel}>Trialing</span><strong className={styles.kpiValue}>{metrics.trialing}</strong><span className={styles.kpiNote}>active trials</span></div></div>
        <div className={styles.kpi}><span className={styles.kpiIcon}>↗</span><div><span className={styles.kpiLabel}>Active paid</span><strong className={styles.kpiValue}>{metrics.active}</strong><span className={styles.kpiNote}>MRR eligible</span></div></div>
        <div className={`${styles.kpi} ${styles.kpiFeatured}`}><span className={styles.kpiIcon}>$</span><div><span className={styles.kpiLabel}>Current MRR</span><strong className={styles.kpiValue}>{money(metrics.mrrCents)}</strong><span className={styles.kpiNote}>active subscriptions × $99</span></div></div>
      </section>

      <section className={styles.overviewGrid}>
        <div className={`${styles.surface} ${styles.lifecycle}`}>
          <div className={styles.sectionHead}><div><p className={styles.eyebrow}>CUSTOMER LIFECYCLE</p><h2>Where customers are now</h2></div><span className={styles.sectionMeta}>Current state</span></div>
          <div className={styles.lifecycleTrack}>
            {lifecycle.map(([label, count, note], index) => <div className={styles.lifecycleStage} key={label}><span className={styles.stageIndex}>0{index + 1}</span><strong>{count}</strong><span>{label}</span><small>{note}</small>{index < lifecycle.length - 1 && <span className={styles.lifecycleArrow} aria-hidden="true">→</span>}</div>)}
          </div>
          <p className={styles.surfaceFootnote}>A current-state view only — no historical conversion rate is implied.</p>
        </div>
        <div className={styles.surface}>
          <div className={styles.sectionHead}><div><p className={styles.eyebrow}>ATTENTION NEEDED</p><h2>Operator follow-up</h2></div></div>
          <div className={styles.attentionList}>{attention.map(([label, count, note, tone]) => <div className={styles.attentionRow} key={label}><span className={`${styles.attentionDot} ${styles[tone]}`} /><span><strong>{label}</strong><small>{note}</small></span><b>{count}</b></div>)}</div>
        </div>
      </section>

      <section className={styles.surface}>
        <div className={styles.sectionHead}><div><p className={styles.eyebrow}>RECENT CUSTOMERS</p><h2>Latest workspaces</h2></div><Link className={styles.textLink} href="/admin/customers">View all customers ↗</Link></div>
        <div className={styles.tableWrap}>
          {recent.length ? <table className={styles.table}><thead><tr><th>Customer / workspace</th><th>Subscription</th><th>Onboarding</th><th>Trial end</th><th><span className={styles.srOnly}>Action</span></th></tr></thead><tbody>{recent.map((customer) => <tr key={customer.workspaceId}><td><Link href={`/admin/customers/${customer.workspaceId}`} className={styles.name}><strong>{customer.workspaceName}</strong><span className={styles.emailText} title={customer.primaryUserEmail}>{customer.primaryUserEmail}</span></Link></td><td><span className={`${styles.status} ${statusClass(customer.subscriptionStatus)}`}>{status(customer.subscriptionStatus)}</span></td><td><span className={customer.onboardingCompletedAt ? styles.statusComplete : styles.statusIncomplete}>{customer.onboardingCompletedAt ? "Complete" : "Incomplete"}</span></td><td className={styles.muted}>{date(customer.trialEnd)}</td><td><Link className={styles.rowAction} href={`/admin/customers/${customer.workspaceId}`}>View customer <span aria-hidden="true">→</span></Link></td></tr>)}</tbody></table> : <div className={styles.empty}>No customers in the current data.</div>}
        </div>
      </section>
    </AdminShell>
  );
}
