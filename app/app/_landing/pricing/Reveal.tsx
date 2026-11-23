"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./pricing.module.css";

/** Rows rise in, staggered, the first time the list enters the viewport. Content is visible without JavaScript; the
 *  hidden starting state is only applied when the list is still below the fold. */
export function Reveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;
    el.dataset.armed = "";
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.dataset.in = "";
        io.disconnect();
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={styles.reveal}>
      {children}
    </div>
  );
}
