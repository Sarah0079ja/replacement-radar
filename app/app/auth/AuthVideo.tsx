"use client";

import { useLayoutEffect, useRef } from "react";
import styles from "./auth.module.css";

const REDUCED_MOTION_FRAME = 4.5;

export function AuthVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useLayoutEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyMotionPreference = () => {
      if (mediaQuery.matches) {
        video.autoplay = false;
        video.removeAttribute("autoplay");
        video.pause();
        video.currentTime = REDUCED_MOTION_FRAME;
      } else {
        video.autoplay = true;
        void video.play().catch(() => undefined);
      }
    };

    const preventReducedMotionPlayback = () => {
      if (mediaQuery.matches) video.pause();
    };

    applyMotionPreference();
    const retryTimer = window.setTimeout(() => {
      if (!mediaQuery.matches) {
        video.muted = true;
        void video.play().catch(() => undefined);
      }
    }, 1000);
    video.addEventListener("loadeddata", applyMotionPreference);
    video.addEventListener("play", preventReducedMotionPlayback);
    mediaQuery.addEventListener("change", applyMotionPreference);
    return () => {
      video.removeEventListener("loadeddata", applyMotionPreference);
      video.removeEventListener("play", preventReducedMotionPlayback);
      mediaQuery.removeEventListener("change", applyMotionPreference);
      window.clearTimeout(retryTimer);
    };
  }, []);

  return (
    <div className={styles.videoScene} aria-hidden="true">
      <video
        ref={videoRef}
        className={styles.video}
        src="/hvac-signals-teal.mp4"
        poster="/hvac-signals-teal-poster.jpg"
        muted
        loop
        playsInline
        preload="metadata"
        tabIndex={-1}
        onLoadedData={(event) => {
          if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            event.currentTarget.muted = true;
            void event.currentTarget.play().catch(() => undefined);
          } else {
            event.currentTarget.currentTime = REDUCED_MOTION_FRAME;
          }
        }}
        onPlay={(event) => {
          if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            event.currentTarget.pause();
            event.currentTarget.currentTime = REDUCED_MOTION_FRAME;
          }
        }}
      />
    </div>
  );
}
