import { holdSpan, STATION_COUNT } from "./hold";

// The shift: a moment of arrival at a station. This module only decides when it fires and in
// which size; the effects draw it. Visits live in the tracker (memory), so a reload starts over.
export type { ShiftKind } from "./nixie";
import type { ShiftKind } from "./nixie";

/** How long the visitor must stay inside a hold before the shift fires, so scrolling quickly
 *  through a station doesn't trigger it. */
export const DWELL_MS = 250;

const stationAt = (progress: number) => {
  for (let i = 1; i <= STATION_COUNT; i++) {
    const [a, b] = holdSpan(i);
    if (progress >= a && progress <= b) return i;
  }
  return 0; // the entrance, or travelling
};

/** Call `observe` on every scroll, and again `DWELL_MS` after the last one (the visitor may have
 *  stopped). It returns the shift to play now, or null. */
export function createShifts(reduced = false) {
  const visited = new Set<number>();
  let at = 0, since = 0, fired = false;
  return {
    observe(progress: number, nowMs: number): ShiftKind | null {
      const here = stationAt(progress);
      if (here !== at) { at = here; since = nowMs; fired = false; }
      if (reduced || here === 0 || fired || nowMs - since < DWELL_MS) return null;
      fired = true;
      const kind = visited.has(here) ? "short" : "full";
      visited.add(here);
      return kind;
    },
  };
}
