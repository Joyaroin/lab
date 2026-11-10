import { describe, it, expect } from "vitest";
import { bench, crts } from "./crts";
import { stations } from "./content";

describe("the TV list", () => {
  it("has one entry per station, in tour order: the five station ids", () => {
    expect(crts.map((c) => c.id)).toEqual(["work", "mediasafe", "home-lab", "software-factory", "contact"]);
    expect(crts.map((c) => c.id)).toEqual(stations.map((s) => s.id));
  });
  it("exports the bench TV apart, and it is not in the list", () => {
    expect(bench.id).toBe("bench");
    expect(crts.some((c) => c.id === bench.id || c.screen.join() === bench.screen.join())).toBe(false);
  });
});
