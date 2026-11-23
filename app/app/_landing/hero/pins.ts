import tracks from "./tracks.json";

// Stat cards pinned to houses in the hero film. Positions come from optical-flow tracks of the footage
// (normalised 0–1 video coordinates, sampled at 12 fps); every figure on a card is illustrative.

export type Direction = "up" | "down" | "right" | "left";

export interface Pin {
  id: keyof typeof tracks.pins;
  in: number;
  out: number;
  dir: Direction;
  priority: "Strong" | "Medium" | "Weak";
  hvac: string;
  built: string;
  picked?: boolean;
}

export const PINS: Pin[] = [
  { id: "b1", in: 8.9, out: 14.4, dir: "up", priority: "Strong", hvac: "2011 · 15 yrs", built: "1998" },
  { id: "b2", in: 9.6, out: 14.4, dir: "down", priority: "Medium", hvac: "2016 · 10 yrs", built: "2004" },
  { id: "b3", in: 10.3, out: 14.4, dir: "up", priority: "Strong", hvac: "2009 · 17 yrs", built: "1996" },
  { id: "c2", in: 17.6, out: 21.0, dir: "up", priority: "Medium", hvac: "2014 · 12 yrs", built: "1961" },
  { id: "c1", in: 20.9, out: 27.1, dir: "left", priority: "Strong", hvac: "Apr 2011 · 15 yrs ago", built: "1962 · 1,640 sq ft", picked: true },
];

export const TRACKS = tracks.pins as Record<Pin["id"], [number, number, number][]>;

/** The tracked position of a pin at time t (video seconds), or null outside its track. */
export function trackAt(samples: [number, number, number][], t: number): [number, number] | null {
  if (t < samples[0][0] || t > samples[samples.length - 1][0]) return null;
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid][0] <= t) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const u = b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0]);
  return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

/** Where a narrow (portrait) screen centres the frame horizontally: on the houses that carry cards. */
export function focusX(t: number) {
  const keys: [number, number][] = [
    [0, 0.5],
    [7.2, 0.5],
    [8.4, 0.62],
    [14.9, 0.62],
    [16.2, 0.66],
    [28, 0.66],
  ];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, x0] = keys[i - 1];
      const [t1, x1] = keys[i];
      const u = (t - t0) / (t1 - t0);
      const e = u * u * (3 - 2 * u);
      return x0 + (x1 - x0) * e;
    }
  }
  return keys[keys.length - 1][1];
}
