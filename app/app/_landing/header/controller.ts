import { drawBeam } from "./beam";
import { BEAM_W } from "./geometry";
import { clamp, lerp } from "./math";
import {
  BEAM_OPACITY,
  CAUSTIC_FOCUS,
  CAUSTIC_PULSE,
  COVER,
  COVER_SPAN,
  FLOOR_ALPHA,
  FLOOR_FOCUS,
  FLOOR_LEFT,
  FLOOR_PULSE,
  FLOOR_WIDTH,
  GLOW,
  GLOW_ALPHA,
  GLOW_ON,
  HOVER_LIT,
  ICON_ON,
  RIM_OPACITY,
  RIM_OPACITY_GAIN,
  RIM_WIDTH,
  TILT_MAX,
} from "./motion";
import { CAUSTIC, FLOOR, ICON_GLOW, ICON_LIT, TAB_DIM, TAB_HOVER, TAB_LIT, type RGB } from "./palette";
import { barLeft, createSpotlight, layout, select, step } from "./spotlight";

// Runs the tab bar: waits for the font, measures the tabs, steps the state every animation frame and writes the
// frame to the DOM (the spec's controller, without its demo cursor; tabs are links). Every write is skipped when the
// value hasn't changed.

const REDUCED = "(prefers-reduced-motion: reduce)";
const COMPACT = "(max-width: 720px)";
const FONT_WAIT = 3000;

function part<T extends Element>(root: Element, name: string): T {
  const el = root.querySelector<T>(`[data-part="${name}"]`);
  if (!el) throw new Error(`spotlight header: missing [data-part="${name}"]`);
  return el;
}

function parts<T extends Element>(root: Element, name: string): T[] {
  return [...root.querySelectorAll<T>(`[data-part="${name}"]`)];
}

const mix = (a: RGB, b: RGB, u: number) =>
  `rgb(${Math.round(lerp(a[0], b[0], u))},${Math.round(lerp(a[1], b[1], u))},${Math.round(lerp(a[2], b[2], u))})`;

export interface SpotlightHandle {
  dispose: () => void;
  setActive: (i: number) => void;
}

export interface SpotlightOptions {
  /** No beam or floor glow, and the frame loop sleeps once nothing on the bar is moving. */
  quiet?: boolean;
  /** The tab the pill starts on (no slide in from Overview). */
  initial?: number;
}

/** Frames with no DOM write before a quiet bar's loop sleeps. */
const IDLE_FRAMES = 30;

export function mountSpotlightHeader(
  scene: HTMLElement,
  fontFamily: string,
  options: SpotlightOptions,
  onPick: (i: number, event: MouseEvent) => void,
): SpotlightHandle {
  const quiet = !!options.quiet;
  const beam = part<HTMLCanvasElement>(scene, "beam");
  const floor = part<HTMLElement>(scene, "floor");
  const bar = part<HTMLElement>(scene, "bar");
  const rimlight = part<HTMLElement>(scene, "rimlight");
  const hover = part<HTMLElement>(scene, "hover");
  const active = part<HTMLElement>(scene, "active");
  const caustic = part<HTMLElement>(scene, "caustic");
  const tabs = parts<HTMLAnchorElement>(scene, "tab");
  const icons = tabs.map((tab) => part<SVGSVGElement>(tab, "icon"));
  const probes = parts<HTMLElement>(scene, "probe");
  const g = beam.getContext("2d");
  if (!g) return { dispose: () => {}, setActive: () => {} };
  const g2d: CanvasRenderingContext2D = g;

  const reducedQuery = window.matchMedia(REDUCED);
  const compactQuery = window.matchMedia(COMPACT);
  const s = createSpotlight();
  if (options.initial) s.act = options.initial;
  let raf = 0;
  let disposed = false;
  let measured = false;
  let started = false;
  let writes = 0;
  let idle = 0;

  const last = new WeakMap<Element, Map<string, string>>();
  const css = (el: HTMLElement | SVGElement, prop: string, value: string | number) => {
    const v = String(value);
    let seen = last.get(el);
    if (!seen) last.set(el, (seen = new Map()));
    if (seen.get(prop) === v) return;
    seen.set(prop, v);
    writes++;
    if (v === "") el.style.removeProperty(prop);
    else el.style.setProperty(prop, v);
  };
  const attr = (el: Element, name: string, value: string | null) => {
    if (value === null) {
      if (el.hasAttribute(name)) {
        el.removeAttribute(name);
        writes++;
      }
    } else if (el.getAttribute(name) !== value) {
      el.setAttribute(name, value);
      writes++;
    }
  };

  const measure = () => {
    layout(
      s,
      probes.map((p) => p.offsetWidth),
    );
    css(bar, "--x", barLeft(s));
    css(bar, "--w", s.BW);
    tabs.forEach((tab, i) => {
      css(tab, "--x", s.X[i]);
      css(tab, "--w", s.Wd[i]);
    });
    measured = true;
  };

  // A quiet bar's loop sleeps when idle; anything that can move the bar wakes it.
  const wake = () => {
    idle = 0;
    if (started && !raf && !disposed) raf = requestAnimationFrame(frame);
  };
  const enter = (i: number) => () => {
    s.hov = i;
    wake();
  };
  const leave = () => {
    s.hov = -1;
    wake();
  };
  const click = (i: number) => (e: MouseEvent) => {
    select(s, i);
    wake();
    onPick(i, e);
  };
  const listeners = tabs.map((tab, i) => {
    const on = { enter: enter(i), click: click(i) };
    tab.addEventListener("pointerenter", on.enter);
    tab.addEventListener("pointerleave", leave);
    tab.addEventListener("click", on.click);
    return on;
  });
  // labels hide on phones, so the bar is measured again when the layout switches
  const onCompact = () => {
    measured = false;
    wake();
  };
  compactQuery.addEventListener("change", onCompact);

  function frame(now: number) {
    writes = 0;
    if (!measured) measure();
    const reduced = reducedQuery.matches;
    const { w, fo } = step(s, now, reduced);
    const f = clamp(fo);

    css(active, "--x", s.L.x);
    css(active, "--w", w);
    css(hover, "--x", s.HL.x);
    css(hover, "--w", s.HR.x - s.HL.x);
    css(hover, "opacity", clamp(s.HO.x));

    if (!quiet) {
      css(beam, "--x", s.BM - BEAM_W / 2);
      css(beam, "opacity", lerp(BEAM_OPACITY[0], BEAM_OPACITY[1], f));
      css(beam, "transform", `skewX(${clamp(s.SK, -TILT_MAX, TILT_MAX).toFixed(2)}deg)`);
      drawBeam(g2d, s.beamT, w, fo, s.pulse, s.BM, clamp(s.SK, -TILT_MAX, TILT_MAX));
      css(floor, "--x", s.BM - w * FLOOR_LEFT);
      css(floor, "--w", w * FLOOR_WIDTH);
      css(
        floor,
        "background",
        `radial-gradient(closest-side,rgba(${FLOOR},${(FLOOR_ALPHA + FLOOR_FOCUS * f + FLOOR_PULSE * s.pulse).toFixed(3)}),transparent)`,
      );
    }
    const rw = w * lerp(RIM_WIDTH[0], RIM_WIDTH[1], f);
    css(rimlight, "--x", s.BM - barLeft(s) - rw / 2);
    css(rimlight, "--w", rw);
    css(rimlight, "opacity", (RIM_OPACITY + RIM_OPACITY_GAIN * f).toFixed(3));
    css(
      caustic,
      "background",
      `radial-gradient(60% 90% at 50% 0%,rgba(${CAUSTIC},${(CAUSTIC_FOCUS * f + CAUSTIC_PULSE * s.pulse).toFixed(3)}),transparent 70%)`,
    );

    tabs.forEach((tab, i) => {
      const c = s.X[i] + s.Wd[i] / 2,
        cov = clamp(1 - Math.abs(c - (s.L.x + w / 2)) / (s.Wd[i] * COVER_SPAN));
      const lit = s.lit[i];
      const over = clamp((Math.min(s.L.x + w, s.X[i] + s.Wd[i]) - Math.max(s.L.x, s.X[i])) / s.Wd[i]);
      const gate = clamp((over - 0.55) / 0.4);
      const k = Math.max(cov * COVER, lit) * gate,
        hk = s.hov === i && i !== s.act ? HOVER_LIT : 0,
        v = Math.max(k, hk);
      css(tab, "color", hk > k ? mix(TAB_DIM, TAB_HOVER, v) : mix(TAB_DIM, TAB_LIT, v));
      css(icons[i], "color", lit > ICON_ON ? mix(TAB_DIM, ICON_LIT, lit * gate) : "");
      css(
        icons[i],
        "filter",
        lit > GLOW_ON ? `drop-shadow(0 0 calc(${GLOW * lit} * var(--u)) rgba(${ICON_GLOW},${GLOW_ALPHA * lit}))` : "none",
      );
      attr(tab, "aria-current", i === s.act ? "true" : null);
    });
    attr(scene, "data-ready", "");
    // The beam animates on its own, so a normal bar always runs; a quiet one sleeps once nothing changes.
    if (quiet && (writes === 0 ? ++idle : (idle = 0)) > IDLE_FRAMES) {
      raf = 0;
      s.last = null;
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  const fontReady = document.fonts
    ? Promise.race([document.fonts.load(`500 15.5px ${fontFamily}`), new Promise((r) => setTimeout(r, FONT_WAIT))])
    : Promise.resolve();
  fontReady
    .catch(() => {})
    .then(() => {
      if (disposed) return;
      started = true;
      raf = requestAnimationFrame(frame);
    });

  return {
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      tabs.forEach((tab, i) => {
        tab.removeEventListener("pointerenter", listeners[i].enter);
        tab.removeEventListener("pointerleave", leave);
        tab.removeEventListener("click", listeners[i].click);
      });
      compactQuery.removeEventListener("change", onCompact);
    },
    setActive: (i: number) => {
      if (i === s.act) return;
      select(s, i);
      wake();
    },
  };
}
