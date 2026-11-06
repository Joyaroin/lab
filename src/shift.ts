import { holdSpan, PANEL_SHOWN, panelStrength, STATION_COUNT } from "./hold";

// The shift: a moment of arrival at a station. This module only decides when it fires and in
// which size; the effects draw it. Visits live in the tracker (memory), so a reload starts over.
export type { ShiftKind } from "./nixie";
import { SHIFT_SECONDS, type ShiftKind } from "./nixie";
import { TEAR_POSES } from "./tear";

/** The wait: how long the visitor must stay inside a hold before the shift fires, so scrolling
 *  quickly through a station doesn't trigger it. */
export const WAIT_MS = 250;

/** A shift that is playing, as the views are told of it. `id` changes for each new one. */
export type Play = { kind: ShiftKind; id: number };

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

/** The most sudden changes (a jump in the view) in any window of a little over a second (see
 *  FRAME_ALLOWANCE_MS). A shift held back by this still shows its text. */
export const MAX_CHANGES_PER_SECOND = 3;

/** Changes are drawn on the next frame, so two of them can land closer together than they were booked
 *  (a late start, an early next one). Every check counts over this much more than a second, so the
 *  real gaps still hold the limit on a slow device. One place for tears and page turns alike. */
const FRAME_ALLOWANCE_MS = 100;
const WINDOW_MS = 1000 + FRAME_ALLOWANCE_MS;

/** The most changes (times in ms) in any window of `windowMs` that starts at one of them. This is the
 *  one place the count is written: the tracker, the unit tests and the browser tests all use it. */
export const busiestWindow = (times: number[], windowMs = 1000) =>
  Math.max(0, ...times.map((a) => times.filter((b) => b >= a && b < a + windowMs).length));

/** When a shift's tear jumps the view, in ms after it starts: the tear starting, each re-cut of the
 *  bands, and the snap back. The tear and this list both come from TEAR_POSES and SHIFT_SECONDS. */
export const changeOffsets = (kind: ShiftKind): number[] => {
  const len = SHIFT_SECONDS[kind] * 1000, poses = TEAR_POSES[kind];
  return [0, ...Array.from({ length: poses - 1 }, (_, k) => ((k + 1) / poses) * len), len + SNAP_BACK_MS];
};

/** How long after a full tear starts its text may show: the tear, then a moment for the snap back. */
const fullTearMs = SHIFT_SECONDS.full * 1000 + SNAP_BACK_MS;

/** A booked change. Objects, so a plan is found again by identity, never by its time. */
type Change = { at: number };

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
 *  Call `observe` on every scroll, and again `WAIT_MS` after the last one (the visitor may have
 *  stopped). It returns the shift to play now, or null. `ready` says whether a station's text may
 *  show: on a first visit it is held back until the full tear ends, so it resolves out of it; on a
 *  return it shows as soon as the wait ends and the flick plays over it. */
export function createShifts(reduced = false, { startProgress = 0, quietUntil = 0 } = {}) {
  const visited = new Set<number>();
  const revealed = new Set<number>(); // stations whose text is out, until the visitor has left
  const resolving = new Set<number>(); // stations whose text is held for a full tear
  // Booked changes, pending ones included, and the last plan booked for each kind of play (the whole
  // view's tear, a page turn's flick) so it can be re-timed when the view really draws it.
  let changes: Change[] = [];
  const plans = { whole: [] as Change[], page: [] as Change[] };
  const plan = (kind: ShiftKind, nowMs: number): Change[] => changeOffsets(kind).map((o) => ({ at: nowMs + o }));
  /** Books `kind` from `nowMs` if no window would then hold more than the limit; false if it doesn't fit. */
  const book = (slot: keyof typeof plans, kind: ShiftKind, nowMs: number): boolean => {
    const kept = changes.filter((c) => c.at > nowMs - WINDOW_MS); // an older change can't share a window with a new one
    const added = plan(kind, nowMs);
    changes = kept;
    if (busiestWindow([...kept, ...added].map((c) => c.at), WINDOW_MS) > MAX_CHANGES_PER_SECOND) return false;
    changes.push(...added); plans[slot] = added;
    return true;
  };
  /** The play really began at `nowMs` (drawn a frame or more after it was booked): count from there. */
  const rebook = (slot: keyof typeof plans, kind: ShiftKind, nowMs: number) => {
    const added = plan(kind, nowMs);
    changes = changes.filter((c) => !plans[slot].includes(c)); changes.push(...added); plans[slot] = added;
  };
  let at = stationAt(startProgress), since = 0, fired = at !== 0, readyAt = 0;
  if (at) revealed.add(at);
  return {
    /** The hold the visitor is in, 0 for the entrance or travel. */
    get station() { return at; },
    observe(progress: number, nowMs: number): ShiftKind | null {
      const here = stationAt(progress);
      if (here !== at) { at = here; since = nowMs; fired = false; }
      if (reduced || here === 0 || fired || nowMs - since < WAIT_MS || nowMs < quietUntil) return null;
      fired = true;
      const kind = visited.has(here) ? "short" : "full";
      if (!book("whole", kind, nowMs)) { readyAt = nowMs; return null; }
      visited.add(here);
      if (kind === "full") { resolving.add(here); readyAt = nowMs + fullTearMs; }
      else { resolving.delete(here); readyAt = nowMs; } // a return: the text shows now, and the flick plays over it
      return kind;
    },
    /** The tear actually began (the view is drawn a moment after the shift fires, more on a slow
     *  device): its changes count from here, and the text follows `kind`'s length after that, never
     *  before the tear is over. */
    tearStarted(kind: ShiftKind, nowMs: number) {
      rebook("whole", kind, nowMs);
      if (kind === "full") readyAt = Math.max(readyAt, nowMs + fullTearMs);
    },
    /** A Work page turn asks for the short flick on that TV. It plays unless reduced motion is on or
     *  it would put more than the limit of sudden changes in a second (quick clicks): the page turns
     *  either way. */
    turn(nowMs: number): boolean {
      return !reduced && book("page", "short", nowMs);
    },
    /** The flick on the Work TV really began at `nowMs`: its changes count from here. */
    turnStarted(nowMs: number) { rebook("page", "short", nowMs); },
    /** The page put the visitor in this hold itself (it restored the scroll position after a
     *  reload): that is not an arrival, so no shift, and the text shows. */
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
