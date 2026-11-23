"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { FOCUS, HOMES } from "../proof/demo";
import { ATTACH, BEHIND, FRONT, ROADS, SUBJECT_SHAPES, UNIT_SHAPES, type Shape } from "./street";
import styles from "./evidence.module.css";

gsap.registerPlugin(ScrollTrigger);

// How we know, as one scroll story about one house on one street (7310 Larkspur Ln). The street is drawn in lines;
// as you scroll, one roof lights up orange and the story follows that house: a verified record attaches → time
// passes (inference) → the customer's view in ResponseHVAC.
//
// Desktop: a sticky SVG scene beside five copy blocks; ONE ScrollTrigger scrubs ONE master timeline whose time is
// the beat (0…3), so the drawing transforms continuously with scroll. Phones and reduced motion: the copy and the
// same scene stack beat by beat (phones animate each step once; reduced motion shows each final state).
// The story is about transparency of evidence only: no inputs, scoring, weighting or ranking logic.

const REDUCED = "(prefers-reduced-motion: reduce)";
const STACKED = "(max-width: 860px)";
const home = HOMES[FOCUS];
const YEARS = home.elapsed.split(" ")[0]; // "14"

function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/* ------------------------------------------------------------------ The four beats of copy */
const BEATS: { tone: "neutral" | "verified" | "inference" | "product"; eyebrow: string; title: ReactNode; body: ReactNode }[] = [
  {
    tone: "neutral",
    eyebrow: "How we know",
    title: "Your next replacement job is already on the map.",
    body: (
      <p>
        Every street in your service area has homes ready for a new HVAC system or service. ResponseHVAC finds
        them for you.
      </p>
    ),
  },
  {
    tone: "verified",
    eyebrow: "Recorded HVAC history",
    title: "Backed by real HVAC records.",
    body: (
      <>
        <p>Every home we surface comes with its recorded HVAC history, straight from the property&rsquo;s records.</p>
        <p className={styles.mono}>Last HVAC replacement · {home.permitDate}</p>
      </>
    ),
  },
  {
    tone: "inference",
    eyebrow: "The timing",
    title: "Then we spot the homes that are due.",
    body: (
      <p>
        {YEARS} years since the last HVAC replacement. ResponseHVAC flags homes at that stage so your team reaches
        them first.
      </p>
    ),
  },
  {
    tone: "product",
    eyebrow: "The opportunity",
    title: "Your next job, ready to work.",
    body: (
      <p>
        ResponseHVAC puts homes like this in front of your team every week, prioritized and backed by the
        records, so you know exactly where to start.
      </p>
    ),
  },
];

function Beat({ i, first = false }: { i: number; first?: boolean }) {
  const b = BEATS[i];
  const Title = first ? "h1" : "h2";
  return (
    <div className={`${styles.beatCopy} ${styles[`tone_${b.tone}`]}`}>
      <p className={styles.eyebrow}>{b.eyebrow}</p>
      <Title className={styles.beatTitle}>{b.title}</Title>
      <div className={styles.beatBody}>{b.body}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ The scene: one street, four states */
function SketchPath({ sh }: { sh: Shape }) {
  return <path data-draw data-roof={sh.roof ? "" : undefined} pathLength={1} d={sh.d} className={styles[`k_${sh.kind}`]} />;
}

function Scene() {
  return (
    <div className={styles.scene}>
      <svg data-world className={styles.world} viewBox="0 0 640 560" role="img" aria-label={`A service-area street; ${home.address} highlighted`}>
        {/* Sun: the passage of time (beat 3). */}
        <circle data-sun cx="210" cy="72" r="11" className={styles.sun} />

        <g data-street>
          {/* An aerial pencil sketch of the neighbourhood: roads, then houses, trees and cars in depth order. */}
          <g data-roads className={styles.roads}>
            {ROADS.fill.map((d) => (
              <path key={d} d={d} className={styles.roadFill} />
            ))}
            {ROADS.edges.map((d) => (
              <path key={d} data-draw pathLength={1} d={d} className={styles.roadEdge} />
            ))}
            {ROADS.dashes.map((d) => (
              <path key={d} d={d} className={styles.roadDash} />
            ))}
          </g>
          <g data-neighbours className={styles.sketch}>
            {BEHIND.map((sh, i) => (
              <SketchPath key={i} sh={sh} />
            ))}
          </g>
          {/* 7310 Larkspur Ln: the house the story follows. */}
          <g data-house className={`${styles.sketch} ${styles.subject}`}>
            <path d={ROADS.driveway} className={styles.roadFill} />
            {SUBJECT_SHAPES.map((sh, i) => (
              <SketchPath key={i} sh={sh} />
            ))}
          </g>
          <g data-neighbours className={styles.sketch}>
            {FRONT.map((sh, i) => (
              <SketchPath key={i} sh={sh} />
            ))}
          </g>
        </g>
        <text data-street-name x="320" y="552" className={styles.streetName}>
          SERVICE AREA · TEXAS
        </text>
        <text data-address x="320" y="552" className={styles.addressRoad}>
          {home.address.toUpperCase()} · TX {home.zip}
        </text>

        {/* The outdoor unit beside the house. */}
        <g data-unit-solid className={`${styles.sketch} ${styles.unitSolid}`}>
          <path d={UNIT_SHAPES.side} className={styles.k_shade} />
          <path d={UNIT_SHAPES.front} className={styles.k_wall} />
          <path d={UNIT_SHAPES.top} className={styles.k_roof} />
        </g>

        {/* Beat 2: the recorded event attaches to the house. */}
        <g data-record className={styles.record}>
          <path d="M40 64H164L180 80V156H40Z" />
          <path d="M164 64V80H180" />
          <text x="54" y="98" className={styles.recordSmall}>
            HVAC REPLACEMENT
          </text>
          <text x="54" y="124" className={styles.recordBig}>
            {home.permitDate?.toUpperCase()}
          </text>
          <path d="M54 140H140" className={styles.recordRule} />
        </g>
        <text data-record-label x="40" y="50" className={`${styles.tag} ${styles.tagVerified}`}>
          VERIFIED DATA · RECORDED HVAC REPLACEMENT
        </text>
        <path data-leader pathLength={1} d={`M180 132C300 150 ${ATTACH[0] - 30} ${ATTACH[1] - 120} ${ATTACH[0]} ${ATTACH[1]}`} className={styles.leader} />
        <circle data-attach cx={ATTACH[0]} cy={ATTACH[1]} r="4.5" className={styles.attach} />
        <circle data-marker cx="180" cy="132" r="5" className={styles.attach} />

        {/* Beat 3: time since the event, an inference that stops before the unit. */}
        <path data-inference pathLength={1} d="M226 486H372" className={styles.inferenceLine} />
        <path data-tick-2012 d="M226 478V494" className={styles.tickVerified} />
        <text data-year x="226" y="470" className={`${styles.small} ${styles.smallVerified}`}>
          2012
        </text>
        <text data-inference-label x="300" y="512" className={`${styles.small} ${styles.smallInference}`}>
          {YEARS} YEARS SINCE LAST HVAC REPLACEMENT
        </text>
        <text data-inference-note x="300" y="528" className={styles.note}>
          Time to reach out
        </text>

        {/* Beat 4: where we stop. */}
        <path data-stop d="M376 476V496" className={styles.stop} />
        <text data-today x="376" y="470" className={`${styles.small} ${styles.smallUnknown}`}>
          TODAY
        </text>
      </svg>

      {/* Beat 5: the customer's view, in the product's own UI. */}
      <div className={styles.panelWrap}>
        <div data-panel className={styles.panel}>
          <div className="detail-header">
            <div>
              <div className="eyebrow">
                PROPERTY DETAIL <span className="eyebrow-dot" /> SUPPORTED
              </div>
              <h3 className={styles.panelTitle}>{home.address}</h3>
              <p>TX {home.zip}</p>
            </div>
          </div>
          <div data-panel-priority className="detail-priority-row">
            <span className="priority-label priority-high">HIGH PRIORITY</span>
          </div>
          <div className={styles.panelEvidence}>
            <span className="detail-kicker">WHY THIS HOME STANDS OUT</span>
            <div className="evidence-stack">
              <div data-panel-ev className="source-row">
                <span className="tag tag-verified">VERIFIED DATA</span>
                <div>
                  <strong>Recorded HVAC replacement</strong>
                  <span>{home.permitDate}</span>
                </div>
              </div>
              <div data-panel-ev className="source-row">
                <span className="tag tag-verified">VERIFIED DATA</span>
                <div>
                  <strong>Property year built</strong>
                  <span>{home.built}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The master timeline for one scene. Its time is the story beat: 0 = just a house, 1 = verified record,
 * 2 = time / inference, 3 = the opportunity in the product.
 */
function buildScene(root: HTMLElement) {
  const q = (s: string) => Array.from(root.querySelectorAll(s));
  const one = (s: string) => root.querySelector(s)!;
  const tl = gsap.timeline({ paused: true, defaults: { ease: "power2.inOut" } });

  // Starting state (beat 0): a whole street, nothing selected.
  gsap.set(q("[data-record], [data-record-label], [data-leader], [data-attach], [data-marker]"), { autoAlpha: 0 });
  gsap.set(q("[data-inference], [data-tick-2012], [data-year], [data-inference-label], [data-inference-note]"), { autoAlpha: 0 });
  gsap.set(q("[data-stop], [data-today]"), { autoAlpha: 0 });
  gsap.set(one("[data-address]"), { autoAlpha: 0 });
  gsap.set(q("[data-roof]"), { fill: "rgba(255,122,85,0)" });
  gsap.set(one("[data-sun]"), { autoAlpha: 0 });
  gsap.set(one("[data-panel]"), { autoAlpha: 0, y: 36, scale: 0.96 });
  gsap.set(q("[data-panel-ev], [data-panel-priority]"), { autoAlpha: 0, x: -14 });

  // 0 → 0.4: one roof on the street lights up orange; the neighbours fall back; the address resolves.
  tl.to(q("[data-roof]"), { stroke: "#ff7a55", fill: "rgba(255,122,85,0.2)", duration: 0.3 }, 0.04);
  tl.to(q("[data-neighbours]"), { opacity: 0.22, duration: 0.35 }, 0.08);
  tl.to(one("[data-roads]"), { opacity: 0.55, duration: 0.35 }, 0.08);
  tl.to(one("[data-house]"), { scale: 1.04, transformOrigin: "50% 100%", duration: 0.4 }, 0.08);
  tl.to(one("[data-street-name]"), { autoAlpha: 0, duration: 0.15 }, 0.18);
  tl.to(one("[data-address]"), { autoAlpha: 1, duration: 0.2 }, 0.26);

  // 0.4 → 1: then the information arrives — a verified record attaches to that house.
  tl.to(one("[data-record]"), { autoAlpha: 1, duration: 0.25 }, 0.42);
  tl.fromTo(one("[data-record]"), { y: -14 }, { y: 0, duration: 0.3, ease: "power3.out" }, 0.42);
  tl.to(one("[data-marker]"), { autoAlpha: 1, duration: 0.05 }, 0.58);
  tl.fromTo(one("[data-marker]"), { x: 0, y: 0 }, { x: ATTACH[0] - 180, y: ATTACH[1] - 132, duration: 0.3, ease: "power1.inOut" }, 0.6);
  tl.to(one("[data-marker]"), { autoAlpha: 0, duration: 0.05 }, 0.9);
  tl.to(one("[data-leader]"), { autoAlpha: 1, duration: 0.01 }, 0.6);
  tl.fromTo(one("[data-leader]"), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.3 }, 0.6);
  tl.to(one("[data-attach]"), { autoAlpha: 1, duration: 0.1 }, 0.88);
  tl.to(one("[data-record-label]"), { autoAlpha: 1, duration: 0.15 }, 0.82);

  // 1 → 2: time passes — the sun crosses — and an orange inference runs from 2012 toward today, stopping short.
  const sun = one("[data-sun]") as SVGCircleElement;
  const arc = { t: 0 };
  tl.to(sun, { autoAlpha: 1, duration: 0.1 }, 1.05);
  tl.to(
    arc,
    {
      t: 1,
      duration: 0.8,
      ease: "none",
      onUpdate: () => {
        sun.setAttribute("cx", String(210 + arc.t * 380));
        sun.setAttribute("cy", String(72 - Math.sin(Math.PI * arc.t) * 34));
      },
    },
    1.05,
  );
  tl.to(q("[data-tick-2012], [data-year]"), { autoAlpha: 1, duration: 0.12 }, 1.15);
  tl.to(one("[data-inference]"), { autoAlpha: 1, duration: 0.01 }, 1.2);
  tl.fromTo(one("[data-inference]"), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.55 }, 1.2);
  tl.to(q("[data-inference-label], [data-inference-note]"), { autoAlpha: 1, duration: 0.15, stagger: 0.05 }, 1.6);
  tl.to(q("[data-stop], [data-today]"), { autoAlpha: 1, duration: 0.12 }, 1.72);

  // 2 → 3: the street steps back; the evidence settles into the product's own detail view.
  tl.to(q("[data-record-label], [data-inference-label], [data-inference-note], [data-year], [data-today]"), { autoAlpha: 0, duration: 0.2 }, 2.05);
  tl.to(one("[data-world]"), { scale: 0.74, x: "-14%", y: "-6%", opacity: 0.32, transformOrigin: "50% 50%", duration: 0.55 }, 2.1);
  tl.to(one("[data-panel]"), { autoAlpha: 1, y: 0, scale: 1, duration: 0.45, ease: "power3.out" }, 2.3);
  tl.to(one("[data-panel-priority]"), { autoAlpha: 1, x: 0, duration: 0.2 }, 2.55);
  tl.to(q("[data-panel-ev]"), { autoAlpha: 1, x: 0, duration: 0.2, stagger: 0.1 }, 2.62);
  tl.set({}, {}, 3);
  return tl;
}

/** Draw the street in once, on arrival (not tied to scroll). */
function drawHouse(root: HTMLElement) {
  return gsap.fromTo(
    root.querySelectorAll("[data-street] [data-draw]"),
    { strokeDashoffset: 1 },
    { strokeDashoffset: 0, duration: 0.9, stagger: { amount: 1.1, from: "start" }, ease: "power2.inOut" },
  );
}

/* ------------------------------------------------------------------ Desktop: sticky scene, scrubbed */
function StickyStory() {
  const trackRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const track = trackRef.current;
    const scene = sceneRef.current;
    if (!track || !scene) return;
    const ctx = gsap.context(() => {
      const tl = buildScene(scene);
      drawHouse(scene);
      ScrollTrigger.create({
        trigger: track,
        start: "top top",
        end: "bottom bottom",
        scrub: 0.6,
        animation: tl,
      });
    }, track);
    return () => ctx.revert();
  }, []);
  return (
    <div ref={trackRef} className={styles.track}>
      <div className={styles.copyCol}>
        {BEATS.map((_, i) => (
          <section key={i} className={styles.beat} aria-label={`Story ${i + 1} of ${BEATS.length}`}>
            <Beat i={i} first={i === 0} />
          </section>
        ))}
      </div>
      <div className={styles.stageCol}>
        <div ref={sceneRef} className={styles.stage}>
          <Scene />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Phones / reduced motion: stacked beats */
function StackedBeat({ i, reduced }: { i: number; reduced: boolean }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      const scene = el.querySelector<HTMLElement>("[data-scene-root]")!;
      const tl = buildScene(scene);
      if (reduced) {
        tl.time(i);
        return;
      }
      tl.time(Math.max(0, i - 1));
      const io = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting) return;
          io.disconnect();
          if (i === 0) drawHouse(scene);
          else tl.tweenFromTo(i - 1, i, { duration: 1.6, ease: "power1.inOut" });
        },
        { threshold: 0.45 },
      );
      io.observe(scene);
      return () => io.disconnect();
    }, el);
    return () => ctx.revert();
  }, [i, reduced]);
  return (
    <section ref={ref} className={styles.stackBeat}>
      <Beat i={i} first={i === 0} />
      <div data-scene-root className={styles.stackScene}>
        <Scene />
      </div>
    </section>
  );
}

function StackedStory({ reduced }: { reduced: boolean }) {
  return (
    <div className={styles.stack}>
      {BEATS.map((_, i) => (
        <StackedBeat key={i} i={i} reduced={reduced} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ CTA (unchanged copy) */
function Cta() {
  return (
    <section className={styles.cta} aria-labelledby="hwk-cta-title">
      <h2 id="hwk-cta-title" className={styles.ctaTitle}>
        See the evidence.
        <br />
        Then make the call.
      </h2>
      <p className={styles.ctaLede}>Start next week with the homes most ready for your call.</p>
      <div className={styles.ctaActions}>
        <Link href="/territory" className={styles.button}>
          Start your 5-day trial
        </Link>
        <Link href="/#how-it-works" className={styles.secondary}>
          See how it works <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}

export function HowWeKnow() {
  const stacked = useMedia(STACKED);
  const reduced = useMedia(REDUCED);
  return (
    <div className={styles.page}>
      {stacked || reduced ? <StackedStory reduced={reduced} /> : <StickyStory />}
      <Cta />
    </div>
  );
}
