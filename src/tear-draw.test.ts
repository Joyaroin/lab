import { describe, it, expect } from "vitest";
import { playTear, type TearTargets } from "./tear-draw";
import { snapBackMs } from "./tear";
import { SHIFT_SECONDS } from "./nixie";

// A frame loop on a fake clock: `frame(ms)` draws one frame at that time, like requestAnimationFrame would.
function setup(kind: "full" | "short" = "short", reduced = () => false) {
  const attrs = { turb: {} as Record<string, string>, disp: {} as Record<string, string>, red: {} as Record<string, string>, cyan: {} as Record<string, string> };
  const writes: number[] = []; // every displacement scale written, in order
  const node = (a: Record<string, string>, log = false) => ({
    setAttribute: (n: string, v: string) => { a[n] = v; if (log && n === "scale") writes.push(parseFloat(v)); },
  });
  const el = { style: { filter: "" } };
  const targets: TearTargets = {
    el,
    turb: { current: node(attrs.turb) }, disp: { current: node(attrs.disp, true) },
    red: { current: node(attrs.red) }, cyan: { current: node(attrs.cyan) },
  };
  let t = 0, queued: (() => void) | null = null;
  const stop = playTear("shift-tear", kind, targets, () => 1000, reduced, {
    now: () => t, request: (cb) => { queued = cb; return 1; }, cancel: () => { queued = null; },
  });
  const frame = (ms: number) => { t = ms; const cb = queued; queued = null; cb?.(); return queued !== null; };
  return { attrs, writes, el, frame, stop };
}

describe("the tear's frame loop", () => {
  it("draws the slip while the tear runs, with the filter on", () => {
    const s = setup();
    s.frame(100);
    expect(parseFloat(s.attrs.disp.scale)).toBeGreaterThan(0);
    expect(s.el.style.filter).toBe("url(#shift-tear)");
  });

  it("a frame that lands in done straight from slip > 0 leaves scale 0 and the filter cleared (the snap back the flash-limit specs watch for)", () => {
    const s = setup("short");
    // ~50 ms frames, as on a loaded machine: none lands in the 37 ms where slip is already 0 (212.5 to 250 ms).
    const times = [49, 98, 153, 209, 262];
    for (const ms of times.slice(0, -1)) s.frame(ms);
    expect(snapBackMs("short")).toBeGreaterThan(times[3]);
    expect(parseFloat(s.attrs.disp.scale)).toBeGreaterThan(0); // still slipping at the last frame before done
    const more = s.frame(times[4]);
    expect(more).toBe(false); // the loop ended on that frame
    expect(parseFloat(s.attrs.disp.scale)).toBe(0);
    expect(parseFloat(s.attrs.red.dx)).toBe(0);
    expect(parseFloat(s.attrs.cyan.dx)).toBe(0);
    expect(s.el.style.filter).toBe("");
    expect(s.writes.at(-1)).toBe(0);
  });

  it("reduced motion ending a play leaves scale 0 too", () => {
    let reduced = false;
    const s = setup("full", () => reduced);
    s.frame(50);
    expect(parseFloat(s.attrs.disp.scale)).toBeGreaterThan(0);
    reduced = true;
    s.frame(100);
    expect(parseFloat(s.attrs.disp.scale)).toBe(0);
    expect(s.el.style.filter).toBe("");
  });

  it("stopping early (the view goes away) takes the filter off", () => {
    const s = setup("full");
    s.frame(50);
    s.stop();
    expect(s.el.style.filter).toBe("");
    expect(SHIFT_SECONDS.full).toBe(0.4);
  });
});
