import { CAMERA_FOV, CRT_GLASS, type Crt } from "./crts";
import { clearances, MIN_PANEL_H, SIDE } from "./pin";

type V3 = [number, number, number];
type Win = { width: number; height: number };

const TAN = Math.tan((CAMERA_FOV * Math.PI) / 360);

/** The band of the window the glass fills: below the HUD, above the meter, inside the sides. */
function band(win: Win) {
  const { top, bottom } = clearances(win);
  const free = Math.max(MIN_PANEL_H, win.height - top - bottom);
  return { free, wide: Math.max(120, win.width - 2 * SIDE), centreY: top + free * 0.5 };
}

/** How far the camera stands from the glass so it fills the band, whichever of height and width
 *  runs out first. One rule for every station: 0.54 m at 1280x800. */
function stopDistance(win: Win): number {
  const { free, wide } = band(win);
  const px = win.height / (2 * TAN); // pixels per metre at one metre
  return Math.max((CRT_GLASS.height * px) / free, (CRT_GLASS.width * px) / wide);
}

/** The desktop stop for a CRT: straight in front of the glass, level with it, at `stopDistance`.
 *  The look point sits a little below the glass centre so the glass centres in the band between
 *  the HUD and the meter rather than in the whole window. */
export function squareStop(crt: Crt, win: Win): { camera: V3; look: V3 } {
  const d = stopDistance(win), a = (crt.yaw * Math.PI) / 180;
  const metresPerPx = (2 * d * TAN) / win.height;
  const y = crt.screen[1] + (band(win).centreY - win.height / 2) * metresPerPx;
  return {
    camera: [crt.screen[0] + Math.sin(a) * d, y, crt.screen[2] + Math.cos(a) * d],
    look: [crt.screen[0], y, crt.screen[2]],
  };
}
