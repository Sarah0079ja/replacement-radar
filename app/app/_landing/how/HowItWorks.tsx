"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./how.module.css";

// How it works, drawn as a flow: information comes in on the left, Replacement Radar prioritizes in the middle, and
// the week's list comes out on the right. Nodes are cards on a dotted canvas joined by bezier cables; comets run
// along the connected cables once the section is on screen.

type NodeId = "parcels" | "permits" | "weigh" | "week";
type Side = "left" | "right" | "top" | "bottom";

interface NodeBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Layout {
  name: "wide" | "tall";
  W: number;
  H: number;
  nodes: Record<NodeId, NodeBox>;
  result: NodeBox;
  cables: { from: NodeId; to: NodeId; out: Side; in: Side; delay: number }[];
}

const WIDE: Layout = {
  name: "wide",
  W: 1000,
  H: 560,
  nodes: {
    parcels: { x: 50, y: 56, w: 196, h: 176 },
    permits: { x: 50, y: 326, w: 196, h: 176 },
    weigh: { x: 400, y: 186, w: 196, h: 188 },
    week: { x: 752, y: 56, w: 196, h: 176 },
  },
  result: { x: 712, y: 288, w: 250, h: 220 },
  cables: [
    { from: "parcels", to: "weigh", out: "right", in: "left", delay: 0 },
    { from: "permits", to: "weigh", out: "right", in: "left", delay: 0.15 },
    { from: "weigh", to: "week", out: "right", in: "left", delay: 1.2 },
  ],
};

const TALL: Layout = {
  name: "tall",
  W: 360,
  H: 940,
  nodes: {
    parcels: { x: 16, y: 20, w: 156, h: 168 },
    permits: { x: 188, y: 20, w: 156, h: 168 },
    weigh: { x: 92, y: 290, w: 176, h: 180 },
    week: { x: 92, y: 572, w: 176, h: 168 },
  },
  result: { x: 40, y: 770, w: 280, h: 150 },
  cables: [
    { from: "parcels", to: "weigh", out: "bottom", in: "top", delay: 0 },
    { from: "permits", to: "weigh", out: "bottom", in: "top", delay: 0.15 },
    { from: "weigh", to: "week", out: "bottom", in: "top", delay: 1.2 },
  ],
};

const NODES: Record<NodeId, { tag: string; title: string; sub: string; preview: "lots" | "permits" | "tiers" | "list" }> = {
  parcels: { tag: "Parcels", title: "Property records", sub: "Property information", preview: "lots" },
  permits: { tag: "Permits", title: "HVAC permit history", sub: "Recorded HVAC history", preview: "permits" },
  weigh: { tag: "Signals", title: "Evidence weighed", sub: "Strong · Medium · Weak", preview: "tiers" },
  week: { tag: "This week", title: "Your weekly list", sub: "Ranked for your ZIP codes", preview: "list" },
};

function port(b: NodeBox, side: Side): [number, number] {
  if (side === "left") return [b.x, b.y + b.h / 2];
  if (side === "right") return [b.x + b.w, b.y + b.h / 2];
  if (side === "top") return [b.x + b.w / 2, b.y];
  return [b.x + b.w / 2, b.y + b.h];
}

function cablePath(layout: Layout, c: Layout["cables"][number]) {
  const [x1, y1] = port(layout.nodes[c.from], c.out);
  const [x2, y2] = port(layout.nodes[c.to], c.in);
  if (c.out === "right") {
    const d = (x2 - x1) * 0.5;
    return `M${x1} ${y1} C${x1 + d} ${y1} ${x2 - d} ${y2} ${x2} ${y2}`;
  }
  const d = (y2 - y1) * 0.5;
  return `M${x1} ${y1} C${x1} ${y1 + d} ${x2} ${y2 - d} ${x2} ${y2}`;
}

const pct = (v: number, of: number) => `${(v / of) * 100}%`;
const boxStyle = (b: NodeBox, l: Layout): CSSProperties => ({
  left: pct(b.x, l.W),
  top: pct(b.y, l.H),
  width: pct(b.w, l.W),
  height: pct(b.h, l.H),
});

/** 5 × 7 dot-matrix digits. */
const GLYPHS: Record<string, string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
};

function DotNumber({ value }: { value: number }) {
  const digits = String(value).padStart(2, "0").split("");
  const cell = 7;
  const gap = 2;
  const width = digits.length * 5 * cell + (digits.length - 1) * gap * cell;
  return (
    <svg className={styles.dotNumber} viewBox={`0 0 ${width} ${7 * cell}`} role="img" aria-label={String(value)}>
      {digits.map((d, di) =>
        GLYPHS[d].map((row, ry) =>
          row.split("").map((bit, rx) => (
            <circle
              key={`${di}-${ry}-${rx}`}
              cx={di * (5 + gap) * cell + rx * cell + cell / 2}
              cy={ry * cell + cell / 2}
              r={bit === "1" ? 2.6 : 1.1}
              className={bit === "1" ? styles.dotOn : styles.dotOff}
            />
          )),
        ),
      )}
    </svg>
  );
}

function Preview({ kind }: { kind: (typeof NODES)[NodeId]["preview"] }) {
  if (kind === "lots") return <div className={`${styles.preview} ${styles.previewLots}`} />;
  if (kind === "permits")
    return (
      <div className={`${styles.preview} ${styles.previewPermits}`}>
        {[38, 62, 30, 80, 46, 70, 24, 56, 90, 40, 64, 34].map((h, i) => (
          <span key={i} style={{ height: `${h}%` }} />
        ))}
      </div>
    );
  if (kind === "tiers")
    return (
      <div className={`${styles.preview} ${styles.previewTiers}`}>
        <span style={{ width: "86%" }}>Strong</span>
        <span style={{ width: "58%" }}>Medium</span>
        <span style={{ width: "34%" }}>Weak</span>
      </div>
    );
  return (
    <div className={`${styles.preview} ${styles.previewList}`}>
      <span />
      <span />
      <span />
    </div>
  );
}

function Flow({ layout, live, count }: { layout: Layout; live: boolean; count: number }) {
  return (
    <div
      className={`${styles.canvas} ${layout.name === "wide" ? styles.wide : styles.tall} ${live ? styles.live : ""}`}
      style={{ aspectRatio: `${layout.W} / ${layout.H}`, "--design": layout.W } as CSSProperties}
    >
      <svg className={styles.cables} viewBox={`0 0 ${layout.W} ${layout.H}`} aria-hidden="true">
        <defs>
          <filter id={`glow-${layout.name}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        {layout.cables.map((c, i) => {
          const d = cablePath(layout, c);
          const delay = { "--delay": `${c.delay}s` } as CSSProperties;
          return (
            <g key={i} style={delay}>
              <path d={d} pathLength={100} className={styles.cablePending} />
              <path d={d} pathLength={100} className={styles.cableGlow} filter={`url(#glow-${layout.name})`} />
              <path d={d} pathLength={100} className={styles.cable} />
              <path d={d} pathLength={100} className={styles.cometTail} />
              <path d={d} pathLength={100} className={styles.cometHead} />
            </g>
          );
        })}
      </svg>

      {(Object.keys(NODES) as NodeId[]).map((id, i) => {
        const n = NODES[id];
        const box = layout.nodes[id];
        const sides: Side[] = layout.name === "wide" ? ["left", "right"] : ["top", "bottom"];
        return (
          <div
            key={id}
            className={`${styles.node} ${id === "week" ? styles.nodeLit : ""}`}
            style={{ ...boxStyle(box, layout), "--i": i } as CSSProperties}
          >
            {sides.map((side) => {
              const connected = layout.cables.some(
                (c) => (c.from === id && c.out === side) || (c.to === id && c.in === side),
              );
              return <span key={side} className={`${styles.port} ${styles[side]} ${connected ? styles.portOn : ""}`} />;
            })}
            <div className={styles.folder}>
              <Preview kind={n.preview} />
              <span className={styles.tag}>{n.tag}</span>
            </div>
            <strong className={styles.nodeTitle}>{n.title}</strong>
            <span className={styles.nodeSub}>{n.sub}</span>
          </div>
        );
      })}

      <div className={styles.result} style={boxStyle(layout.result, layout)}>
        <div className={styles.resultHead}>
          <div>
            <strong>This week</strong>
            <span>Texas · your service ZIPs</span>
          </div>
          <span className={styles.ready}>{count === 50 ? "Ready" : "Ranking"}</span>
        </div>
        <div className={styles.resultBody}>
          <DotNumber value={count} />
          <span className={styles.resultCaption}>homes worth a call</span>
        </div>
        <div className={styles.ruler} aria-hidden="true">
          {Array.from({ length: 33 }, (_, i) => (
            <span key={i} className={i % 4 === 0 ? styles.tickTall : undefined} />
          ))}
          <i className={styles.rulerMark} />
        </div>
        <div className={styles.rulerLabels} aria-hidden="true">
          <span>Weak</span>
          <span>Strong</span>
        </div>
      </div>
    </div>
  );
}

export function HowItWorks() {
  const ref = useRef<HTMLElement>(null);
  const [live, setLive] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setLive(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The list fills once the first comet reaches the week node.
  useEffect(() => {
    if (!live) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let start = 0;
    const startTimer = window.setTimeout(
      () => {
        const tick = (now: number) => {
          if (!start) start = now;
          const u = Math.min(1, (now - start) / 1100);
          setCount(Math.round(50 * (1 - Math.pow(1 - u, 3))));
          if (u < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      reduced ? 0 : 2300,
    );
    return () => {
      window.clearTimeout(startTimer);
      cancelAnimationFrame(raf);
    };
  }, [live]);

  return (
    <section ref={ref} id="how-it-works" className={styles.section} aria-labelledby="how-title">
      <div className={styles.intro}>
        <p className={styles.eyebrow}>How it works</p>
        <h2 id="how-title" className={styles.title}>
          Records in. A ranked list out.
        </h2>
        <p className={styles.lede}>
          Replacement Radar uses available property and HVAC-related information to surface the strongest opportunities
          in your service area, and hands your team a short list each week.
        </p>
      </div>

      <div className={styles.frame}>
        <div className={styles.frameHead}>
          <div>
            <span className={styles.crumb}>Replacement Radar</span>
            <strong>Flow</strong>
          </div>
          <span className={styles.status}>
            <i /> Weekly run · Monday
          </span>
        </div>
        <Flow layout={WIDE} live={live} count={count} />
        <Flow layout={TALL} live={live} count={count} />
      </div>

      <ol className={styles.steps}>
        <li>
          <span>01</span>
          <strong>Read the records</strong>
          <p>Every home in your service area, with the information on record.</p>
        </li>
        <li>
          <span>02</span>
          <strong>Weigh the evidence</strong>
          <p>Stronger opportunities rise first — and you see why each one stands out.</p>
        </li>
        <li>
          <span>03</span>
          <strong>Work the list</strong>
      <p>50, 100 or 250 homes a week. Mark them Contacted, Appointment, Won.</p>
        </li>
      </ol>
    </section>
  );
}
