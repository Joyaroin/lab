import type { Framing } from "./framing";
import { formatReading } from "./gap";
import type { ShiftKind } from "./nixie";
import { readingAt } from "./tour";
import type { Where } from "./where";

/** A key on the meter bar. */
export type BarKey = "prev" | "room" | "next" | "start";

/** What the bar shows: its keys in order, and the stop whose line and digits it shows. */
export type Bar = { keys: BarKey[]; stop: number };

/** What the bar shows at `where` in a framing. At the overview: START alone. At a station: PREV, ROOM, NEXT, and
 *  on a portrait window PREV and NEXT (the phone's menu has the way back to the room). In a flight everything is that
 *  of the stop being flown to. */
export function barFor(where: Where, framing: Framing["name"]): Bar {
  const stop = where.kind === "at" ? where.stop : where.to;
  if (stop === 0) return { keys: ["start"], stop };
  return { keys: framing === "portrait" ? ["prev", "next"] : ["prev", "room", "next"], stop };
}

// ---- the hover preview (#228)
// At the overview, resting the pointer on a lit TV or a station link makes the meter show that station before the
// click. The line changes at once; the digits after the pointer has rested PREVIEW_REST_MS, with the short scramble.
// Pointer only, and only at the overview: the tour feeds `createHover` from pointer events, never from focus.

/** How long the pointer rests on a station before the digits follow the line. */
export const PREVIEW_REST_MS = 150;

/** The pointer is resting on `stop`'s TV or link, since `since` (ms on the page's clock). */
export type Preview = { stop: number; since: number };

/** The station a preview shows, when it shows: only at the overview. At a station and in a flight nothing previews. */
export function previewStop(where: Where, preview: Preview | null): number | null {
  return preview && where.kind === "at" && where.stop === 0 ? preview.stop : null;
}

/** Where the pointer is: the one station whose TV or link it is on, if any. The TV (the room's canvas) and the HUD's
 *  links each report their own enter and leave, in no fixed order. The last to report a station has the pointer, and a
 *  source leaving clears only what it reported. Subscribers hear of each change of `preview()`, which is stable between changes. */
export function createHover(clock: () => number) {
  type Source = "tv" | "link";
  let current: (Preview & { source: Source }) | null = null;
  let snapshot: Preview | null = null;
  const listeners = new Set<() => void>();
  const set = (next: (Preview & { source: Source }) | null) => {
    current = next;
    snapshot = next && { stop: next.stop, since: next.since };
    listeners.forEach((l) => l());
  };
  return {
    /** `source` has the pointer on `stop`'s TV or link, or (null) no longer has it on any. */
    point(source: Source, stop: number | null) {
      if (stop === null) { if (current?.source === source) set(null); return; }
      if (current?.stop === stop && current.source === source) return; // still resting
      if (current?.stop === stop) { current = { ...current, source }; return; } // the same station, the other source: the rest goes on
      set({ stop, since: clock(), source });
    },
    /** The rest starts again from now: the pointer stayed put through a visit and the overview is back. */
    rest() { if (current) set({ ...current, since: clock() }); },
    preview: (): Preview | null => snapshot,
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  };
}

/** A shift's scramble as the meters play it: its kind, and an id that changes for each new play. */
export type Scramble = { kind: ShiftKind; id: number };

/** What a meter shows: the reading, its digits, and the scramble to play onto them (null for none). */
export type MeterDigits = { reading: number; digits: string; scramble: Scramble | null };

/** The one source of the meters' digits and scramble, for the meter bar (`who` "bar") and the desk meter ("desk").
 *  Outside a preview each shows what it always did: the bar the stop it is for (the one flown to, in a flight), the desk
 *  meter the reading at `where` (rolling between two stops in a flight), both playing the shift that is `playing`.
 *  Through a preview, both show the same: the gap's digits until the pointer has rested PREVIEW_REST_MS, then the
 *  station's, with the short scramble (its id is the preview's start, below zero so it can't be a shift's id).
 *  Under reduced motion nothing scrambles. `now` is ms on the page's clock. */
export function meterDigits({ who, where, preview, deploys, now, playing, reduced }: {
  who: "bar" | "desk"; where: Where; preview: Preview | null; deploys: number; now: number; playing: Scramble | null; reduced: boolean;
}): MeterDigits {
  const previewing = previewStop(where, preview);
  const rested = preview !== null && previewing !== null && now - preview.since >= PREVIEW_REST_MS;
  const shown: Where = rested ? { kind: "at", stop: preview.stop } : who === "bar" ? { kind: "at", stop: barFor(where, "square").stop } : where;
  const reading = Math.round(readingAt(shown, deploys));
  const scramble = reduced ? null : rested ? { kind: "short" as const, id: -1 - preview.since } : previewing !== null ? null : playing;
  return { reading, digits: formatReading(reading), scramble };
}
