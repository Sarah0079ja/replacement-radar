import Link from "next/link";
import styles from "../../login/login.module.css";

export default function CheckoutCancelPage() {
  return <main className={styles.page}><section className={styles.authPanel} aria-labelledby="cancel-title"><div className={styles.brand}><span className={styles.brandMark}>R</span><span>ResponseHVAC</span></div><div className={styles.formIntro}><p className={styles.kicker}>CHECKOUT PAUSED</p><h1 id="cancel-title">Your account is still here.</h1><p className={styles.intro}>No subscription was started. You can return to secure checkout whenever you&apos;re ready.</p></div><Link className={styles.submit} href="/checkout">Return to checkout <span aria-hidden="true">↗</span></Link></section></main>;
}
