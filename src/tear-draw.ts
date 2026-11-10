import { runFrames, type FrameOptions } from "./frames";
import { tearAt, TEAR_SEEDS } from "./tear";
import type { ShiftKind } from "./nixie";

type Settable = { setAttribute(name: string, value: string): void };
type Ref = { current: Settable | null };
/** What a tear draws into: the element it filters, and the filter's four primitives. */
export type TearTargets = { el: { style: { filter: string } }; turb: Ref; disp: Ref; red: Ref; cyan: Ref };

/** Plays one tear's frames into `targets`, through the filter named `filter`, until its length ends (or `reduced()`
 *  turns true). The last step writes displacement scale 0 and edge 0 before it takes the filter off: the scale
 *  is the record of the snap back (tests/lib/snap.ts counts it going from above 0 to 0), and a frame can step from
 *  slip > 0 straight to done without ever drawing a 0 of its own. Returns the stop function from `runFrames`. */
export function playTear(filter: string, kind: ShiftKind, targets: TearTargets, width: () => number, reduced: () => boolean, frames: FrameOptions = {}): () => void {
  const { el, turb, disp, red, cyan } = targets;
  const stop = runFrames((seconds) => {
    const t = tearAt(seconds, kind);
    if (t.done || reduced()) {
      disp.current?.setAttribute("scale", "0");
      red.current?.setAttribute("dx", "0");
      cyan.current?.setAttribute("dx", "0");
      el.style.filter = "";
      return true;
    }
    const w = width();
    turb.current?.setAttribute("seed", String(TEAR_SEEDS[kind][t.pose]));
    disp.current?.setAttribute("scale", String(t.slip * w * 2)); // the map spans ±half the scale
    red.current?.setAttribute("dx", String(t.edge * w));
    cyan.current?.setAttribute("dx", String(-t.edge * w));
    el.style.filter = `url(#${filter})`;
    return false;
  }, frames);
  return () => { stop(); el.style.filter = ""; };
}
