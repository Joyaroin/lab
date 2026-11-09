import { describe, it, expect } from "vitest";
import { CAMERA_FOV, crts, OVERVIEW } from "../crts";
import { stations } from "../content";
import { flightPose } from "../visit/flight";
import type { Launch } from "../visit";
import { PANEL_SHOWN, panelStrength, STATION_COUNT } from "../hold";
import { PARALLAX_FROM, PARALLAX_FULL } from ".";
import { squareStop } from "../stop";
import { framingFor } from ".";
import type { Where } from "../where";

const win = (width: number, height: number) => ({ width, height });
const at = (stop: number): Where => ({ kind: "at", stop });

describe("the framing", () => {
  it("is chosen from the window's size each time: it switches when the window crosses the portrait line", () => {
    const wide = framingFor(win(801, 800)), square = framingFor(win(800, 800)), tall = framingFor(win(799, 800));
    expect(wide.name).toBe("square");
    expect(square.name).toBe("square"); // aspect 1 is not portrait
    expect(tall.name).toBe("portrait");
    // The same window rotated: the stop, the text and the parallax all follow the new framing.
    const p = at(1);
    expect(framingFor(win(1280, 800)).cameraAt(p).camera).not.toEqual(framingFor(win(800, 1280)).cameraAt(p).camera);
    expect(framingFor(win(1280, 800)).textOnGlass(p, 1)).toBe(true);
    expect(framingFor(win(800, 1280)).textOnGlass(p, 1)).toBe(false);
    expect(framingFor(win(1280, 800)).parallaxStrength(p)).toBe(0);
    expect(framingFor(win(800, 1280)).parallaxStrength(p)).toBe(1);
  });

  it("square: the stop for the window, the text on the glass in a hold, the layout's panel point", () => {
    const w = win(1280, 800), f = framingFor(w);
    expect(f.cameraAt(at(0)).camera).toEqual(OVERVIEW.camera);
    for (let i = 1; i <= STATION_COUNT; i++) {
      expect(f.cameraAt(at(i)).camera).toEqual(squareStop(crts[i - 1], w).camera);
      expect(f.textOnGlass(at(i), i)).toBe(true);
    }
    for (const c of crts) expect(f.panelPoint(c)).toEqual(c.panel);
  });

  it("portrait: the phone stop or pull-back, text pinned beside the CRT (the phone's point if it has one), full parallax", () => {
    const f = framingFor(win(390, 780));
    for (const c of crts) expect(f.panelPoint(c)).toEqual(c.phone ? c.phone.panel : c.panel);
    for (let i = 1; i <= STATION_COUNT; i++) {
      expect(f.textOnGlass(at(i), i)).toBe(false);
      expect(f.parallaxStrength(at(i))).toBe(1);
    }
  });
});

describe("the framing's stops", () => {
  it("are the overview pose first, then the station stops the app uses", async () => {
    const { OVERVIEW } = await import("../crts");
    const sq = framingFor(win(1280, 800)).stops, tall = framingFor(win(390, 844)).stops;
    expect(sq).toHaveLength(crts.length + 1);
    expect(sq[0].camera).toEqual(OVERVIEW.camera);
    expect(sq[1].camera).toEqual(squareStop(crts[0], win(1280, 800)).camera);
    expect(tall[0].camera).toEqual(OVERVIEW.portrait.camera);
    expect(tall[1].camera).toEqual(framingFor(win(390, 844)).cameraAt({ kind: "at", stop: 1 }).camera);
  });
});

describe("cameraAt over a flight", () => {
  const f = framingFor(win(1280, 800)), [a, b, c] = [f.stops[0], f.stops[3], f.stops[5]];
  it("gives the overview's own field of view at stop 0 and the stations' at a station", () => {
    expect(f.cameraAt({ kind: "at", stop: 0 }).fov).toBe(OVERVIEW.fov);
    expect(f.cameraAt({ kind: "at", stop: 3 }).fov).toBe(CAMERA_FOV);
  });
  it("flies a flying Where with flightPose between the framing's own stops, field of view eased too", () => {
    const w = { kind: "flying", from: 0, to: 3, f: 0.4 } as const;
    expect(f.cameraAt(w)).toEqual(flightPose(a, b, 0.4));
    const mid = f.cameraAt(w).fov;
    expect(mid).toBeLessThan(OVERVIEW.fov);
    expect(mid).toBeGreaterThan(CAMERA_FOV);
  });
  it("starts a re-target from the launch pose, however many flights deep, so it never jumps", () => {
    const launch: Launch = { kind: "flying", from: { kind: "flying", from: { kind: "at", stop: 0 }, to: 3, f: 0.5 }, to: 5, f: 0.3 };
    const first = flightPose(a, b, 0.5), second = flightPose(first, c, 0.3);
    expect(f.cameraAt({ kind: "flying", from: 5, to: 1, f: 0 }, launch)).toEqual(flightPose(second, f.stops[1], 0));
    const start = f.cameraAt({ kind: "flying", from: 5, to: 1, f: 0 }, launch);
    expect(start.camera).toEqual(second.camera);
    expect(start.look).toEqual(second.look);
    expect(start.fov).toBe(second.fov);
    const later = f.cameraAt({ kind: "flying", from: 5, to: 1, f: 0.5 }, launch);
    expect(later).toEqual(flightPose(second, f.stops[1], 0.5));
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
    const w = win(1280, 720), f = framingFor(w);
    expect(f.cameraAt(at(0)).camera).toEqual(OVERVIEW.camera);
    expect(f.cameraAt(at(0)).look).toEqual(OVERVIEW.look);
    for (let i = 1; i <= STATION_COUNT; i++) {
      const stop = squareStop(crts[i - 1], w), t = f.cameraAt(at(i));
      expect(t.camera).toEqual(stop.camera);
      expect(t.look).toEqual(stop.look);
    }
  });
  it("pulls back every station but the home lab, whose phone view is approved, and those with a phone stop", () => {
    for (const c of crts) expect(c.portrait > 1, c.id).toBe(c.id !== "home-lab" && !c.phone);
  });
  it("stands further back on a portrait window along the layout's own stop, looking at the same point", () => {
    const f = framingFor(win(390, 780));
    expect(f.cameraAt(at(0)).camera).toEqual(OVERVIEW.portrait.camera);
    expect(f.cameraAt(at(0)).look).toEqual(OVERVIEW.portrait.look);
    for (let i = 1; i <= STATION_COUNT; i++) {
      if (crts[i - 1].phone) continue; // reframed on phones instead, below
      const tall = f.cameraAt(at(i)), cam = crts[i - 1].camera, look = crts[i - 1].look;
      for (let k = 0; k < 3; k++) expect(tall.look[k]).toBeCloseTo(look[k], 9);
      expect(dist(tall.camera, tall.look)).toBeCloseTo(dist(cam, look) * crts[i - 1].portrait, 6);
    }
  });
});

// --- phone stops: MediaSafe and Software factory are reframed on phones so lit parts of the room show (ticket 36) ---
describe("phone stops", () => {
  const reframed = ["mediasafe", "software-factory"];
  it("reframe MediaSafe and Software factory, and only those", () => {
    expect(crts.filter((c) => c.phone).map((c) => c.id)).toEqual(reframed);
  });
  it("are used on a portrait window, camera and look point both", () => {
    for (const id of reframed) {
      const i = crts.findIndex((c) => c.id === id) + 1, phone = crts[i - 1].phone!;
      const tall = framingFor(win(390, 780)).cameraAt(at(i));
      expect(tall.camera).toEqual(phone.camera);
      expect(tall.look).toEqual(phone.look);
    }
  });
  it("do not change the desktop stop: it is the square one", () => {
    for (const id of reframed) {
      const i = crts.findIndex((c) => c.id === id) + 1, c = crts[i - 1];
      const wide = framingFor(win(1280, 800)).cameraAt(at(i)), s = squareStop(c, win(1280, 800));
      expect(wide.camera).toEqual(s.camera);
      expect(wide.look).toEqual(s.look);
    }
  });
  it("pin the text at the phone's own point on a portrait window", () => {
    for (const c of crts.filter((c) => c.phone)) expect(framingFor(win(390, 780)).panelPoint(c), c.id).toEqual(c.phone!.panel);
  });
  it("pin the text at the desktop point on a portrait window for a station with no phone stop", () => {
    const plain = crts.find((c) => !c.phone)!;
    expect(framingFor(win(390, 780)).panelPoint(plain)).toEqual(plain.panel);
  });
  it("still see the station's CRT from in front of its glass", () => {
    for (const c of crts.filter((c) => c.phone)) {
      const a = (c.yaw * Math.PI) / 180, cam = c.phone!.camera;
      expect((cam[0] - c.screen[0]) * Math.sin(a) + (cam[2] - c.screen[2]) * Math.cos(a), c.id).toBeGreaterThan(0.5);
    }
  });
});

describe("parallax strength", () => {
  const desktop = framingFor(win(1280, 800)), phone = framingFor(win(390, 780));
  /** Every flight between two stops, from `from` to `to`, sampled `n` times along its own share. */
  const along = (from: number, to: number, n = 400) => Array.from({ length: n + 1 }, (_, k) => ({ kind: "flying", from, to, f: k / n }) as Where);
  it("stays full on a portrait window, even at a station", () => {
    expect(phone.parallaxStrength(at(1))).toBe(1);
    expect(desktop.parallaxStrength(at(1))).toBe(0);
  });
  it("is gone at every station, and full at the overview", () => {
    for (let i = 1; i <= STATION_COUNT; i++) expect(desktop.parallaxStrength(at(i)), `stop ${i}`).toBe(0);
    expect(desktop.parallaxStrength(at(0))).toBe(1);
  });
  it("is full halfway through every flight between stations", () => {
    for (let i = 1; i < STATION_COUNT; i++) expect(desktop.parallaxStrength({ kind: "flying", from: i, to: i + 1, f: 0.5 })).toBe(1);
  });
  it("fades with the flight's own share, never its length: nothing until PARALLAX_FROM, full by PARALLAX_FULL, from either end", () => {
    // Whatever the two stops, the strength depends on f alone, so a longer or shorter flight fades the same way.
    for (const [from, to] of [[1, 2], [2, 6], [6, 1], [0, 3], [4, 0]])
      for (const w of along(from, to)) {
        if (w.kind !== "flying") continue;
        const away = Math.min(from >= 1 ? w.f : Infinity, to >= 1 ? 1 - w.f : Infinity);
        const want = Math.min(1, Math.max(0, (away - PARALLAX_FROM) / (PARALLAX_FULL - PARALLAX_FROM)));
        expect(desktop.parallaxStrength(w), `${from} to ${to} at ${w.f}`).toBeCloseTo(want, 12);
      }
    expect(desktop.parallaxStrength({ kind: "flying", from: 1, to: 2, f: PARALLAX_FROM })).toBe(0);
    expect(desktop.parallaxStrength({ kind: "flying", from: 1, to: 2, f: PARALLAX_FULL })).toBeCloseTo(1, 12);
    expect(desktop.parallaxStrength({ kind: "flying", from: 1, to: 2, f: 1 - PARALLAX_FROM })).toBeCloseTo(0, 12);
    expect(desktop.parallaxStrength({ kind: "flying", from: 1, to: 2, f: 1 - PARALLAX_FULL })).toBeCloseTo(1, 12);
  });
  it("fades in without a jump as the camera leaves a station", () => {
    let prev = 0;
    for (const w of along(1, 2)) {
      const s = desktop.parallaxStrength(w);
      if (w.kind === "flying" && w.f > 0.5) break;
      expect(s).toBeGreaterThanOrEqual(prev);
      expect(s - prev).toBeLessThan(0.02);
      prev = s;
    }
  });
  it("starts only once the text has faded away, so flat text never sits over tilting glass", () => {
    for (let i = 1; i < STATION_COUNT; i++)
      for (const w of along(i, i + 1)) {
        const leaving = panelStrength(w, i) >= PANEL_SHOWN, arriving = panelStrength(w, i + 1) >= PANEL_SHOWN;
        if (leaving || arriving) expect(desktop.parallaxStrength(w), JSON.stringify(w)).toBe(0);
      }
  });
});
