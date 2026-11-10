import { describe, it, expect } from "vitest";
import { goesBack, DRAG_PX, type Press } from "./back";
import { STATION_COUNT } from "./hold";
import { createVisit, FADE_MS, FLIGHT_MS } from "./visit";

const room: Press = { on: "room", moved: 0 };
const at = (stop: number) => ({ kind: "at", stop }) as const;

describe("goesBack", () => {
  it("is true for a press on the room at a station", () => {
    for (let s = 1; s <= STATION_COUNT; s++) expect(goesBack(at(s), room, false)).toBe(true);
  });
  it("is true for a press on another station's TV: from here it is the room", () => {
    expect(goesBack(at(2), { on: "tv", stop: 3, moved: 0 }, false)).toBe(true);
    expect(goesBack(at(2), { on: "tv", stop: 1, moved: 0 }, false)).toBe(true);
  });
  it("is false for a press on this station's own TV (its glass or bezel)", () => {
    for (let s = 1; s <= STATION_COUNT; s++) expect(goesBack(at(s), { on: "tv", stop: s, moved: 0 }, false)).toBe(false);
  });
  it("is false for a press on the desk meter: that click means next", () => {
    expect(goesBack(at(2), { on: "meter", moved: 0 }, false)).toBe(false);
  });
  it("is false for a press that moved more than the drag limit (6 px), true at the limit", () => {
    expect(DRAG_PX).toBe(6);
    expect(goesBack(at(2), { on: "room", moved: 7 }, false)).toBe(false);
    expect(goesBack(at(2), { on: "room", moved: 20 }, false)).toBe(false);
    expect(goesBack(at(2), { on: "room", moved: 6 }, false)).toBe(true);
  });
  it("is false at the overview, whatever is pressed", () => {
    for (const p of [room, { on: "tv", stop: 2, moved: 0 }, { on: "meter", moved: 0 }] as Press[]) expect(goesBack(at(0), p, false)).toBe(false);
  });
  it("is false in flight, whatever is pressed, either way and at either end", () => {
    for (const f of [0, 0.01, 0.5, 0.99, 1]) for (const [from, to] of [[0, 2], [2, 0], [1, 3]]) {
      for (const p of [room, { on: "tv", stop: 3, moved: 0 }] as Press[]) expect(goesBack({ kind: "flying", from, to, f }, p, false)).toBe(false);
    }
  });

  // What RoomClick asks of the rule: where the visit says the visitor is, and whether a move is running.
  const ask = (reduced: boolean) => {
    let t = 1000;
    const visit = createVisit({ reduced, now: () => t });
    visit.land(1);
    return {
      visit,
      goTo: (stop: number) => visit.go(stop),
      at: (ms: number) => { t = ms; },
      click: () => goesBack(visit.where(t), room, visit.moving(t)),
    };
  };

  it("under reduced motion, is false through the whole fade, both halves, and true once it ends (#224)", () => {
    const { goTo, at, click, visit } = ask(true);
    expect(click()).toBe(true); // resting at Home lab
    goTo(2);
    for (const f of [0, 0.25, 0.49, 0.5, 0.75, 0.99]) {
      at(1000 + f * FADE_MS);
      expect(click(), `${f} of the way through the fade`).toBe(false);
    }
    at(1000 + FADE_MS);
    expect(visit.where(1000 + FADE_MS)).toEqual({ kind: "at", stop: 2 });
    expect(click(), "the fade has ended").toBe(true);
  });
  it("under reduced motion, a press that waits for the fade does not let a click through either", () => {
    const { goTo, at, click } = ask(true);
    goTo(2);
    at(1000 + 0.75 * FADE_MS);
    goTo(3);
    expect(click()).toBe(false);
  });
  it("with flights, is false through the flight and true once it lands", () => {
    const { goTo, at, click } = ask(false);
    goTo(2);
    for (const f of [0, 0.5, 0.99]) { at(1000 + f * FLIGHT_MS); expect(click(), `${f}`).toBe(false); }
    at(1000 + FLIGHT_MS);
    expect(click()).toBe(true);
  });
});
