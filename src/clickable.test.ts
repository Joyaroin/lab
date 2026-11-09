import { describe, it, expect } from "vitest";
import { clickable } from "./clickable";
import { STATION_COUNT } from "./hold";

describe("clickable", () => {
  it("is true at the overview", () => expect(clickable({ kind: "at", stop: 0 })).toBe(true));
  it("is false at every station", () => {
    for (let s = 1; s <= STATION_COUNT; s++) expect(clickable({ kind: "at", stop: s })).toBe(false);
  });
  it("is false in flight, including either end of one", () => {
    for (const f of [0, 0.01, 0.5, 0.99, 1]) {
      expect(clickable({ kind: "flying", from: 0, to: 2, f })).toBe(false);
      expect(clickable({ kind: "flying", from: 2, to: 0, f })).toBe(false);
    }
  });
});
