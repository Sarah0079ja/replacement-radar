import { BAR_END, CENTER, TAB_GAP, TAB_START } from "./geometry";
import { clamp } from "./math";
import {
  BLOOM,
  DT_FIRST,
  DT_MAX,
  FADE_C,
  FADE_K,
  FOCUS_C,
  FOCUS_K,
  FOCUS_MAX,
  FOCUS_THIN,
  FOLLOW_RATE,
  HOVER_C,
  HOVER_K,
  LIT_RATE,
  PILL_DAMPING,
  PILL_K0,
  PILL_K_LEAD,
  PILL_K_RATE,
  PILL_K_TRAIL,
  PULSE_DECAY,
  REARM,
  SPEED_THIN,
  TILT,
  TILT_RATE,
} from "./motion";

// The tab bar's state, stepped once per animation frame (the spec's state with its demo switched off). Positions are
// design px: tab and pill x along the bar, the beam in stage x.

export interface Spring {
  x: number;
  v: number;
  k: number;
  c: number;
}

const spring = (k: number, c: number): Spring => ({ x: 0, v: 0, k, c });

/** One semi-implicit Euler step towards `target`. */
function pull(s: Spring, target: number, dt: number) {
  s.v += (s.k * (target - s.x) - s.c * s.v) * dt;
  s.x += s.v * dt;
}

export interface Spotlight {
  X: number[];
  Wd: number[];
  BW: number;
  L: Spring;
  R: Spring;
  HL: Spring;
  HR: Spring;
  HO: Spring;
  FO: { x: number; v: number };
  BM: number;
  SK: number;
  bloomed: boolean;
  pulse: number;
  act: number;
  hov: number;
  dirK: number;
  lit: number[];
  start: number | null;
  last: number | null;
  beamT: number;
}

export function createSpotlight(): Spotlight {
  return {
    X: [],
    Wd: [],
    BW: 0,
    L: spring(PILL_K0, 0),
    R: spring(PILL_K0, 0),
    HL: spring(HOVER_K, HOVER_C),
    HR: spring(HOVER_K, HOVER_C),
    HO: spring(FADE_K, FADE_C),
    FO: { x: 1, v: 0 },
    BM: 0,
    SK: 0,
    bloomed: true,
    pulse: 0,
    act: 0,
    hov: -1,
    dirK: 0,
    lit: [],
    start: null,
    last: null,
    beamT: 0,
  };
}

/** Lays the tabs out from their widths (design px), left to right with a 2-px gap. */
export function layout(s: Spotlight, widths: number[]) {
  let x = TAB_START;
  s.X = [];
  s.Wd = [];
  widths.forEach((w) => {
    s.X.push(x);
    s.Wd.push(w);
    x += w + TAB_GAP;
  });
  s.BW = x + BAR_END;
  s.lit = widths.map((_, i) => (i === s.act ? 1 : 0));
}

/** The bar's left edge on the stage. */
export const barLeft = (s: Spotlight) => CENTER - s.BW / 2;

export function select(s: Spotlight, i: number) {
  if (i === s.act) return;
  s.dirK = i > s.act ? 1 : -1;
  s.act = i;
}

/** One frame at time `now` (ms, the animation frame's timestamp). */
export function step(s: Spotlight, now: number, reduced: boolean) {
  const T = now / 1000;
  if (s.start === null) {
    s.start = T;
    s.beamT = T;
    s.L.x = s.X[s.act];
    s.R.x = s.X[s.act] + s.Wd[s.act];
    s.BM = barLeft(s) + s.X[s.act] + s.Wd[s.act] / 2;
    s.HL.x = s.L.x;
    s.HR.x = s.R.x;
  }
  const dt = s.last === null ? DT_FIRST : Math.min(DT_MAX, T - s.last);
  s.last = T;
  if (!reduced) s.beamT = T;

  // the active pill: the edge in front is stiffer, so it runs ahead and the pill stretches
  const { L, R, HL, HR, HO, FO } = s;
  const lead = s.dirK > 0 ? "R" : "L";
  const kL = lead === "L" ? PILL_K_LEAD : PILL_K_TRAIL,
    kR = lead === "R" ? PILL_K_LEAD : PILL_K_TRAIL;
  L.k += (kL - L.k) * Math.min(1, dt * PILL_K_RATE);
  R.k += (kR - R.k) * Math.min(1, dt * PILL_K_RATE);
  L.c = 2 * Math.sqrt(L.k) * PILL_DAMPING;
  R.c = 2 * Math.sqrt(R.k) * PILL_DAMPING;
  pull(L, s.X[s.act], dt);
  pull(R, s.X[s.act] + s.Wd[s.act], dt);
  if (reduced) {
    snap(L, s.X[s.act]);
    snap(R, s.X[s.act] + s.Wd[s.act]);
  }

  // the hover pill: only on a tab that isn't active; it follows softly and fades in and out
  const hv = s.hov >= 0 && s.hov !== s.act;
  if (hv) {
    pull(HL, s.X[s.hov], dt);
    pull(HR, s.X[s.hov] + s.Wd[s.hov], dt);
    if (reduced) {
      snap(HL, s.X[s.hov]);
      snap(HR, s.X[s.hov] + s.Wd[s.hov]);
    }
  }
  pull(HO, hv ? 1 : 0, dt);

  // the beam focuses into a thread while the pill moves fast, and blooms with a pulse when it opens up again
  const speed = Math.abs(L.v) + Math.abs(R.v);
  const fT = speed > SPEED_THIN ? FOCUS_THIN : 1;
  FO.v += (FOCUS_K * (fT - FO.x) - FOCUS_C * FO.v) * dt;
  FO.x += FO.v * dt;
  const fo = clamp(FO.x, 0, FOCUS_MAX);
  if (fo > BLOOM && !s.bloomed) {
    s.bloomed = true;
    s.pulse = 1;
  }
  if (fo < REARM) s.bloomed = false;
  s.pulse *= Math.pow(PULSE_DECAY, dt);

  // it follows the pill's centre with its own lag, leaning into the lag
  const w = R.x - L.x;
  const midT = barLeft(s) + L.x + w / 2;
  s.BM += (midT - s.BM) * Math.min(1, dt * FOLLOW_RATE);
  s.SK += ((midT - s.BM) * TILT - s.SK) * Math.min(1, dt * TILT_RATE);
  if (reduced) {
    s.BM = midT;
    s.SK = 0;
  }

  // tabs light up while active, and fade back when the pill leaves
  s.lit.forEach((l, i) => {
    s.lit[i] = l + ((i === s.act ? 1 : 0) - l) * Math.min(1, dt * LIT_RATE);
  });
  return { w, fo };
}

function snap(s: Spring, x: number) {
  s.x = x;
  s.v = 0;
}
