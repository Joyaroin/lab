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

describe("portrait framing", () => {
  const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  it("leaves landscape windows on the approved stops", () => {
    for (let i = 0; i <= STATION_COUNT; i++)
      expect(tourAt(progressFor(i), GAP, 16 / 9)).toEqual(tourAt(progressFor(i), GAP));
  });
  it("pulls back every station but the home lab, whose phone view is approved", () => {
    for (const c of crts) expect(c.portrait > 1, c.id).toBe(c.id !== "home-lab");
  });
  it("stands further back on a portrait window, still looking at the same point", () => {
    for (let i = 0; i <= STATION_COUNT; i++) {
      const wide = tourAt(progressFor(i), GAP), tall = tourAt(progressFor(i), GAP, 390 / 780);
      expect(tall.look).toEqual(wide.look);
      const pull = i === 0 ? ENTRANCE.portrait : crts[i - 1].portrait;
      expect(dist(tall.camera, tall.look)).toBeCloseTo(dist(wide.camera, wide.look) * pull, 6);
    }
  });
});

// --- the entrance: the desk meter first, then a pull back to reveal the room (ticket 29) ---
import { PerspectiveCamera, Vector3 } from "three";
import { DESK_METER, ENTRANCE } from "./crts";

/** Where the desk meter's row of tubes lands in a window of `w` x `h`, seen from tour position `p`. */
function meterOnScreen(p: number, w: number, h: number) {
  const t = tourAt(p, GAP, w / h);
  const cam = new PerspectiveCamera(55, w / h, 0.05, 50);
  cam.position.set(...t.camera);
  cam.lookAt(...t.look);
  cam.updateMatrixWorld();
  const pts = DESK_METER.tubeEnds().map((v) => {
    const q = new Vector3(...v).project(cam);
    return { x: (q.x * 0.5 + 0.5) * w, y: (-q.y * 0.5 + 0.5) * h };
  });
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

describe("entrance framing", () => {
  it("fills the middle of a desktop window with the meter's tubes", () => {
    const m = meterOnScreen(0, 1280, 800);
    expect(m.right - m.left).toBeGreaterThan(1280 * 0.4);
    expect(m.bottom - m.top).toBeGreaterThan(60); // each tube's digit is big, not 14 px
    expect(m.left).toBeGreaterThan(1280 * 0.1);
    expect(m.right).toBeLessThan(1280 * 0.9);
    expect(m.top).toBeGreaterThan(800 * 0.15);
    expect(m.bottom).toBeLessThan(800 * 0.75); // clear of the label bar at the bottom
  });
  it("shows the whole meter, large, on a portrait phone", () => {
    const m = meterOnScreen(0, 390, 780);
    expect(m.right - m.left).toBeGreaterThan(390 * 0.5);
    expect(m.left).toBeGreaterThan(8);
    expect(m.right).toBeLessThan(390 - 8);
  });
  it("pulls back to the wide view of the room halfway to the first station", () => {
    const half = tourAt(progressFor(1) / 2, GAP);
    for (let k = 0; k < 3; k++) {
      expect(half.camera[k]).toBeCloseTo(ENTRANCE.reveal.camera[k], 6);
      expect(half.look[k]).toBeCloseTo(ENTRANCE.reveal.look[k], 6);
    }
    const m = meterOnScreen(progressFor(1) / 2, 1280, 800);
    expect(m.right - m.left).toBeLessThan(1280 * 0.15); // the meter is now a small part of the room
  });
  it("moves smoothly from the meter to the first station, with no jumps", () => {
    const steps = 200, end = progressFor(1);
    let prev = tourAt(0, GAP).camera, longest = 0;
    for (let i = 1; i <= steps; i++) {
      const c = tourAt((end * i) / steps, GAP).camera;
      longest = Math.max(longest, Math.hypot(c[0] - prev[0], c[1] - prev[1], c[2] - prev[2]));
      prev = c;
    }
    expect(longest).toBeLessThan(0.05); // no step of the 200 moves more than 5 cm
  });
});
