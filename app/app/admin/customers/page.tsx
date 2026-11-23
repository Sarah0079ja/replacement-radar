import { requireAdminPage } from "../../lib/admin";
import { getAdminOverview } from "../../lib/admin-data";
import AdminCustomersTable from "../AdminCustomersTable";
import AdminShell from "../AdminShell";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";

export default async function AdminCustomersPage() {
  await requireAdminPage();
  const { customers } = await getAdminOverview();
  return <AdminShell current="customers"><header className={styles.topbar}><div><p className={styles.eyebrow}>OPERATIONS / CUSTOMERS</p><h1 className={styles.title}>Customers</h1><p className={styles.subtle}>Search and filter the real customer and billing record.</p></div></header><section className={styles.pageSection}><div className={styles.sectionHead}><div><p className={styles.eyebrow}>CUSTOMER DIRECTORY</p><h2>{customers.length} workspaces</h2></div><span className={styles.muted}>Read-only customer records</span></div><AdminCustomersTable customers={customers} /></section></AdminShell>;
}
