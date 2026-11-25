"use client";

import gsap from "gsap";
import Link from "next/link";
import { useEffect, useRef, type CSSProperties } from "react";
import { DRAW, HOME_DESKTOP, HOME_STACKED, MARKS, MARKS_STACKED, PICKED, SIZES } from "./marks";
import styles from "./pricing.module.css";

// The pricing hero: the whole offer is server-rendered and readable on the first frame. Around it, one short entrance
// timeline (no scroll, no loop) plays once when the hero comes into view: the territory recedes, eight homes turn
// moss and settle into the week's list, a thin rule draws from the list to the price, and the top home warms to amber
// once. If JavaScript or animation is unavailable the page is simply the static offer.

const REDUCED = "(prefers-reduced-motion: reduce)";
const STACKED = "(max-width: 1100px)";
const BASE = 1 / DRAW;
/** Lengths of the abstract list rows (as a fraction of the row), so the rows read as entries, not a table. */
const ROWS = [0.92, 0.7, 0.84, 0.62, 0.78, 0.66, 0.88, 0.58];

export function PricingHero({ howHref, level = "h1" }: { howHref: string; level?: "h1" | "h2" }) {
  const ref = useRef<HTMLElement>(null);
  const Heading = level;

  useEffect(() => {
    const hero = ref.current;
    if (!hero) return;
    const reduced = window.matchMedia(REDUCED).matches;
    const fine = window.matchMedia("(pointer: fine)").matches;
    let ctx: gsap.Context | null = null;
    let started = false;
    let width = window.innerWidth;
    let unhover = () => {};

    // After the entrance: nearby marks lift very slightly under a fine pointer. Work happens only on pointermove
    // (coalesced to one frame); nothing runs otherwise.
    const hover = (marks: HTMLElement[]) => {
      if (!fine || reduced || window.matchMedia(STACKED).matches) return () => {};
      const centres = marks.map((el) => {
        const r = el.getBoundingClientRect();
        return [r.left + r.width / 2 + window.scrollX, r.top + r.height / 2 + window.scrollY];
      });
      const last = marks.map(() => 1);
      let px = 0;
      let py = 0;
      let frame = 0;
      const paint = () => {
        frame = 0;
        marks.forEach((el, i) => {
          const k = Math.max(0, 1 - Math.hypot(centres[i][0] - px, centres[i][1] - py) / 140);
          const s = 1 + 0.08 * k;
          if (Math.abs(s - last[i]) < 0.004) return;
          last[i] = s;
          el.style.scale = s === 1 ? "" : s.toFixed(3);
        });
      };
      const move = (e: PointerEvent) => {
        px = e.pageX;
        py = e.pageY;
        if (!frame) frame = requestAnimationFrame(paint);
      };
      const leave = () => {
        px = py = -1e5;
        if (!frame) frame = requestAnimationFrame(paint);
      };
      hero.addEventListener("pointermove", move);
      hero.addEventListener("pointerleave", leave);
      return () => {
        cancelAnimationFrame(frame);
        hero.removeEventListener("pointermove", move);
        hero.removeEventListener("pointerleave", leave);
        marks.forEach((el) => (el.style.scale = ""));
      };
    };

    const build = (finish: boolean) => {
      ctx?.revert();
      unhover();
      const stacked = window.matchMedia(STACKED).matches;
      ctx = gsap.context(() => {
        const all = Array.from(hero.querySelectorAll<HTMLElement>("[data-mark]"));
        const n = stacked ? MARKS_STACKED : MARKS;
        const home = stacked ? HOME_STACKED : HOME_DESKTOP;
        const picked = all.slice(0, PICKED);
        const others = all.slice(PICKED, n);
        const field = hero.querySelector<HTMLElement>("[data-field]")!.getBoundingClientRect();
        const slots = Array.from(hero.querySelectorAll<HTMLElement>("[data-slot]")).map((el) => {
          const r = el.getBoundingClientRect();
          return [r.left + r.width / 2, r.top + r.height / 2];
        });

        // Precomputed once: the top-most picked home takes the top row, and so on down.
        const byY = picked.map((_, i) => i).sort((a, b) => home[a][1] - home[b][1] || home[a][0] - home[b][0]);
        const to: [number, number][] = [];
        byY.forEach((m, row) => {
          const hx = field.left + (home[m][0] / 100) * field.width;
          const hy = field.top + (home[m][1] / 100) * field.height;
          to[m] = [slots[row][0] - hx, slots[row][1] - hy];
        });
        const strongest = picked[byY[0]];
        const rules = hero.querySelectorAll<HTMLElement>("[data-rule]");
        const labels = hero.querySelectorAll<HTMLElement>("[data-label]");
        const path = hero.querySelector<SVGPathElement>("[data-path]")!;

        // The connector: one thin rule from the list into the price column's hairline (desktop only).
        if (!stacked) {
          const h = hero.getBoundingClientRect();
          const list = hero.querySelector<HTMLElement>("[data-list]")!.getBoundingClientRect();
          const offer = hero.querySelector<HTMLElement>("[data-offer]")!.getBoundingClientRect();
          const x1 = list.right + 14 - h.left;
          const x2 = offer.left - h.left;
          const y = list.top + list.height / 2 - h.top;
          path.setAttribute("d", x2 > x1 + 12 ? `M${x1} ${y}H${x2}` : "");
        }

        const tl = gsap.timeline({
          paused: true,
          delay: 0.9,
          defaults: { ease: "power2.inOut" },
          onComplete: () => {
            unhover = hover(all.slice(0, n));
          },
        });
        // 1 → 2 s: the territory recedes; the qualified homes turn moss.
        tl.to(others, { opacity: 0.07, duration: 0.8, stagger: { each: 0.012, from: "random" }, ease: "power2.out" }, 0);
        tl.to(picked, { opacity: 0.95, duration: 0.6 }, 0.05);
        tl.fromTo(picked, { "--moss": 0 }, { "--moss": 1, duration: 0.6 }, 0.05);
        // 2 → 3 s: they settle into the week's list.
        tl.to(
          picked,
          { x: (i) => to[i][0], y: (i) => to[i][1], scale: BASE * 1.2, duration: 1, stagger: 0.05, ease: "power3.inOut" },
          0.95,
        );
        tl.fromTo(rules, { scaleX: 0 }, { scaleX: 1, duration: 0.5, stagger: 0.05, ease: "power2.out" }, 1.6);
        tl.fromTo(labels, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: "power2.out" }, 1.7);
        tl.fromTo(path, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.8 }, 1.8);
        // Once: the strongest home warms to amber and back.
        tl.fromTo(strongest, { "--amber": 0 }, { "--amber": 1, duration: 0.4, ease: "sine.inOut" }, 2.3);
        tl.to(strongest, { "--amber": 0, duration: 0.7, ease: "sine.inOut" }, 2.75);

        if (finish || reduced) tl.progress(1);
        else tl.play();
      }, hero);
    };

    // Start once the motion is on screen (on desktop that is the hero, immediately on /pricing; stacked, it is the
    // block under the offer), after the web fonts so the list is measured right.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started) return;
        started = true;
        io.disconnect();
        const go = () => build(false);
        if (document.fonts && document.fonts.status !== "loaded") document.fonts.ready.then(go);
        else go();
      },
      { threshold: 0.35 },
    );
    const motion = hero.querySelector<HTMLElement>("[data-motion]");
    io.observe(window.matchMedia(STACKED).matches && motion ? motion : hero);

    // A real width change re-measures and jumps straight to the settled state.
    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!started || window.innerWidth === width) return;
        width = window.innerWidth;
        build(true);
      }, 200);
    };
    window.addEventListener("resize", onResize);

    return () => {
      io.disconnect();
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
      unhover();
      ctx?.revert();
    };
  }, []);

  return (
    <section ref={ref} className={styles.hero} aria-labelledby="pricing-title">
      <div className={styles.heroInner}>
        <div className={styles.head}>
          <p className={styles.eyebrow}>One plan</p>
          <Heading id="pricing-title" className={styles.title}>
            The week is already sorted.
          </Heading>
        </div>
        <div className={styles.body}>
          <p className={styles.lede}>
            50, 100 or 250+ prioritized homes in the ZIP codes your team serves, refreshed every week.
          </p>
          <p className={styles.proof}>Property context. Recorded HVAC history. Evidence you can check.</p>
        </div>

        <div data-motion className={styles.motion} aria-hidden="true">
          <div data-field className={styles.field}>
            {Array.from({ length: MARKS }, (_, i) => (
              <span
                key={i}
                data-mark
                data-picked={i < PICKED ? "" : undefined}
                data-wide={i >= MARKS_STACKED ? "" : undefined}
                className={styles.mark}
                style={
                  {
                    "--x": HOME_DESKTOP[i][0],
                    "--y": HOME_DESKTOP[i][1],
                    "--sx": HOME_STACKED[i]?.[0] ?? 0,
                    "--sy": HOME_STACKED[i]?.[1] ?? 0,
                    "--w": SIZES[i].w,
                    "--h": SIZES[i].h,
                    opacity: SIZES[i].op,
                  } as CSSProperties
                }
              />
            ))}
          </div>
          <div data-list className={styles.list}>
            <p data-label className={styles.listLabel}>
              <span>This week</span>
              <span>50 / 100 / 250+</span>
            </p>
            <ol>
              {ROWS.map((len, i) => (
                <li key={i}>
                  <span data-slot className={styles.slot} />
                  <span data-rule className={styles.rowRule} style={{ "--len": len } as CSSProperties} />
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div data-offer className={styles.offer}>
          <p data-label className={styles.offerLabel} aria-hidden="true">
            One plan <span>·</span> $99 / month
          </p>
          <p className={styles.price}>
            <span className={styles.currency}>$</span>99<span className={styles.per}>/month</span>
          </p>
          <ul className={styles.terms}>
            <li>5-day free trial</li>
            <li>Credit card required</li>
            <li>Cancel anytime</li>
          </ul>
          <div className={styles.actions}>
            <Link href="/territory" className={styles.cta}>
              Start your 5-day trial
            </Link>
            <Link href={howHref} className={styles.secondary}>
              See how it works <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>
      <svg className={styles.connector} aria-hidden="true">
        <path data-path pathLength={1} />
      </svg>
    </section>
  );
}
