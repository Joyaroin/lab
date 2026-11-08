import { describe, it, expect } from "vitest";
import { crts, ENTRANCE } from "../crts";
import { progressFor, STATION_COUNT } from "../hold";
import { squareStop } from "../stop";
import { framingFor } from ".";
import { whereAt } from "../where";

const win = (width: number, height: number) => ({ width, height });

describe("the framing", () => {
  it("is chosen from the window's size each time: it switches when the window crosses the portrait line", () => {
    const wide = framingFor(win(801, 800)), square = framingFor(win(800, 800)), tall = framingFor(win(799, 800));
    expect(wide.name).toBe("square");
    expect(square.name).toBe("square"); // aspect 1 is not portrait
    expect(tall.name).toBe("portrait");
    // The same window rotated: the stop, the text and the parallax all follow the new framing.
    const p = whereAt(progressFor(1));
    expect(framingFor(win(1280, 800)).cameraAt(p).camera).not.toEqual(framingFor(win(800, 1280)).cameraAt(p).camera);
    expect(framingFor(win(1280, 800)).textOnGlass(p, 1)).toBe(true);
    expect(framingFor(win(800, 1280)).textOnGlass(p, 1)).toBe(false);
    expect(framingFor(win(1280, 800)).parallaxStrength(p)).toBe(0);
    expect(framingFor(win(800, 1280)).parallaxStrength(p)).toBe(1);
  });

  it("square: the stop for the window, the text on the glass in a hold, the layout's panel point", () => {
    const w = win(1280, 800), f = framingFor(w);
    expect(f.cameraAt(whereAt(progressFor(0))).camera).toEqual(ENTRANCE.camera);
    for (let i = 1; i <= STATION_COUNT; i++) {
      expect(f.cameraAt(whereAt(progressFor(i))).camera).toEqual(squareStop(crts[i - 1], w).camera);
      expect(f.textOnGlass(whereAt(progressFor(i)), i)).toBe(true);
    }
    for (const c of crts) expect(f.panelPoint(c)).toEqual(c.panel);
  });

  it("portrait: the phone stop or pull-back, text pinned beside the CRT (the phone's point if it has one), full parallax", () => {
    const f = framingFor(win(390, 780));
    for (const c of crts) expect(f.panelPoint(c)).toEqual(c.phone ? c.phone.panel : c.panel);
    for (let i = 1; i <= STATION_COUNT; i++) {
      expect(f.textOnGlass(whereAt(progressFor(i)), i)).toBe(false);
      expect(f.parallaxStrength(whereAt(progressFor(i)))).toBe(1);
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
