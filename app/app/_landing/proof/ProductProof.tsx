"use client";

import gsap from "gsap";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { COHORT, FOCUS, HOMES, PRIORITY, STATUSES, WEEK, evidence, whyItStandsOut, type DemoHome, type Status } from "./demo";
import styles from "./proof.module.css";

// Product proof: the real This Week screen, rendered with the product's own markup and global classes (globals.css)
// and illustrative data. One GSAP timeline plays once when the section comes into view: headline → orange rule →
// the light product rises in → one HIGH PRIORITY row takes focus → a thin orange line runs to "Why this home?" → the
// real property drawer opens and settles on its source evidence. Afterwards the preview is a small local demo
// (click a row, change a status, close the drawer); nothing is wired to real data.

const REDUCED = "(prefers-reduced-motion: reduce)";
const WIDE = "(min-width: 1100px)";
const MOBILE = "(max-width: 760px)";

function HvacCell({ h }: { h: DemoHome }) {
  return h.permitDate ? (
    <>
      <strong>{h.permitDate}</strong>
      <span>{h.elapsed}</span>
      <small>{h.event}</small>
    </>
  ) : (
    <>
      <strong>No recorded event</strong>
      <span>Since 2018 coverage start</span>
      <small>Current system unknown</small>
    </>
  );
}

function Evidence({ h, compact = false }: { h: DemoHome; compact?: boolean }) {
  const rows = evidence(h);
  return (
    <div className="evidence-stack">
      {(compact ? [rows[2], rows[3], rows[4]] : rows).map((r) => (
        <div className="source-row" key={r.title}>
          <span className={`tag tag-${r.tone}`}>{r.label}</span>
          <div>
            <strong>{r.title}</strong>
            <span>{r.value}</span>
            {r.source && <small>{r.source}</small>}
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailHead({ h }: { h: DemoHome }) {
  return (
    <>
      <div className="detail-priority-row">
        <span className={`priority-label priority-${h.tone}`}>{PRIORITY[h.tone]}</span>
        <span className="detail-priority-note">Priority is based on recorded HVAC and property signals.</span>
      </div>
      <div className="standout-section">
        <span className="detail-kicker">WHY THIS HOME STANDS OUT</span>
        <p>{whyItStandsOut(h)}</p>
      </div>
      <div className="detail-section hvac-highlight-section">
        <h3>Last HVAC record</h3>
        {h.permitDate ? (
          <div className="hvac-highlight">
            <strong>{h.permitDate}</strong>
            <span>{h.elapsed}</span>
            <small>{h.event}</small>
          </div>
        ) : (
          <div className="hvac-highlight hvac-highlight-unknown">
            <strong>No recorded HVAC event</strong>
            <span>Since 2018 coverage start</span>
            <small>Current system unknown</small>
          </div>
        )}
        <p className="hvac-caveat">This is the last recorded public event, not verified current equipment age.</p>
      </div>
    </>
  );
}

export function ProductProof() {
  const ref = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [statuses, setStatuses] = useState<Status[]>(() => HOMES.map((h) => h.status));
  const [focus, setFocus] = useState<number | null>(null);
  const [active, setActive] = useState(FOCUS);
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState(false);

  // Pipeline counts follow the demo's status changes, the way the real strip does.
  const count = (s: Status) => statuses.filter((v) => v === s).length - HOMES.filter((h) => h.status === s).length;
  const strip = {
    remaining: COHORT.remaining + count("NEW"),
    contacted: COHORT.contacted + count("CONTACTED"),
    appointments: COHORT.appointments + count("APPOINTMENT"),
    won: COHORT.won + count("WON"),
  };
  const setStatus = (i: number, s: Status) => setStatuses((prev) => prev.map((v, j) => (j === i ? s : v)));
  const home = HOMES[active];

  useEffect(() => {
    const section = ref.current;
    const panel = panelRef.current;
    if (!section || !panel) return;
    const reduced = window.matchMedia(REDUCED).matches;
    const wide = window.matchMedia(WIDE).matches;
    const mobile = window.matchMedia(MOBILE).matches;
    const q = (sel: string) => Array.from(section.querySelectorAll<HTMLElement>(sel));

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
      tl.fromTo(q("[data-intro]"), { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.08 }, 0);
      tl.fromTo(q("[data-rule]"), { scaleX: 0 }, { scaleX: 1, duration: 1.1, ease: "power2.inOut" }, 0.45);

      if (mobile) {
        // Phone: one HIGH PRIORITY card, then its detail and evidence.
        tl.fromTo(q("[data-mcard]"), { autoAlpha: 0, y: 56 }, { autoAlpha: 1, y: 0, duration: 1.1, ease: "expo.out" }, 0.8);
        tl.call(() => setFocus(FOCUS), [], 1.9);
        tl.fromTo(q("[data-mdetail]"), { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 1, ease: "expo.out" }, 2.4);
        tl.fromTo(q("[data-aside]"), { autoAlpha: 0, x: -80 }, { autoAlpha: 1, x: 0, duration: 0.8, ease: "power3.out" }, 2.8);
        tl.fromTo(
          q("[data-why], [data-aside-item]"),
          { autoAlpha: 0, x: -14 },
          { autoAlpha: 1, x: 0, duration: 0.6, stagger: 0.08, ease: "power3.out" },
          2.85,
        );
      } else {
        // 01 + 02: the editorial block slides in from the left while the product comes in from the right; both
        // settle on the same top line at about the same moment.
        tl.fromTo(q("[data-aside]"), { autoAlpha: 0, x: -100 }, { autoAlpha: 1, x: 0, duration: 0.9, ease: "power3.out" }, 0.8);
        tl.fromTo(
          q("[data-why], [data-aside-item]"),
          { autoAlpha: 0, x: -18 },
          { autoAlpha: 1, x: 0, duration: 0.7, stagger: 0.08, ease: "power3.out" },
          0.85,
        );
        tl.fromTo(q("[data-product]"), { autoAlpha: 0, x: 64 }, { autoAlpha: 1, x: 0, duration: 1, ease: "power3.out" }, 0.85);
        tl.fromTo(q("[data-note]"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 }, 1.6);

        // 03: this property ranks higher (a short orange line crosses the gutter from its row toward the copy) …
        tl.call(() => setFocus(FOCUS), [], 2);
        const sig = section.querySelector<HTMLElement>("[data-sig]")!;
        if (wide) {
          tl.call(
            () => {
              const s = section.getBoundingClientRect();
              const row = section.querySelector<HTMLElement>(`[data-row="${FOCUS}"]`)!.getBoundingClientRect();
              const aside = section.querySelector<HTMLElement>("[data-aside]")!.getBoundingClientRect();
              const x1 = aside.right - s.left + 8;
              const x2 = row.left - s.left - 6;
              sig.style.left = `${x1}px`;
              sig.style.top = `${row.top + row.height / 2 - s.top}px`;
              sig.style.width = `${Math.max(0, x2 - x1)}px`;
            },
            [],
            2.1,
          );
          tl.fromTo(sig, { scaleX: 0, autoAlpha: 1 }, { scaleX: 1, duration: 0.5, ease: "power2.inOut" }, 2.15);
        }

        // 04: … here is why: the real drawer opens, holds on the reason, then settles on its source evidence.
        tl.call(() => setOpen(true), [], 2.7);
        if (wide) tl.to(sig, { autoAlpha: 0, duration: 0.4, ease: "power1.out" }, 2.8);
        tl.to(
          panel,
          {
            scrollTop: () => (panel.querySelector<HTMLElement>("[data-evidence]")?.offsetTop ?? 0) - 24,
            duration: 1.4,
            ease: "power2.inOut",
          },
          4.3,
        );
      }
      tl.call(() => setLive(true), [], mobile ? 3.6 : 5.8);

      if (reduced) {
        tl.progress(1);
        return;
      }
      const io = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting) return;
          io.disconnect();
          tl.play();
        },
        { threshold: 0.3 },
      );
      io.observe(section);
      return () => io.disconnect();
    }, section);

    return () => ctx.revert();
  }, []);

  const openHome = (i: number) => {
    if (!live) return;
    setActive(i);
    setFocus(i);
    setOpen(true);
    if (panelRef.current) panelRef.current.scrollTop = 0;
  };

  return (
    <section ref={ref} className={styles.section} aria-labelledby="proof-title">
      <div className={styles.inner}>
        <div className={styles.copy}>
          <p data-intro className={styles.eyebrow}>
            This week
          </p>
          <h2 data-intro id="proof-title" className={styles.title}>
            Monday, sorted.
          </h2>
          <p data-intro className={styles.lede}>
            Your strongest prospecting opportunities, prioritized and ready to work.
          </p>
          <p data-intro className={styles.small}>
            Start with the homes worth investigating first. See the evidence. Work the list.
          </p>
        </div>

        <span data-rule className={styles.rule} aria-hidden="true" />

        <div data-aside className={styles.aside}>
          <p data-why className={styles.why}>
            Why this home?
          </p>
          <h3 data-aside-item className={styles.asideTitle}>
            Not just an address.
          </h3>
          <p data-aside-item className={styles.asideBody}>
            See why a home stands out before you decide whether it&rsquo;s worth your team&rsquo;s time.
          </p>
          <dl className={styles.points}>
            <div data-aside-item>
              <dt>Recorded history</dt>
              <dd>See the HVAC history on record, and how long ago it was.</dd>
            </div>
            <div data-aside-item>
              <dt>Property context</dt>
              <dd>Understand the home behind the opportunity.</dd>
            </div>
            <div data-aside-item>
              <dt>Evidence</dt>
              <dd>Every source marked Verified data, Inference or Unknown.</dd>
            </div>
          </dl>
          <Link data-aside-item href="/how-we-know" className={styles.howLink}>
            See how we know <span aria-hidden="true">→</span>
          </Link>
        </div>

        {/* Desktop and tablet: the This Week screen itself. */}
        <div className={styles.stage}>
          <div data-product className={`${styles.product} ${live ? styles.live : ""}`}>
            <div className="title-row weekly-title-row">
              <div>
                <div className="eyebrow">
                  SUPPORTED TERRITORY <span className="eyebrow-dot" /> YOUR SERVICE AREA
                </div>
                <h1 className={styles.productH1}>This Week · {WEEK}</h1>
                <p className="intro">Your weekly prospect list. Work through these before next Monday.</p>
              </div>
            </div>
            <section className="weekly-progress-strip" aria-label="This week's progress">
              <div>
                <span>PROSPECTS THIS WEEK</span>
                <strong>{COHORT.size}</strong>
              </div>
              <div>
                <span>REMAINING</span>
                <strong>{strip.remaining}</strong>
              </div>
              <div>
                <span>
                  CONTACTED <em>pipeline total</em>
                </span>
                <strong>{strip.contacted}</strong>
              </div>
              <div>
                <span>
                  APPOINTMENTS <em>pipeline total</em>
                </span>
                <strong>{strip.appointments}</strong>
              </div>
              <div>
                <span>
                  WON <em>pipeline total</em>
                </span>
                <strong>{strip.won}</strong>
              </div>
            </section>
            <div className="weekly-filter-bar" aria-hidden="true">
              <button type="button" tabIndex={-1} className="weekly-filter-active">
                All {COHORT.size}
              </button>
              <button type="button" tabIndex={-1}>
                To Do {strip.remaining}
              </button>
              <button type="button" tabIndex={-1}>
                Worked {COHORT.size - strip.remaining}
              </button>
            </div>
            <div className={`weekly-table-wrap ${styles.tableWrap}`}>
              <table className="weekly-table">
                <thead>
                  <tr>
                    <th>Property</th>
                    <th>Priority</th>
                    <th>Last HVAC record</th>
                    <th>Home</th>
                    <th>Status</th>
                    <th aria-label="Details" />
                  </tr>
                </thead>
                <tbody className={focus !== null ? styles.dimmed : undefined}>
                  {HOMES.map((h, i) => {
                    const st = statuses[i];
                    return (
                      <tr
                        key={h.address}
                        data-row={i}
                        className={`weekly-row status-${st.toLowerCase().replaceAll(" ", "-")} ${styles.row} ${focus === i ? styles.focusRow : ""}`}
                        onClick={() => openHome(i)}
                      >
                        <td>
                          <div className="address">{h.address}</div>
                          <div className="subline">{h.zip}</div>
                        </td>
                        <td>
                          <span className={`priority-label priority-${h.tone}`}>{PRIORITY[h.tone]}</span>
                        </td>
                        <td className="hvac-record-cell">
                          <HvacCell h={h} />
                        </td>
                        <td className="home-context-cell">
                          <strong>{h.sqft}</strong>
                          <span>Built {h.built}</span>
                        </td>
                        <td>
                          <select
                            aria-label={`Status for ${h.address}`}
                            value={st}
                            disabled={!live}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setStatus(i, e.target.value as Status)}
                          >
                            {STATUSES.map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <span className="row-arrow" aria-hidden="true">
                            →
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* The real property drawer, inside the preview rather than over the page. */}
            <div className={`${styles.drawer} ${open ? styles.open : ""}`}>
              <div className={styles.backdrop} onClick={() => live && setOpen(false)} aria-hidden="true" />
              <aside ref={panelRef} className={`detail-panel ${styles.panel}`} aria-label="Property detail preview">
                <div className="detail-header">
                  <div>
                    <div className="eyebrow">
                      PROPERTY DETAIL <span className="eyebrow-dot" /> SUPPORTED
                    </div>
                    <h2>{home.address}</h2>
                    <p>{home.zip}</p>
                  </div>
                  <button
                    type="button"
                    className="close-button"
                    aria-label="Close detail"
                    tabIndex={live ? 0 : -1}
                    onClick={() => live && setOpen(false)}
                  >
                    ×
                  </button>
                </div>
                <DetailHead h={home} />
                <div className="detail-section">
                  <h3>Home and ownership</h3>
                  <dl className="overview-grid">
                    <div className="overview-item">
                      <dt className="overview-label">Property type</dt>
                      <dd className="overview-value">Single-family residential</dd>
                    </div>
                    <div className="overview-item">
                      <dt className="overview-label">Living area</dt>
                      <dd className="overview-value">{home.sqft}</dd>
                    </div>
                    <div className="overview-item">
                      <dt className="overview-label">Current owner</dt>
                      <dd className="overview-value">Owner details hidden</dd>
                    </div>
                    <div className="overview-item">
                      <dt className="overview-label">Owner occupancy</dt>
                      <dd className="overview-value">
                        {home.occupancy ? (
                          <>
                            <span>{home.occupancy}</span>
                            <span className="inferred-label">Inferred</span>
                          </>
                        ) : (
                          "Not available"
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="detail-section">
                  <h3>Lead status</h3>
                  <select
                    aria-label="Lead status"
                    value={statuses[active]}
                    disabled={!live}
                    onChange={(e) => setStatus(active, e.target.value as Status)}
                  >
                    {STATUSES.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </div>
                <div data-evidence className="detail-section source-evidence-section">
                  <h3>Source evidence</h3>
                  <Evidence h={home} />
                </div>
              </aside>
            </div>
          </div>
          <p data-note className={styles.note}>
            Illustrative data · owner details hidden
          </p>
        </div>

        {/* Phone: one HIGH PRIORITY property and its evidence. */}
        <div className={styles.mobile}>
          <div
            data-mcard
            className={`mobile-prospect-card weekly-compact-card status-new ${styles.mcard} ${focus !== null ? styles.mcardFocus : ""}`}
          >
            <div className="weekly-compact-top">
              <div className="mobile-card-property">
                <strong>{HOMES[FOCUS].address}</strong>
                <span>{HOMES[FOCUS].zip}</span>
              </div>
              <div className="weekly-compact-badges">
                <span className="priority-label priority-high">HIGH PRIORITY</span>
                <span className="status-label">NEW</span>
              </div>
            </div>
            <div className="weekly-compact-hvac">
              <span className="mobile-card-label">Last HVAC</span>
              <strong>
                {HOMES[FOCUS].permitDate} · {HOMES[FOCUS].elapsed.replace(" ago", "")}
              </strong>
              <small>{HOMES[FOCUS].event}</small>
            </div>
            <div className="weekly-compact-context">
              Built {HOMES[FOCUS].built} · {HOMES[FOCUS].sqft}
            </div>
            <span className="mobile-card-action">
              View property <span aria-hidden="true">→</span>
            </span>
          </div>
          <div data-mdetail className={`detail-panel ${styles.mdetail}`}>
            <div className="eyebrow">
              PROPERTY DETAIL <span className="eyebrow-dot" /> SUPPORTED
            </div>
            <DetailHead h={HOMES[FOCUS]} />
            <div className="detail-section source-evidence-section">
              <h3>Source evidence</h3>
              <Evidence h={HOMES[FOCUS]} compact />
            </div>
          </div>
          <p className={styles.note}>Illustrative data · owner details hidden</p>
        </div>
      </div>
      <span data-sig className={styles.sig} aria-hidden="true" />
    </section>
  );
}
