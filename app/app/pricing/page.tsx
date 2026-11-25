import { SpotlightHeader } from "../_landing/header/SpotlightHeader";
import { FinalCta, LandingFooter, Pricing } from "../_landing/pricing/Pricing";
import styles from "../_landing/landing.module.css";

export const metadata = {
  title: "Pricing: ResponseHVAC",
  description: "One plan for Texas HVAC contractors: $99/month after a 5-day free trial. Cancel anytime.",
};

export default function PricingPage() {
  return (
    <div className={styles.page}>
      <SpotlightHeader quiet />
      <main>
        <Pricing howHref="/#how-it-works" level="h1" />
        <FinalCta
          compact
          title={
            <>
              Start next week
              <br />
              with the right homes.
            </>
          }
        />
      </main>
      <LandingFooter />
    </div>
  );
}
