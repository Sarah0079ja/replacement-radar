"use client";

import gsap from "gsap";
import { useEffect, useRef, useState } from "react";
import { COHORT, FOCUS, HOMES } from "../proof/demo";
import styles from "./work.module.css";

// Work the list: the same property the This Week preview examined (7310 Larkspur Ln) travels through the product's
// lead statuses: NEW → CONTACTED → APPOINTMENT → WON, with NOT INTERESTED as a quiet side branch. One GSAP timeline
// plays once when the section comes into view; the station positions are measured once when it is built, then the
// property only ever moves by transform. Afterwards, hovering a status shows one line about it.

const REDUCED = "(prefers-reduced-motion: reduce)";
const VERTICAL = "(max-width: 760px)";

/** The product's lead statuses (app/dashboard/page.tsx), with one line each for hover and the demo's microcopy. */
const STATES = [
  { label: "NEW", hint: "Not worked yet.", micro: "Ready to work" },
  { label: "CONTACTED", hint: "Your team has reached out.", micro: "Conversation started" },
  { label: "APPOINTMENT", hint: "A visit is scheduled.", micro: "Visit booked" },
  { label: "WON", hint: "The opportunity converted.", micro: "Opportunity won" },
] as const;

const home = HOMES[FOCUS];

/** The This Week strip after this property is marked Won (same cohort as the preview above). */
const SUMMARY = [
  { label: "PROSPECTS THIS WEEK", value: COHORT.size },
  { label: "REMAINING", value: COHORT.remaining - 1 },
  { label: "CONTACTED", sub: "pipeline total", value: COHORT.contacted },
  { label: "APPOINTMENTS", sub: "pipeline total", value: COHORT.appointments },
  { label: "WON", sub: "pipeline total", value: COHORT.won + 1 },
];

export function WorkTheList() {
  const ref = useRef<HTMLElement>(null);
  const [stage, setStage] = useState(0);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const section = ref.current;
    if (!section) return;
    const reduced = window.matchMedia(REDUCED).matches;
    const q = (sel: string) => Array.from(section.querySelectorAll<HTMLElement>(sel));
    let ctx: gsap.Context | null = null;

    const build = () => {
      const vertical = window.matchMedia(VERTICAL).matches;
      ctx = gsap.context(() => {
        const property = section.querySelector<HTMLElement>("[data-property]")!;
        const trackEl = section.querySelector<HTMLElement>("[data-track]")!;
        const track = trackEl.getBoundingClientRect();
        const anchors = q("[data-anchor]").map((el) => el.getBoundingClientRect());
        const markers = q("[data-marker]").map((el) => el.getBoundingClientRect());
        // Measured once: where the property sits at each station, and how far the progress line reaches.
        const to = anchors.map((a) => ({ x: a.left - anchors[0].left, y: a.top - anchors[0].top }));
        const reach = markers.map((m) =>
          vertical ? (m.top + m.height / 2 - track.top) / track.height : (m.left + m.width / 2 - track.left) / track.width,
        );
        const axis = vertical ? "scaleY" : "scaleX";
        const progress = section.querySelector<HTMLElement>("[data-progress]")!;
        const warm = section.querySelector<HTMLElement>("[data-warm]")!;

        const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
        tl.fromTo(q("[data-intro]"), { autoAlpha: 0, y: 22 }, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.08 }, 0);
        tl.fromTo(trackEl, { [axis]: 0 }, { [axis]: 1, duration: 0.9, ease: "power2.inOut" }, 0.35);
        tl.fromTo(q("[data-station]"), { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.08 }, 0.45);
        tl.fromTo(q("[data-branch]"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6, ease: "power1.out" }, 0.9);

        // NEW: the property arrives and waits.
        tl.fromTo(property, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.6 }, 0.8);
        tl.call(() => setStage(0), [], 0.8);

        // Each move: the same object travels to the next station while the progress line follows it.
        const move = (i: number, at: number) => {
          tl.to(property, { x: to[i].x, y: to[i].y, duration: 0.9, ease: "power3.inOut" }, at);
          tl.to(progress, { [axis]: reach[i], duration: 0.9, ease: "power3.inOut" }, at);
          tl.call(() => setStage(i), [], at + 0.75);
        };
        move(1, 1.7);
        move(2, 3.0);
        // The conversion moment: a short stretch of the line warms to orange, then returns to moss at WON.
        tl.fromTo(warm, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, ease: "power1.inOut" }, 3.35);
        move(3, 4.3);
        tl.to(warm, { autoAlpha: 0, duration: 0.6, ease: "power1.inOut" }, 4.6);

        // The week, after this one is won.
        tl.fromTo(q("[data-stat]"), { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.07 }, 5.3);
        tl.call(() => setLive(true), [], 5.6);

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
          { threshold: 0.35 },
        );
        io.observe(section);
        return () => io.disconnect();
      }, section);
    };

    // Measure after the web fonts settle so the station positions are final.
    let alive = true;
    if (document.fonts && document.fonts.status !== "loaded") document.fonts.ready.then(() => alive && build());
    else build();
    return () => {
      alive = false;
      ctx?.revert();
    };
  }, []);

  return (
    <section ref={ref} className={`${styles.section} ${live ? styles.live : ""}`} aria-labelledby="work-title">
      <div className={styles.inner}>
        <div className={styles.copy}>
          <p data-intro className={styles.eyebrow}>
            Work the list
          </p>
          <h2 data-intro id="work-title" className={styles.title}>
            From opportunity
            <br />
            to outcome.
          </h2>
          <p data-intro className={styles.lede}>
            Keep every property moving — from first contact to appointment to won.
          </p>
        </div>

        <div className={styles.flow}>
          <div data-track className={styles.track} aria-hidden="true">
            <span data-progress className={styles.progress} />
            <span data-warm className={styles.warm} />
          </div>

          <ol className={styles.stations} aria-label="Lead statuses">
            {STATES.map((st, i) => (
              <li
                key={st.label}
                data-station
                className={`${styles.station} ${i === stage ? styles.active : ""} ${i < stage ? styles.done : ""} ${
                  i === 2 ? styles.appointment : ""
                } ${i === 3 ? styles.won : ""}`}
                tabIndex={live ? 0 : -1}
              >
                <span data-marker className={styles.marker} aria-hidden="true" />
                <span className={styles.num} aria-hidden="true">
                  0{i + 1}
                </span>
                <strong className={styles.state}>{st.label}</strong>
                <span className={styles.hint}>{st.hint}</span>
                <span data-anchor className={styles.anchor} aria-hidden="true" />
              </li>
            ))}
          </ol>

          {/* The other way out: leads that don't progress are closed out. */}
          <div data-branch className={styles.branch} tabIndex={live ? 0 : -1}>
            <span className={styles.branchLine} aria-hidden="true" />
            <strong>NOT INTERESTED</strong>
            <span className={styles.hint}>Closed out. It won&rsquo;t come back as new.</span>
          </div>

          {/* The one property, carried over from This Week. */}
          <div data-property className={`${styles.property} ${stage === 2 ? styles.propertyWarm : ""}`} aria-live="polite">
            <span className={styles.from}>From this week</span>
            <strong className={styles.address}>{home.address}</strong>
            <span className={styles.priority}>HIGH PRIORITY</span>
            <span className={styles.record}>
              Last HVAC record <b>{home.permitDate}</b>
            </span>
            <span className={styles.foot}>
              {STATES.map((st, i) => (
                <span key={st.label} className={`${styles.footLine} ${i === stage ? styles.footOn : ""}`} aria-hidden={i !== stage}>
                  <em>{st.label}</em> {st.micro}
                </span>
              ))}
            </span>
          </div>
        </div>

        <dl className={styles.summary} aria-label="This week after the property is won">
          {SUMMARY.map((s) => (
            <div data-stat key={s.label} className={s.label === "WON" ? styles.statWon : undefined}>
              <dt>
                {s.label}
                {s.sub && <em>{s.sub}</em>}
              </dt>
              <dd>{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
