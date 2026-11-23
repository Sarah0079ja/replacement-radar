"use client";

import { Host_Grotesk } from "next/font/google";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { BEAM_RES } from "./beam";
import { mountSpotlightHeader } from "./controller";
import { BEAM_H, BEAM_W } from "./geometry";
import { Icon } from "./icons";
import { TABS } from "./tabs";
import styles from "./SpotlightHeader.module.css";

// display: block keeps the labels hidden until the face has loaded, so the measured widths are the real ones.
const hostGrotesk = Host_Grotesk({ subsets: ["latin"], weight: ["400", "500"], display: "block" });

/** Which tab is current: Pricing (2) on /pricing or once the pricing section is under the reading line, else
 *  How it works (1) or Overview (0). */
function sectionInView() {
  if (window.location.pathname === "/pricing") return 2;
  const line = window.innerHeight * 0.45;
  const pricing = document.getElementById("pricing");
  if (pricing && pricing.getBoundingClientRect().top < line) return 2;
  const how = document.getElementById("how-it-works");
  return how && how.getBoundingClientRect().top < line ? 1 : 0;
}

/** `quiet` (used on /pricing) drops the decorative beam and floor glow and lets the bar's frame loop sleep once the
 *  pill has settled, so nothing competes with the offer. */
export function SpotlightHeader({ quiet = false }: { quiet?: boolean }) {
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const family = hostGrotesk.style.fontFamily.split(",")[0];
    const handle = mountSpotlightHeader(scene, family, { quiet, initial: sectionInView() }, (i, event) => {
      const href = TABS[i].href;
      if (!href.startsWith("#")) return;
      event.preventDefault();
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (href === "#top") window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
      else document.querySelector(href)?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
      history.replaceState(null, "", href === "#top" ? location.pathname : href);
    });

    let ticking = 0;
    const onScroll = () => {
      cancelAnimationFrame(ticking);
      ticking = requestAnimationFrame(() => handle.setActive(sectionInView()));
    };
    handle.setActive(sectionInView());
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(ticking);
      handle.dispose();
    };
  }, [quiet]);

  return (
    <header className={`${styles.header} ${hostGrotesk.className} ${quiet ? styles.quiet : ""}`}>
      <Link href="/" className={styles.wordmark} aria-label="Replacement Radar home">
        <span className={styles.mark} aria-hidden="true" />
        <span className={styles.wordmarkText}>Replacement Radar</span>
      </Link>
      <div className={styles.stage}>
        <div ref={sceneRef} className={styles.scene}>
          <canvas data-part="beam" className={styles.beam} width={BEAM_W * BEAM_RES} height={BEAM_H * BEAM_RES} aria-hidden="true" />
          <div data-part="floor" className={styles.floor} />
          <nav data-part="bar" className={styles.bar} aria-label="Primary">
            <div data-part="rimlight" className={styles.rimlight} />
            <div data-part="hover" className={`${styles.pill} ${styles.hover}`}>
              <div className={styles.hoverRing} />
            </div>
            <div data-part="active" className={`${styles.pill} ${styles.active}`}>
              <div data-part="caustic" className={styles.caustic} />
            </div>
            {TABS.map(({ icon, label, href }) => (
              <Link key={label} href={href} data-part="tab" className={styles.tab} aria-label={label}>
                <Icon name={icon} className={styles.icon} />
                <span className={styles.label}>{label}</span>
              </Link>
            ))}
            <div className={styles.probe} aria-hidden="true">
              {TABS.map(({ label }) => (
                <div key={label} data-part="probe" className={styles.probeTab}>
                  <span className={styles.probeIcon} />
                  <span className={styles.label}>{label}</span>
                </div>
              ))}
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}
