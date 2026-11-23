// Precomputed property marks for the pricing hero. Computed once at module load (deterministic, so server and client
// agree); nothing here runs during animation.

/** Marks on desktop, and on stacked (tablet / phone) layouts. */
export const MARKS = 34;
export const MARKS_STACKED = 22;
/** Marks that qualify and settle into the weekly list (always indices 0 … PICKED-1). */
export const PICKED = 8;
/** Marks are drawn at 2× and rest at 0.5 so they stay crisp when they grow into the list. */
export const DRAW = 2;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SIZES = (() => {
  const r = rng(5);
  return Array.from({ length: MARKS }, () => ({ w: 9 + Math.round(r() * 3), h: 8 + Math.round(r() * 2), op: 0.2 + r() * 0.14 }));
})();

type P = [number, number];

/**
 * Lots on a jittered grid. `weight(x, y)` (0–1) thins the field where text sits; the picked marks come from where
 * `pickable` is true so they travel a short way. Returns [x%, y%] of the field box, picked marks first.
 */
function scatter(
  n: number,
  cols: number,
  rows: number,
  seed: number,
  weight: (x: number, y: number) => number,
  pickable: (x: number, y: number) => boolean,
): P[] {
  const r = rng(seed);
  const cand: { p: P; w: number }[] = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const fx = (x + 0.5 + (r() - 0.5) * 0.55) / cols;
      const fy = (y + 0.5 + (r() - 0.5) * 0.5) / rows;
      cand.push({ p: [fx, fy], w: weight(fx, fy) * (0.35 + r() * 0.65) });
    }
  cand.sort((a, b) => b.w - a.w);
  const chosen = cand.slice(0, n).map((c) => c.p);
  const picked = chosen.filter(([x, y]) => pickable(x, y)).slice(0, PICKED);
  const rest = chosen.filter((p) => !picked.includes(p));
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [...picked, ...rest].map(([x, y]) => [+(x * 100).toFixed(2), +(y * 100).toFixed(2)] as P);
}

// Desktop: the field box spans the whole hero row (copy | motion | offer). The middle third is the motion column;
// the field is fuller there and thinner behind the headline and the price.
export const HOME_DESKTOP = scatter(
  MARKS,
  14,
  6,
  3,
  (x, y) => (x > 0.36 && x < 0.66 ? 1 : x > 0.7 && y > 0.12 && y < 0.62 ? 0.12 : 0.42),
  (x) => x > 0.38 && x < 0.62,
);

// Stacked: the field box is the motion block under the offer; the list forms on its right.
export const HOME_STACKED = scatter(MARKS_STACKED, 8, 4, 8, () => 1, (x) => x < 0.6);
