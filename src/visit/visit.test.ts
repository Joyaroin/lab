import { describe, it, expect } from "vitest";
import { STATION_COUNT } from "../hold";
import { createVisit, ease, FADE_MS, FLIGHT_MS, type VisitEvent } from "./index";

function setup(reduced = false) {
  let t = 1000;
  const visit = createVisit({ reduced, now: () => t });
  const events: VisitEvent[] = [];
  visit.subscribe((e) => events.push(e));
  return { visit, events, at: (ms: number) => (t = ms), advance: (ms: number) => (t += ms), now: () => t };
}

describe("go, back, land", () => {
  it("starts at the overview", () => {
    expect(setup().visit.where(0)).toEqual({ kind: "at", stop: 0 });
  });

  it("flies to a stop and rests there", () => {
    const { visit, advance, now } = setup();
    visit.go(3);
    expect(visit.where(now())).toEqual({ kind: "flying", from: 0, to: 3, f: 0 });
    advance(FLIGHT_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 3 });
  });

  it("back flies to the overview", () => {
    const { visit, advance, now } = setup();
    visit.land(2);
    visit.back();
    expect(visit.where(now())).toEqual({ kind: "flying", from: 2, to: 0, f: 0 });
    advance(FLIGHT_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 0 });
  });

  it("land puts the visitor at the stop with no flight", () => {
    const { visit, now } = setup();
    visit.land(4);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 4 });
  });

  it("going to where you already are does nothing", () => {
    const { visit, events } = setup();
    visit.go(0);
    visit.go(2);
    visit.go(2);
    expect(events.filter((e) => e.type === "move")).toHaveLength(1);
  });
});

describe("a flight", () => {
  it("runs f from 0 to 1, rising, and ends exactly at the stop", () => {
    const { visit, at } = setup();
    visit.go(2);
    let last = -1;
    for (let ms = 0; ms < FLIGHT_MS; ms += 50) {
      const w = visit.where(at(1000 + ms));
      if (w.kind !== "flying") throw new Error("not flying");
      expect(w.f).toBeGreaterThanOrEqual(last);
      last = w.f;
    }
    expect(last).toBeGreaterThan(0.9);
    expect(visit.where(at(1000 + FLIGHT_MS))).toEqual({ kind: "at", stop: 2 });
  });

  it("is eased: slower than linear at the start, and half done at half the time", () => {
    const { visit, at } = setup();
    visit.go(2);
    const early = visit.where(at(1000 + FLIGHT_MS * 0.1));
    expect(early).toMatchObject({ kind: "flying" });
    if (early.kind === "flying") expect(early.f).toBeLessThan(0.1);
    const mid = visit.where(at(1000 + FLIGHT_MS / 2));
    if (mid.kind === "flying") expect(mid.f).toBeCloseTo(0.5);
  });

  it("is 0.9 s", () => {
    expect(FLIGHT_MS).toBe(900);
  });
});

describe("next", () => {
  it("goes from the overview to Work and station to station", () => {
    const { visit, advance, now } = setup();
    for (let i = 1; i <= STATION_COUNT; i++) {
      visit.next();
      advance(FLIGHT_MS);
      expect(visit.where(now())).toEqual({ kind: "at", stop: i });
    }
  });

  it("goes from the last station to the overview", () => {
    const { visit, advance, now } = setup();
    visit.land(STATION_COUNT);
    visit.next();
    advance(FLIGHT_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 0 });
  });

  it("during a flight means the stop after its destination", () => {
    const { visit, advance, now } = setup();
    visit.go(2);
    advance(300);
    visit.next();
    expect(visit.target()).toBe(3);
    advance(FLIGHT_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 3 });
  });

  it("during a flight to the last station wraps to the overview", () => {
    const { visit, advance } = setup();
    visit.go(STATION_COUNT);
    advance(300);
    visit.next();
    expect(visit.target()).toBe(0);
  });
});

describe("prev", () => {
  it("goes from a station to the one before", () => {
    const { visit, advance, now } = setup();
    visit.land(3);
    visit.prev();
    advance(FLIGHT_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 2 });
  });

  it("goes from the first station to the overview", () => {
    const { visit, advance, now } = setup();
    visit.land(1);
    visit.prev();
    advance(FLIGHT_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 0 });
  });

  it("does nothing at the overview", () => {
    const { visit, events, advance, now } = setup();
    visit.prev();
    advance(FLIGHT_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 0 });
    expect(events).toEqual([]);
  });

  it("during a flight means the stop before its destination", () => {
    const { visit, advance, now } = setup();
    visit.go(3);
    advance(300);
    visit.prev();
    expect(visit.target()).toBe(2);
    advance(FLIGHT_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 2 });
  });

  it("during a flight to the first station means the overview, and during one to the overview nothing", () => {
    const { visit, advance } = setup();
    visit.go(1);
    advance(300);
    visit.prev();
    expect(visit.target()).toBe(0);
    visit.prev();
    expect(visit.target()).toBe(0);
  });

  it("during a fade means the stop before its destination", () => {
    const { visit } = setup(true);
    visit.go(3);
    visit.prev();
    expect(visit.target()).toBe(2);
  });
});

describe("a go mid-flight", () => {
  it("starts a new flight from where the camera is, with f back at 0", () => {
    const { visit, advance, now } = setup();
    visit.go(1);
    advance(FLIGHT_MS / 2);
    const before = visit.where(now());
    visit.go(4);
    expect(visit.where(now())).toMatchObject({ kind: "flying", to: 4, f: 0 });
    expect(visit.launch(now())).toEqual({ kind: "flying", from: { kind: "at", stop: 0 }, to: 1, f: before.kind === "flying" ? before.f : -1 });
    advance(FLIGHT_MS / 2);
    expect(visit.where(now())).toMatchObject({ kind: "flying", to: 4 });
    advance(FLIGHT_MS / 2);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 4 });
  });

  it("launches from a stop's own Where when not mid-flight", () => {
    const { visit, now } = setup();
    visit.land(2);
    visit.go(3);
    expect(visit.launch(now())).toEqual({ kind: "at", stop: 2 });
  });

  it("chains: each re-target launches from where the camera really is, however many times", () => {
    const { visit, at } = setup();
    const t0 = 1000;
    at(t0);
    visit.go(1);
    at(t0 + 0.3 * FLIGHT_MS); // 0.3 of the way, eased
    visit.go(2);
    const first = { kind: "flying", from: { kind: "at", stop: 0 }, to: 1, f: ease(0.3) };
    expect(visit.launch(t0 + 0.3 * FLIGHT_MS)).toEqual(first);
    at(t0 + 0.5 * FLIGHT_MS); // 0.2 of the second flight
    visit.go(3);
    const second = { kind: "flying", from: first, to: 2, f: ease(0.2) };
    expect(visit.launch(t0 + 0.5 * FLIGHT_MS)).toEqual(second);
    at(t0 + 0.75 * FLIGHT_MS); // 0.25 of the third flight
    visit.go(4);
    expect(visit.launch(t0 + 0.75 * FLIGHT_MS)).toEqual({ kind: "flying", from: second, to: 3, f: ease(0.25) });
    expect(visit.where(t0 + 0.75 * FLIGHT_MS)).toMatchObject({ kind: "flying", to: 4, f: 0 });
  });
});

describe("subscribers", () => {
  it("hear a move as it starts, and the landing", () => {
    const { visit, events, advance, now } = setup();
    visit.go(2);
    expect(events).toEqual([{ type: "move", from: { kind: "at", stop: 0 }, to: 2 }]);
    advance(FLIGHT_MS);
    visit.where(now());
    expect(events[1]).toEqual({ type: "land", stop: 2 });
    visit.back();
    expect(events[2]).toMatchObject({ type: "move", to: 0 });
  });

  it("hear a move and a landing for land()", () => {
    const { visit, events } = setup();
    visit.go(1);
    visit.land(3);
    expect(events.map((e) => e.type)).toEqual(["move", "move", "land"]);
    expect(events[1]).toMatchObject({ to: 3 });
  });

  it("hear a landing once, and can unsubscribe", () => {
    const { visit, events, advance, now } = setup();
    const heard: VisitEvent[] = [];
    const off = visit.subscribe((e) => heard.push(e));
    visit.go(1);
    advance(FLIGHT_MS);
    visit.where(now());
    visit.where(now());
    expect(events.filter((e) => e.type === "land")).toHaveLength(1);
    off();
    visit.go(2);
    expect(heard).toHaveLength(2);
  });
});

describe("reduced motion", () => {
  it("fades instead of flying: old stop until the midpoint, new one after", () => {
    const { visit, advance, now } = setup(true);
    visit.land(1);
    visit.go(3);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 1 });
    advance(FADE_MS / 2 - 1);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 1 });
    advance(1);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 3 });
    advance(FADE_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 3 });
  });

  it("moving is true through the whole fade, both halves, and false at rest", () => {
    const { visit, advance, now } = setup(true);
    visit.land(1);
    expect(visit.moving(now())).toBe(false);
    visit.go(3);
    expect(visit.moving(now())).toBe(true);
    advance(FADE_MS * 0.75);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 3 }); // reads as arrived, yet still moving
    expect(visit.moving(now())).toBe(true);
    advance(FADE_MS);
    expect(visit.moving(now())).toBe(false);
  });

  it("fade is 0 at rest, rises to 1 at the midpoint, and falls back to 0", () => {
    const { visit, advance, now } = setup(true);
    expect(visit.fade(now())).toBe(0);
    visit.go(2);
    expect(visit.fade(now())).toBe(0);
    advance(FADE_MS / 2);
    expect(visit.fade(now())).toBe(1);
    advance(FADE_MS / 4);
    expect(visit.fade(now())).toBeCloseTo(0.5);
    advance(FADE_MS);
    expect(visit.fade(now())).toBe(0);
  });

  it("is about 300 ms and never reports a flight", () => {
    expect(FADE_MS).toBe(300);
    const { visit, advance, now } = setup(true);
    visit.go(2);
    for (let i = 0; i < 6; i++) {
      expect(visit.where(now()).kind).toBe("at");
      advance(50);
    }
    expect(visit.launch(now())).toBeNull();
  });

  it("next during a fade means the stop after its destination, and land is instant", () => {
    const { visit, now } = setup(true);
    visit.go(2);
    visit.next();
    expect(visit.target()).toBe(3);
    visit.land(1);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 1 });
    expect(visit.fade(now())).toBe(0);
  });

  it("subscribers hear the landing after the fade", () => {
    const { visit, events, advance, now } = setup(true);
    visit.go(2);
    advance(FADE_MS);
    visit.where(now());
    expect(events.map((e) => e.type)).toEqual(["move", "land"]);
  });
});

describe("reduced motion: a press during a fade waits (Adham, #176)", () => {
  it("keeps only the latest press and starts it when the fade ends", () => {
    const { visit, events, advance, now } = setup(true);
    visit.go(2);
    advance(100);
    visit.go(4);
    visit.go(5);
    expect(visit.target()).toBe(5);
    advance(FADE_MS / 2 - 100);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 2 }); // the first fade finishes its own move
    advance(FADE_MS / 2);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 2 });
    expect(visit.fade(now())).toBe(0); // the waiting move starts on the next read
    advance(FADE_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 5 });
    expect(events.filter((e) => e.type === "move").map((e) => (e as { to: number }).to)).toEqual([2, 5]);
  });

  it("a press back to the stop being faded to cancels the waiting one", () => {
    const { visit, events, advance, now } = setup(true);
    visit.go(2);
    visit.go(4);
    visit.go(2);
    advance(FADE_MS * 3);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 2 });
    expect(events.filter((e) => e.type === "move")).toHaveLength(1);
  });

  it("presses every 160 ms: fades start at least a fade apart, the last press lands, one move event per fade", () => {
    const { visit, events, advance, now, at } = setup(true);
    const t0 = now();
    const starts: number[] = [];
    visit.subscribe((e) => { if (e.type === "move") starts.push(now()); });
    let wasFading = false;
    let lastPressed = 0;
    for (let ms = 0; ms <= 2000 + FADE_MS * 3; ms += 10) {
      at(t0 + ms);
      if (ms <= 2000 && ms % 160 === 0) { lastPressed = (ms / 160) % 2 ? 3 : 1; visit.go(lastPressed); }
      const f = visit.fade(now());
      if (f > 0 && !wasFading) wasFading = true;
      if (f === 0) wasFading = false;
    }
    expect(starts.length).toBeGreaterThan(1);
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(FADE_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: lastPressed });
    expect(events.filter((e) => e.type === "move")).toHaveLength(starts.length);
  });

  it("fade() never drops by more than a 10 ms step's share while presses arrive", () => {
    const { visit, now, at } = setup(true);
    const t0 = now();
    let prev = 0;
    for (let ms = 0; ms <= 3000; ms += 10) {
      at(t0 + ms);
      if (ms <= 2000 && ms % 160 === 0) visit.go((ms / 160) % 2 ? 3 : 1);
      const f = visit.fade(now());
      expect(prev - f).toBeLessThanOrEqual(10 / (FADE_MS / 2) + 1e-9);
      prev = f;
    }
  });
});
