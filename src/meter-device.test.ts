import { describe, it, expect } from "vitest";
import { deviceLayers } from "./meter-device";
import { LAYERS, TUBES } from "./meter-layers";
import { meterUrl } from "./meter-images";
import { layerFiles } from "./meter-layers";

const ids = (shown: string, keys: Parameters<typeof deviceLayers>[1] = ["start"]) => deviceLayers(shown, keys).map((l) => l.id);

describe("the layers shown for a reading", () => {
  it("lays base, light, the tubes with the dot after the first, then the keys, in that order", () => {
    expect(ids("0.123456", ["prev", "room", "next"])).toEqual([
      "base", "light", "tube-0", "dot", "tube-1", "tube-2", "tube-3", "tube-4", "tube-5", "tube-6", "key-prev", "key-room", "key-next",
    ]);
  });
  it("gives each tube the numeral of its digit, at that tube's place", () => {
    const tubes = deviceLayers("0.123456", ["start"]).filter((l) => l.id.startsWith("tube-"));
    expect(tubes.map((t) => t.file)).toEqual([0, 1, 2, 3, 4, 5, 6].map((d) => LAYERS.numerals[d].file));
    tubes.forEach((t, k) => {
      expect([t.x, t.y]).toEqual([TUBES[k].x, TUBES[k].y]);
      expect([t.width, t.height]).toEqual([LAYERS.numerals[0].width, LAYERS.numerals[0].height]);
      expect(t.mode).toBe("add");
    });
  });
  it("changing one digit changes one tube and nothing else", () => {
    const before = deviceLayers("0.000377", ["prev", "room", "next"]);
    const after = deviceLayers("0.000378", ["prev", "room", "next"]);
    const changed = after.filter((l, i) => JSON.stringify(l) !== JSON.stringify(before[i]));
    expect(changed.map((l) => l.id)).toEqual(["tube-6"]);
    expect(changed[0].file).toBe("numeral-8.png");
  });
  it("lays the dot and the lit layers additively and the base and keys normally", () => {
    const by = Object.fromEntries(deviceLayers("0.000000", ["prev", "start"]).map((l) => [l.id, l.mode]));
    expect(by).toMatchObject({ base: "normal", light: "add", dot: "add", "key-prev": "normal", "key-start": "normal" });
  });
  it("puts a key at its own place: ROOM and START share the middle one, and without ROOM the middle stays empty", () => {
    const at = (k: "room" | "start") => deviceLayers("0.000000", [k]).find((l) => l.id === `key-${k}`)!;
    expect([at("room").x, at("room").y]).toEqual([at("start").x, at("start").y]);
    const portrait = deviceLayers("0.000000", ["prev", "next"]);
    expect(portrait.map((l) => l.id)).not.toContain("key-room");
    expect(portrait.map((l) => l.id)).not.toContain("key-start");
  });
  it("shows a reading of any length on the seven tubes", () => {
    expect(ids("12.345678").filter((i) => i.startsWith("tube-"))).toHaveLength(7);
  });
});

describe("the meter's image files", () => {
  it("has a built URL for every file the layer list names", () => {
    for (const f of layerFiles()) expect(meterUrl(f), f).toMatch(/\.png/);
  });
});
