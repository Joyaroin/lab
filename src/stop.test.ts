import { describe, it, expect } from "vitest";
import { PerspectiveCamera } from "three";
import { CAMERA_FOV, crts } from "./crts";
import { glassBox, glassOnScreen } from "./glass";
import { progressFor, tourAt } from "./tour";
import { BOTTOM_CLEAR, SIDE, TOP_CLEAR } from "./pin";
import { squareStop } from "./stop";

/** The glass on screen at station `i`'s hold, through the code the app runs: the tour's camera
 *  (tourAt, as CameraRig sets it) and the projection Room.tsx pins the text with (glassOnScreen). */
function glassAtHold(i: number, w: number, h: number) {
  const t = tourAt(progressFor(i + 1), 0, w / h, h);
  const cam = new PerspectiveCamera(CAMERA_FOV, w / h, 0.1, 1000); // react-three-fiber's default near and far
  cam.position.set(...t.camera);
  cam.lookAt(...t.look);
  cam.updateMatrixWorld();
  const size = { width: w, height: h };
  const pts = glassOnScreen(crts[i], cam, size);
  const box = glassBox(crts[i], cam, size); // the call Room.tsx pins the text with
  return { left: box.left, right: box.left + box.width, top: box.top, bottom: box.top + box.height, pts, box };
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
        const g = glassAtHold(i, w, h);
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
        const g = glassAtHold(i, w, h);
        const [bl, tl, br, tr] = g.pts; // x then y order from the loops
        expect(Math.abs(tl.x - bl.x), crts[i].id).toBeLessThan(0.01);
        expect(Math.abs(tr.x - br.x), crts[i].id).toBeLessThan(0.01);
        expect(Math.abs(tl.y - tr.y), crts[i].id).toBeLessThan(0.01);
        expect(Math.abs(bl.y - br.y), crts[i].id).toBeLessThan(0.01);
      }
    });
    it(`give the text the glass's own box, which fills the band between the HUD and the meter, ${w}x${h}`, () => {
      for (let i = 0; i < crts.length; i++) {
        const { box } = glassAtHold(i, w, h);
        const bandH = h - TOP_CLEAR - BOTTOM_CLEAR, bandW = w - 2 * SIDE;
        // inside the band on every side...
        expect(box.top, crts[i].id).toBeGreaterThanOrEqual(TOP_CLEAR - 1);
        expect(box.top + box.height, crts[i].id).toBeLessThanOrEqual(h - BOTTOM_CLEAR + 1);
        expect(box.left, crts[i].id).toBeGreaterThanOrEqual(SIDE - 1);
        expect(box.left + box.width, crts[i].id).toBeLessThanOrEqual(w - SIDE + 1);
        // ...and as big as the band allows, in the middle of it
        expect(box.height >= bandH - 2 || box.width >= bandW - 2, crts[i].id).toBe(true);
        expect(box.left + box.width / 2, crts[i].id).toBeCloseTo(w / 2, 0);
        expect(box.top + box.height / 2, crts[i].id).toBeCloseTo(TOP_CLEAR + bandH / 2, 0);
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
