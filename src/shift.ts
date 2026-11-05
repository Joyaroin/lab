import { holdSpan, PANEL_SHOWN, panelStrength, STATION_COUNT } from "./hold";

// The shift: a moment of arrival at a station. This module only decides when it fires and in
// which size; the effects draw it. Visits live in the tracker (memory), so a reload starts over.
export type { ShiftKind } from "./nixie";
import { SHIFT_SECONDS, type ShiftKind } from "./nixie";

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

/** The text follows a moment after the tear has snapped back, so the two never overlap, even when a
 *  frame comes late. */
export const SNAP_BACK_MS = 40;

/** The most shifts that may start in any one second. A shift held back by this still shows its text. */
export const MAX_SHIFTS_PER_SECOND = 3;

/** What the room needs from the tracker: may station `i`'s text show at this progress and time. */
export type TextGate = { ready: (station: number, progress: number, nowMs: number) => boolean };

/** `startProgress`: where the page opens (a reload inside a hold is not an arrival, so it gets no
 *  shift and its text shows). `quietUntil`: a time (ms) before which no shift starts, the meter's
 *  power-on; a visitor still in the hold afterwards gets it then.
 *
 *  Call `observe` on every scroll, and again `DWELL_MS` after the last one (the visitor may have
 *  stopped). It returns the shift to play now, or null. `ready` says whether a station's text may
 *  show: it is held back from arrival until the shift ends, so it resolves out of the tear. */
export function createShifts(reduced = false, { startProgress = 0, quietUntil = 0 } = {}) {
  const visited = new Set<number>();
  const revealed = new Set<number>(); // stations whose text is out, until the visitor has left
  const starts: number[] = [];
  let at = stationAt(startProgress), since = 0, fired = at !== 0, readyAt = 0;
  if (at) revealed.add(at);
  return {
    /** The hold the visitor is in, 0 for the entrance or travel. */
    get station() { return at; },
    observe(progress: number, nowMs: number): ShiftKind | null {
      const here = stationAt(progress);
      if (here !== at) { at = here; since = nowMs; fired = false; }
      if (reduced || here === 0 || fired || nowMs - since < DWELL_MS || nowMs < quietUntil) return null;
      fired = true;
      while (starts.length && starts[0] <= nowMs - 1000) starts.shift();
      if (starts.length >= MAX_SHIFTS_PER_SECOND) { readyAt = nowMs; return null; }
      starts.push(nowMs);
      const kind = visited.has(here) ? "short" : "full";
      visited.add(here);
      readyAt = nowMs + SHIFT_SECONDS[kind] * 1000 + SNAP_BACK_MS;
      return kind;
    },
    /** The page put the visitor in this hold itself (it restored the scroll position after a
     *  reload): that is not an arrival, so no shift, and the text shows. */
    restore(progress: number) {
      at = stationAt(progress);
      fired = at !== 0;
      if (at) revealed.add(at);
    },
    ready(station: number, progress: number, nowMs: number): boolean {
      if (reduced) return true;
      if (panelStrength(progress, station) < PANEL_SHOWN) { revealed.delete(station); return false; }
      if (revealed.has(station)) return true;
      if (at === station && fired && nowMs >= readyAt) { revealed.add(station); return true; }
      return false;
    },
  };
}

/** The link between the tour (which owns the tracker) and the room (which shows the text). Until the
 *  tour is up every station's text may show. */
export const textGate = (): TextGate => ({ ready: () => true });
