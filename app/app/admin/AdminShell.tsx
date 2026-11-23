import Link from "next/link";
import SignOutButton from "./SignOutButton";
import styles from "./admin.module.css";

export default function AdminShell({ children, current }: { children: React.ReactNode; current: "overview" | "customers" }) {
  return <div className={styles.shell}>
    <aside className={styles.rail}>
      <div className={styles.brand}><span className={styles.brandMark}>R</span><span>Replacement Radar</span></div>
      <div className={styles.navGroup}>
        <p className={styles.railLabel}>Operator console</p>
        <nav className={styles.nav} aria-label="Admin navigation">
          <Link href="/admin" className={current === "overview" ? styles.navActive : ""} aria-current={current === "overview" ? "page" : undefined}><span className={styles.navGlyph}>◫</span>Overview</Link>
          <Link href="/admin/customers" className={current === "customers" ? styles.navActive : ""} aria-current={current === "customers" ? "page" : undefined}><span className={styles.navGlyph}>≡</span>Customers</Link>
        </nav>
      </div>
      <div className={styles.operator}>
        <p className={styles.railLabel}>Current operator</p>
        <div className={styles.operatorRow}><span className={styles.operatorAvatar}>O</span><span><strong>Owner access</strong><small>Read-only console</small></span></div>
        <SignOutButton />
      </div>
    </aside>
    <main className={styles.main}>{children}</main>
  </div>;
}
