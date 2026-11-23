// Every motion number. Times in seconds, springs as stiffness k and damping c (per unit mass), stepped once per
// animation frame with semi-implicit Euler.

/** The first frame's step, and the longest step a slow frame may take. */
export const DT_FIRST = 1 / 60;
export const DT_MAX = 0.04;

/** The demo: [time in the loop, tab, click]. The cursor glides to a tab, then clicks it. */
export const DEMO: readonly (readonly [number, number, 0 | 1])[] = [
  [0.6, 1, 0],
  [1.3, 1, 1],
  [2.6, 3, 0],
  [3.2, 3, 1],
  [4.6, 2, 0],
  [5.1, 2, 1],
  [6.5, 4, 0],
  [7.0, 4, 1],
  [8.6, 0, 0],
  [9.1, 0, 1],
];
export const LOOP = 10.6;
/** The loop's clicks re-arm in its first 0.05 s; a click fires within 0.2 s of its time; the press shows 0.16 s. */
export const LOOP_REARM = 0.05;
export const CLICK_WINDOW = 0.2;
export const PRESS = 0.16;
export const CURSOR_PRESSED = 0.9;
/** The cursor eases towards its target at this rate (per s). */
export const CURSOR_RATE = 5.5;
/** A hover, click or key press holds the demo off this long. */
export const HAND_BACK = 4;

/** The active pill: one spring per edge. The edge in front (the one the pill is moving towards) is stiffer, so it
 *  runs ahead and the pill stretches, then the trailing edge catches up. Both start at stiffness PILL_K0 and ease
 *  to their values at PILL_K_RATE, and stay critically damped (c = 2√k × PILL_DAMPING) all the way. */
export const PILL_K0 = 300;
export const PILL_K_LEAD = 230;
export const PILL_K_TRAIL = 150;
export const PILL_K_RATE = 6;
export const PILL_DAMPING = 1.0;

/** The hover pill's edges, and its fade in and out. */
export const HOVER_K = 420;
export const HOVER_C = 36;
export const FADE_K = 200;
export const FADE_C = 26;

/** The beam's focus (1 = an open cone, lower = a thin thread): when the pill's edges move faster than SPEED_THIN
 *  together (design px/s), it springs to FOCUS_THIN, otherwise back to 1, and may overshoot to FOCUS_MAX. */
export const SPEED_THIN = 35;
export const FOCUS_THIN = 0.12;
export const FOCUS_K = 90;
export const FOCUS_C = 17;
export const FOCUS_MAX = 1.25;
/** On the way back up past BLOOM the beam blooms (a pulse of light that decays to PULSE_DECAY per second); it can
 *  bloom again once it has dropped under REARM. */
export const BLOOM = 0.75;
export const REARM = 0.4;
export const PULSE_DECAY = 0.12;

/** The beam follows the pill's centre at this rate, and leans into its own lag (deg per design px, up to TILT_MAX). */
export const FOLLOW_RATE = 9;
export const TILT_RATE = 6;
export const TILT = -0.05;
export const TILT_MAX = 10;

/** What the focus does to the beam's opacity, the rim light's width (× the pill's width) and its opacity. */
export const BEAM_OPACITY: readonly [number, number] = [0.45, 1];
export const RIM_WIDTH: readonly [number, number] = [0.3, 0.9];
export const RIM_OPACITY = 0.35;
export const RIM_OPACITY_GAIN = 0.65;
/** The pool of light on the floor: × the pill's width, and its alpha from the focus and the pulse. */
export const FLOOR_LEFT = 0.6;
export const FLOOR_WIDTH = 1.2;
export const FLOOR_ALPHA = 0.12;
export const FLOOR_FOCUS = 0.14;
export const FLOOR_PULSE = 0.2;
/** The light inside the active pill, from its top edge. */
export const CAUSTIC_FOCUS = 0.1;
export const CAUSTIC_PULSE = 0.18;

/** Tabs light up as the pill passes over them and stay lit while active (rate per s). A tab is covered when the
 *  pill's centre is within COVER_SPAN of its width from its own centre; covering lights it to COVER at most, a hover
 *  to HOVER_LIT. The icon takes its own colour above ICON_ON and glows above GLOW_ON (GLOW px, GLOW_ALPHA). */
export const LIT_RATE = 9;
export const COVER_SPAN = 0.7;
export const COVER = 0.6;
export const HOVER_LIT = 0.35;
export const ICON_ON = 0.02;
export const GLOW_ON = 0.05;
export const GLOW = 7;
export const GLOW_ALPHA = 0.55;
