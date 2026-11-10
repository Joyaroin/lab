import { describe, it, expect } from "vitest";
import { noteStyleFor } from "./notes";
import { stations } from "./content";

describe("sticky notes", () => {
  it("Software factory keeps its colour and tilt, and so does Contact", () => {
    expect(noteStyleFor("software-factory")).toEqual({ colour: "#f7c68b", tilt: 0.06 });
    expect(noteStyleFor("contact")).toEqual({ colour: "#d3b8f0", tilt: -0.01 });
  });
  it("every station has its own colour and its own tilt", () => {
    const styles = stations.map((s) => noteStyleFor(s.id));
    expect(new Set(styles.map((n) => n.colour)).size).toBe(stations.length);
    expect(new Set(styles.map((n) => n.tilt)).size).toBe(stations.length);
  });
});
