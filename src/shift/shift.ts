import { holdSpan, PANEL_SHOWN, panelStrength, STATION_COUNT } from "../hold";
import { POWER_ON_SECONDS } from "../nixie";
import { TEAR_POSES } from "../tear";
import { SHIFT_SECONDS, type ShiftKind } from "./lengths";

// The shift: a moment of arrival at a station. This module runs it from start to finish (the wait, the
// restore window, the leaving rule, the page-turn limit, the wake-up after a tear); the views draw it. Visits live in the tracker (memory), so a reload starts over.

/** The wait: how long the visitor must stay inside a hold before the shift fires, so scrolling
 *  quickly through a station doesn't trigger it. */
export const WAIT_MS = 250;

/** A shift that is playing, as the views are told of it. `id` changes for each new one. */
export type Play = { kind: ShiftKind; id: number };

const holdAt = (progress: number) => {
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

/** Timers are set a little past the moment they wait for (and a late timer is no problem), so that
 *  when one fires the moment has really come: the wait is over, the tear has snapped back. */
const TIMER_SLACK_MS = 30;

/** After a reload the browser puts the scroll position back once the page is tall enough, which is
 *  just after the tour mounts. The first move off the top within this long counts as that restore,
 *  not an arrival. Long, because a slow device restores late; the cost is that a visitor who jumps
 *  into a hold within this long of a reload gets no shift there, which is harmless. */
export const RESTORE_WINDOW_MS = 5000;

/** The browser's navigation type, as `PerformanceNavigationTiming.type` says it. */
export type NavigationKind = "navigate" | "reload" | "back_forward" | "prerender";

/** What the tour gives the shift when it mounts. */
export type Mount = {
  /** Where the page opens: a reload inside a hold is not an arrival, so it gets no shift and its text shows. */
  startProgress: number;
  /** Reload and back/forward put the scroll position back after mounting; that is not an arrival. */
  navigationType: NavigationKind;
  /** A shift starts playing. */
  onStart: (play: Play) => void;
  /** The shift that was playing ended early, because the visitor left its hold. */
  onEnd: () => void;
  /** Ask the room for a frame: the text's gate may have opened. */
  wake: () => void;
};

/** One shift object per app. The app creates it; the tour `mount`s it (the meter's power-on starts
 *  then, so no shift starts for `POWER_ON_SECONDS` after) and calls `observe` on every scroll. The
 *  module sets its own timers, so a visitor who stops still gets the shift, and tells the tour through
 *  the three callbacks of `mount` (until #118 replaces them). Visits are kept in memory only. */
export function createShift(reduced = false) {
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

  let at = 0, since = 0, fired = false, readyAt = 0;
  let quietUntil = 0, mountedAt = 0, restoring = false, progress = 0, playId = 0;
  let active: number | null = null; // the hold whose shift is playing
  let waitTimer: ReturnType<typeof setTimeout> | undefined, wakeTimer: ReturnType<typeof setTimeout> | undefined;
  let link: Pick<Mount, "onStart" | "onEnd" | "wake"> | null = null;

  /** Decide what the visitor's stay so far calls for: end a shift they left, fire one they waited for. */
  const check = (nowMs: number) => {
    const here = holdAt(progress);
    if (here !== at) { at = here; since = nowMs; fired = false; }
    // Leaving mid-shift ends it for the views: the bar and the desk meter go straight to the reading
    // for where the visitor is. The tear finishes its own length.
    if (active !== null && at !== active) { active = null; link?.onEnd(); }
    if (!(reduced || here === 0 || fired || nowMs - since < WAIT_MS || nowMs < quietUntil)) {
      fired = true;
      const kind: ShiftKind = visited.has(here) ? "short" : "full";
      if (!book("whole", kind, nowMs)) readyAt = nowMs;
      else {
        visited.add(here);
        if (kind === "full") { resolving.add(here); readyAt = nowMs + fullTearMs; }
        else { resolving.delete(here); readyAt = nowMs; } // a return: the text shows now, and the flick plays over it
        active = here;
        link?.onStart({ kind, id: ++playId });
      }
    }
    link?.wake(); // the text's gate may have opened
  };

  const restore = (p: number) => {
    at = holdAt(p);
    fired = at !== 0;
    if (at) revealed.add(at);
  };

  return {
    /** The tour is up, and the meter starts its power-on now. Returns the unmount. */
    mount(m: Mount): () => void {
      link = m;
      mountedAt = performance.now();
      quietUntil = mountedAt + POWER_ON_SECONDS * 1000;
      restoring = m.navigationType === "reload" || m.navigationType === "back_forward";
      progress = m.startProgress;
      at = holdAt(progress); fired = at !== 0; since = mountedAt; active = null;
      if (at) revealed.add(at);
      return () => { clearTimeout(waitTimer); clearTimeout(wakeTimer); link = null; };
    },
    /** The hold the visitor is in, 0 for the entrance or travel. */
    get hold() { return at; },
    /** Where the visitor is now. Call on every scroll and resize; the module re-checks by itself once
     *  the wait is over (the visitor may have stopped). */
    observe(p: number) {
      const nowMs = performance.now();
      progress = p;
      if (restoring && p > 0) { // the first move off the top, soon after mounting
        restoring = false;
        if (nowMs - mountedAt < RESTORE_WINDOW_MS) restore(p);
      }
      check(nowMs);
      clearTimeout(waitTimer);
      waitTimer = setTimeout(() => check(performance.now()), Math.max(WAIT_MS, quietUntil - nowMs) + TIMER_SLACK_MS);
    },
    /** The tear actually began (the view is drawn a moment after the shift fires, more on a slow
     *  device): its changes count from here, the text follows `kind`'s length after that, never
     *  before the tear is over, and the room is asked for a frame then to show it. */
    tearStarted(kind: ShiftKind, nowMs: number) {
      rebook("whole", kind, nowMs);
      clearTimeout(wakeTimer);
      if (kind === "short") return; // a return's text is already showing
      readyAt = Math.max(readyAt, nowMs + fullTearMs);
      wakeTimer = setTimeout(() => link?.wake(), SHIFT_SECONDS[kind] * 1000 + SNAP_BACK_MS + TIMER_SLACK_MS);
    },
    /** A Work page turn asks for the short flick on that TV. It plays unless reduced motion is on or
     *  it would put more than the limit of sudden changes in a second (quick clicks): the page turns
     *  either way. */
    turn(): boolean {
      return !reduced && book("page", "short", performance.now());
    },
    /** The flick on the Work TV really began at `nowMs`: its changes count from here. */
    turnStarted(nowMs: number) { rebook("page", "short", nowMs); },
    resolves: (station: number) => resolving.has(station),
    /** May station `i`'s text show at this progress and time. On a first visit it is held back until
     *  the full tear ends, so it resolves out of it; on a return it shows as soon as the wait ends. */
    ready(station: number, p: number, nowMs: number): boolean {
      if (reduced) return true;
      if (panelStrength(p, station) < PANEL_SHOWN) { revealed.delete(station); resolving.delete(station); return false; }
      if (revealed.has(station)) return true;
      if (at === station && fired && nowMs >= readyAt) { revealed.add(station); return true; }
      return false;
    },
  };
}

export type Shift = ReturnType<typeof createShift>;

/** The link between the tour (which mounts the shift) and the room (which shows the text), until
 *  #118. Until the tour is up every station's text may show. */
export const textGate = (): TextGate => ({ ready: () => true, resolves: () => false });
