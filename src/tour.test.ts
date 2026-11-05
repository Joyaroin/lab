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
  it("pulls back every station but the home lab, whose phone view is approved, and those with a phone stop", () => {
    for (const c of crts) expect(c.portrait > 1, c.id).toBe(c.id !== "home-lab" && !c.phone);
  });
  it("stands further back on a portrait window, still looking at the same point", () => {
    for (let i = 0; i <= STATION_COUNT; i++) {
      if (i > 0 && crts[i - 1].phone) continue; // reframed on phones instead, below
      const wide = tourAt(progressFor(i), GAP), tall = tourAt(progressFor(i), GAP, 390 / 780);
      for (let k = 0; k < 3; k++) expect(tall.look[k]).toBeCloseTo(wide.look[k], 9);
      const pull = i === 0 ? ENTRANCE.portrait : crts[i - 1].portrait;
      expect(dist(tall.camera, tall.look)).toBeCloseTo(dist(wide.camera, wide.look) * pull, 6);
    }
  });
});

// --- phone stops: MediaSafe and WC2026 are reframed on phones so lit parts of the room show (ticket 36) ---
describe("phone stops", () => {
  const reframed = ["mediasafe", "wc2026-predictor"];
  it("reframe MediaSafe and WC2026 Predictor, and only those", () => {
    expect(crts.filter((c) => c.phone).map((c) => c.id)).toEqual(reframed);
  });
  it("are used on a portrait window, camera and look point both", () => {
    for (const id of reframed) {
      const i = crts.findIndex((c) => c.id === id) + 1, phone = crts[i - 1].phone!;
      const tall = tourAt(progressFor(i), GAP, 390 / 780);
      expect(tall.camera).toEqual(phone.camera);
      expect(tall.look).toEqual(phone.look);
    }
  });
  it("leave the desktop stop alone", () => {
    for (const id of reframed) {
      const i = crts.findIndex((c) => c.id === id) + 1, c = crts[i - 1];
      const wide = tourAt(progressFor(i), GAP, 1280 / 800);
      expect(wide.camera).toEqual(c.camera);
      expect(wide.look).toEqual(c.look);
    }
  });
  it("still see the station's CRT from in front of its glass", () => {
    for (const c of crts.filter((c) => c.phone)) {
      const a = (c.yaw * Math.PI) / 180, cam = c.phone!.camera;
      expect((cam[0] - c.screen[0]) * Math.sin(a) + (cam[2] - c.screen[2]) * Math.cos(a), c.id).toBeGreaterThan(0.5);
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

// --- mouse parallax: a slight sideways shift at every stop, never a zoom (ticket 29 review) ---
import { parallax } from "./tour";

/** The meter on screen at the entrance, with the pointer at (`x`, `y`). */
function meterWithPointer(x: number, y: number, w: number, h: number) {
  const t = tourAt(0, GAP, w / h);
  const o = parallax(t.camera, t.look, { x, y });
  const cam = new PerspectiveCamera(55, w / h, 0.05, 50);
  cam.position.set(t.camera[0] + o[0], t.camera[1] + o[1], t.camera[2] + o[2]);
  cam.lookAt(...t.look);
  cam.updateMatrixWorld();
  const pts = DESK_METER.tubeEnds().map((v) => {
    const q = new Vector3(...v).project(cam);
    return { x: (q.x * 0.5 + 0.5) * w, y: (-q.y * 0.5 + 0.5) * h };
  });
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys), width: Math.max(...xs) - Math.min(...xs) };
}

describe("mouse parallax", () => {
  const pointers = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]];
  for (const [w, h] of [[1280, 800], [390, 780]]) {
    it(`keeps the entrance meter the same size and fully in frame at ${w}x${h}`, () => {
      const centre = meterWithPointer(0, 0, w, h);
      for (const [x, y] of pointers) {
        const m = meterWithPointer(x, y, w, h);
        expect(m.width / centre.width, `width at ${x},${y}`).toBeGreaterThan(0.95);
        expect(m.width / centre.width, `width at ${x},${y}`).toBeLessThan(1.05);
        expect(m.left, `left at ${x},${y}`).toBeGreaterThan(8);
        expect(m.right, `right at ${x},${y}`).toBeLessThan(w - 8);
        expect(m.top, `top at ${x},${y}`).toBeGreaterThan(8);
        expect(m.bottom, `bottom at ${x},${y}`).toBeLessThan(h - 8);
      }
    });
  }
  it("is a small sideways shift at every stop, in proportion to the distance to the look point", () => {
    const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const len = (a: number[]) => Math.hypot(a[0], a[1], a[2]);
    for (let i = 0; i <= STATION_COUNT; i++) {
      const t = tourAt(progressFor(i), GAP);
      const d = len(sub(t.look, t.camera));
      for (const [x, y] of pointers.slice(1)) {
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
});
