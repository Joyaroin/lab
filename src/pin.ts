import { stations } from "./content";

// How much room the HUD takes at the top and the meter bar at the bottom: one pure rule of the window's
// size (`clearances`), never measured from the page. The camera's stop (src/stop.ts) and the text panel
// (`fitPanel`) both read it, so the glass and the panel always stand between the same two lines.
// Where a station's HTML panel goes: centred on the CRT's projection but kept fully inside the window and
// between the clearances. On a portrait window the panel spans the full width and takes all the free height
// between them, and scrolls.
export const SIDE = 8;

// The phone's bottom menu (src/Hud.tsx builds it from these): Room and one button per station, in rows
// of PHONE_COLS, each BUTTON_PX tall. #222 changes the columns to three; the clearance follows.
export const BUTTON_PX = 44;
export const PHONE_COLS = 4;
export const PHONE_GAP_PX = 4.8; // 0.3rem
export const PHONE_PAD_PX = 6.4; // 0.4rem
export const PHONE_ROWS = Math.ceil((stations.length + 1) / PHONE_COLS);
/** The menu bar's height: its rows, the gaps between them and the padding above and below. */
export const PHONE_MENU_H = PHONE_ROWS * BUTTON_PX + (PHONE_ROWS - 1) * PHONE_GAP_PX + 2 * PHONE_PAD_PX;

// The landscape HUD's boxes (px): the name block at the top left, the link row at the top right. The
// threshold for one row is worked out from them. #222 asserts the real HUD fits them; #226 tests the
// overview against them. If the HUD needs more room, change a box here and the rest follows. The boxes
// are sized so ONE_ROW_MIN_W is 1280: a 1280 x 800 window keeps the one-row HUD (420 + 24 + 800 + 2 x 18).
export const NAME_BLOCK_W = 420, NAME_BLOCK_H = 72;
export const LINK_ROW_W = 800, LINK_ROW_H = 36;
export const HUD_MARGIN = 18; // round the boxes: the window's top and sides
export const HUD_GAP = 24; // between the name block and the link row when they share a line
/** From this width (landscape) the name block and the link row share the top of the window. */
export const ONE_ROW_MIN_W = NAME_BLOCK_W + HUD_GAP + LINK_ROW_W + 2 * HUD_MARGIN;
const ONE_ROW_H = HUD_MARGIN + NAME_BLOCK_H; // about 90
const TWO_LINE_H = ONE_ROW_H + LINK_ROW_H; // about 126
const PHONE_TOP = 96;

type Win = { width: number; height: number };

/** A portrait window is narrower than it is tall: the same test the framing makes. */
const isPortrait = (win: Win) => win.width < win.height;

/** The meter device's size: 660 x 280 in shape, its width a rule of the window's. */
export function deviceSize(win: Win): { width: number; height: number } {
  const width = isPortrait(win) ? Math.min(280, 0.72 * win.width) : Math.min(Math.max(280, 0.29 * win.width), 420);
  return { width, height: (width * 280) / 660 };
}

/** The room the HUD takes at the top and the meter bar (with the phone menu, on portrait) at the bottom. */
export function clearances(win: Win): { top: number; bottom: number } {
  const device = deviceSize(win);
  if (isPortrait(win)) return { top: PHONE_TOP, bottom: PHONE_MENU_H + 16 + device.height + 32 };
  // 26 px of text, 8 px under it and 8 px over the device
  return { top: win.width >= ONE_ROW_MIN_W ? ONE_ROW_H : TWO_LINE_H, bottom: device.height + 42 };
}

export type Fit = { left: number; top: number; width: number; maxHeight: number };

/**
 * @param cx,cy      CRT centre in window pixels
 * @param crtWidth   CRT width in window pixels (the panel is at least a readable size)
 * @param panelHeight the panel's natural height (px); it scrolls if it can't fit
 */
export function fitPanel(win: { width: number; height: number }, cx: number, cy: number, crtWidth: number, panelHeight: number): Fit {
  const { top: topClear, bottom: bottomClear } = clearances(win);
  const width = Math.min(Math.max(crtWidth, 352), win.width - 2 * SIDE, 640);
  const room = Math.max(120, win.height - topClear - bottomClear);
  const maxHeight = Math.min(room, win.height - 2 * SIDE);
  const h = Math.min(panelHeight, maxHeight);
  const left = Math.min(Math.max(cx - width / 2, SIDE), win.width - width - SIDE);
  const lowest = Math.max(topClear, win.height - bottomClear - h);
  const top = Math.min(Math.max(cy - h / 2, topClear), lowest);
  return { left, top, width, maxHeight };
}

const MIN_GLASS_FONT = 14; // px
const GLASS_PER_EM = 40; // glass widths per em: 40 characters of type across

/** Font size (px) for text laid over the glass, so the type scales with it: a large window fills
 *  the screen instead of stopping at a fixed size, and a small one never drops below 14 px. */
export function glassFontSize(glassWidth: number): number {
  return Math.max(MIN_GLASS_FONT, glassWidth / GLASS_PER_EM);
}
