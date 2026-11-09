import { describe, it, expect } from "vitest";
import { CAMERA_FOV, crts, glassCorners, OVERVIEW } from "../crts";
import { framingFor } from "../framing";
import { nearestSurface } from "../../tests/lib/room-mesh";
import { flightFov, flightPose, HUB, type Pose } from "./flight";

type V3 = [number, number, number];
const CLEAR = 0.15, GLASS_CLEAR = 0.6, SAMPLES = 40;
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Where a point lands in a frame of this aspect, -1..1 each way, by the camera's own projection
 *  (vertical field the pose's fov, or CAMERA_FOV, looking at `look` with world up). Null if it is behind the camera. */
function project(pose: Pose, p: V3, aspect: number): [number, number] | null {
  const f = norm(sub(pose.look, pose.camera)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f), d = sub(p, pose.camera), z = dot(d, f), TAN = Math.tan(((pose.fov ?? CAMERA_FOV) * Math.PI) / 360);
  return z <= 0 ? null : [dot(d, r) / z / (TAN * aspect), dot(d, u) / z / TAN];
}

describe("the overview", () => {
  for (const [name, aspect] of [["16:9", 16 / 9], ["16:10", 16 / 10]] as const)
    it(`has every TV's glass corners inside a ${name} frame`, () => {
      for (const crt of crts) for (const c of glassCorners(crt)) {
        const q = project(OVERVIEW, c, aspect);
        expect(q, `${crt.id} is behind the camera`).not.toBeNull();
        expect(Math.abs(q![0]), `${crt.id} across`).toBeLessThanOrEqual(1);
        expect(Math.abs(q![1]), `${crt.id} up`).toBeLessThanOrEqual(1);
      }
    });
  it("has its own field of view, wider than the stations' and no more than 75 degrees", () => {
    expect(OVERVIEW.fov).toBeGreaterThan(CAMERA_FOV);
    expect(OVERVIEW.fov).toBeLessThanOrEqual(75);
  });
  it("is in front of every TV's glass in the in-frame set, as each station's stop is", () => {
    for (const crt of crts) {
      const a = (crt.yaw * Math.PI) / 180;
      const d = sub(OVERVIEW.camera, crt.screen);
      expect(d[0] * Math.sin(a) + d[2] * Math.cos(a), crt.id).toBeGreaterThan(0.5);
    }
  });
  it("has the camera inside the room", () => {
    const [x, y, z] = OVERVIEW.camera;
    expect(Math.abs(x)).toBeLessThan(1.9);
    expect(Math.abs(z)).toBeLessThan(1.9);
    expect(y).toBeLessThan(2.5);
  });
  it("has the camera clear of the room's surfaces, both poses", () => {
    expect(nearestSurface(OVERVIEW.camera, CLEAR)).toBe(Infinity);
    expect(nearestSurface(OVERVIEW.portrait.camera, CLEAR)).toBe(Infinity);
  });
});

describe("flightPose", () => {
  const a: Pose = { camera: [0, 1, 0], look: [0, 1, -1] }, b: Pose = { camera: [1, 1.2, -1], look: [1, 1.2, -2] };
  it("starts exactly on `from` and ends exactly on `to`", () => {
    expect(flightPose(a, b, 0)).toEqual({ ...a, fov: CAMERA_FOV });
    expect(flightPose(a, b, 1)).toEqual({ ...b, fov: CAMERA_FOV });
  });
  it("eases the field of view between the two poses' own: exact at both ends, continuous, never outside the two", () => {
    const wide: Pose = { ...a, fov: OVERVIEW.fov };
    for (const [from, to] of [[wide, b], [b, wide]] as const) {
      expect(flightPose(from, to, 0).fov).toBe(from.fov ?? CAMERA_FOV);
      expect(flightPose(from, to, 1).fov).toBe(to.fov ?? CAMERA_FOV);
      const v = Array.from({ length: SAMPLES + 1 }, (_, i) => flightFov(from, to, i / SAMPLES));
      const lo = Math.min(CAMERA_FOV, OVERVIEW.fov), hi = Math.max(CAMERA_FOV, OVERVIEW.fov);
      for (const x of v) { expect(x).toBeGreaterThanOrEqual(lo); expect(x).toBeLessThanOrEqual(hi); }
      const steps = v.slice(1).map((x, i) => Math.abs(x - v[i]));
      expect(Math.max(...steps)).toBeLessThan(0.1 * (hi - lo));
      expect(flightFov(from, to, 1e-9)).toBeCloseTo(from.fov ?? CAMERA_FOV, 6);
      expect(flightFov(from, to, 1 - 1e-9)).toBeCloseTo(to.fov ?? CAMERA_FOV, 6);
    }
  });
  it("keeps CAMERA_FOV between two station poses", () => {
    expect(flightPose(a, b, 0.5).fov).toBe(CAMERA_FOV);
  });
  it("moves smoothly: no step between neighbouring samples is more than a few times the average", () => {
    const pts = Array.from({ length: SAMPLES + 1 }, (_, i) => flightPose(a, b, i / SAMPLES).camera);
    const steps = pts.slice(1).map((p, i) => Math.hypot(...sub(p, pts[i])));
    expect(Math.max(...steps)).toBeLessThan(3 * (steps.reduce((x, y) => x + y) / steps.length));
  });
});

// The stops the app really flies between: Square at two window sizes, Portrait, and both overviews.
const lists: [string, Pose[]][] = [
  ["square 1280x800", framingFor({ width: 1280, height: 800 }).stops],
  ["square 1920x1080", framingFor({ width: 1920, height: 1080 }).stops],
  ["portrait", framingFor({ width: 390, height: 844 }).stops],
];
const glass = crts.map((c) => c.screen);

/** The first problem along a flight, or null: too close to a surface, or closer to any station's glass than 0.6 m or than the flight's start or end is. The stations a flight starts or ends at are no exception: it may not swing closer to them than it begins or ends. */
function problem(from: Pose, to: Pose): string | null {
  const dist = (p: V3, i: number) => Math.hypot(...sub(p, glass[i]));
  const limit = glass.map((_, i) => Math.min(GLASS_CLEAR, dist(from.camera, i), dist(to.camera, i)));
  for (let s = 0; s <= SAMPLES; s++) {
    const f = s / SAMPLES, { camera } = flightPose(from, to, f);
    if (nearestSurface(camera, CLEAR) < Infinity) return `a surface within ${CLEAR} m at f=${f.toFixed(2)} (${camera.map((v) => v.toFixed(2))})`;
    for (let i = 0; i < glass.length; i++)
      if (dist(camera, i) < limit[i] - 1e-9) return `${dist(camera, i).toFixed(2)} m from station ${i + 1}'s glass at f=${f.toFixed(2)}`;
  }
  return null;
}

describe("every flight between the stops", () => {
  it("stays 0.15 m from surfaces and passes no other station, in both directions", () => {
    const failures: string[] = [];
    for (const [name, list] of lists)
      for (let i = 0; i < list.length; i++) for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        const p = problem(list[i], list[j]);
        if (p) failures.push(`${name}: ${i} to ${j}: ${p}`);
      }
    expect(failures).toEqual([]);
  });
  it("stays clear between the two overview poses, such as a window turned mid-visit", () => {
    const [land, port] = [lists[0][1][0], lists[2][1][0]];
    expect(problem(land, port)).toBeNull();
    expect(problem(port, land)).toBeNull();
  });
  it("stays clear for a re-target: a new flight from halfway along another", () => {
    const failures: string[] = [];
    for (const [name, list] of lists)
      for (let i = 0; i < list.length; i++) for (let j = 0; j < list.length; j++) for (let k = 0; k < list.length; k++) {
        if (i === j || j === k) continue;
        // The camera's place at f = 0.5 is where the new flight starts; the start-distance allowance covers any station it is near.
        const p = problem(flightPose(list[i], list[j], 0.5), list[k]);
        if (p) failures.push(`${name}: ${i} to ${j} then ${k}: ${p}`);
      }
    expect(failures).toEqual([]);
  });
});

describe("the room mesh used for clearance", () => {
  const blockedAt = (c: V3) => nearestSurface(c, CLEAR) < Infinity;
  it("sees solid things: a point just in front of a CRT's glass is close to it, and the middle of the room is clear", () => {
    const c = crts[0], a = (c.yaw * Math.PI) / 180;
    const front: V3 = [c.screen[0] + Math.sin(a) * 0.05, c.screen[1], c.screen[2] + Math.cos(a) * 0.05];
    expect(nearestSurface(front, 0.3)).toBeLessThan(0.07);
    expect(blockedAt([-0.5, 1.7, 0.2])).toBe(false);
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
    for (const w of [[1.88, 1.0, 0], [0, 1, -1.92], [-1.88, 1.2, 0.5], [0.3, 0.02, 0.3], [0.3, 2.45, 0.3]] as V3[]) expect(blockedAt(w), `wall at ${w}`).toBe(true);
  });
});

describe("a flight's look point", () => {
  it("stays inside the room on every flight, so the view is never of the void", () => {
    const min = [-1.9, 0, -1.9], max = [1.9, 2.5, 1.9];
    for (const [name, list] of lists)
      for (let i = 0; i < list.length; i++) for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        for (let s = 0; s <= SAMPLES; s++) {
          const { look } = flightPose(list[i], list[j], s / SAMPLES);
          for (let k = 0; k < 3; k++) { expect(look[k], `${name}: ${i} to ${j}`).toBeGreaterThan(min[k]); expect(look[k], `${name}: ${i} to ${j}`).toBeLessThan(max[k]); }
        }
      }
  });
});

describe("a flight with control points in the same place", () => {
  const finite = (v: number[]) => v.every(Number.isFinite);
  it("gives finite poses when the start is on the hub or the look points coincide", () => {
    const onHub: Pose = { camera: [...HUB.camera], look: [...HUB.look] };
    const there: Pose = { camera: [-1, 1.2, -1], look: [...HUB.look] };
    for (const [a, b] of [[onHub, there], [there, onHub], [onHub, onHub]])
      for (let s = 0; s <= 10; s++) {
        const p = flightPose(a, b, s / 10);
        expect(finite(p.camera) && finite(p.look), `f=${s / 10}`).toBe(true);
      }
  });
  it("gives finite poses when a mid-flight start sits on its exit point", () => {
    const start: Pose = { camera: [1, 1, 1], look: [0, 1, 0], exit: [[1, 1, 1]] };
    const p = flightPose(start, { camera: [-1, 1.2, -1], look: [0, 1, -1] }, 0.3);
    expect(finite(p.camera)).toBe(true);
  });
});
