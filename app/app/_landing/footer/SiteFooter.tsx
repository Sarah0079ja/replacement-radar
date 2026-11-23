import Link from "next/link";
import styles from "./footer.module.css";

// The marketing site's footer: the quiet end after the final CTA. Destinations mirror the floating nav
// (_landing/header/tabs.ts); in-page targets are written as "/" and "/#how-it-works" so they work from every page.
// No Privacy/Terms links until those pages exist.
//
// Hero footage (public/hero/neighborhood-*.mp4, -poster.jpg) is from Pexels; the Pexels licence does not require
// attribution, so the credit is recorded here rather than on the page.

const GROUPS = [
  {
    title: "Product",
    links: [
      { label: "Overview", href: "/" },
      { label: "How it works", href: "/#how-it-works" },
      { label: "Pricing", href: "/pricing" },
      { label: "How we know", href: "/how-we-know" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Sign in", href: "/login" },
      { label: "Start trial", href: "/territory" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.brand}>
        <Link href="/" className={styles.wordmark} aria-label="ResponseHVAC home">
              <span className={styles.mark} aria-hidden="true" />
          ResponseHVAC
            </Link>
            <p>HVAC prospecting opportunities for Texas contractors.</p>
          </div>
          <nav className={styles.groups} aria-label="Footer">
            {GROUPS.map((g) => (
              <div key={g.title} className={styles.group}>
                <span className={styles.groupTitle}>{g.title}</span>
                <ul>
                  {g.links.map((l) => (
                    <li key={l.label}>
                      <Link href={l.href}>{l.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className={styles.bottom}>
          <span>© 2026 ResponseHVAC · Texas</span>
          <span className={styles.note}>Homes and figures shown are illustrative.</span>
        </div>
      </div>
    </footer>
  );
}
