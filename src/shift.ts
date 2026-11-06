import { holdSpan, PANEL_SHOWN, panelStrength, STATION_COUNT } from "./hold";

// The shift: a moment of arrival at a station. This module only decides when it fires and in
// which size; the effects draw it. Visits live in the tracker (memory), so a reload starts over.
export type { ShiftKind } from "./nixie";
import { SHIFT_SECONDS, type ShiftKind } from "./nixie";
import { TEAR_POSES } from "./tear";

/** How long the visitor must stay inside a hold before the shift fires, so scrolling quickly
 *  through a station doesn't trigger it. */
export const DWELL_MS = 250;

/** True if no window of one second holds more than MAX_CHANGES_PER_SECOND of these times. */
const withinLimit = (times: number[]) =>
  times.every((a) => times.filter((b) => b >= a && b < a + 1000).length <= MAX_CHANGES_PER_SECOND);

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

/** The most sudden changes (a jump in the view) in any one second. A shift held back by this still shows its text. */
export const MAX_CHANGES_PER_SECOND = 3;

/** When a shift's tear jumps the view, in ms after it starts: the tear starting, each re-cut of the
 *  bands, and the snap back. The tear and this list both come from TEAR_POSES and SHIFT_SECONDS. */
export const changeOffsets = (kind: ShiftKind): number[] => {
  const len = SHIFT_SECONDS[kind] * 1000, poses = TEAR_POSES[kind];
  return [0, ...Array.from({ length: poses - 1 }, (_, k) => ((k + 1) / poses) * len), len + SNAP_BACK_MS];
};

/** What the room needs from the tracker: may station `i`'s text show at this progress and time. */
export type TextGate = {
  ready: (station: number, progress: number, nowMs: number) => boolean;
  /** Whether station `i`'s text resolves out of the tear when it shows (a first visit's full tear),
   *  or just appears (a return, or a shift held back). */
  resolves: (station: number) => boolean;
};

/** `startProgress`: where the page opens (a reload inside a hold is not an arrival, so it gets no
 *  shift and its text shows). `quietUntil`: a time (ms) before which no shift starts, the meter's
 *  power-on; a visitor still in the hold afterwards gets it then.
 *
 *  Call `observe` on every scroll, and again `DWELL_MS` after the last one (the visitor may have
 *  stopped). It returns the shift to play now, or null. `ready` says whether a station's text may
 *  show: on a first visit it is held back until the full tear ends, so it resolves out of it; on a
 *  return it shows as soon as the dwell ends and the flick plays over it. */
export function createShifts(reduced = false, { startProgress = 0, quietUntil = 0 } = {}) {
  const visited = new Set<number>();
  const revealed = new Set<number>(); // stations whose text is out, until the visitor has left
  const resolving = new Set<number>(); // stations whose text is held for a full tear
  let changes: number[] = [], lastPlan: number[] = []; // times (ms) of sudden changes, pending ones included
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
      changes = changes.filter((c) => c > nowMs - 1000); // an older change can't share a window with a new one
      const kind = visited.has(here) ? "short" : "full";
      const plan = changeOffsets(kind).map((o) => nowMs + o);
      if (!withinLimit([...changes, ...plan])) { readyAt = nowMs; return null; }
      changes.push(...plan); lastPlan = plan;
      visited.add(here);
      if (kind === "full") { resolving.add(here); readyAt = nowMs + SHIFT_SECONDS.full * 1000 + SNAP_BACK_MS; }
      else { resolving.delete(here); readyAt = nowMs; } // a return: the text shows now, and the flick plays over it
      return kind;
    },
    /** The page put the visitor in this hold itself (it restored the scroll position after a
     *  reload): that is not an arrival, so no shift, and the text shows. */
    /** The tear actually began (the view is drawn a moment after the shift fires, more on a slow
     *  device): the text follows `kind`'s length after that, never before the tear is over. */
    tearStarted(kind: ShiftKind, nowMs: number) {
      // the tear's jumps are from here, not from when it fired
      const plan = changeOffsets(kind).map((o) => nowMs + o);
      changes = changes.filter((c) => !lastPlan.includes(c)).concat(plan); lastPlan = plan;
      if (kind === "full") readyAt = Math.max(readyAt, nowMs + SHIFT_SECONDS.full * 1000 + SNAP_BACK_MS);
    },
    /** A Work page turn asks for the short flick on that TV. It plays unless reduced motion is on or
     *  it would put more than the limit of sudden changes in a second (quick clicks): the page turns
     *  either way. */
    turn(nowMs: number): boolean {
      if (reduced) return false;
      changes = changes.filter((c) => c > nowMs - 1000);
      const plan = changeOffsets("short").map((o) => nowMs + o);
      if (!withinLimit([...changes, ...plan])) return false;
      changes.push(...plan);
      return true;
    },
    restore(progress: number) {
      at = stationAt(progress);
      fired = at !== 0;
      if (at) revealed.add(at);
    },
    resolves: (station: number) => resolving.has(station),
    ready(station: number, progress: number, nowMs: number): boolean {
      if (reduced) return true;
      if (panelStrength(progress, station) < PANEL_SHOWN) { revealed.delete(station); resolving.delete(station); return false; }
      if (revealed.has(station)) return true;
      if (at === station && fired && nowMs >= readyAt) { revealed.add(station); return true; }
      return false;
    },
  };
}

/** The link between the tour (which owns the tracker) and the room (which shows the text). Until the
 *  tour is up every station's text may show. */
export const textGate = (): TextGate => ({ ready: () => true, resolves: () => false });
