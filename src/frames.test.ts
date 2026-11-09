import { describe, expect, it } from "vitest";
import { runFrames } from "./frames";
import { tearAt } from "./tear";
import { shiftDigits } from "./nixie";

/** A fake clock and frame scheduler: `frame(ms)` moves the clock on and runs the requested frame. */
function fake(startMs = 0) {
  let ms = startMs, next = 1;
  const pending = new Map<number, () => void>();
  const cancelled: number[] = [];
  return {
    now: () => ms,
    request: (cb: () => void) => { pending.set(next, cb); return next++; },
    cancel: (id: number) => { cancelled.push(id); pending.delete(id); },
    pending, cancelled,
    set: (v: number) => { ms = v; },
    frame(at: number) { ms = at; const cbs = [...pending.values()]; pending.clear(); cbs.forEach((c) => c()); },
  };
}

/** Runs a loop whose step is `done(seconds)` at 60 fps (or `gapMs` apart); returns the ms it finished at. */
function endsAt(done: (s: number) => boolean, gapMs = 1000 / 60, slowAt?: number) {
  const f = fake();
  let end: number | null = null, last = -1;
  const steps: number[] = [];
  runFrames((s) => { steps.push(s); const d = done(s); if (d) end = f.now(); return d; }, f);
  let ms = 0;
  while (end === null && ms < 5000) { ms += slowAt !== undefined && ms >= slowAt && last < 0 ? (last = ms, 300) : gapMs; f.frame(ms); }
  return { end: end as number | null, steps };
}

describe("runFrames", () => {
  it("runs the first step at once with 0 s, before any frame is requested, and onStart gets that clock reading", () => {
    const f = fake(1234);
    const steps: number[] = [], starts: number[] = [];
    runFrames((s) => { steps.push(s); expect(f.pending.size).toBe(0); return false; }, { ...f, onStart: (ms) => starts.push(ms) });
    expect(steps).toEqual([0]);
    expect(starts).toEqual([1234]);
    expect(f.pending.size).toBe(1);
  });

  it("counts from when the loop starts: clock at 5000 ms, the step at 5800 ms gets 0.8", () => {
    const f = fake(5000);
    const steps: number[] = [];
    runFrames((s) => { steps.push(s); return false; }, f);
    f.frame(5800);
    expect(steps).toEqual([0, 0.8]);
  });

  it("stops requesting once the step is done", () => {
    const f = fake();
    runFrames((s) => s >= 0.1, f);
    f.frame(50);
    expect(f.pending.size).toBe(1);
    f.frame(100);
    expect(f.pending.size).toBe(0);
  });

  it("stop cancels the requested frame and no step runs after it", () => {
    const f = fake();
    let runs = 0;
    const stop = runFrames(() => { runs++; return false; }, f);
    const [id] = [...f.pending.keys()];
    stop();
    expect(f.cancelled).toEqual([id]);
    f.frame(16);
    expect(runs).toBe(1);
  });

  it.each([["full", 0.8], ["short", 0.25]] as const)("the %s tear is on at the last frame before %s s and done at the first at or past it", (kind, len) => {
    const { end, steps } = endsAt((s) => tearAt(s, kind).done);
    const lenMs = len * 1000;
    expect(end).toBeGreaterThanOrEqual(lenMs);
    expect(end! - lenMs).toBeLessThan(1000 / 60); // the first frame at or past it, not one later
    expect(steps.at(-2)! * 1000).toBeLessThan(lenMs); // the frame before was still playing
  });

  it("a slow frame (a 300 ms gap) makes the end come later, never sooner", () => {
    const normal = endsAt((s) => tearAt(s, "full").done);
    const slow = endsAt((s) => tearAt(s, "full").done, 1000 / 60, 200);
    expect(slow.steps.length).toBeLessThan(normal.steps.length); // fewer frames, same length of time
    expect(slow.end!).toBeGreaterThanOrEqual(800);
    expect(slow.steps.some((s) => tearAt(s, "full").done && s < 0.8)).toBe(false);
  });

  it("the scramble ends on the digits read at its last frame, not those it started with", () => {
    const f = fake();
    let digits = "1.000000", shown = "";
    runFrames((s) => { const r = shiftDigits(s, digits, "full"); shown = r.digits; return r.done; }, f);
    digits = "2.500000";
    f.frame(100);
    f.frame(900);
    expect(shown).toBe("2.500000");
    expect(f.pending.size).toBe(0);
  });
});
