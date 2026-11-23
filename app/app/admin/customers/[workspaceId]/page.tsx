import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "../../../lib/admin";
import { getAdminCustomer } from "../../../lib/admin-data";
import AdminShell from "../../AdminShell";
import styles from "../../admin.module.css";

export const dynamic = "force-dynamic";

function date(value: string | null) { if (!value) return "Not available"; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "Not available" : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(parsed); }
function status(value: string | null) { return value ? value.replaceAll("_", " ") : "not started"; }
function statusClass(value: string | null) { const normalized = value?.toLowerCase(); return normalized === "trialing" ? styles.statusTrialing : normalized === "active" ? styles.statusActive : normalized === "past_due" ? styles.statusPastDue : normalized === "canceled" || normalized === "cancelled" ? styles.statusCancelled : ""; }
function Detail({ label, value, technical = false }: { label: string; value: string; technical?: boolean }) { return <div className={`${styles.detailRow} ${technical ? styles.detailTechnical : ""}`}><span>{label}</span><strong>{value}</strong></div>; }

export default async function AdminCustomerDetailPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  await requireAdminPage();
  const { workspaceId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) notFound();
  const customer = await getAdminCustomer(workspaceId);
  if (!customer) notFound();
  return <AdminShell current="customers">
    <div className={styles.detailActions}><Link className={styles.back} href="/admin/customers">← All customers</Link></div>
    <header className={styles.topbar}><div><p className={styles.eyebrow}>CUSTOMER / WORKSPACE DETAIL</p><h1 className={styles.title}>{customer.workspaceName}</h1><p className={styles.subtle}>{customer.primaryUserName} · <span className={styles.emailText} title={customer.primaryUserEmail}>{customer.primaryUserEmail}</span></p></div><span className={`${styles.status} ${statusClass(customer.subscriptionStatus)}`}>{status(customer.subscriptionStatus)}</span></header>
    <div className={styles.detailGrid}>
      <section className={styles.detailBlock}><div className={styles.detailBlockHead}><span className={styles.detailIcon}>◎</span><div><p className={styles.eyebrow}>CUSTOMER</p><h2>Workspace identity</h2></div></div><div className={styles.detailList}><Detail label="Primary user" value={customer.primaryUserName} /><Detail label="Email" value={customer.primaryUserEmail} /><Detail label="Signed up" value={date(customer.signupDate)} /></div></section>
      <section className={styles.detailBlock}><div className={styles.detailBlockHead}><span className={`${styles.detailIcon} ${styles.detailIconGreen}`}>✓</span><div><p className={styles.eyebrow}>ACCOUNT</p><h2>Product setup</h2></div></div><div className={styles.detailList}><Detail label="Onboarding" value={customer.onboardingCompletedAt ? `Complete · ${date(customer.onboardingCompletedAt)}` : "Incomplete"} /><Detail label="Service ZIPs" value={customer.serviceZips.length ? customer.serviceZips.join(", ") : "Not configured"} /><Detail label="Weekly target" value={`${customer.weeklyTarget} opportunities`} /></div></section>
      <section className={styles.detailBlock}><div className={styles.detailBlockHead}><span className={`${styles.detailIcon} ${styles.detailIconAmber}`}>$</span><div><p className={styles.eyebrow}>SUBSCRIPTION</p><h2>Billing health</h2></div></div><div className={styles.detailList}><Detail label="Status" value={status(customer.subscriptionStatus)} /><Detail label="Trial end" value={date(customer.trialEnd)} /><Detail label="Current period" value={`${date(customer.currentPeriodStart)} → ${date(customer.currentPeriodEnd)}`} /><Detail label="Cancel at period end" value={customer.cancelAtPeriodEnd ? "Yes" : "No"} /></div></section>
    </div>
    <section className={`${styles.surface} ${styles.technicalSurface}`}><div className={styles.sectionHead}><div><p className={styles.eyebrow}>TECHNICAL REFERENCES</p><h2>Billing identifiers</h2></div><span className={styles.sectionMeta}>Operational only</span></div><div className={styles.technicalGrid}><Detail label="Workspace ID" value={customer.workspaceId} technical /><Detail label="Stripe customer ID" value={customer.stripeCustomerId || "Not connected"} technical /><Detail label="Stripe subscription ID" value={customer.stripeSubscriptionId || "Not connected"} technical /></div><p className={styles.surfaceFootnote}>Payment methods, card data, secrets, sessions and authentication internals are never loaded here.</p></section>
  </AdminShell>;
}
