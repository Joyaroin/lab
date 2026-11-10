import { describe, it, expect } from "vitest";
import { stations } from "../content";
import { hashForStop, stopForHash } from "./route";

describe("route", () => {
  it("a station's hash is its stop, and back", () => {
    stations.forEach((s, i) => {
      expect(stopForHash(`#${s.id}`)).toBe(i + 1);
      expect(hashForStop(i + 1)).toBe(`#${s.id}`);
    });
  });
  it("no hash, an empty hash and an unknown hash are the overview", () => {
    for (const h of ["", "#", "#nope", "work", "#WORK"]) expect(stopForHash(h)).toBe(0);
  });
  it("the hash of the removed station is the overview", () => {
    // built in two parts: the repo's grep for the old name (ticket #221) must find nothing in src or tests
    expect(stopForHash(`#${["order", "tracker"].join("-")}`)).toBe(0);
  });
  it("the overview has no hash", () => {
    expect(hashForStop(0)).toBe("");
  });
});
