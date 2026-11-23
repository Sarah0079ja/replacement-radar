import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { PricingHero } from "./PricingHero";
import { Reveal } from "./Reveal";
import landing from "../landing.module.css";
import styles from "./pricing.module.css";

// What the plan includes, described as outcomes. Public copy: say what the customer gets, never how it is produced.
const INCLUDES = [
  { title: "A fresh list every week", body: "Choose your list size and start each week with fresh opportunities." },
  { title: "Your service area", body: "Focus your weekly list on the ZIP codes your team actually serves." },
  { title: "Context behind every opportunity", body: "See the information that helped each property stand out." },
  { title: "Know where to start", body: "Stronger opportunities rise so your team can focus its time." },
  { title: "Understand the opportunity", body: "See a clear explanation of why a property deserves a closer look." },
  { title: "Work the lead", body: "Move opportunities from new to contacted, appointment and won." },
];

export function Pricing({ howHref = "#how-it-works", level = "h2" }: { howHref?: string; level?: "h1" | "h2" }) {
  return (
    <div id="pricing" className={styles.section}>
      <PricingHero howHref={howHref} level={level} />

      <section className={styles.includes} aria-labelledby="includes-title">
        <div className={styles.includesHead}>
          <p className={styles.eyebrow}>Included in your plan</p>
          <h2 id="includes-title" className={styles.includesTitle}>
            Your weekly prospecting system.
          </h2>
          <p className={styles.includesLede}>
            One plan with the whole workflow in it, from finding the homes to marking the ones you won.
          </p>
        </div>
        <Reveal>
          <ol className={styles.includesList}>
            {INCLUDES.map((item, i) => (
              <li key={item.title} style={{ "--i": i } as CSSProperties}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </li>
            ))}
          </ol>
          <p className={styles.also}>Also included: All Opportunities, map view and CSV export.</p>
          <p className={styles.honest}>Replacement Radar prioritizes prospecting opportunities from available information.</p>
        </Reveal>
      </section>
    </div>
  );
}

/** The closing call to action. The landing page keeps its illustrative street; /pricing uses the compact version. */
export function FinalCta({ compact = false, title }: { compact?: boolean; title?: ReactNode }) {
  return (
    <section className={`${landing.close} ${compact ? landing.closeCompact : ""}`} aria-labelledby="close-title">
      {!compact && (
        <div className={landing.street} aria-hidden="true">
          {Array.from({ length: 50 }, (_, i) => (
            <span key={i} />
          ))}
        </div>
      )}
      <h2 id="close-title">
        {title ?? (
          <>
          Start next week
            <br />
            with the right homes.
          </>
        )}
      </h2>
      <p>5-day free trial, then $99/month.</p>
      <Link href="/territory" className={landing.cta}>
        Start your 5-day trial
      </Link>
    </section>
  );
}

/** The site footer (shared by /, /pricing and /how-we-know). */
export { SiteFooter as LandingFooter } from "../footer/SiteFooter";
