import { STATION_COUNT } from "../hold";
import type { Where } from "../where";

/** A flight's length in ms. A design constant (Adham, 2026-11-08): checked by unit tests only. */
export const FLIGHT_MS = 900;
/** A reduced-motion move's whole fade in ms (out, cut, in). A design constant like FLIGHT_MS. */
export const FADE_MS = 300;

/** Smoothstep: 0 at 0, 1 at 1, slow at both ends. */
export const ease = (t: number) => {
  const u = Math.min(Math.max(t, 0), 1);
  return u * u * (3 - 2 * u);
};

export type VisitEvent =
  /** A move has started (a landing with no flight is a move too). `from` is where the camera was. */
  | { type: "move"; from: Where; to: number }
  /** The visitor is now at `stop`. */
  | { type: "land"; stop: number };

/** Where a flight began, however many re-targets led to it: a stop, or the camera's real place `f` of the way
 *  along the flight from `from` to stop `to`. A flight's path starts at the pose this describes, found by
 *  following `from` down to a stop (#181's flightPose). */
export type Launch =
  | { kind: "at"; stop: number }
  | { kind: "flying"; from: Launch; to: number; f: number };

export type Visit = {
  go(stop: number): void;
  /** To the overview (stop 0). */
  back(): void;
  /** The overview goes to Work, a station to the next, the last station to the overview. During a move,
   *  the stop after its destination. */
  next(): void;
  /** Puts the visitor at `stop` with no flight and no fade. */
  land(stop: number): void;
  /** Where the visitor is at `nowMs`. Also settles a finished move, telling subscribers it landed. */
  where(nowMs: number): Where;
  /** The cover's opacity, 0..1, under reduced motion: 0 when not fading, 1 at the midpoint (the cut). */
  fade(nowMs: number): number;
  /** Whether a move (a flight, or under reduced motion a fade) is running at `nowMs`. Under reduced motion `where()`
   *  reads as at a stop through the whole fade, so this is how to tell a fade from a rest. */
  moving(nowMs: number): boolean;
  /** Where the camera was when the current flight began: a stop, or a chain of the flights it replaced, each
   *  with the share the camera had flown. Null when not flying. #174 flies from `launch(now)` to `target()`. */
  launch(nowMs: number): Launch | null;
  /** The stop the visitor is at or flying to. */
  target(): number;
  subscribe(listener: (e: VisitEvent) => void): () => void;
};

type Move = { start: number; launch: Launch; to: number; origin: number };

const clampStop = (s: number) => Math.min(Math.max(Math.round(s), 0), STATION_COUNT);

/** `now` stamps a move's start; where(nowMs) and fade(nowMs) take the time to read at. */
export function createVisit({ reduced, now = () => performance.now() }: { reduced: boolean; now?: () => number }): Visit {
  let rest = 0; // the stop the visitor is at when no move is running
  let move: Move | null = null;
  // Reduced motion only: the latest move pressed during a fade. It starts when that fade ends (Adham, #176).
  let waiting: number | null = null;
  const listeners = new Set<(e: VisitEvent) => void>();
  const emit = (e: VisitEvent) => [...listeners].forEach((l) => l(e));

  const dur = () => (reduced ? FADE_MS : FLIGHT_MS);
  const target = () => (waiting !== null ? waiting : move ? move.to : rest);

  /** The camera's Where at `t`, without settling. */
  function read(t: number): Where {
    if (!move) return { kind: "at", stop: rest };
    const u = (t - move.start) / dur();
    if (reduced) return { kind: "at", stop: u < 0.5 ? move.origin : move.to };
    const f = ease(u);
    // `from` is the stop nearest the launch; `launch()` has the real start.
    return { kind: "flying", from: move.origin, to: move.to, f };
  }

  function settle(t: number) {
    if (move && t - move.start >= dur()) {
      rest = move.to;
      move = null;
      emit({ type: "land", stop: rest });
      const next = waiting;
      waiting = null;
      // A waiting press for the stop just reached is dropped: nothing moves. (history.ts fixes the URL if it differs.)
      if (next !== null && next !== rest) go(next, t);
    }
  }

  function go(stop: number, at?: number) {
    const to = clampStop(stop);
    const t = at ?? now();
    settle(t);
    if (reduced && move) {
      // A fade is running: the press waits for it, and the latest press replaces any earlier one. Nothing is
      // emitted until a move really starts; history.ts keeps the URL right, wherever the waiting presses end.
      waiting = to;
      return;
    }
    if (to === target()) return;
    const from = read(t);
    const origin = from.kind === "at" ? from.stop : from.f < 0.5 ? from.from : from.to;
    const launch: Launch = move
      ? { kind: "flying", from: move.launch, to: move.to, f: ease((t - move.start) / dur()) }
      : { kind: "at", stop: rest };
    move = { start: t, launch, to, origin };
    emit({ type: "move", from, to });
  }

  return {
    go,
    back: () => go(0),
    next() {
      settle(now());
      go((target() + 1) % (STATION_COUNT + 1));
    },
    land(stop) {
      const to = clampStop(stop);
      const from = read(now());
      settle(now());
      move = null;
      waiting = null;
      rest = to;
      emit({ type: "move", from, to });
      emit({ type: "land", stop: to });
    },
    where(nowMs) {
      settle(nowMs);
      return read(nowMs);
    },
    fade(nowMs) {
      settle(nowMs);
      if (!reduced || !move) return 0;
      const u = Math.min(Math.max((nowMs - move.start) / FADE_MS, 0), 1);
      return 1 - Math.abs(2 * u - 1);
    },
    moving(nowMs) {
      settle(nowMs);
      return move !== null;
    },
    launch(nowMs) {
      settle(nowMs);
      return move && !reduced ? move.launch : null;
    },
    target,
    subscribe(l) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
}
