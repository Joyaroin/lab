// Where a station's HTML panel goes in the window, given where its CRT projects to.
// The panel is centred on the CRT but kept fully inside the window and clear of the HUD (top)
// and the meter (bottom), so every panel is readable at every station and window size.
// On a narrow window the panel spans the full width, so it takes at most half the free height
// and scrolls, leaving the rest of the window to show the station in the room.
export const TOP_CLEAR = 128, BOTTOM_CLEAR = 150, SIDE = 8, NARROW = 600;

export type Fit = { left: number; top: number; width: number; maxHeight: number };

/**
 * @param cx,cy      CRT centre in window pixels
 * @param crtWidth   CRT width in window pixels (the panel is at least a readable size)
 * @param panelHeight the panel's natural height (px); it scrolls if it can't fit
 * @param menuHeight the phone menu's height (px), 0 when there is none: it stands under the meter, which it lifts
 */
export function fitPanel(win: { width: number; height: number }, cx: number, cy: number, crtWidth: number, panelHeight: number, menuHeight = 0): Fit {
  const bottomClear = BOTTOM_CLEAR + menuHeight;
  const width = Math.min(Math.max(crtWidth, 352), win.width - 2 * SIDE, 640);
  const free = win.height - TOP_CLEAR - bottomClear;
  const room = Math.max(120, win.width < NARROW ? free / 2 : free);
  const maxHeight = Math.min(room, win.height - 2 * SIDE);
  const h = Math.min(panelHeight, maxHeight);
  const left = Math.min(Math.max(cx - width / 2, SIDE), win.width - width - SIDE);
  const lowest = Math.max(TOP_CLEAR, win.height - bottomClear - h);
  const top = Math.min(Math.max(cy - h / 2, TOP_CLEAR), lowest);
  return { left, top, width, maxHeight };
}

const MIN_GLASS_FONT = 14; // px
const GLASS_PER_EM = 40; // glass widths per em: 40 characters of type across

/** Font size (px) for text laid over the glass, so the type scales with it: a large window fills
 *  the screen instead of stopping at a fixed size, and a small one never drops below 14 px. */
export function glassFontSize(glassWidth: number): number {
  return Math.max(MIN_GLASS_FONT, glassWidth / GLASS_PER_EM);
}
