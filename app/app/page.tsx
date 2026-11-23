import { SpotlightHeader } from "./_landing/header/SpotlightHeader";
import { HeroFilm } from "./_landing/hero/HeroFilm";
import { HowItWorks } from "./_landing/how/HowItWorks";
import { FinalCta, LandingFooter, Pricing } from "./_landing/pricing/Pricing";
import { ProductProof } from "./_landing/proof/ProductProof";
import { WorkTheList } from "./_landing/work/WorkTheList";
import styles from "./_landing/landing.module.css";

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <SpotlightHeader />
      <main>
        <HeroFilm />
        <HowItWorks />
        <Pricing />
        <ProductProof />
        <WorkTheList />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
