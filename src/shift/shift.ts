import { holdSpan, PANEL_SHOWN, panelStrength, STATION_COUNT } from "../hold";
import { POWER_ON_SECONDS } from "../nixie";
import { snapBackMs, TEAR_POSES } from "../tear";
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

/** The text follows a moment after the tear's own length ends, so the two never overlap, even when a
 *  frame comes late. This sets only when the text shows; the flash count uses the visible snap back
 *  (snapBackMs in tear.ts), which is earlier. */
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
 *  bands, and the snap back, when it is visible (snapBackMs). The tear and this list both come from TEAR_POSES and tear.ts. */
export const changeOffsets = (kind: ShiftKind): number[] => {
  const len = SHIFT_SECONDS[kind] * 1000, poses = TEAR_POSES[kind];
  return [0, ...Array.from({ length: poses - 1 }, (_, k) => ((k + 1) / poses) * len), snapBackMs(kind)];
};

/** How long after a full tear starts its text may show: the tear, then a moment for the snap back. */
const fullTearMs = SHIFT_SECONDS.full * 1000 + SNAP_BACK_MS;

/** A booked change. Objects, so a plan is found again by identity, never by its time. */
type Change = { at: number };

/** How a station's text stands: `held` back (arrival to the end of a first visit's tear, or not showing
 *  at all), `resolving` out of the tear (a first visit's text, once it shows), or `showing` (a return's
 *  text, or a first visit's once its panel has gone). A first visit's text stays `resolving` until its
 *  panel goes (the `resolving` set below); the text module's per-panel record is what makes the resolve
 *  play only once. */
export type TextState = "held" | "resolving" | "showing";

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
};

/** One shift object per app. The app creates it; the tour `mount`s it and calls `observe` on every
 *  scroll. The desk meter says when its power-on really began (`powerOnBegan`): no shift starts until
 *  `POWER_ON_SECONDS` after that. The module sets its own timers, so a visitor who stops still gets the
 *  shift. Views read `playing` and hear changes through `subscribe`; the room gives `setWake` the one
 *  function that asks it for a frame. Visits are kept in memory only. */
export function createShift(reduced = false) {
  const visited = new Set<number>();
  const revealed = new Set<number>(); // stations whose text is out, until the visitor has left
  const resolving = new Set<number>(); // stations whose text resolves out of a full tear
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
  let poweredOnAt: number | null = null; // when the desk meter says its power-on really began
  let mountedAt = 0, restoring = false, progress = 0, playId = 0;
  let active: number | null = null; // the hold whose shift is playing
  let waitTimer: ReturnType<typeof setTimeout> | undefined, wakeTimer: ReturnType<typeof setTimeout> | undefined;
  let mounted = false, wake: (() => void) | null = null;
  let current: Play | null = null; // the shift the bar and the desk meter are playing
  const listeners = new Set<() => void>();
  const setCurrent = (play: Play | null) => { current = play; listeners.forEach((l) => l()); };
  /** How long to wait before looking again: the wait, or the rest of the power-on if that is longer. */
  const waitFor = (nowMs: number) => Math.max(WAIT_MS, poweredOnAt === null ? 0 : quietEnd() - nowMs) + TIMER_SLACK_MS;
  /** The power-on hold: no shift while the desk meter is still powering on, or before it has begun. */
  const quietEnd = () => (poweredOnAt === null ? Infinity : poweredOnAt + POWER_ON_SECONDS * 1000);

  /** Decide what the visitor's stay so far calls for: end a shift they left, fire one they waited for. */
  const check = (nowMs: number) => {
    const here = holdAt(progress);
    if (here !== at) {
      // The text that was showing stays through the fade out, until the visitor has left the panel.
      if (at !== 0 && fired && nowMs >= readyAt) revealed.add(at);
      at = here; since = nowMs; fired = false;
    }
    // Leaving mid-shift ends it for the views: the bar and the desk meter go straight to the reading
    // for where the visitor is. The tear finishes its own length.
    if (active !== null && at !== active) { active = null; setCurrent(null); }
    if (!(reduced || here === 0 || fired || nowMs - since < WAIT_MS || nowMs < quietEnd())) {
      fired = true;
      const kind: ShiftKind = visited.has(here) ? "short" : "full";
      if (!book("whole", kind, nowMs)) readyAt = nowMs;
      else {
        visited.add(here);
        if (kind === "full") { resolving.add(here); readyAt = nowMs + fullTearMs; }
        else { resolving.delete(here); readyAt = nowMs; } // a return: the text shows now, and the flick plays over it
        active = here;
        setCurrent({ kind, id: ++playId });
      }
    }
    wake?.(); // the text may now show
  };

  const restore = (p: number) => {
    at = holdAt(p);
    fired = at !== 0;
    if (at) revealed.add(at);
  };

  return {
    /** The tour is up. Returns the unmount. */
    mount(m: Mount): () => void {
      mounted = true;
      mountedAt = performance.now();
      restoring = m.navigationType === "reload" || m.navigationType === "back_forward";
      progress = m.startProgress;
      at = holdAt(progress); fired = at !== 0; since = mountedAt; active = null; current = null;
      if (at) revealed.add(at);
      return () => { clearTimeout(waitTimer); clearTimeout(wakeTimer); mounted = false; };
    },
    /** The desk meter's power-on really began at `nowMs` (its first frame, later than the tour's start on
     *  a slow device). No shift starts until it has run its length from here. */
    powerOnBegan(nowMs: number) {
      poweredOnAt = nowMs;
      if (!mounted) return;
      clearTimeout(waitTimer);
      waitTimer = setTimeout(() => check(performance.now()), waitFor(performance.now()));
    },
    /** The shift the bar and the desk meter are playing: null when none, or once the visitor has left its
     *  hold. A new play is a new object (new `id`). The tear's own length is its own business. */
    get playing(): Play | null { return current; },
    /** Hear that `playing` changed. Returns the unsubscribe. */
    subscribe(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; },
    /** The room's one function for asking for a frame. Returns the remove. */
    setWake(fn: () => void): () => void { wake = fn; return () => { if (wake === fn) wake = null; }; },
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
      for (let i = 1; i <= STATION_COUNT; i++) { // a panel that has gone is forgotten (after check, which may keep it through the fade)
        if (panelStrength(p, i) < PANEL_SHOWN) { revealed.delete(i); resolving.delete(i); }
      }
      clearTimeout(waitTimer);
      waitTimer = setTimeout(() => check(performance.now()), waitFor(nowMs));
    },
    /** The tear actually began (the view is drawn a moment after the shift fires, more on a slow
     *  device): its changes count from here, the text follows `kind`'s length after that, never
     *  before the tear is over, and the room is asked for a frame then to show it. */
    tearStarted(kind: ShiftKind, nowMs: number) {
      rebook("whole", kind, nowMs);
      clearTimeout(wakeTimer);
      if (kind === "short") return; // a return's text is already showing
      readyAt = Math.max(readyAt, nowMs + fullTearMs);
      wakeTimer = setTimeout(() => wake?.(), SHIFT_SECONDS[kind] * 1000 + SNAP_BACK_MS + TIMER_SLACK_MS);
    },
    /** A Work page turn asks for the short flick on that TV. It plays unless reduced motion is on or
     *  it would put more than the limit of sudden changes in a second (quick clicks): the page turns
     *  either way. */
    turn(): boolean {
      return !reduced && book("page", "short", performance.now());
    },
    /** The flick on the Work TV really began at `nowMs`: its changes count from here. */
    turnStarted(nowMs: number) { rebook("page", "short", nowMs); },
    /** How station `i`'s text stands at this progress and time. A read: it changes nothing. On a first visit
     *  it is held back until the full tear ends, so it resolves out of it; on a return it shows as soon as
     *  the wait ends. A station whose panel isn't showing is held. */
    textState(station: number, p: number, nowMs: number): TextState {
      if (reduced || !mounted) return "showing"; // until the tour is up every text may show
      if (panelStrength(p, station) < PANEL_SHOWN) return "held";
      const shown = revealed.has(station) || (at === station && fired && nowMs >= readyAt);
      if (!shown) return "held";
      return resolving.has(station) ? "resolving" : "showing";
    },
  };
}

export type Shift = ReturnType<typeof createShift>;
