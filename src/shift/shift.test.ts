import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { busiestWindow, changeOffsets, createShift, MAX_CHANGES_PER_SECOND, RESTORE_WINDOW_MS, SNAP_BACK_MS, WAIT_MS, type NavigationKind, type Play } from "./index";
import { SHIFT_SECONDS, POWER_ON_SECONDS } from "../nixie";
import { holdSpan, progressFor, STATION_COUNT } from "../hold";

// Fake timers also fake performance.now, so the module's own clock and timers are what's under test.
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const mid = progressFor;
const FULL_END_MS = SHIFT_SECONDS.full * 1000 + SNAP_BACK_MS;
const POWER_ON_MS = POWER_ON_SECONDS * 1000;

/** A shift mounted with spies. `quiet` runs out the power-on first, as most tests want. */
const setup = ({ reduced = false, startProgress = 0, navigationType = "navigate" as NavigationKind, quiet = true } = {}) => {
  const shift = createShift(reduced);
  const started: Play[] = [];
  const ended = vi.fn(), wake = vi.fn();
  const unmount = shift.mount({ startProgress, navigationType, onStart: (p) => started.push(p), onEnd: ended, wake });
  if (quiet) vi.advanceTimersByTime(POWER_ON_MS + 1);
  return { shift, started, ended, wake, unmount };
};
/** The visitor reaches progress `p` and stays: the module's own timer must fire the shift. */
const arrive = (s: ReturnType<typeof setup>, p: number, stay = 1500) => { s.shift.observe(p); vi.advanceTimersByTime(stay); };

describe("the wait", () => {
  it("fires in full on its own once the visitor has stayed, with no further scroll", () => {
    const s = setup();
    s.shift.observe(mid(1));
    vi.advanceTimersByTime(WAIT_MS - 1);
    expect(s.started).toEqual([]);
    vi.advanceTimersByTime(60);
    expect(s.started).toEqual([{ kind: "full", id: 1 }]);
    vi.advanceTimersByTime(5000);
    expect(s.started).toHaveLength(1); // once per arrival
  });
  it("does not fire when scrolling quickly through a station, even after the timers run out", () => {
    const s = setup();
    for (let i = 1; i <= STATION_COUNT; i++) {
      const [a, b] = holdSpan(i);
      s.shift.observe(a + 1e-6); vi.advanceTimersByTime(WAIT_MS / 4);
      s.shift.observe(b - 1e-6); vi.advanceTimersByTime(WAIT_MS / 4);
      s.shift.observe(b + 0.02); vi.advanceTimersByTime(WAIT_MS / 4);
    }
    vi.advanceTimersByTime(5000);
    expect(s.started).toEqual([]);
    arrive(s, mid(1)); // and passing through didn't count as a visit
    expect(s.started.map((p) => p.kind)).toEqual(["full"]);
  });
  it("is short on a return, and full for each first visit", () => {
    const s = setup();
    arrive(s, mid(1)); arrive(s, mid(2), 3000); arrive(s, 0, 100); arrive(s, mid(1), 3000);
    expect(s.started.map((p) => p.kind)).toEqual(["full", "full", "short"]);
    expect(s.started.map((p) => p.id)).toEqual([1, 2, 3]);
  });
  it("never fires at the entrance or with reduced motion", () => {
    const s = setup(); arrive(s, 0); arrive(s, 0.0001, 5000);
    const r = setup({ reduced: true }); arrive(r, mid(1)); arrive(r, mid(2), 3000);
    expect(s.started).toEqual([]); expect(r.started).toEqual([]);
  });
  it("keeps visits in memory only: a new object starts over", () => {
    const a = setup(); arrive(a, mid(1));
    const b = setup(); arrive(b, mid(1));
    expect(b.started[0].kind).toBe("full");
  });
  it("stops its timers when unmounted", () => {
    const s = setup();
    s.shift.observe(mid(1));
    s.unmount();
    vi.advanceTimersByTime(5000);
    expect(s.started).toEqual([]);
  });
});

describe("the power-on", () => {
  it("holds a shift back until the power-on has run from the mount, then plays it if the visitor is still there", () => {
    const s = setup({ quiet: false });
    s.shift.observe(mid(1));
    vi.advanceTimersByTime(POWER_ON_MS - 5);
    expect(s.started).toEqual([]); // the tubes are still warming up
    vi.advanceTimersByTime(40);
    expect(s.started).toHaveLength(1);
  });
  it("plays nothing one ms before the power-on ends, and the full shift at the boundary", () => {
    const s = setup({ quiet: false });
    s.shift.observe(mid(1));
    vi.advanceTimersByTime(POWER_ON_MS - 1);
    s.shift.observe(mid(1)); // a scroll check, long past the wait, one ms early
    expect(s.started).toEqual([]);
    vi.advanceTimersByTime(1);
    s.shift.observe(mid(1));
    expect(s.started.map((p) => p.kind)).toEqual(["full"]);
  });
  it("counts the quiet time from the mount, not from when the object was created", () => {
    const shift = createShift();
    vi.advanceTimersByTime(10_000); // a long boot screen
    const started: Play[] = [];
    shift.mount({ startProgress: 0, navigationType: "navigate", onStart: (p) => started.push(p), onEnd() {}, wake() {} });
    shift.observe(mid(1));
    vi.advanceTimersByTime(POWER_ON_MS - 5);
    expect(started).toEqual([]);
  });
});

describe("a reload", () => {
  it("does not play a shift for the hold the page opened in, and shows its text", () => {
    const s = setup({ startProgress: mid(2), navigationType: "reload" });
    expect(s.shift.ready(2, mid(2), performance.now())).toBe(true);
    arrive(s, mid(2), 3000);
    expect(s.started).toEqual([]);
    arrive(s, 0, 100); arrive(s, mid(2), 1000); // leaving and coming back is an arrival, nothing was remembered
    expect(s.started.map((p) => p.kind)).toEqual(["full"]);
  });
  it("treats the first move off the top soon after a reload as the page's restore, not an arrival", () => {
    const s = setup({ navigationType: "reload", quiet: false });
    s.shift.observe(0);
    vi.advanceTimersByTime(POWER_ON_MS + 100);
    s.shift.observe(mid(4)); // the browser put the visitor back
    expect(s.shift.ready(4, mid(4), performance.now())).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(s.started).toEqual([]);
  });
  it("does the same for back and forward", () => {
    const s = setup({ navigationType: "back_forward" });
    s.shift.observe(0); s.shift.observe(mid(4)); vi.advanceTimersByTime(3000);
    expect(s.started).toEqual([]);
  });
  it("treats a move off the top after the restore window as an arrival", () => {
    const s = setup({ navigationType: "reload" });
    s.shift.observe(0);
    vi.advanceTimersByTime(RESTORE_WINDOW_MS + 1);
    arrive(s, mid(4));
    expect(s.started.map((p) => p.kind)).toEqual(["full"]);
  });
  it("treats an ordinary page load's first move off the top as an arrival", () => {
    const s = setup({ navigationType: "navigate" });
    s.shift.observe(0); arrive(s, mid(4));
    expect(s.started).toHaveLength(1);
  });
  it("only the first move off the top is the restore", () => {
    const s = setup({ navigationType: "reload" });
    s.shift.observe(0); s.shift.observe(mid(4));
    arrive(s, 0, 100); arrive(s, mid(4), 1000);
    expect(s.started).toHaveLength(1);
  });
});

describe("leaving", () => {
  it("ends the shift for the views the moment the visitor leaves the hold, and not before", () => {
    const s = setup();
    arrive(s, mid(1));
    expect(s.started).toHaveLength(1);
    s.shift.observe(mid(1) + 0.001);
    expect(s.ended).not.toHaveBeenCalled(); // moving inside the hold
    s.shift.observe(holdSpan(1)[1] + 0.02);
    expect(s.ended).toHaveBeenCalledTimes(1);
  });
  it("ends nothing when no shift is playing", () => {
    const s = setup();
    s.shift.observe(mid(1)); s.shift.observe(0);
    expect(s.ended).not.toHaveBeenCalled();
  });
  it("ends a shift that is held back by nothing on a later hold too: each shift ends once", () => {
    const s = setup();
    arrive(s, mid(1)); s.shift.observe(0); arrive(s, mid(2), 3000); s.shift.observe(0);
    expect(s.ended).toHaveBeenCalledTimes(2);
  });
  it("reports where the visitor is", () => {
    const s = setup();
    s.shift.observe(mid(3)); expect(s.shift.station).toBe(3);
    s.shift.observe(holdSpan(3)[1] + 0.02); expect(s.shift.station).toBe(0);
  });
});

describe("waking the room after a tear", () => {
  it("asks for one frame once a full tear has snapped back, and not before", () => {
    const s = setup();
    arrive(s, mid(1));
    s.wake.mockClear();
    s.shift.tearStarted("full", performance.now());
    vi.advanceTimersByTime(FULL_END_MS);
    expect(s.wake).not.toHaveBeenCalled(); // a timer set to the exact moment could fire early
    vi.advanceTimersByTime(60);
    expect(s.wake).toHaveBeenCalledTimes(1);
  });
  it("counts from when the tear really started", () => {
    const s = setup();
    arrive(s, mid(1)); s.wake.mockClear();
    vi.advanceTimersByTime(300); // drawn late
    s.shift.tearStarted("full", performance.now());
    vi.advanceTimersByTime(FULL_END_MS);
    expect(s.wake).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60);
    expect(s.wake).toHaveBeenCalledTimes(1);
  });
  it("does not ask for a short flick, whose text is already showing", () => {
    const s = setup();
    arrive(s, mid(1)); arrive(s, 0, 100); arrive(s, mid(1)); s.wake.mockClear();
    s.shift.tearStarted("short", performance.now());
    vi.advanceTimersByTime(5000);
    expect(s.wake).not.toHaveBeenCalled();
  });
  it("is cancelled when unmounted", () => {
    const s = setup();
    arrive(s, mid(1)); s.shift.tearStarted("full", performance.now()); s.wake.mockClear();
    s.unmount(); vi.advanceTimersByTime(5000);
    expect(s.wake).not.toHaveBeenCalled();
  });
});

describe("the text", () => {
  it("is held back from arrival until the tear has ended, then shows", () => {
    const s = setup();
    s.shift.observe(mid(1));
    expect(s.shift.ready(1, mid(1), performance.now())).toBe(false);
    vi.advanceTimersByTime(WAIT_MS + 30); // the timer fires the shift
    const fired = performance.now();
    expect(s.shift.resolves(1)).toBe(true);
    expect(s.shift.ready(1, mid(1), fired + FULL_END_MS - 1)).toBe(false);
    expect(s.shift.ready(1, mid(1), fired + FULL_END_MS + 1)).toBe(true);
  });
  it("waits for a tear that began late, such as on a slow device", () => {
    const s = setup();
    arrive(s, mid(1), WAIT_MS + 30);
    const fired = performance.now();
    expect(s.started).toHaveLength(1);
    s.shift.tearStarted("full", fired + 300); // the view drew it 300 ms after it fired
    expect(s.shift.ready(1, mid(1), fired + 300 + FULL_END_MS - 1)).toBe(false);
    expect(s.shift.ready(1, mid(1), fired + 300 + FULL_END_MS + 1)).toBe(true);
  });
  it("is readable about a second after arrival on a first visit", () => {
    const s = setup();
    const arrival = performance.now();
    arrive(s, mid(1), WAIT_MS + 30);
    let t = arrival;
    while (t - arrival < 5000 && !s.shift.ready(1, mid(1), t)) t++;
    expect(t - arrival).toBeLessThanOrEqual(1200);
  });
  it("is readable about 0.3 s after arrival on a return", () => {
    const s = setup();
    arrive(s, mid(1)); arrive(s, 0, 100);
    s.shift.ready(1, 0, performance.now()); // the room sees the text go
    const arrival = performance.now();
    arrive(s, mid(1), WAIT_MS + 30);
    expect(s.started.map((p) => p.kind)).toEqual(["full", "short"]);
    let t = arrival;
    while (t - arrival < 5000 && !s.shift.ready(1, mid(1), t)) t++;
    expect(t - arrival).toBeGreaterThanOrEqual(WAIT_MS);
    expect(t - arrival).toBeLessThanOrEqual(WAIT_MS + 30);
  });
  it("is not held back by a short flick the view draws late", () => {
    const s = setup();
    arrive(s, mid(1)); arrive(s, 0, 100);
    s.shift.ready(1, 0, performance.now());
    arrive(s, mid(1), WAIT_MS + 30);
    const fired = performance.now();
    s.shift.tearStarted("short", fired + 200);
    expect(s.shift.ready(1, mid(1), fired)).toBe(true);
  });
  it("shows as soon as the wait ends on a return, without resolving", () => {
    const s = setup();
    arrive(s, mid(1)); arrive(s, 0, 100);
    s.shift.ready(1, 0, performance.now()); // the room sees the text go
    s.shift.observe(mid(1));
    expect(s.shift.ready(1, mid(1), performance.now() + WAIT_MS - 1)).toBe(false);
    vi.advanceTimersByTime(WAIT_MS + 30);
    expect(s.shift.ready(1, mid(1), performance.now())).toBe(true);
    expect(s.shift.resolves(1)).toBe(false);
  });
  it("stays through the fade out on leaving, and is held back again on the next arrival", () => {
    const s = setup();
    arrive(s, mid(1)); vi.advanceTimersByTime(2000);
    expect(s.shift.ready(1, mid(1), performance.now())).toBe(true);
    const out = holdSpan(1)[1] + 0.005;
    s.shift.observe(out);
    expect(s.shift.ready(1, out, performance.now())).toBe(true);
    expect(s.shift.ready(1, 0, performance.now())).toBe(false);
    s.shift.observe(holdSpan(1)[0] + 1e-4);
    expect(s.shift.ready(1, holdSpan(1)[0] + 1e-4, performance.now())).toBe(false);
  });
  it("shows at once with reduced motion", () => {
    expect(createShift(true).ready(1, mid(1), 0)).toBe(true);
  });
});

describe("limiting flashes", () => {
  // Every sudden change of the shifts the module starts: the tear starting, each re-cut, the snap back.
  const run = (hopMs: number, seconds: number) => {
    const s = setup();
    const changes: number[] = [];
    const seen = new Set<number>();
    for (let k = 0, t0 = performance.now(); performance.now() - t0 < seconds * 1000; k++) {
      s.shift.observe(mid((k % STATION_COUNT) + 1));
      const before = performance.now();
      vi.advanceTimersByTime(hopMs);
      for (const p of s.started) if (!seen.has(p.id)) { seen.add(p.id); changes.push(...changeOffsets(p.kind).map((o) => before + o)); }
    }
    return { changes, started: s.started.length };
  };
  it("counts the start, the re-cut and the snap back of a tear", () => {
    expect(changeOffsets("full")).toEqual([0, 400, 800 + SNAP_BACK_MS]);
    expect(changeOffsets("short")).toEqual([0, 250 + SNAP_BACK_MS]);
  });
  it("never holds more than 3 sudden changes in any second, across back-to-back tears", () => {
    for (const hop of [WAIT_MS + 60, 400, 600, 777]) {
      const { changes } = run(hop, 20);
      expect(changes.length).toBeGreaterThan(10); // it still fires when it can
      // the changes are booked from the arrival; the shift fires a little later, which only spreads them
      expect(busiestWindow(changes)).toBeLessThanOrEqual(MAX_CHANGES_PER_SECOND);
    }
  });
  it("holds a second tear back until its changes fit, and shows its text at once without counting the visit", () => {
    const s = setup();
    arrive(s, mid(1), WAIT_MS + 50); // fires at 280: changes 280, 680, 1120
    arrive(s, mid(2), 300); // would fire at 550 after the hop: 4 changes within a second
    expect(s.started).toHaveLength(1);
    expect(s.shift.ready(2, mid(2), performance.now())).toBe(true);
    expect(s.shift.resolves(2)).toBe(false);
    arrive(s, mid(3), 300); // would fire at 910: 280, 680, 910 and 1120 are 4 within a window
    expect(s.started).toHaveLength(1);
    arrive(s, 0, 3000); arrive(s, mid(4), 300); // once the first tear's changes are long past: it fits again
    expect(s.started.map((p) => p.kind)).toEqual(["full", "full"]);
    arrive(s, 0, 3000); arrive(s, mid(2), 3000); // a held-back visit was not counted: still a first visit
    expect(s.started.map((p) => p.kind)).toEqual(["full", "full", "full"]);
  });
  it("counts from when the tear really began, if the view drew it late", () => {
    // The first tear fires at 280 and is booked 280, 680, 1120. A second fires at 1500: on the booked
    // times it fits; if the view drew the first 300 ms late (580, 980, 1420) it does not.
    for (const [late, plays] of [[0, 2], [300, 1]]) {
      const s = setup();
      arrive(s, mid(1), WAIT_MS + 30);
      s.shift.tearStarted("full", performance.now() + late);
      vi.advanceTimersByTime(940);
      arrive(s, mid(2), WAIT_MS + 50);
      expect(s.started).toHaveLength(plays);
    }
  });
});

describe("a Work page turn", () => {
  it("plays the short flick, and only when the visitor is not reduced", () => {
    expect(setup().shift.turn()).toBe(true);
    expect(setup({ reduced: true }).shift.turn()).toBe(false);
  });
  it("lets quick clicks through only while no second holds more than 3 sudden changes", () => {
    const s = setup();
    const played: number[] = [];
    for (let i = 0; i < 40; i++) { if (s.shift.turn()) played.push(performance.now()); vi.advanceTimersByTime(100); }
    expect(played.length).toBeGreaterThan(0);
    expect(played.length).toBeLessThan(40);
    expect(busiestWindow(played.flatMap((t) => changeOffsets("short").map((o) => t + o)))).toBeLessThanOrEqual(MAX_CHANGES_PER_SECOND);
  });
  it("holds a click 0.7 s after a flick, because the snap back is drawn a frame late", () => {
    const s = setup();
    expect(s.shift.turn()).toBe(true);
    vi.advanceTimersByTime(710);
    expect(s.shift.turn()).toBe(false);
    vi.advanceTimersByTime(390);
    expect(s.shift.turn()).toBe(true);
  });
  it("counts from when the flick really began, if the page drew it late", () => {
    const s = setup();
    expect(s.shift.turn()).toBe(true);
    s.shift.turnStarted(performance.now() + 200);
    vi.advanceTimersByTime(900);
    expect(s.shift.turn()).toBe(false);
  });
  it("counts against the flash limit with a tear that is already playing", () => {
    const s = setup();
    arrive(s, mid(1), WAIT_MS + 30); // fired: 280, 680, 1120
    vi.advanceTimersByTime(450);
    expect(s.shift.turn()).toBe(false);
  });
});
