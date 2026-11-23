import Link from "next/link";
import styles from "../../login/login.module.css";

export default function CheckoutSuccessPage() {
  return <main className={styles.page}><section className={styles.authPanel} aria-labelledby="success-title"><div className={styles.brand}><span className={styles.brandMark}>R</span><span>ResponseHVAC</span></div><div className={styles.formIntro}><p className={styles.kicker}>CHECKOUT RECEIVED</p><h1 id="success-title">We&apos;re confirming your trial.</h1><p className={styles.intro}>Stripe has returned you to ResponseHVAC. Your subscription webhook is the source of truth, so we&apos;ll send you to your workspace as soon as the trial is confirmed.</p></div><Link className={styles.submit} href="/dashboard">Continue to ResponseHVAC <span aria-hidden="true">↗</span></Link></section></main>;
}
