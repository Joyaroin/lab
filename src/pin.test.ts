import { describe, it, expect } from "vitest";
import { BOTTOM_CLEAR, fitPanel, glassFontSize, TOP_CLEAR } from "./pin";

const wins = [{ width: 1280, height: 800 }, { width: 390, height: 780 }, { width: 320, height: 500 }];

describe("fitPanel", () => {
  it("keeps the panel inside the window wherever the CRT projects, even off-screen", () => {
    for (const win of wins)
      for (const cx of [-500, 0, win.width / 2, win.width, win.width + 500])
        for (const cy of [-500, 0, win.height / 2, win.height, win.height + 500])
          for (const ph of [60, 300, 2000]) {
            const f = fitPanel(win, cx, cy, 90, ph);
            const h = Math.min(ph, f.maxHeight);
            expect(f.left).toBeGreaterThanOrEqual(0);
            expect(f.left + f.width).toBeLessThanOrEqual(win.width);
            expect(f.top).toBeGreaterThanOrEqual(0);
            expect(f.top + h).toBeLessThanOrEqual(win.height);
          }
  });
  it("on a phone, leaves at least half the free height for the room, scrolling the text", () => {
    const phone = { width: 390, height: 844 };
    const free = phone.height - TOP_CLEAR - BOTTOM_CLEAR;
    expect(fitPanel(phone, 195, 400, 200, 2000).maxHeight).toBeLessThanOrEqual(free / 2);
    expect(fitPanel(wins[0], 640, 400, 400, 2000).maxHeight).toBe(wins[0].height - TOP_CLEAR - BOTTOM_CLEAR);
  });
  it("never makes the panel wider than 640 px, however wide the window and the CRT (#49)", () => {
    const wide = { width: 2560, height: 1440 };
    expect(fitPanel(wide, 1280, 700, 1500, 300).width).toBe(640);
    expect(fitPanel(wide, 1280, 700, 640, 300).width).toBe(640);
    expect(fitPanel(wide, 1280, 700, 639, 300).width).toBe(639); // under the cap it follows the CRT
  });
  it("centres on the CRT when there is room", () => {
    const f = fitPanel(wins[0], 640, 400, 400, 200);
    expect(f.left + f.width / 2).toBe(640);
    expect(f.top + 100).toBe(400);
  });
});

describe("glassFontSize", () => {
  it("grows with the glass and never goes below a readable size", () => {
    expect(glassFontSize(100)).toBe(14);
    expect(glassFontSize(1600)).toBeGreaterThan(glassFontSize(800));
    expect(glassFontSize(800)).toBeGreaterThanOrEqual(16);
  });
});
