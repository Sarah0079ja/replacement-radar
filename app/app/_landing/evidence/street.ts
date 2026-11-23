// An aerial (isometric) pencil-sketch street for /how-we-know, generated once at module load (deterministic, so the
// server and client agree). World units: x runs down-right on screen, y runs down-left, z is up. Everything is plain
// SVG path data; the story timeline animates it.

const S = 1.3;
const OX = 320;
const OY = 118;
const CX = 0.866 * S;
const CY = 0.5 * S;

type P = [number, number];
export const iso = (x: number, y: number, z = 0): P => [OX + (x - y) * CX, OY + (x + y) * CY - z * S];
const f = (n: number) => n.toFixed(1);
const poly = (pts: P[]) => `M${pts.map(([a, b]) => `${f(a)} ${f(b)}`).join("L")}Z`;
const line = (a: P, b: P) => `M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}`;

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

export type Kind = "wall" | "shade" | "roof" | "roofBack" | "detail" | "canopy" | "trunk" | "car";
export interface Shape {
  d: string;
  kind: Kind;
  /** Roof planes of the story's house (they warm to orange). */
  roof?: boolean;
}
interface Item {
  depth: number;
  shapes: Shape[];
  subject?: boolean;
}

/** A gabled house: footprint w × d, wall height h, roof rise r, ridge along x (or y). */
function house(x: number, y: number, w: number, d: number, h: number, r: number, ridgeX: boolean, subject = false): Item {
  const s: Shape[] = [];
  const roof = subject || undefined;
  if (ridgeX) {
    s.push({ kind: "roofBack", roof, d: poly([iso(x, y, h), iso(x + w, y, h), iso(x + w, y + d / 2, h + r), iso(x, y + d / 2, h + r)]) });
    s.push({ kind: "shade", d: poly([iso(x + w, y, 0), iso(x + w, y + d, 0), iso(x + w, y + d, h), iso(x + w, y + d / 2, h + r), iso(x + w, y, h)]) });
    s.push({ kind: "wall", d: poly([iso(x, y + d, 0), iso(x + w, y + d, 0), iso(x + w, y + d, h), iso(x, y + d, h)]) });
    s.push({ kind: "roof", roof, d: poly([iso(x, y + d, h), iso(x + w, y + d, h), iso(x + w, y + d / 2, h + r), iso(x, y + d / 2, h + r)]) });
  } else {
    s.push({ kind: "roofBack", roof, d: poly([iso(x, y, h), iso(x, y + d, h), iso(x + w / 2, y + d, h + r), iso(x + w / 2, y, h + r)]) });
    s.push({ kind: "shade", d: poly([iso(x + w, y, 0), iso(x + w, y + d, 0), iso(x + w, y + d, h), iso(x + w, y, h)]) });
    s.push({ kind: "wall", d: poly([iso(x, y + d, 0), iso(x + w, y + d, 0), iso(x + w, y + d, h), iso(x + w / 2, y + d, h + r), iso(x, y + d, h)]) });
    s.push({ kind: "roof", roof, d: poly([iso(x + w, y, h), iso(x + w, y + d, h), iso(x + w / 2, y + d, h + r), iso(x + w / 2, y, h + r)]) });
  }
  // Door and windows on the street-facing wall, a window on the side.
  const fy = y + d;
  const dx = x + w * 0.42;
  s.push({ kind: "detail", d: poly([iso(dx, fy, 0), iso(dx + 4, fy, 0), iso(dx + 4, fy, 7), iso(dx, fy, 7)]) });
  for (const wx of [x + w * 0.14, x + w * 0.66]) {
    s.push({ kind: "detail", d: poly([iso(wx, fy, 4), iso(wx + 5, fy, 4), iso(wx + 5, fy, 8), iso(wx, fy, 8)]) });
  }
  const sy = y + d * 0.35;
  s.push({ kind: "detail", d: poly([iso(x + w, sy, 4), iso(x + w, sy + 5, 4), iso(x + w, sy + 5, 8), iso(x + w, sy, 8)]) });
  return { depth: x + w + y + d, shapes: s, subject };
}

/** A tree: trunk plus a hand-drawn (wobbly) canopy. */
function tree(x: number, y: number, seed: number): Item {
  const r = rng(seed);
  const [cx, cy] = iso(x, y, 15);
  const rad = 7 + r() * 4;
  const pts: P[] = [];
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = rad * (0.82 + r() * 0.3);
    pts.push([cx + Math.cos(a) * k, cy + Math.sin(a) * k * 0.9]);
  }
  // Smooth the wobble with quadratic curves through midpoints.
  const mid = (p: P, q: P): P => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const start = mid(pts[n - 1], pts[0]);
  let d = `M${f(start[0])} ${f(start[1])}`;
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n]);
    d += `Q${f(pts[i][0])} ${f(pts[i][1])} ${f(m[0])} ${f(m[1])}`;
  }
  return {
    depth: x + y,
    shapes: [
      { kind: "trunk", d: line(iso(x, y, 0), iso(x, y, 9)) },
      { kind: "canopy", d: `${d}Z` },
    ],
  };
}

/** A small car on the road. */
function car(x: number, y: number, alongX: boolean): Item {
  const w = alongX ? 9 : 4;
  const d = alongX ? 4 : 9;
  const h = 3;
  return {
    depth: x + w + y + d,
    shapes: [
      { kind: "shade", d: poly([iso(x + w, y, 0), iso(x + w, y + d, 0), iso(x + w, y + d, h), iso(x + w, y, h)]) },
      { kind: "wall", d: poly([iso(x, y + d, 0), iso(x + w, y + d, 0), iso(x + w, y + d, h), iso(x, y + d, h)]) },
      { kind: "car", d: poly([iso(x, y, h), iso(x + w, y, h), iso(x + w, y + d, h), iso(x, y + d, h)]) },
    ],
  };
}

// ---- The neighbourhood: two crossing roads and four blocks of houses. ----
const ROAD_Y: [number, number] = [118, 142];
const ROAD_X: [number, number] = [150, 172];

/** The story's house (7310 Larkspur Ln) and its outdoor unit. */
const SUBJECT = { x: 184, y: 154, w: 36, d: 26, h: 14, r: 11 };
const UNIT = { x: 225, y: 164, w: 11, d: 11, h: 8 };

const HOUSES: [number, number, number, number, number, number, boolean][] = [
  [14, 20, 30, 22, 12, 9, true],
  [62, 14, 26, 24, 12, 9, false],
  [104, 22, 30, 22, 13, 9, true],
  [18, 70, 28, 24, 12, 9, false],
  [62, 66, 32, 24, 12, 10, true],
  [108, 72, 26, 26, 12, 9, false],
  [182, 16, 30, 22, 12, 9, true],
  [226, 20, 26, 24, 12, 9, false],
  [186, 66, 28, 26, 13, 10, false],
  [228, 72, 26, 22, 12, 9, true],
  [16, 156, 30, 24, 12, 9, true],
  [64, 160, 28, 24, 12, 10, false],
  [108, 154, 30, 22, 12, 9, true],
  [20, 206, 28, 24, 12, 9, false],
  [66, 210, 30, 22, 13, 9, true],
  [110, 204, 28, 26, 12, 9, false],
  [186, 212, 28, 24, 12, 9, false],
  [230, 214, 24, 24, 12, 9, true],
];

const TREES: [number, number][] = [
  [48, 52], [96, 48], [140, 40], [42, 104], [132, 104], [204, 50], [252, 54], [212, 104], [254, 104],
  [10, 190], [52, 192], [96, 240], [140, 236], [178, 242], [252, 252], [250, 150], [142, 186], [8, 104],
];

const items: Item[] = [
  ...HOUSES.map(([x, y, w, d, h, r, rx]) => house(x, y, w, d, h, r, rx)),
  ...TREES.map(([x, y], i) => tree(x, y, 40 + i)),
  car(40, 121, true),
  car(96, 134, true),
  car(214, 122, true),
  car(155, 186, false),
  car(164, 40, false),
  house(SUBJECT.x, SUBJECT.y, SUBJECT.w, SUBJECT.d, SUBJECT.h, SUBJECT.r, true, true),
].sort((a, b) => a.depth - b.depth);

/** Painter's order: everything behind the subject, the subject, everything in front of it. */
const subjectIndex = items.findIndex((i) => i.subject);
export const BEHIND: Shape[] = items.slice(0, subjectIndex).flatMap((i) => i.shapes);
export const SUBJECT_SHAPES: Shape[] = items[subjectIndex].shapes;
export const FRONT: Shape[] = items.slice(subjectIndex + 1).flatMap((i) => i.shapes);

export const ROADS = {
  fill: [
    poly([iso(0, ROAD_Y[0]), iso(260, ROAD_Y[0]), iso(260, ROAD_Y[1]), iso(0, ROAD_Y[1])]),
    poly([iso(ROAD_X[0], 0), iso(ROAD_X[1], 0), iso(ROAD_X[1], 260), iso(ROAD_X[0], 260)]),
  ],
  edges: [
    line(iso(0, ROAD_Y[0]), iso(ROAD_X[0], ROAD_Y[0])),
    line(iso(ROAD_X[1], ROAD_Y[0]), iso(260, ROAD_Y[0])),
    line(iso(0, ROAD_Y[1]), iso(ROAD_X[0], ROAD_Y[1])),
    line(iso(ROAD_X[1], ROAD_Y[1]), iso(260, ROAD_Y[1])),
    line(iso(ROAD_X[0], 0), iso(ROAD_X[0], ROAD_Y[0])),
    line(iso(ROAD_X[1], 0), iso(ROAD_X[1], ROAD_Y[0])),
    line(iso(ROAD_X[0], ROAD_Y[1]), iso(ROAD_X[0], 260)),
    line(iso(ROAD_X[1], ROAD_Y[1]), iso(ROAD_X[1], 260)),
  ],
  dashes: [line(iso(0, 130), iso(260, 130)), line(iso(161, 0), iso(161, 260))],
  /** The subject's driveway, out to the main road. */
  driveway: poly([
    iso(SUBJECT.x + 6, SUBJECT.y),
    iso(SUBJECT.x + 16, SUBJECT.y),
    iso(SUBJECT.x + 16, ROAD_Y[1]),
    iso(SUBJECT.x + 6, ROAD_Y[1]),
  ]),
};

const ux = UNIT.x;
const uy = UNIT.y;
const uh = UNIT.h;
export const UNIT_SHAPES = {
  top: poly([iso(ux, uy, uh), iso(ux + UNIT.w, uy, uh), iso(ux + UNIT.w, uy + UNIT.d, uh), iso(ux, uy + UNIT.d, uh)]),
  side: poly([iso(ux + UNIT.w, uy, 0), iso(ux + UNIT.w, uy + UNIT.d, 0), iso(ux + UNIT.w, uy + UNIT.d, uh), iso(ux + UNIT.w, uy, uh)]),
  front: poly([iso(ux, uy + UNIT.d, 0), iso(ux + UNIT.w, uy + UNIT.d, 0), iso(ux + UNIT.w, uy + UNIT.d, uh), iso(ux, uy + UNIT.d, uh)]),
};
/** Where the "?" sits (top of the unit) and where the unknown leader starts. */
export const UNIT_TOP = iso(ux + UNIT.w / 2, uy + UNIT.d / 2, uh);
/** Where the verified record attaches: the subject's side wall. */
export const ATTACH = iso(SUBJECT.x + SUBJECT.w, SUBJECT.y + SUBJECT.d * 0.55, SUBJECT.h * 0.55);
