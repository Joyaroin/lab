import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createShift, WAIT_MS } from "../shift";
import { createVisit } from "./visit";
import { linkHistory, type HistoryHost } from "./history";

function setup(hash = "") {
  const calls: string[] = [];
  let pop: () => void = () => {};
  const host: HistoryHost = {
    history: {
      pushState: (_s, _t, url) => void calls.push(`push ${url}`),
      replaceState: (_s, _t, url) => void calls.push(`replace ${url}`),
    },
    location: { hash },
    addEventListener: (_t, l) => { pop = l; },
    removeEventListener: () => { pop = () => {}; },
  };
  const visit = createVisit({ reduced: false, now: () => 0 });
  const off = linkHistory(visit, host);
  return { visit, calls, off, host, popstate: (h: string) => { host.location.hash = h; pop(); } };
}

describe("linkHistory", () => {
  it("a move pushes one entry with the station's hash; back pushes the overview", () => {
    const { visit, calls } = setup();
    visit.go(1);
    visit.back();
    expect(calls).toEqual(["push #work", "push ./"]);
  });
  it("next and a re-target each push", () => {
    const { visit, calls } = setup();
    visit.next();
    visit.go(3);
    expect(calls).toEqual(["push #work", "push #home-lab"]);
  });
  it("a popstate moves the visit and pushes nothing", () => {
    const { visit, calls, popstate } = setup();
    popstate("#mediasafe");
    expect(visit.target()).toBe(2);
    popstate("");
    expect(visit.target()).toBe(0);
    expect(calls).toEqual([]);
  });
  it("a direct link lands there, with an overview entry under it, and no flight", () => {
    const { visit, calls } = setup("#work");
    expect(calls).toEqual(["replace ./", "push #work"]);
    expect(visit.where(0)).toEqual({ kind: "at", stop: 1 });
  });
  it("an unknown hash opens the overview and touches no history", () => {
    const { visit, calls } = setup("#nope");
    expect(calls).toEqual([]);
    expect(visit.where(0)).toEqual({ kind: "at", stop: 0 });
  });
  it("unlinking stops pushing", () => {
    const { visit, calls, off } = setup();
    off();
    visit.go(1);
    expect(calls).toEqual([]);
  });

  describe("under reduced motion, Back during a fade", () => {
    function reducedSetup() {
      const stack = ["./"];
      let i = 0;
      let pop: () => void = () => {};
      let clock = 0;
      const host: HistoryHost = {
        history: {
          pushState: (_s, _t, url) => { stack.splice(i + 1, stack.length, String(url)); i++; },
          replaceState: (_s, _t, url) => { stack[i] = String(url); },
        },
        location: { get hash() { return stack[i] === "./" ? "" : stack[i]; } } as Location,
        addEventListener: (_t, l) => { pop = l; },
        removeEventListener: () => {},
      };
      const visit = createVisit({ reduced: true, now: () => clock });
      linkHistory(visit, host);
      return {
        visit, stack, at: (ms: number) => { clock = ms; visit.where(ms); },
        back: () => { i--; pop(); },
        url: () => stack[i],
        index: () => i,
      };
    }
    it("a press for the fade's stop keeps the URL on the stop the visitor ends at", () => {
      const s = reducedSetup();
      s.visit.go(1);
      s.at(100);
      s.back();
      expect(s.url()).toBe("./");
      s.at(120);
      s.visit.go(1);
      s.at(400);
      expect(s.visit.target()).toBe(1);
      expect(s.url()).toBe("#work");
      s.back();
      expect(s.url()).toBe("./");
      expect(s.index()).toBe(0);
    });
    it("a press for another stop ends with the URL on that stop", () => {
      const s = reducedSetup();
      s.visit.go(1);
      s.at(100);
      s.back();
      s.at(120);
      s.visit.go(2);
      s.at(700);
      expect(s.visit.target()).toBe(2);
      expect(s.url()).toBe("#mediasafe");
    });
  });
});

describe("a direct link and the shift", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("plays no shift for the station the page opened on, mounted the way TourView does, and shows its text", () => {
    const { visit } = setup("#work");
    const shift = createShift(false);
    const played = vi.fn();
    shift.subscribe(() => { if (shift.playing) played(shift.playing); });
    shift.setWake(() => {});
    shift.mount({ startWhere: visit.where(performance.now()) });
    shift.observe(visit.where(performance.now()));
    vi.advanceTimersByTime(WAIT_MS + 5000);
    shift.observe(visit.where(performance.now()));
    expect(played).not.toHaveBeenCalled();
    expect(shift.textState(1, performance.now())).toBe("showing");
  });
});
