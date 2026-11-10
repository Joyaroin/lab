import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { DEVICE, LAYERS, TUBES, layerFiles, type MeterLayer } from "./meter-layers";
import { ui } from "./content";

const DIR = "src/assets/meter";
// A PNG's size is in its header: 8 bytes of signature, 4 of length, 4 of "IHDR", then width and height.
const pngSize = (file: string) => {
  const b = readFileSync(`${DIR}/${file}`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
};

describe("the meter's layer list", () => {
  it("is 840 px wide", () => expect(DEVICE.width).toBe(840));
  it("names every layer the bar needs", () => {
    expect(layerFiles()).toEqual(expect.arrayContaining([
      "base.png", "light.png", "dot.png", "key-prev.png", "key-room.png", "key-next.png", "key-start.png",
      ...Array.from({ length: 10 }, (_, d) => `numeral-${d}.png`),
    ]));
    expect(LAYERS.numerals).toHaveLength(10);
  });
  it("holds every file it names, and no file it doesn't", () => {
    for (const f of layerFiles()) expect(existsSync(`${DIR}/${f}`), f).toBe(true);
    const named = new Set(layerFiles());
    for (const f of readdirSync(DIR).filter((n) => n.endsWith(".png"))) expect(named.has(f), f).toBe(true);
  });

  const all: [string, MeterLayer][] = [
    ["base", LAYERS.base], ["light", LAYERS.light], ["dot", LAYERS.dot],
    ...LAYERS.numerals.map((l, d) => [`numeral ${d}`, l] as [string, MeterLayer]),
    ...Object.entries(LAYERS.keys),
  ];
  it.each(all)("%s: its real size is the size its entry gives", (_n, l) => {
    expect(pngSize(l.file)).toEqual({ width: l.width, height: l.height });
  });
  it.each(all)("%s: lies inside the 840 px device", (_n, l) => {
    expect(l.x).toBeGreaterThanOrEqual(0);
    expect(l.y).toBeGreaterThanOrEqual(0);
    expect(l.x + l.width).toBeLessThanOrEqual(DEVICE.width);
    expect(l.y + l.height).toBeLessThanOrEqual(DEVICE.height);
  });
  it("lays the two full frames over the whole device", () => {
    for (const l of [LAYERS.base, LAYERS.light]) {
      expect(l).toMatchObject({ x: 0, y: 0, width: 840, height: DEVICE.height });
      expect(pngSize(l.file).width).toBe(840);
    }
  });
  it("lays the base normally and the lit layers additively", () => {
    expect(LAYERS.base.mode).toBe("normal");
    for (const l of [LAYERS.light, LAYERS.dot, ...LAYERS.numerals]) expect(l.mode).toBe("add");
  });
  it("lists seven tubes, left to right, inside the device, with one numeral crop's size", () => {
    expect(TUBES).toHaveLength(7);
    const { width, height } = LAYERS.numerals[0];
    for (const l of LAYERS.numerals) expect(l).toMatchObject({ width, height });
    TUBES.forEach((t, i) => {
      if (i) expect(t.x).toBeGreaterThan(TUBES[i - 1].x);
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x + width).toBeLessThanOrEqual(DEVICE.width);
      expect(t.y + height).toBeLessThanOrEqual(DEVICE.height);
    });
  });
  it("puts the middle key in the same place for ROOM and START", () => {
    const { room, start } = LAYERS.keys;
    expect([room.x, room.y, room.width, room.height]).toEqual([start.x, start.y, start.width, start.height]);
    expect(LAYERS.keys.prev.x).toBeLessThan(room.x);
    expect(LAYERS.keys.next.x).toBeGreaterThan(room.x);
  });
});

// The scene draws no copy: the key words come from the content module when it renders.
describe("the render tool holds none of the key words", () => {
  const words = [ui.keyPrev, ui.keyRoom, ui.keyNext, ui.keyStart];
  const sources = readdirSync("tools/meter").map((f) => [f, readFileSync(`tools/meter/${f}`, "utf8")] as const);
  it("has the scene and the render", () => expect(sources.map(([f]) => f)).toEqual(expect.arrayContaining(["meter.js", "render.mjs"])));
  it.each(sources)("%s", (_f, src) => {
    for (const w of words) expect(src, w).not.toContain(w);
  });
});
