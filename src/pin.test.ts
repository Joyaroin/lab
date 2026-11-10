import { describe, it, expect } from "vitest";
import { stations } from "./content";
import {
  BUTTON_PX, clearances, deviceSize, lineHeight, fitPanel, glassFontSize, HUD_GAP, HUD_MARGIN, LINK_ROW_H, LINK_ROW_W, NAME_BLOCK_H, NAME_BLOCK_W,
  ONE_ROW_MIN_W, PHONE_MENU_H, TWO_LINE_MIN_W,
} from "./pin";

// fitPanel only places text pinned beside the CRT, which only a portrait window does (src/framing).
const wins = [{ width: 800, height: 1000 }, { width: 390, height: 780 }, { width: 320, height: 500 }];

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
  it("on a phone, gives a tall panel all the free height between the name block and the meter bar", () => {
    const phone = { width: 390, height: 844 };
    const { top, bottom } = clearances(phone);
    const f = fitPanel(phone, 195, 400, 200, 2000);
    expect(f.maxHeight).toBeCloseTo(phone.height - top - bottom, 6);
    expect(f.maxHeight).toBeGreaterThanOrEqual(460); // Room and five stations are two rows of three
    expect(f.top).toBe(top);
    expect(f.top + f.maxHeight).toBeCloseTo(phone.height - bottom, 6);
  });
  it("on a wide portrait window it takes all the free height too, with no half rule", () => {
    const win = wins[0], { top, bottom } = clearances(win);
    expect(fitPanel(win, 400, 500, 400, 2000).maxHeight).toBeCloseTo(win.height - top - bottom, 6);
  });
  it("never makes the panel wider than 640 px, however wide the window and the CRT (#49)", () => {
    const wide = { width: 2560, height: 1440 };
    expect(fitPanel(wide, 1280, 700, 1500, 300).width).toBe(640);
    expect(fitPanel(wide, 1280, 700, 640, 300).width).toBe(640);
    expect(fitPanel(wide, 1280, 700, 639, 300).width).toBe(639); // under the cap it follows the CRT
  });
  it("centres on the CRT when there is room", () => {
    const f = fitPanel(wins[0], 400, 500, 400, 200);
    expect(f.left + f.width / 2).toBe(400);
    expect(f.top + 100).toBe(500);
  });
});

describe("glassFontSize", () => {
  it("grows with the glass and never goes below a readable size", () => {
    expect(glassFontSize(100)).toBe(14);
    expect(glassFontSize(1600)).toBeGreaterThan(glassFontSize(800));
    expect(glassFontSize(800)).toBeGreaterThanOrEqual(16);
  });
});

describe("fitPanel with the phone menu", () => {
  it("keeps the panel above the menu, the meter bar and the device, wherever the CRT projects", () => {
    const phone = { width: 390, height: 844 };
    for (const cy of [0, 400, 844, 1500]) {
      const f = fitPanel(phone, 195, cy, 200, 2000);
      expect(f.top + f.maxHeight).toBeLessThanOrEqual(phone.height - clearances(phone).bottom + 1e-6);
    }
  });
});

describe("the device", () => {
  it("is clamp(280, 0.29 x width, 420) wide on a landscape window, 660:280 in shape", () => {
    expect(deviceSize({ width: 1920, height: 1080 }).width).toBe(420);
    expect(deviceSize({ width: 1920, height: 1080 }).height).toBeCloseTo(178.2, 1);
    expect(deviceSize({ width: 1440, height: 900 }).width).toBeCloseTo(417.6, 6);
    expect(deviceSize({ width: 1280, height: 800 }).width).toBeCloseTo(371.2, 6);
    expect(deviceSize({ width: 800, height: 700 }).width).toBe(280); // 0.29 x 800 = 232, floored at 280
  });
  it("is 280 px wide on a portrait window, or 72% of the width if that is less", () => {
    const d = deviceSize({ width: 390, height: 844 });
    expect(d.width).toBe(280);
    expect(d.height).toBeCloseTo(118.8, 1);
    expect(deviceSize({ width: 320, height: 500 }).width).toBeCloseTo(230.4, 6);
  });
});

describe("clearances", () => {
  it("at 1920 x 1080 the bottom is the device's height plus 42 px", () => {
    expect(clearances({ width: 1920, height: 1080 }).bottom).toBeCloseTo(220.2, 1);
  });
  it("on landscape the bottom is the device's height plus 42 px at every width", () => {
    for (const width of [1024, 1280, 1440, 2560]) {
      const win = { width, height: 800 };
      expect(clearances(win).bottom).toBeCloseTo(deviceSize(win).height + 42, 6);
    }
  });
  it("the line under the device is 26 px on one line and grows 18 px (16 px on portrait) for each line it wraps to", () => {
    expect(lineHeight({ width: 1440, height: 900 })).toBe(26);
    expect(lineHeight({ width: 1024, height: 768 })).toBe(26);
    expect(lineHeight({ width: 700, height: 500 }), "the longest sentence wraps to two lines at 700 px").toBe(44);
    expect(lineHeight({ width: 390, height: 844 }), "and on a phone, in smaller type, to two").toBe(40);
    expect(lineHeight({ width: 360, height: 740 }), "or three on a narrow one").toBe(56);
  });
  it("on portrait the bottom is the menu, 16, the device and the line", () => {
    const win = { width: 390, height: 844 };
    const rows = Math.ceil((stations.length + 1) / 3); // Room and one button per station, three to a row
    const menu = rows * 44 + (rows - 1) * 4.8 + 2 * 6.4; // 44 px buttons, the gaps and the padding
    expect(PHONE_MENU_H).toBeCloseTo(menu, 6);
    expect(stations.length, "five stations: two rows, 105.6 px").toBe(5);
    expect(PHONE_MENU_H).toBeCloseTo(105.6, 6);
    expect(clearances(win).bottom).toBeCloseTo(menu + 16 + 118.8 + lineHeight(win), 1);
    expect(clearances(win).top).toBe(96);
  });
  it("the top is the one-row HUD's height from ONE_ROW_MIN_W wide, the two-line HUD's from TWO_LINE_MIN_W, the three-line HUD's under that, and 96 on portrait", () => {
    const oneRow = HUD_MARGIN + NAME_BLOCK_H, twoLine = oneRow + LINK_ROW_H, threeLine = twoLine + LINK_ROW_H;
    expect(oneRow).toBe(90);
    expect(twoLine).toBe(126);
    expect(threeLine).toBe(162);
    expect(clearances({ width: ONE_ROW_MIN_W, height: 900 }).top).toBe(oneRow);
    expect(clearances({ width: 1920, height: 1080 }).top).toBe(oneRow);
    expect(clearances({ width: ONE_ROW_MIN_W - 1, height: 900 }).top).toBe(twoLine);
    expect(clearances({ width: 1280, height: 800 }).top).toBe(oneRow); // 1280 x 800 keeps the one-row HUD
    expect(clearances({ width: 1279, height: 800 }).top).toBe(twoLine);
    expect(clearances({ width: 1024, height: 768 }).top).toBe(twoLine);
    expect(clearances({ width: TWO_LINE_MIN_W, height: 600 }).top).toBe(twoLine);
    expect(clearances({ width: TWO_LINE_MIN_W - 1, height: 600 }).top).toBe(threeLine);
    expect(clearances({ width: 800, height: 600 }).top).toBe(threeLine);
    expect(clearances({ width: 700, height: 500 }).top).toBe(threeLine);
    expect(clearances({ width: 390, height: 844 }).top).toBe(96);
  });
  it("ONE_ROW_MIN_W is worked out from the HUD's boxes: name block, link row, the gap and both margins", () => {
    expect(ONE_ROW_MIN_W).toBe(NAME_BLOCK_W + HUD_GAP + LINK_ROW_W + 2 * HUD_MARGIN);
    expect(ONE_ROW_MIN_W).toBeLessThanOrEqual(1280); // so a 1280 x 800 window gets the one-row HUD
  });
  it("TWO_LINE_MIN_W is worked out from the link row's box and both margins: under it the row wraps as two whole groups", () => {
    expect(TWO_LINE_MIN_W).toBe(LINK_ROW_W + 2 * HUD_MARGIN);
    expect(TWO_LINE_MIN_W).toBeLessThan(1024); // so 1024 x 768 keeps the two-line HUD
  });
  it("the phone menu's height comes from the button, gap, padding and rows", () => {
    expect(BUTTON_PX).toBe(44);
  });
});
