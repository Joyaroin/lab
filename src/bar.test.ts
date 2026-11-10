import { describe, it, expect } from "vitest";
import { barFor } from "./bar";
import { STATION_COUNT } from "./hold";
import type { Where } from "./where";

const at = (stop: number): Where => ({ kind: "at", stop });
const flying = (from: number, to: number, f = 0.5): Where => ({ kind: "flying", from, to, f });

describe("the bar's keys and stop", () => {
  it("at the overview shows START alone, on either framing", () => {
    for (const framing of ["square", "portrait"] as const) expect(barFor(at(0), framing)).toEqual({ keys: ["start"], stop: 0 });
  });

  it("at a station on a landscape window shows PREV, ROOM, NEXT, for that station", () => {
    for (let i = 1; i <= STATION_COUNT; i++) expect(barFor(at(i), "square")).toEqual({ keys: ["prev", "room", "next"], stop: i });
  });

  it("at a station on a portrait window shows PREV and NEXT, for that station", () => {
    for (let i = 1; i <= STATION_COUNT; i++) expect(barFor(at(i), "portrait")).toEqual({ keys: ["prev", "next"], stop: i });
  });

  it("in a flight is everything of the stop being flown to, at any share of it", () => {
    for (const f of [0, 0.3, 0.5, 0.99]) {
      expect(barFor(flying(0, 2, f), "square")).toEqual({ keys: ["prev", "room", "next"], stop: 2 });
      expect(barFor(flying(3, 2, f), "portrait")).toEqual({ keys: ["prev", "next"], stop: 2 });
      expect(barFor(flying(2, 0, f), "square")).toEqual({ keys: ["start"], stop: 0 });
      expect(barFor(flying(STATION_COUNT, 0, f), "portrait")).toEqual({ keys: ["start"], stop: 0 });
    }
  });
});
