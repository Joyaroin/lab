import { describe, it, expect } from "vitest";
import { CAMERA_FOV, crts, glassCorners, OVERVIEW } from "../crts";
import { framingFor } from "../framing";
import { nearestSurface } from "../../tests/lib/room-mesh";
import { flightPose, type Pose } from "./flight";

type V3 = [number, number, number];
const CLEAR = 0.15, GLASS_CLEAR = 0.6, SAMPLES = 40;
const TAN = Math.tan((CAMERA_FOV * Math.PI) / 360);
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Where a point lands in a frame of this aspect, -1..1 each way, by the camera's own projection
 *  (vertical field CAMERA_FOV, looking at `look` with world up). Null if it is behind the camera. */
function project(pose: Pose, p: V3, aspect: number): [number, number] | null {
  const f = norm(sub(pose.look, pose.camera)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f), d = sub(p, pose.camera), z = dot(d, f);
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
  it("has the camera clear of the room's surfaces, both poses", () => {
    expect(nearestSurface(OVERVIEW.camera, CLEAR)).toBe(Infinity);
    expect(nearestSurface(OVERVIEW.portrait.camera, CLEAR)).toBe(Infinity);
  });
});

describe("flightPose", () => {
  const a: Pose = { camera: [0, 1, 0], look: [0, 1, -1] }, b: Pose = { camera: [1, 1.2, -1], look: [1, 1.2, -2] };
  it("starts exactly on `from` and ends exactly on `to`", () => {
    expect(flightPose(a, b, 0)).toEqual(a);
    expect(flightPose(a, b, 1)).toEqual(b);
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
  it("holds between the two overview poses, such as a window turned mid-visit", () => {
    const [land, port] = [lists[0][1][0], lists[2][1][0]];
    expect(problem(land, port)).toBeNull();
    expect(problem(port, land)).toBeNull();
  });
  it("holds for a re-target: a new flight from halfway along another", () => {
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
