"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { PINS, TRACKS, focusX, trackAt } from "./pins";
import styles from "./hero.module.css";

const VIDEO_W = 1920;
const VIDEO_H = 1080;
/** With reduced motion the film rests on the frame where one home has been picked. */
const STILL_AT = 24;

export function HeroFilm() {
  const heroRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pinRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const hero = heroRef.current;
    const video = videoRef.current;
    if (!hero || !video) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const narrow = window.matchMedia("(max-width: 900px)").matches;
    video.src = narrow ? "/hero/neighborhood-720.mp4" : "/hero/neighborhood-1080.mp4";

    if (reduced) {
      video.loop = false;
      const rest = () => {
        video.currentTime = STILL_AT;
      };
      video.addEventListener("loadeddata", rest, { once: true });
    } else {
      video.play().catch(() => {
        // Autoplay blocked (e.g. low-power mode): the poster stays and no cards show.
      });
    }

    let raf = 0;
    let visible = true;
    const shown = PINS.map(() => false);

    const frame = () => {
      const t = video.currentTime;
      const w = hero.clientWidth;
      const h = hero.clientHeight;
      const scale = Math.max(w / VIDEO_W, h / VIDEO_H);
      const dw = VIDEO_W * scale;
      const dh = VIDEO_H * scale;
      const px = w / h < VIDEO_W / VIDEO_H ? focusX(t) : 0.5;
      video.style.objectPosition = `${(px * 100).toFixed(2)}% 50%`;
      const ox = (w - dw) * px;
      const oy = (h - dh) * 0.5;

      PINS.forEach((pin, i) => {
        const el = pinRefs.current[i];
        if (!el) return;
        const at = t >= pin.in && t <= pin.out ? trackAt(TRACKS[pin.id], t) : null;
        if (at) {
          const x = ox + at[0] * dw;
          const y = oy + at[1] * dh;
          const inside = x > 12 && x < w - 12 && y > 12 && y < h - 12;
          el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
          el.classList.toggle(styles.flip, x > w - 300);
          if (inside !== shown[i]) {
            shown[i] = inside;
            el.classList.toggle(styles.on, inside);
          }
        } else if (shown[i]) {
          shown[i] = false;
          el.classList.remove(styles.on);
        }
      });
      if (visible) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // The film only plays while the hero is on screen.
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) {
        if (!reduced) video.play().catch(() => {});
        raf = requestAnimationFrame(frame);
      } else video.pause();
    });
    observer.observe(hero);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
      video.pause();
    };
  }, []);

  return (
    <section ref={heroRef} id="top" className={styles.hero} aria-labelledby="hero-title">
      <video
        ref={videoRef}
        className={styles.video}
        poster="/hero/neighborhood-poster.jpg"
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
      />
      <div className={styles.scrim} aria-hidden="true" />

      <div className={styles.pins} aria-hidden="true">
        {PINS.map((pin, i) => (
          <div
            key={pin.id}
            ref={(el) => {
              pinRefs.current[i] = el;
            }}
            className={`${styles.pin} ${styles[pin.dir]} ${pin.picked ? styles.picked : ""}`}
          >
            <span className={styles.dot} />
            <span className={styles.leader} />
            <div className={styles.card}>
              {pin.picked ? (
                <>
                  <span className={styles.cardKicker}>Strong opportunity</span>
                  <dl className={styles.facts}>
                    <div>
                      <dt>Last HVAC work</dt>
                      <dd>{pin.hvac}</dd>
                    </div>
                    <div>
                      <dt>Built</dt>
                      <dd>{pin.built}</dd>
                    </div>
                    <div>
                      <dt>Evidence</dt>
                      <dd>High · recorded permit</dd>
                    </div>
                  </dl>
                  <span className={styles.cardAction}>Added to This Week →</span>
                </>
              ) : (
                <>
                  <span className={`${styles.chip} ${styles[`chip${pin.priority}`]}`}>{pin.priority}</span>
                  <dl className={styles.compact}>
                    <div>
                      <dt>Last HVAC</dt>
                      <dd>{pin.hvac}</dd>
                    </div>
                    <div>
                      <dt>Built</dt>
                      <dd>{pin.built}</dd>
                    </div>
                  </dl>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.copy}>
        <p className={styles.eyebrow}>Texas · HVAC property intelligence</p>
        <h1 id="hero-title" className={styles.title}>
          Know which homes to target this week.
        </h1>
        <p className={styles.lede}>
          Replacement Radar uses available property and HVAC-related information to surface the homes in your territory
          worth a closer look — with the evidence behind each one.
        </p>
        <div className={styles.actions}>
          <Link href="/territory" className={styles.primary}>
            Start your 5-day trial
          </Link>
          <a href="#how-it-works" className={styles.secondary}>
            See how it works
          </a>
        </div>
        <p className={styles.terms}>$99/month after the trial · one plan · cancel anytime</p>
      </div>

      <p className={styles.note}>Illustrative footage and figures</p>
    </section>
  );
}
