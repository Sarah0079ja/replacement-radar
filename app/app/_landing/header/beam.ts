import { BEAM_H, BEAM_W, CENTER } from "./geometry";
import { clamp, lerp } from "./math";
import { DOT_FLASH, DOT_GHOST, DOT_HOT_FOOT, DOT_HOT_TOP, DOT_INK, DOT_UNLIT, type RGB } from "./palette";

// The beam, drawn on a 360 × 400 canvas every frame as dots on a grid that is fixed to the stage: the cone switches
// dots on (small at the top, full size at the bar), nine rays breathe at its edges, a dashed ghost ring waits above
// each lit column and 46 motes of dust drift up through it. `focus` 1 is the open cone that sits over a resting pill;
// as it drops towards 0 the cone narrows to the thread (what stays while the pill travels). `pulse` is the flash
// on arrival. The rays and the dust are random, picked once per page load.

interface Mote {
  x: number;
  y: number;
  s: number;
  v: number;
  p: number;
}

interface Ray {
  o: number;
  w: number;
  a: number;
  p: number;
  s: number;
}

/** Dust: position across and up the cone (0–1), radius (px), rise speed (cone heights per s) and phase. */
const DUST: Mote[] = Array.from({ length: 46 }, () => ({
  x: Math.random(),
  y: Math.random(),
  s: 0.4 + Math.random() * 1.3,
  v: 0.03 + Math.random() * 0.08,
  p: Math.random() * 6,
}));

/** Rays: offset across the cone (−1 to 1), width (× the cone's foot), strength, phase and breathing speed. */
const RAYS: Ray[] = Array.from({ length: 9 }, (_, i) => ({
  o: (i - 4) / 4,
  w: 0.08 + Math.random() * 0.12,
  a: 0.25 + Math.random() * 0.5,
  p: Math.random() * 6,
  s: 0.6 + Math.random() * 0.8,
}));

/** The canvas's bitmap is this many times its design size, so the dots stay round and sharp. */
export const BEAM_RES = 3;

/** The dot grid (design px): pitch, the lowest row's height in the canvas (14 px above the bar's top edge), the lit
 *  dot's radius at the top and at the foot, the unlit dot, and the ghost ring. */
const PITCH = 20;
const ROW_FOOT = 378;
const R_TOP = 1.9;
const R_FOOT = 6.1;
const R_UNLIT = 1.5;
const RING_WIDTH = 1.2;
const RING_DASH = [2, 2.4];
const RING_ALPHA = 0.34;
/** A grid point is switched on from this much cover; under it, at the edge, it shows as a ghost ring (when the
 *  row's dot is at least RING_MIN px). */
const EDGE = 0.45;
const RING_MIN = 3.2;

const rgb = (a: RGB, b: RGB, u: number) =>
  `${Math.round(lerp(a[0], b[0], u))},${Math.round(lerp(a[1], b[1], u))},${Math.round(lerp(a[2], b[2], u))}`;
const smooth = (u: number) => {
  const v = clamp(u);
  return v * v * (3 - 2 * v);
};

/**
 * Draws one frame of the beam.
 * @param T the clock in seconds (the rays and dust move with it)
 * @param w the active pill's width (design px): the open cone's foot is 95% of it
 * @param focus the beam's focus (clamped to 0–1 here)
 * @param pulse the arrival flash, 1 → 0
 * @param bm the beam's centre on the stage (design px): the grid stays put while the canvas travels
 * @param tilt the beam's lean (deg), drawn as a leaning cone rather than a skewed canvas
 */
export function drawBeam(
  g: CanvasRenderingContext2D,
  T: number,
  w: number,
  focus: number,
  pulse: number,
  bm: number,
  tilt: number,
) {
  const W = BEAM_W,
    H = BEAM_H;
  g.setTransform(BEAM_RES, 0, 0, BEAM_RES, 0, 0);
  g.clearRect(0, 0, W, H);
  const f = clamp(focus);
  const top = 4 + 6 * f,
    bot = lerp(14, w * 0.95, f);
  const lean = Math.tan((tilt * Math.PI) / 180);
  // each ray breathes at its own pace: it widens or narrows the cone where it stands
  const rays = RAYS.map((r) => ({ cx: r.o * bot * 0.36, br: 0.55 + 0.45 * Math.sin(T * r.s + r.p), a: r.a }));
  /** How lit the grid point (x, y) is, 0–1: inside the leaning cone, a little wider where a ray is bright. */
  const lit = (x: number, y: number) => {
    if (y > ROW_FOOT + 1) return 0;
    const yy = y / H;
    const dx = x - (W / 2 + (y - H) * lean);
    let breath = 0,
      sum = 0;
    rays.forEach((r) => {
      const k = 1 / (1 + Math.abs(dx - r.cx * yy) / 14);
      breath += k * r.a * r.br;
      sum += k * r.a;
    });
    const half = (lerp(top, bot, yy) / 2) * lerp(1, 0.82 + 0.36 * (breath / sum), f) + PITCH / 2;
    return clamp((half - Math.abs(dx)) / (PITCH * 0.45));
  };
  // ink while the pill travels, the accent once it rests, a brighter accent on arrival
  const hot = smooth((f - 0.5) / 0.3);
  const first = Math.ceil((bm - W / 2 - CENTER) / PITCH);
  for (let k = first; ; k++) {
    const x = CENTER + k * PITCH - bm + W / 2;
    if (x > W) break;
    // the field shows around the beam and fades towards the canvas's sides and top
    const side = smooth((W / 2 - 8 - Math.abs(x - W / 2)) / 60);
    for (let y = ROW_FOOT; y > 0; y -= PITCH) {
      const yy = y / H;
      const rise = smooth((yy - 0.08) / 0.4);
      const on = lit(x, y);
      const size = lerp(R_TOP, R_FOOT, Math.pow(yy, 1.5));
      if (on >= EDGE) {
        const r = size * lerp(0.72, 1, (on - EDGE) / (1 - EDGE)) * (1 + 0.12 * pulse);
        const accent: RGB = [
          lerp(lerp(DOT_HOT_TOP[0], DOT_HOT_FOOT[0], yy), DOT_FLASH[0], clamp(pulse)),
          lerp(lerp(DOT_HOT_TOP[1], DOT_HOT_FOOT[1], yy), DOT_FLASH[1], clamp(pulse)),
          lerp(lerp(DOT_HOT_TOP[2], DOT_HOT_FOOT[2], yy), DOT_FLASH[2], clamp(pulse)),
        ];
        g.fillStyle = `rgba(${rgb(DOT_INK, accent, hot)},${(lerp(0.25, 1, rise) * side).toFixed(3)})`;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        continue;
      }
      // unlit: a small grid dot; at the cone's edge, a dashed ghost ring around it
      g.fillStyle = `rgba(${DOT_UNLIT},${(rise * side).toFixed(3)})`;
      g.beginPath();
      g.arc(x, y, R_UNLIT, 0, Math.PI * 2);
      g.fill();
      if (on > 0.02 && size > RING_MIN) {
        g.strokeStyle = `rgba(${DOT_GHOST},${(RING_ALPHA * smooth(on / EDGE + 0.35) * rise * side * hot).toFixed(3)})`;
        g.lineWidth = RING_WIDTH;
        g.setLineDash(RING_DASH);
        g.beginPath();
        g.arc(x, y, size, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      }
    }
  }
  // dust: small free dots rising through the cone
  DUST.forEach((d) => {
    const yy = (((d.y - T * d.v) % 1) + 1) % 1,
      half = lerp(top, bot, yy) / 2,
      xx = W / 2 + (yy * H - H) * lean + (d.x - 0.5) * 2 * half * 0.9 + Math.sin(T + d.p) * 3;
    g.fillStyle = `rgba(${rgb(DOT_INK, DOT_HOT_FOOT, hot)},${((0.12 + 0.45 * yy) * (0.5 + 0.5 * Math.sin(T * 2 + d.p)) * f).toFixed(3)})`;
    g.beginPath();
    g.arc(xx, yy * H, d.s, 0, Math.PI * 2);
    g.fill();
  });
}
