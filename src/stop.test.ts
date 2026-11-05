import { describe, it, expect } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { CAMERA_FOV, CRT_GLASS, crts } from "./crts";
import { BOTTOM_CLEAR, SIDE, TOP_CLEAR } from "./pin";
import { glassRect, squareStop } from "./stop";

/** The glass's corners projected into a window, by three.js itself. */
function glassOnScreen(i: number, w: number, h: number) {
  const crt = crts[i], s = squareStop(crt, { width: w, height: h });
  const cam = new PerspectiveCamera(CAMERA_FOV, w / h, 0.05, 50);
  cam.position.set(...s.camera);
  cam.lookAt(...s.look);
  cam.updateMatrixWorld();
  const a = (crt.yaw * Math.PI) / 180, right = [Math.cos(a), 0, -Math.sin(a)];
  const pts = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => {
    const q = new Vector3(
      crt.screen[0] + (right[0] * sx * CRT_GLASS.width) / 2, crt.screen[1] + (sy * CRT_GLASS.height) / 2,
      crt.screen[2] + (right[2] * sx * CRT_GLASS.width) / 2).project(cam);
    return { x: (q.x * 0.5 + 0.5) * w, y: (-q.y * 0.5 + 0.5) * h };
  }));
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys), pts };
}

const windows = [[1280, 800], [1920, 1080], [1440, 900], [1024, 768], [1366, 640], [2560, 1440]];

describe("square stops", () => {
  it("stand about 0.53 m from the glass at 1280x800", () => {
    for (const c of crts) {
      const s = squareStop(c, { width: 1280, height: 800 });
      expect(Math.hypot(s.camera[0] - c.screen[0], s.camera[2] - c.screen[2])).toBeCloseTo(0.53, 2);
    }
  });
  for (const [w, h] of windows) {
    it(`put the glass between the HUD and the meter at every station, ${w}x${h}`, () => {
      for (let i = 0; i < crts.length; i++) {
        const g = glassOnScreen(i, w, h);
        expect(g.top, crts[i].id).toBeGreaterThanOrEqual(TOP_CLEAR - 1);
        expect(g.bottom, crts[i].id).toBeLessThanOrEqual(h - BOTTOM_CLEAR + 1);
        expect(g.left, crts[i].id).toBeGreaterThanOrEqual(SIDE - 1);
        expect(g.right, crts[i].id).toBeLessThanOrEqual(w - SIDE + 1);
        // and fills it: height of the band, unless the window is too narrow for that
        const fills = g.bottom - g.top > (h - TOP_CLEAR - BOTTOM_CLEAR) * 0.98 || g.right - g.left > (w - 2 * SIDE) * 0.98;
        expect(fills, crts[i].id).toBe(true);
      }
    });
    it(`face the glass straight on: its edges are square on screen, ${w}x${h}`, () => {
      for (let i = 0; i < crts.length; i++) {
        const g = glassOnScreen(i, w, h);
        const [bl, tl, br, tr] = g.pts; // x then y order from the loops
        expect(Math.abs(tl.x - bl.x), crts[i].id).toBeLessThan(0.01);
        expect(Math.abs(tr.x - br.x), crts[i].id).toBeLessThan(0.01);
        expect(Math.abs(tl.y - tr.y), crts[i].id).toBeLessThan(0.01);
        expect(Math.abs(bl.y - br.y), crts[i].id).toBeLessThan(0.01);
      }
    });
    it(`report the glass rectangle the text is pinned to, ${w}x${h}`, () => {
      for (let i = 0; i < crts.length; i++) {
        const g = glassOnScreen(i, w, h), r = glassRect(crts[i], { width: w, height: h });
        expect(r.left).toBeCloseTo(g.left, 3);
        expect(r.top).toBeCloseTo(g.top, 3);
        expect(r.width).toBeCloseTo(g.right - g.left, 3);
        expect(r.height).toBeCloseTo(g.bottom - g.top, 3);
      }
    });
  }
  it("use the same height for camera and look point, so the view is level", () => {
    for (const c of crts) {
      const s = squareStop(c, { width: 1280, height: 800 });
      expect(s.camera[1]).toBe(s.look[1]);
    }
  });
});
