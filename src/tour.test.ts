import { describe, it, expect } from "vitest";
import { parallax, readingAt } from "./tour";
import { framingFor } from "./framing";
import { stations } from "./content";
import { STATION_COUNT } from "./hold";

const GAP = 9;

describe("readingAt", () => {
  const r = (i: number) => (i === 0 ? GAP : stations[i - 1].reading);
  it("is the gap at the overview and the station's reading at a station", () => {
    expect(readingAt({ kind: "at", stop: 0 }, GAP)).toBe(GAP);
    for (let i = 1; i <= STATION_COUNT; i++) expect(readingAt({ kind: "at", stop: i }, GAP)).toBe(r(i));
  });
  it("rolls between the two stops' readings over a flight", () => {
    expect(readingAt({ kind: "flying", from: 0, to: 1, f: 0.5 }, GAP)).toBeCloseTo((GAP + r(1)) / 2);
    expect(readingAt({ kind: "flying", from: 2, to: 3, f: 0.25 }, GAP)).toBeCloseTo(r(2) + (r(3) - r(2)) * 0.25);
  });
  it("is the end stop's reading at the end of a flight and the start stop's at its start", () => {
    expect(readingAt({ kind: "flying", from: 1, to: 2, f: 0 }, GAP)).toBe(r(1));
    expect(readingAt({ kind: "flying", from: 1, to: 2, f: 1 }, GAP)).toBe(r(2));
  });
});

// --- mouse parallax: a slight sideways shift at every stop, never a zoom (ticket 29 review) ---
describe("mouse parallax", () => {
  const pointers = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]];
  const pose = (i: number) => framingFor({ width: 1280, height: 800 }).cameraAt({ kind: "at", stop: i });
  it("is a small sideways shift at every stop, in proportion to the distance to the look point", () => {
    const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const len = (a: number[]) => Math.hypot(a[0], a[1], a[2]);
    for (let i = 0; i <= STATION_COUNT; i++) {
      const t = pose(i);
      const d = len(sub(t.look, t.camera));
      for (const [x, y] of pointers) {
        const o = parallax(t.camera, t.look, { x, y });
        const toLook = sub(t.look, t.camera);
        // across the view, not along it: the distance to the look point barely changes
        expect(Math.abs(o[0] * toLook[0] + o[1] * toLook[1] + o[2] * toLook[2]) / d, `stop ${i}`).toBeLessThan(1e-9);
        // slight, but enough to notice: a small share of the distance
        expect(len(o) / d, `stop ${i}`).toBeLessThan(0.15);
        expect(len(o) / d, `stop ${i}`).toBeGreaterThan(0.03);
      }
    }
  });
  it("scales the shift with its strength, and at zero gives none", () => {
    const t = pose(1);
    expect(parallax(t.camera, t.look, { x: 1, y: 1 }, 0).map(Math.abs)).toEqual([0, 0, 0]);
    const full = parallax(t.camera, t.look, { x: 1, y: 1 }), half = parallax(t.camera, t.look, { x: 1, y: 1 }, 0.5);
    for (let k = 0; k < 3; k++) expect(half[k]).toBeCloseTo(full[k] / 2, 12);
  });
});
