import Link from "next/link";
import styles from "./legal.module.css";

export const EFFECTIVE_DATE = "November 24, 2026";

type LegalSection = {
  title: string;
  children: React.ReactNode;
};

export function LegalSection({ title, children }: LegalSection) {
  return (
    <section className={styles.section} aria-labelledby={title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}>
      <h2 id={title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}>{title}</h2>
      {children}
    </section>
  );
}

export function LegalList({ children }: { children: React.ReactNode }) {
  return <ul className={styles.list}>{children}</ul>;
}

export function LegalCallout({ children }: { children: React.ReactNode }) {
  return <div className={styles.callout}>{children}</div>;
}

export function LegalPage({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.wordmark} href="/" aria-label="ResponseHVAC home">
          <span className={styles.mark} aria-hidden="true">R</span>
          <span>ResponseHVAC</span>
        </Link>
        <Link className={styles.backLink} href="/">Back to home <span aria-hidden="true">↗</span></Link>
      </header>
      <div className={styles.shell}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>Rynith, Inc. · ResponseHVAC</p>
          <h1>{title}</h1>
          <p className={styles.effective}>Effective: {EFFECTIVE_DATE}</p>
          <p className={styles.intro}>{intro}</p>
        </div>
        <article className={styles.document}>{children}</article>
        <footer className={styles.footer}>
          <div>
            <strong>Rynith, Inc.</strong>
            <span>ResponseHVAC</span>
          </div>
          <a href="mailto:support@responsehvac.com">support@responsehvac.com</a>
        </footer>
      </div>
    </main>
  );
}
