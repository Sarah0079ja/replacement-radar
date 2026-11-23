// The colours written every frame (the static ones are in tokens.css), as RGB channels.

export type RGB = readonly [number, number, number];

/** A tab's label from grey to white on the ink pill, to ink under the pointer, and its icon to the soft accent once
 *  the tab is active. */
export const TAB_DIM: RGB = [119, 119, 124];
export const TAB_LIT: RGB = [255, 255, 255];
export const TAB_HOVER: RGB = [17, 17, 17];
export const ICON_LIT: RGB = [255, 122, 85];
/** The icon's glow (switched off in CSS: this look has no glows). */
export const ICON_GLOW = "255,122,85";
/** The coral glow on the floor, and the accent flash in the ink pill. */
export const FLOOR = "255,120,90";
export const CAUSTIC = "255,122,85";

/** The beam's dots: ink while the pill travels, the accent by row once it rests, a brighter accent on arrival; the
 *  unlit grid dot and the dashed ghost ring. */
export const DOT_INK: RGB = [17, 17, 17];
export const DOT_HOT_TOP: RGB = [248, 120, 84];
export const DOT_HOT_FOOT: RGB = [232, 70, 34];
export const DOT_FLASH: RGB = [255, 122, 85];
export const DOT_UNLIT = "200,200,206";
export const DOT_GHOST = "17,17,17";
