import { SpotlightHeader } from "../_landing/header/SpotlightHeader";
import { HowWeKnow } from "../_landing/evidence/HowWeKnow";
import { LandingFooter } from "../_landing/pricing/Pricing";
import styles from "../_landing/landing.module.css";

export const metadata = {
  title: "How we know — Replacement Radar",
  description:
    "See how Replacement Radar finds homes worth working, backed by recorded property and HVAC history.",
};

export default function HowWeKnowPage() {
  return (
    <div className={styles.page}>
      <SpotlightHeader quiet />
      <main>
        <HowWeKnow />
      </main>
      <LandingFooter />
    </div>
  );
}
