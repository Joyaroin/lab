import { stations } from "./content";
import type { Where } from "./where";

export const STATION_COUNT = stations.length;

/** How much of a flight (a share of it) the text takes to fade out. It is gone before the
 *  mouse parallax starts (`PARALLAX_FROM` in src/framing), so flat text never sits over tilting glass. */
export const TEXT_FADE = 0.18;

/** How strongly station `i`'s text panel shows at `where`: full while at the station, then fading out over
 *  the first part of a flight away (`TEXT_FADE`), or in over the last part of one in. */
export function panelStrength(where: Where, i: number): number {
  const away = whereAway(where, i);
  return Math.min(1, Math.max(0, 1.1 - away * (1.05 / TEXT_FADE)));
}

/** How far a Where is from station `i`, as a share of one flight: 0 at it, `f` leaving it, `1 - f` arriving, else far. */
function whereAway(w: Where, i: number): number {
  if (w.kind === "at") return w.stop === i ? 0 : Infinity;
  return w.from === i ? w.f : w.to === i ? 1 - w.f : Infinity;
}

/** Below this strength a panel is hidden. */
export const PANEL_SHOWN = 0.05;
