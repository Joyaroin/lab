import { describe, it, expect } from "vitest";
import { busiestWindow, createShifts, WAIT_MS, changeOffsets, MAX_CHANGES_PER_SECOND, SNAP_BACK_MS } from "./shift";
import { SHIFT_SECONDS } from "./nixie";
import { holdSpan, progressFor, STATION_COUNT } from "./hold";

const mid = (i: number) => progressFor(i);
const settle = (s: ReturnType<typeof createShifts>, p: number, t: number) => {
  s.observe(p, t);
  return s.observe(p, t + WAIT_MS);
};

describe("the shift", () => {
  it("fires in full on arrival inside a hold, once the visitor stays", () => {
    const s = createShifts();
    expect(s.observe(mid(1), 0)).toBeNull(); // just arrived: not yet
    expect(s.observe(mid(1), WAIT_MS)).toBe("full");
    expect(s.observe(mid(1), WAIT_MS * 5)).toBeNull(); // only once per arrival
  });
  it("is short on a return to a visited station", () => {
    const s = createShifts();
    expect(settle(s, mid(1), 0)).toBe("full");
    s.observe(mid(2), 5000); // away, in another hold, unsettled
    expect(s.observe(0, 5001)).toBeNull();
    expect(settle(s, mid(1), 6000)).toBe("short");
  });
  it("is full for each station's first visit", () => {
    const s = createShifts();
    expect(settle(s, mid(1), 0)).toBe("full");
    expect(settle(s, mid(2), 3000)).toBe("full");
  });
  it("does not fire when scrolling quickly through a station", () => {
    const s = createShifts();
    for (let i = 1; i <= STATION_COUNT; i++) {
      const [a, b] = holdSpan(i);
      expect(s.observe(a + 1e-6, i * 1000)).toBeNull();
      expect(s.observe(b - 1e-6, i * 1000 + WAIT_MS / 4)).toBeNull();
      expect(s.observe(b + 0.02, i * 1000 + WAIT_MS / 2)).toBeNull();
    }
    // and passing through didn't count as a visit
    expect(settle(s, mid(1), 20000)).toBe("full");
  });
  it("never fires at the entrance", () => {
    const s = createShifts();
    expect(settle(s, 0, 0)).toBeNull();
    expect(settle(s, 0.0001, 5000)).toBeNull();
  });
  it("never fires with reduced motion", () => {
    const s = createShifts(true);
    expect(settle(s, mid(1), 0)).toBeNull();
    expect(settle(s, mid(2), 3000)).toBeNull();
  });
  it("keeps visits in memory only", () => {
    const a = createShifts();
    expect(settle(a, mid(1), 0)).toBe("full");
    expect(settle(createShifts(), mid(1), 0)).toBe("full"); // a reload is a new tracker
    
  });
});

describe("limiting flashes", () => {
  // Every sudden change of a played shift: the tear starting, each re-cut, the snap back.
  const run = (hopMs: number, seconds: number) => {
    const s = createShifts();
    const changes: number[] = [];
    for (let t = 0, k = 0; t < seconds * 1000; t += hopMs, k++) {
      const st = (k % STATION_COUNT) + 1;
      s.observe(mid(st), t);
      const kind = s.observe(mid(st), t + WAIT_MS);
      if (kind) changes.push(...changeOffsets(kind).map((o) => t + WAIT_MS + o));
    }
    return changes;
  };
  it("counts the start, the re-cut and the snap back of a tear", () => {
    expect(changeOffsets("full")).toEqual([0, 400, 800 + SNAP_BACK_MS]);
    expect(changeOffsets("short")).toEqual([0, 250 + SNAP_BACK_MS]);
  });
  it("never holds more than 3 sudden changes in any second, across back-to-back tears", () => {
    // hop between the stations just past the wait for 20 s, so one tear follows another
    for (const hop of [WAIT_MS + 10, 400, 600, 777]) {
      const changes = run(hop, 20);
      expect(changes.length).toBeGreaterThan(10); // it still fires when it can
      expect(busiestWindow(changes)).toBeLessThanOrEqual(MAX_CHANGES_PER_SECOND);
    }
  });
  it("holds a second tear back until its changes fit", () => {
    const s = createShifts();
    expect(settle(s, mid(1), 0)).toBe("full"); // changes at 250, 650, 1090
    expect(settle(s, mid(2), 300)).toBeNull(); // would start at 550: 4 changes within a second
    expect(settle(s, mid(3), 800)).toBeNull(); // 1050: its start fits but its re-cut at 1450 + the earlier ones do not
    expect(settle(s, mid(4), 3000)).toBe("full");
  });
  it("counts from when the tear really began, if the view drew it late", () => {
    const s = createShifts();
    expect(settle(s, mid(1), 0)).toBe("full"); // planned 250, 650, 1090
    s.tearStarted("full", WAIT_MS + 300); // drawn late: 550, 950, 1390
    // Fired at 1100 it changes at 1100, 1500 and 1540. On the planned times that fits (650, 1090, 1100 and
    // 1090, 1100, 1500 are 3 each); on the drawn times 950, 1100, 1390, 1500 is 4 in a second.
    expect(settle(s, mid(2), 850)).toBeNull();
  });
  it("shows the text at once when a shift is held back, and does not count that visit", () => {
    const s = createShifts();
    expect(settle(s, mid(1), 0)).toBe("full");
    expect(settle(s, mid(2), 300)).toBeNull();
    expect(s.ready(2, mid(2), 300 + WAIT_MS)).toBe(true);
    expect(s.resolves(2)).toBe(false); // and it just appears
    s.observe(0, 3000); // away, then back
    expect(settle(s, mid(2), 5000)).toBe("full"); // later, still a first visit
  });
});

describe("text resolving out of the shift", () => {
  it("is held back from arrival until the shift ends, then shows", () => {
    const s = createShifts();
    s.observe(mid(1), 0);
    expect(s.ready(1, mid(1), 10)).toBe(false);
    expect(s.observe(mid(1), WAIT_MS)).toBe("full");
    const end = WAIT_MS + SHIFT_SECONDS.full * 1000 + SNAP_BACK_MS; // after the tear has snapped back
    expect(s.ready(1, mid(1), end - 1)).toBe(false);
    expect(s.ready(1, mid(1), end)).toBe(true);
  });
  it("waits for a tear that began late, such as on a slow device", () => {
    const s = createShifts();
    s.observe(mid(1), 0);
    expect(s.observe(mid(1), WAIT_MS)).toBe("full");
    s.tearStarted("full", WAIT_MS + 300); // the view drew it 300 ms after it fired
    const end = WAIT_MS + 300 + SHIFT_SECONDS.full * 1000 + SNAP_BACK_MS;
    expect(s.ready(1, mid(1), end - 1)).toBe(false);
    expect(s.ready(1, mid(1), end)).toBe(true);
  });
  it("shows at once when the wait ends on a return, without resolving; a first visit resolves", () => {
    const s = createShifts();
    settle(s, mid(1), 0);
    expect(s.resolves(1)).toBe(true);
    s.observe(0, 5000);
    s.ready(1, 0, 5000); // the room sees the text go
    s.observe(mid(1), 6000);
    expect(s.ready(1, mid(1), 6000 + WAIT_MS - 1)).toBe(false); // still waiting
    expect(s.observe(mid(1), 6000 + WAIT_MS)).toBe("short");
    expect(s.ready(1, mid(1), 6000 + WAIT_MS)).toBe(true);
    expect(s.resolves(1)).toBe(false);
    s.tearStarted("short", 6000 + WAIT_MS + 200); // the flick drawn late does not hold the text
    expect(s.ready(1, mid(1), 6000 + WAIT_MS)).toBe(true);
  });
  it("is readable about a second after arrival on a first visit, and about 0.3 s on a return", () => {
    const s = createShifts();
    s.observe(mid(1), 0);
    s.observe(mid(1), WAIT_MS);
    let first = 0;
    while (!s.ready(1, mid(1), first)) first++;
    expect(first).toBeLessThanOrEqual(1200);
    s.observe(0, 5000);
    s.ready(1, 0, 5000); // the room sees the text go
    s.observe(mid(1), 6000);
    s.observe(mid(1), 6000 + WAIT_MS);
    let back = 6000;
    while (!s.ready(1, mid(1), back)) back++;
    expect(back - 6000).toBe(WAIT_MS);
  });
  it("stays through the fade out on leaving, and is held back again on the next arrival", () => {
    const s = createShifts();
    settle(s, mid(1), 0);
    expect(s.ready(1, mid(1), 5000)).toBe(true);
    const [, end] = holdSpan(1);
    s.observe(end + 0.005, 6000);
    expect(s.ready(1, end + 0.005, 6000)).toBe(true); // still fading out, not blanked
    expect(s.ready(1, 0, 7000)).toBe(false); // gone
    s.observe(holdSpan(1)[0] + 1e-4, 8000);
    expect(s.ready(1, holdSpan(1)[0] + 1e-4, 8000)).toBe(false);
  });
  it("shows at once with reduced motion", () => {
    const s = createShifts(true);
    expect(s.ready(1, mid(1), 0)).toBe(true);
  });
});

describe("the power-on and a reload", () => {
  it("waits for the power-on, then plays the shift if the visitor is still there", () => {
    const s = createShifts(false, { quietUntil: 1400 });
    s.observe(mid(1), 0);
    expect(s.observe(mid(1), WAIT_MS)).toBeNull(); // the tubes are still warming up
    expect(s.observe(mid(1), 1399)).toBeNull();
    expect(s.observe(mid(1), 1400)).toBe("full");
  });
  it("does not play a shift for the hold the page was reloaded in, and shows its text", () => {
    const s = createShifts(false, { startProgress: mid(2) });
    expect(s.ready(2, mid(2), 0)).toBe(true);
    expect(settle(s, mid(2), 0)).toBeNull();
    expect(settle(s, mid(2), 1000)).toBeNull();
    // leaving and coming back is an arrival like any other, and nothing was remembered
    s.observe(0, 2000);
    expect(settle(s, mid(2), 3000)).toBe("full");
  });
  it("treats a scroll position the page restored as a reload, not an arrival", () => {
    const s = createShifts();
    s.observe(0, 0);
    s.restore(mid(4)); // the browser put the visitor back after the reload
    expect(s.ready(4, mid(4), 0)).toBe(true);
    expect(settle(s, mid(4), 100)).toBeNull();
    s.observe(0, 2000);
    expect(settle(s, mid(4), 3000)).toBe("full");
  });
  it("reports where the visitor is, so a shift can end when they leave", () => {
    const s = createShifts();
    s.observe(mid(3), 0);
    expect(s.station).toBe(3);
    s.observe(holdSpan(3)[1] + 0.02, 100);
    expect(s.station).toBe(0);
  });
});

describe("a Work page turn", () => {
  it("plays the short flick, and only when the visitor is not reduced", () => {
    expect(createShifts().turn(1000)).toBe(true);
    expect(createShifts(true).turn(1000)).toBe(false);
  });
  it("lets quick clicks through only while no second holds more than 3 sudden changes", () => {
    const s = createShifts();
    const played: number[] = [];
    for (let t = 0; t < 4000; t += 100) if (s.turn(t)) played.push(t);
    expect(played.length).toBeGreaterThan(0);
    expect(played.length).toBeLessThan(40); // not every click
    const times = played.flatMap((t) => changeOffsets("short").map((o) => t + o));
    expect(busiestWindow(times)).toBeLessThanOrEqual(MAX_CHANGES_PER_SECOND);
  });
  it("holds a click 0.7 s after a flick back, because the snap back is drawn a frame late", () => {
    const s = createShifts();
    expect(s.turn(0)).toBe(true);
    expect(s.turn(710)).toBe(false); // 0, 290, 710, 1000 would be 4 in a second once drawn late
    expect(s.turn(1100)).toBe(true);
  });
  it("counts from when the flick really began, if the page drew it late", () => {
    const s = createShifts();
    expect(s.turn(0)).toBe(true); // booked 0 and 290
    s.turnStarted(200); // drawn late: 200 and 490
    // A click at 900 adds 900 and 1190. On the booked times (0, 290, 900) and (290, 900, 1190) that fits;
    // on the drawn times 200, 490, 900 and 1190 are 4 in a window of 1100 ms.
    expect(s.turn(900)).toBe(false);
  });
  it("counts against the flash limit with a tear that is already playing", () => {
    const s = createShifts();
    expect(settle(s, mid(1), 0)).toBe("full"); // changes at 250, 650, 1090+250
    expect(s.turn(700)).toBe(false);
  });
});
