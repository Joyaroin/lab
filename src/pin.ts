// Where a station's HTML panel goes in the window, given where its CRT projects to.
// The panel is centred on the CRT but kept fully inside the window and clear of the HUD (top)
// and the meter (bottom), so every panel is readable at every station and window size.
export const TOP_CLEAR = 96, BOTTOM_CLEAR = 150, SIDE = 8;

export type Fit = { left: number; top: number; width: number; maxHeight: number };

/**
 * @param cx,cy      CRT centre in window pixels
 * @param crtWidth   CRT width in window pixels (the panel is at least a readable size)
 * @param panelHeight the panel's natural height (px); it scrolls if it can't fit
 */
export function fitPanel(win: { width: number; height: number }, cx: number, cy: number, crtWidth: number, panelHeight: number): Fit {
  const width = Math.min(Math.max(crtWidth, 352), win.width - 2 * SIDE, 640);
  const room = Math.max(120, win.height - TOP_CLEAR - BOTTOM_CLEAR);
  const maxHeight = Math.min(room, win.height - 2 * SIDE);
  const h = Math.min(panelHeight, maxHeight);
  const left = Math.min(Math.max(cx - width / 2, SIDE), win.width - width - SIDE);
  const lowest = Math.max(TOP_CLEAR, win.height - BOTTOM_CLEAR - h);
  const top = Math.min(Math.max(cy - h / 2, TOP_CLEAR), lowest);
  return { left, top, width, maxHeight };
}
