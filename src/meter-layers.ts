// The meter device's rendered images, and where each goes. `make meter` writes the images and `layers.json` to
// src/assets/meter/ (tools/meter/); this module is the list the meter bar reads. Every place and size is in pixels
// of the 840 px wide device: scale it with the device's CSS width (420 px is twice, 280 px three times).
//
// Lay them in this order, each over the one before:
//   1. `base`: the case and the tubes, dark, with no keys. Normal.
//   2. `light`: the tubes' light on the case. Additive. Its opacity is how far the device is lit (the power-on).
//   3. `numerals[digit]`, once at each of `TUBES`' places: one lit numeral all seven tubes share. Additive.
//      `dot`: the decimal point, after the first tube. Additive.
//   4. one key of `keys`: PREV on the left, ROOM in the middle, NEXT on the right, START in the middle. Normal.
// Additive means the browser's `plus-lighter` (`mix-blend-mode`), which adds the layer's light to what is under it.
import data from "./assets/meter/layers.json";

/** How a layer is laid over the ones before it. */
export type Mode = "normal" | "add";
/** One image: its file in src/assets/meter/, its place (x, y) and its size on the device. */
export type MeterLayer = { file: string; x: number; y: number; width: number; height: number; mode: Mode };

export const DEVICE = { width: data.width, height: data.height };

const layer = (file: string, mode: Mode): MeterLayer => {
  const at = (data.layers as Record<string, { x: number; y: number; width: number; height: number }>)[file];
  return { file, ...at, mode };
};
const KEYS = ["prev", "room", "next", "start"] as const;

export const LAYERS = {
  base: layer("base.png", "normal"),
  light: layer("light.png", "add"),
  /** by digit: `numerals[7]` is the lit 7. Each is placed at a tube's place, not at its own x and y. */
  numerals: Array.from({ length: 10 }, (_, d) => layer(`numeral-${d}.png`, "add")),
  dot: layer("dot.png", "add"),
  keys: Object.fromEntries(KEYS.map((k) => [k, layer(`key-${k}.png`, "normal")])) as Record<(typeof KEYS)[number], MeterLayer>,
};

/** Where a numeral's top left goes for each of the seven tubes, left to right. */
export const TUBES: { x: number; y: number }[] = data.tubes;

/** Every image file the list names. */
export const layerFiles = (): string[] => [
  LAYERS.base.file, LAYERS.light.file, ...LAYERS.numerals.map((l) => l.file), LAYERS.dot.file,
  ...Object.values(LAYERS.keys).map((l) => l.file),
];
