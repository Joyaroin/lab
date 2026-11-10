import { describe, it, expect } from "vitest";
import { goesBack, DRAG_PX, type Press } from "./back";
import { STATION_COUNT } from "./hold";

const room: Press = { on: "room", moved: 0 };
const at = (stop: number) => ({ kind: "at", stop }) as const;

describe("goesBack", () => {
  it("is true for a press on the room at a station", () => {
    for (let s = 1; s <= STATION_COUNT; s++) expect(goesBack(at(s), room)).toBe(true);
  });
  it("is true for a press on another station's TV: from here it is the room", () => {
    expect(goesBack(at(2), { on: "tv", stop: 3, moved: 0 })).toBe(true);
    expect(goesBack(at(2), { on: "tv", stop: 1, moved: 0 })).toBe(true);
  });
  it("is false for a press on this station's own TV (its glass or bezel)", () => {
    for (let s = 1; s <= STATION_COUNT; s++) expect(goesBack(at(s), { on: "tv", stop: s, moved: 0 })).toBe(false);
  });
  it("is false for a press on the desk meter: that click means next", () => {
    expect(goesBack(at(2), { on: "meter", moved: 0 })).toBe(false);
  });
  it("is false for a press that moved more than the drag limit (7 px), true at the limit", () => {
    expect(DRAG_PX).toBe(6);
    expect(goesBack(at(2), { on: "room", moved: 7 })).toBe(false);
    expect(goesBack(at(2), { on: "room", moved: 20 })).toBe(false);
    expect(goesBack(at(2), { on: "room", moved: 6 })).toBe(true);
  });
  it("is false at the overview, whatever is pressed", () => {
    for (const p of [room, { on: "tv", stop: 2, moved: 0 }, { on: "meter", moved: 0 }] as Press[]) expect(goesBack(at(0), p)).toBe(false);
  });
  it("is false in flight, whatever is pressed, either way and at either end", () => {
    for (const f of [0, 0.01, 0.5, 0.99, 1]) for (const [from, to] of [[0, 2], [2, 0], [1, 3]]) {
      for (const p of [room, { on: "tv", stop: 3, moved: 0 }] as Press[]) expect(goesBack({ kind: "flying", from, to, f }, p)).toBe(false);
    }
  });
});
