import { describe, it, expect } from "vitest";
import { tourAt, progressFor, STATION_COUNT } from "./tour";
import { stations } from "./content";
import { crts } from "./crts";

const GAP = 9;
const readings = stations.map((s) => s.reading);

describe("tour", () => {
  it("starts at the entrance, showing the gap", () => {
    const t = tourAt(0, GAP);
    expect(t.station).toBe(0);
    expect(t.reading).toBe(GAP);
  });

  it("ends at the last station with its fixed reading", () => {
    const t = tourAt(1, GAP);
    expect(t.station).toBe(STATION_COUNT);
    expect(t.reading).toBe(readings[readings.length - 1]);
  });

  it("clamps positions outside the tour", () => {
    expect(tourAt(-3, GAP)).toEqual(tourAt(0, GAP));
    expect(tourAt(7, GAP)).toEqual(tourAt(1, GAP));
  });

  it("sits exactly on each station when scrolled to it", () => {
    for (let i = 1; i <= STATION_COUNT; i++) {
      const t = tourAt(progressFor(i), GAP);
      expect(t.station).toBe(i);
      expect(t.reading).toBe(readings[i - 1]);
    }
  });

  it("rolls the reading between stations and moves the camera", () => {
    const a = tourAt(progressFor(1), GAP);
    const b = tourAt(progressFor(2), GAP);
    const mid = tourAt((progressFor(1) + progressFor(2)) / 2, GAP);
    expect(mid.reading).toBeGreaterThan(a.reading);
    expect(mid.reading).toBeLessThan(b.reading);
    expect(mid.camera[2]).toBeLessThan(a.camera[2]);
    expect(mid.camera[2]).toBeGreaterThan(b.camera[2]);
  });

  it("rolls from the gap toward the first station", () => {
    const mid = tourAt(progressFor(1) / 2, GAP);
    expect(mid.reading).toBeGreaterThan(GAP);
    expect(mid.reading).toBeLessThan(readings[0]);
  });

  it("scrolling backward retraces the same positions", () => {
    const ps = [0, 0.1, 0.33, 0.5, 0.74, 1];
    const forward = ps.map((p) => tourAt(p, GAP));
    const backward = [...ps].reverse().map((p) => tourAt(p, GAP)).reverse();
    expect(backward).toEqual(forward);
  });

  it("changes the current station at the midpoint between two", () => {
    const p1 = progressFor(1), p2 = progressFor(2);
    expect(tourAt(p1 + (p2 - p1) * 0.4, GAP).station).toBe(1);
    expect(tourAt(p1 + (p2 - p1) * 0.6, GAP).station).toBe(2);
  });
});

describe("station readings", () => {
  it("are not numbers from the series", () => {
    // A few well-known divergence readings, as six-decimal strings.
    const series = ["0.337187", "0.571024", "0.456903", "0.523299", "0.409431", "1.048596", "1.130426"];
    for (const r of readings) expect(series).not.toContain((r / 1e6).toFixed(6));
  });
  it("are distinct, so each station is identifiable", () => {
    expect(new Set(readings).size).toBe(readings.length);
  });
});

describe("camera stops", () => {
  it("face one CRT per station, in tour order", () => {
    expect(crts.map((c) => c.id)).toEqual(stations.map((s) => s.id));
  });
  it("look at each station's CRT from in front of its glass", () => {
    for (const c of crts) {
      const a = (c.yaw * Math.PI) / 180;
      const toCamera = [c.camera[0] - c.screen[0], c.camera[2] - c.screen[2]];
      expect(toCamera[0] * Math.sin(a) + toCamera[1] * Math.cos(a)).toBeGreaterThan(0.5);
    }
  });
});
