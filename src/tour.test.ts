import { describe, it, expect } from "vitest";
import { tourAt } from "./tour";
import { framingFor } from "./framing";
import { progressFor, holdSpan, panelStrength, PANEL_SHOWN, STATION_COUNT } from "./hold";
// travelProgress is test-only (the app never asks where the middle of a travel is), so it lives in
// tests/lib, where the browser specs share it; src already reaches into tests/ for room-mesh and fixtures.
import { travelProgress } from "../tests/lib/travel";
import { stations } from "./content";
import { crts } from "./crts";
import { squareStop } from "./stop";

const GAP = 9;
/** A window of the given aspect and height (16:10 at 800 px unless said), reduced motion off unless said. */
const win = (aspect = 16 / 10, height = 800, reduced = false) => ({ width: aspect * height, height, reduced });
/** The tour as the app draws it: the nearest stop and reading from progress, the camera from the window's framing. */
const view = (p: number, w: { width: number; height: number; reduced?: boolean }) => ({ ...tourAt(p, GAP), ...framingFor(w).cameraAt(p, w.reduced) });
const readings = stations.map((s) => s.reading);

describe("tour", () => {
  it("starts at the entrance, showing the gap", () => {
    const t = view(0, win());
    expect(t.nearestStop).toBe(0);
    expect(t.reading).toBe(GAP);
  });

  it("ends at the last station with its fixed reading", () => {
    const t = view(1, win());
    expect(t.nearestStop).toBe(STATION_COUNT);
    expect(t.reading).toBe(readings[readings.length - 1]);
  });

  it("clamps positions outside the tour", () => {
    expect(view(-3, win())).toEqual(view(0, win()));
    expect(view(7, win())).toEqual(view(1, win()));
  });

  it("sits exactly on each station when scrolled to it", () => {
    for (let i = 1; i <= STATION_COUNT; i++) {
      const t = view(progressFor(i), win());
      expect(t.nearestStop).toBe(i);
      expect(t.reading).toBe(readings[i - 1]);
    }
  });

  it("rolls the reading between stations and moves the camera", () => {
    const a = view(progressFor(1), win());
    const b = view(progressFor(2), win());
    const mid = view((progressFor(1) + progressFor(2)) / 2, win());
    expect(mid.reading).toBeGreaterThan(a.reading);
    expect(mid.reading).toBeLessThan(b.reading);
    expect(mid.camera).not.toEqual(a.camera);
    expect(mid.camera).not.toEqual(b.camera);
  });

  it("rolls from the gap toward the first station", () => {
    const mid = view(progressFor(1) / 2, win());
    expect(mid.reading).toBeGreaterThan(GAP);
    expect(mid.reading).toBeLessThan(readings[0]);
  });

  it("scrolling backward retraces the same positions", () => {
    const ps = [0, 0.1, 0.33, 0.5, 0.74, 1];
    const forward = ps.map((p) => view(p, win()));
    const backward = [...ps].reverse().map((p) => view(p, win())).reverse();
    expect(backward).toEqual(forward);
  });

  it("changes the nearest stop at the midpoint between two", () => {
    const p1 = progressFor(1), p2 = progressFor(2);
    expect(view(p1 + (p2 - p1) * 0.4, win()).nearestStop).toBe(1);
    expect(view(p1 + (p2 - p1) * 0.6, win()).nearestStop).toBe(2);
  });
});

describe("holds", () => {
  const same = (a: number[], b: number[]) => { for (let k = 0; k < 3; k++) expect(a[k]).toBe(b[k]); };
  const inside = (i: number, n = 25) => {
    const [a, b] = holdSpan(i);
    return Array.from({ length: n + 1 }, (_, k) => a + ((b - a) * k) / n);
  };
  for (const aspect of [16 / 9, 390 / 780]) {
    it(`keep the camera, look and reading exactly on the stop at every scroll position in a hold (aspect ${aspect.toFixed(2)})`, () => {
      for (let i = 1; i <= STATION_COUNT; i++) {
        const stop = view(progressFor(i), win(aspect));
        for (const p of inside(i)) {
          const t = view(p, win(aspect));
          same(t.camera, stop.camera);
          same(t.look, stop.look);
          expect(t.reading).toBe(readings[i - 1]);
          expect(t.nearestStop).toBe(i);
        }
      }
    });
  }
  it("sit on the square stop for the window on desktop", () => {
    for (const [w, h] of [[1280, 800], [1920, 1080]])
      for (let i = 1; i <= STATION_COUNT; i++) {
        const t = view(progressFor(i), win(w / h, h)), s = squareStop(crts[i - 1], { width: w, height: h });
        same(t.camera, s.camera);
        same(t.look, s.look);
      }
  });
  it("are in order, do not overlap, and leave travel between them", () => {
    let prevEnd = 0;
    for (let i = 1; i <= STATION_COUNT; i++) {
      const [a, b] = holdSpan(i);
      expect(a).toBeGreaterThan(prevEnd);
      expect(b).toBeGreaterThan(a);
      prevEnd = b;
    }
    expect(prevEnd).toBeCloseTo(1, 9);
  });
  it("end with the camera moving again, and travel back the way it came", () => {
    const [, end] = holdSpan(1);
    const before = view(end, win()), after = view(end + 0.01, win());
    expect(after.camera).not.toEqual(before.camera);
    const [start] = holdSpan(2);
    const back = view(start - 0.01, win());
    expect(back.camera).not.toEqual(view(start, win()).camera);
  });
  it("move the camera and roll the reading throughout travel, with no jumps leaving or entering a hold", () => {
    for (let i = 1; i < STATION_COUNT; i++) {
      const a = holdSpan(i)[1], b = holdSpan(i + 1)[0];
      let prev = view(a, win()), longest = 0;
      for (let k = 1; k <= 100; k++) {
        const t = view(a + ((b - a) * k) / 100, win());
        longest = Math.max(longest, Math.hypot(...(t.camera.map((v, j) => v - prev.camera[j]) as [number, number, number])));
        expect(t.reading).toBeGreaterThanOrEqual(prev.reading);
        prev = t;
      }
      expect(longest).toBeLessThan(0.1);
      expect(prev.reading).toBe(readings[i]);
    }
  });
  it("land the meter and HUD jumps inside the hold, away from either edge", () => {
    for (let i = 1; i <= STATION_COUNT; i++) {
      const [a, b] = holdSpan(i), p = progressFor(i);
      expect(p - a).toBeCloseTo(b - p, 9);
      expect(p).toBeGreaterThan(a);
    }
    expect(progressFor(0)).toBe(0);
  });
  it("show the station's text at full strength for the whole hold, and fade it out in travel", () => {
    for (let i = 1; i <= STATION_COUNT; i++) {
      for (const p of inside(i)) expect(panelStrength(p, i)).toBe(1);
      if (i < STATION_COUNT) expect(panelStrength((holdSpan(i)[1] + holdSpan(i + 1)[0]) / 2, i)).toBe(0);
    }
    expect(panelStrength(0, 1)).toBe(0);
  });
  it("take a comfortable page: travel is about as long as before, and the tour is not much longer", () => {
    // Pages are 9 screens (8 of scrolling): each stretch of travel gets 8 * travel share.
    const travelShare = holdSpan(2)[0] - holdSpan(1)[1];
    expect(travelShare * 8).toBeGreaterThan(0.7);
    expect(travelShare * 8).toBeLessThan(1.1);
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
    const w = win(16 / 9);
    expect(view(progressFor(0), w).camera).toEqual(ENTRANCE.camera);
    expect(view(progressFor(0), w).look).toEqual(ENTRANCE.look);
    for (let i = 1; i <= STATION_COUNT; i++) {
      const stop = squareStop(crts[i - 1], w), t = view(progressFor(i), w);
      expect(t.camera).toEqual(stop.camera);
      expect(t.look).toEqual(stop.look);
    }
  });
  it("pulls back every station but the home lab, whose phone view is approved, and those with a phone stop", () => {
    for (const c of crts) expect(c.portrait > 1, c.id).toBe(c.id !== "home-lab" && !c.phone);
  });
  it("stands further back on a portrait window along the layout's own stop, looking at the same point", () => {
    for (let i = 0; i <= STATION_COUNT; i++) {
      if (i > 0 && crts[i - 1].phone) continue; // reframed on phones instead, below
      const tall = view(progressFor(i), win(390 / 780));
      const cam = i === 0 ? ENTRANCE.camera : crts[i - 1].camera, look = i === 0 ? ENTRANCE.look : crts[i - 1].look;
      for (let k = 0; k < 3; k++) expect(tall.look[k]).toBeCloseTo(look[k], 9);
      const pull = i === 0 ? ENTRANCE.portrait : crts[i - 1].portrait;
      expect(dist(tall.camera, tall.look)).toBeCloseTo(dist(cam, look) * pull, 6);
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
      const tall = view(progressFor(i), win(390 / 780));
      expect(tall.camera).toEqual(phone.camera);
      expect(tall.look).toEqual(phone.look);
    }
  });
  it("do not change the desktop stop: it is the square one", () => {
    for (const id of reframed) {
      const i = crts.findIndex((c) => c.id === id) + 1, c = crts[i - 1];
      const wide = view(progressFor(i), win(1280 / 800)), s = squareStop(c, { width: 1280, height: 800 });
      expect(wide.camera).toEqual(s.camera);
      expect(wide.look).toEqual(s.look);
    }
  });
  it("pin the text at the phone's own point on a portrait window", () => {
    for (const c of crts.filter((c) => c.phone)) expect(framingFor(win(390 / 780)).panelPoint(c), c.id).toEqual(c.phone!.panel);
  });
  it("pin the text at the desktop point on a portrait window for a station with no phone stop", () => {
    const plain = crts.find((c) => !c.phone)!;
    expect(framingFor(win(390 / 780)).panelPoint(plain)).toEqual(plain.panel);
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
import { CAMERA_FOV, DESK_METER, ENTRANCE } from "./crts";

/** Where the desk meter's row of tubes lands in a window of `w` x `h`, seen from tour position `p`. */
function meterOnScreen(p: number, w: number, h: number) {
  const t = view(p, win(w / h));
  const cam = new PerspectiveCamera(CAMERA_FOV, w / h, 0.05, 50);
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
  it("pulls back to the wide view of the room halfway through the travel to the first station", () => {
    const half = view(holdSpan(1)[0] / 2, win());
    for (let k = 0; k < 3; k++) {
      expect(half.camera[k]).toBeCloseTo(ENTRANCE.reveal.camera[k], 6);
      expect(half.look[k]).toBeCloseTo(ENTRANCE.reveal.look[k], 6);
    }
    const m = meterOnScreen(holdSpan(1)[0] / 2, 1280, 800);
    expect(m.right - m.left).toBeLessThan(1280 * 0.15); // the meter is now a small part of the room
  });
  it("moves smoothly from the meter to the first station, with no jumps", () => {
    const steps = 200, end = progressFor(1);
    let prev = view(0, win()).camera, longest = 0;
    for (let i = 1; i <= steps; i++) {
      const c = view((end * i) / steps, win()).camera;
      longest = Math.max(longest, Math.hypot(c[0] - prev[0], c[1] - prev[1], c[2] - prev[2]));
      prev = c;
    }
    expect(longest).toBeLessThan(0.06); // no step of the 200 moves more than 6 cm
  });
});

// --- mouse parallax: a slight sideways shift at every stop, never a zoom (ticket 29 review) ---
import { parallax } from "./tour";
const DESKTOP = 1280 / 800;
const strength = (aspect: number, p: number) => framingFor(win(aspect)).parallaxStrength(p);

/** The meter on screen at the entrance, with the pointer at (`x`, `y`). */
function meterWithPointer(x: number, y: number, w: number, h: number) {
  const t = view(0, win(w / h));
  const o = parallax(t.camera, t.look, { x, y });
  const cam = new PerspectiveCamera(CAMERA_FOV, w / h, 0.05, 50);
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
      const t = view(progressFor(i), win());
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

describe("parallax near a stop", () => {
  it("stays full on a portrait window, even inside a hold", () => {
    expect(strength(390 / 780, progressFor(1))).toBe(1);
    expect(strength(DESKTOP, progressFor(1))).toBe(0);
  });
  it("is gone for the whole of every hold", () => {
    for (let i = 1; i <= STATION_COUNT; i++) {
      const [a, b] = holdSpan(i);
      for (let k = 0; k <= 20; k++) expect(strength(DESKTOP, a + ((b - a) * k) / 20), `stop ${i}`).toBe(0);
    }
  });
  it("is full at the entrance and halfway through every travel", () => {
    expect(strength(DESKTOP, 0)).toBe(1);
    for (let i = 1; i < STATION_COUNT; i++) expect(strength(DESKTOP, (holdSpan(i)[1] + holdSpan(i + 1)[0]) / 2)).toBe(1);
  });
  it("fades in between, without a jump, as the camera leaves a stop", () => {
    const [, end] = holdSpan(1);
    let prev = 0;
    for (let k = 1; k <= 100; k++) {
      const s = strength(DESKTOP, end + (k / 200) * (holdSpan(2)[0] - end));
      expect(s).toBeGreaterThanOrEqual(prev);
      expect(s - prev).toBeLessThan(0.1);
      prev = s;
    }
    expect(strength(DESKTOP, end + 0.03)).toBeGreaterThan(0);
    expect(strength(DESKTOP, end + 0.03)).toBeLessThan(1);
  });
  it("starts only once the text has faded away, so flat text never sits over tilting glass", () => {
    for (let i = 1; i < STATION_COUNT; i++) {
      const [, end] = holdSpan(i), [start] = holdSpan(i + 1);
      for (let k = 0; k <= 400; k++) {
        const p = end + ((start - end) * k) / 400; // leaving station i, and arriving at i + 1
        const leaving = panelStrength(p, i) >= PANEL_SHOWN, arriving = panelStrength(p, i + 1) >= PANEL_SHOWN;
        if (leaving || arriving) expect(strength(DESKTOP, p), `p=${p}`).toBe(0);
      }
    }
  });
});

describe("parallax strength", () => {
  it("scales the shift, and at zero gives none", () => {
    const t = view(progressFor(1), win());
    expect(parallax(t.camera, t.look, { x: 1, y: 1 }, 0).map(Math.abs)).toEqual([0, 0, 0]);
    const full = parallax(t.camera, t.look, { x: 1, y: 1 }), half = parallax(t.camera, t.look, { x: 1, y: 1 }, 0.5);
    for (let k = 0; k < 3; k++) expect(half[k]).toBeCloseTo(full[k] / 2, 12);
  });
});

// --- arcs between stations: the camera pulls back through the room on one curve (ticket 51) ---
import { ARCS, glassCorners } from "./crts";
import { nearestSurface } from "../tests/lib/room-mesh";
type V3 = [number, number, number];

// The camera must stay CLEAR metres from every surface in the baked room. The room's camera uses the
// default near plane of 0.1 m (react-three-fiber's), so a closer surface would be clipped. 0.15 is the
// highest value that passes today: it pins the camera's closest approach to the room's props, and
// leaves no headroom on purpose, so an arc or stop that moves nearer to a surface fails here. The
// surfaces are the room's real triangles, read from the committed room.glb, so there is no second list of props to keep in step with tools/room/build.py: add a
// prop near an arc, re-bake, and this fails if the camera would pass through it.
const CLEAR = 0.15;
const ROOM = { min: [-1.9, 0, -1.9], max: [1.9, 2.5, 1.9] };

/** Why the camera at `c` is in the way of something, or null. */
const blockedAt = (c: V3) => (nearestSurface(c, CLEAR) < Infinity ? `a surface within ${CLEAR} m` : null);

describe("the room mesh used for clearance", () => {
  it("sees solid things: a point just in front of a CRT's glass is close to it, and the middle of the room is clear", () => {
    const c = crts[0], a = (c.yaw * Math.PI) / 180;
    const front: V3 = [c.screen[0] + Math.sin(a) * 0.05, c.screen[1], c.screen[2] + Math.cos(a) * 0.05];
    expect(nearestSurface(front, 0.3)).toBeLessThan(0.07);
    expect(blockedAt([-0.5, 1.7, 0.2])).toBeNull();
  });
  it("sees the props the old hand-written boxes stood for: some point inside each is within reach of a surface", () => {
    const regions: [string, number[], number[]][] = [
      ["back desk", [-1.9, 0, -1.9], [0.62, 1.0, -1.15]], ["left desk", [-1.9, 0, -1.15], [-1.15, 1.0, 0.32]],
      ["bench", [1.2, 0, -0.92], [1.9, 1.17, 0.62]], ["parts shelf", [1.32, 0, 0.95], [1.9, 2.15, 1.85]],
      ["rack", [1.2, 0, -1.85], [1.7, 1.05, -1.4]], ["chair", [-0.4, 0, 0.05], [0.2, 1.18, 0.65]],
    ];
    for (const [name, lo, hi] of regions) {
      let hits = 0;
      for (let x = 0; x <= 4; x++) for (let y = 0; y <= 4; y++) for (let z = 0; z <= 4; z++)
        if (blockedAt([0, 1, 2].map((k) => lo[k] + ((hi[k] - lo[k]) * [x, y, z][k]) / 4) as V3)) hits++;
      expect(hits, name).toBeGreaterThan(5);
    }
    for (const w of [[1.88, 1.0, 0], [0, 1, -1.92], [-1.88, 1.2, 0.5], [0.3, 0.02, 0.3], [0.3, 2.45, 0.3]] as V3[]) expect(blockedAt(w), `wall at ${w}`).not.toBeNull();
  });
});

describe("arcs between stations", () => {
  const legs = Array.from({ length: STATION_COUNT - 1 }, (_, k) => k + 1);
  const half = (i: number) => (holdSpan(i)[1] + holdSpan(i + 1)[0]) / 2;
  const sweep = (i: number, aspect: number, fn: (t: ReturnType<typeof view>) => void, n = 300) => {
    const a = holdSpan(i)[1], b = holdSpan(i + 1)[0];
    for (let k = 0; k <= n; k++) fn(view(a + ((b - a) * k) / n, win(aspect)));
  };

  it("has one wide view for each leg between stations", () => {
    expect(ARCS.length).toBe(STATION_COUNT - 1);
  });
  it("shows a wide view of the room at the midpoint of every leg", () => {
    for (const i of legs) {
      const t = view(half(i), win());
      for (let k = 0; k < 3; k++) {
        expect(t.camera[k], `leg ${i}`).toBeCloseTo(ARCS[i - 1].camera[k], 6);
        expect(t.look[k], `leg ${i}`).toBeCloseTo(ARCS[i - 1].look[k], 6);
      }
      // wide: well back from what it looks at, and both TVs of the leg small in frame
      expect(Math.hypot(...(t.look.map((v, k) => v - t.camera[k]) as number[])), `leg ${i}`).toBeGreaterThan(2);
      for (const crt of [crts[i - 1], crts[i]]) {
        const cam = new PerspectiveCamera(CAMERA_FOV, 16 / 10, 0.05, 50);
        cam.position.set(...t.camera); cam.lookAt(...t.look); cam.updateMatrixWorld();
        const [l, r] = glassCorners(crt).filter((_, k) => k % 2 === 0).map((c) => new Vector3(...c).project(cam)); // the glass's left and right edges
        expect(Math.max(l.z, r.z), `${crt.id} is in front of the camera on leg ${i}`).toBeLessThan(1);
        expect(Math.abs(r.x - l.x) * 640, `${crt.id} on leg ${i}`).toBeLessThan(1280 * 0.21);
      }
    }
  });
  for (const aspect of [16 / 10, 390 / 780]) {
    it(`never takes the camera through a wall or prop, on any leg (aspect ${aspect.toFixed(2)})`, () => {
      // The room's real surfaces, the whole way along every leg and at both window shapes, with no
      // exemptions: the stops themselves are held to it too.
      for (const i of legs) sweep(i, aspect, (t) => {
        expect(blockedAt(t.camera), `leg ${i} at ${t.camera.map((v) => v.toFixed(2))}`).toBeNull();
      });
    });
  }
  it("keeps the look point inside the room, so the view is never of the void", () => {
    for (const i of legs) sweep(i, 16 / 10, (t) => { for (let k = 0; k < 3; k++) { expect(t.look[k]).toBeGreaterThan(ROOM.min[k]); expect(t.look[k]).toBeLessThan(ROOM.max[k]); } });
  });
  it("is one smooth curve: no jumps, and no sharp turn in the camera's direction", () => {
    for (const i of legs) {
      let prev: number[] | null = null, prevDir: number[] | null = null;
      sweep(i, 16 / 10, (t) => {
        if (prev) {
          const d = t.camera.map((v, k) => v - prev![k]), len = Math.hypot(...d);
          expect(len, `leg ${i}`).toBeLessThan(0.05);
          if (prevDir && len > 1e-9) expect(d.reduce((s, v, k) => s + v * prevDir![k], 0) / len, `leg ${i}`).toBeGreaterThan(0.9);
          if (len > 1e-9) prevDir = d.map((v) => v / len);
        }
        prev = t.camera;
      });
    }
  });
  it("arrives square to the glass for the hold, and leaves from the same stop", () => {
    for (const i of legs) {
      const arrive = view(holdSpan(i + 1)[0], win()), s = squareStop(crts[i], { width: 1280, height: 800 });
      for (let k = 0; k < 3; k++) { expect(arrive.camera[k]).toBeCloseTo(s.camera[k], 9); expect(arrive.look[k]).toBeCloseTo(s.look[k], 9); }
      const a = (crts[i].yaw * Math.PI) / 180, fwd = [-Math.sin(a), 0, -Math.cos(a)];
      const to = arrive.look.map((v, k) => v - arrive.camera[k]);
      expect(to[0] * fwd[0] + to[2] * fwd[2]).toBeCloseTo(Math.hypot(...to), 9); // looking straight at the glass
    }
  });
});

describe("reduced motion", () => {
  const on = (p: number, aspect = 16 / 9, h = 800) => view(p, win(aspect, h, true));
  for (const aspect of [16 / 9, 390 / 780]) {
    it(`travels in a straight line between every pair of stops (aspect ${aspect.toFixed(2)})`, () => {
      for (let i = 1; i < STATION_COUNT; i++) {
        const b = progressFor(i + 1);
        const from = on(holdSpan(i)[1], aspect), to = on(b, aspect);
        const [s, e] = [holdSpan(i)[1], holdSpan(i + 1)[0]];
        for (let k = 1; k < 10; k++) {
          const f = k / 10, t = on(s + (e - s) * f, aspect);
          for (let c = 0; c < 3; c++) {
            expect(t.camera[c]).toBeCloseTo(from.camera[c] + (to.camera[c] - from.camera[c]) * f, 6);
            expect(t.look[c]).toBeCloseTo(from.look[c] + (to.look[c] - from.look[c]) * f, 6);
          }
        }
      }
    });
  }
  it("keeps the entrance leg's curve", () => {
    for (const aspect of [16 / 9, 390 / 780]) {
      for (let k = 0; k <= 10; k++) {
        const p = holdSpan(1)[0] * (k / 10);
        expect(on(p, aspect)).toEqual(view(p, win(aspect)));
      }
    }
  });
  it("still ends square on each TV, exactly as without it", () => {
    for (let i = 1; i <= STATION_COUNT; i++) {
      const p = progressFor(i);
      expect(on(p, 1280 / 800)).toEqual(view(p, win(1280 / 800)));
    }
  });
  it("differs from the arcs mid-travel, which are unchanged by default", () => {
    const p = (holdSpan(1)[1] + holdSpan(2)[0]) / 2;
    expect(on(p).camera).not.toEqual(view(p, win()).camera);
    const { reduced: _left, ...without } = win(16 / 9); // a window with no `reduced` at all
    expect(view(p, without)).toEqual(view(p, win(16 / 9)));
  });
});

describe("travelProgress", () => {
  it("runs from the end of the previous hold to the start of this one", () => {
    for (let i = 2; i <= STATION_COUNT; i++) {
      expect(travelProgress(i, 0)).toBeCloseTo(holdSpan(i - 1)[1], 12);
      expect(travelProgress(i, 1)).toBeCloseTo(holdSpan(i)[0], 12);
    }
    expect(travelProgress(1, 0)).toBeCloseTo(0, 12);
  });
});
