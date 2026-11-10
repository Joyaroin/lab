import type { BarKey } from "./bar";
import { LAYERS, TUBES, type MeterLayer } from "./meter-layers";

/** One image of the device, put in place: `id` names its place (stable while the image changes), and `digit` is
 *  the numeral's digit on a tube. */
export type Placed = MeterLayer & { id: string; digit?: number };

/** The layers the device shows, in the order they are laid, each over the one before: the base, the tubes' light,
 *  each tube's numeral (the decimal point after the first tube), then one key per place. `shown` is the
 *  reading's digits as the bar shows them (a scrambled one too). A digit change changes that tube's entry only. */
export function deviceLayers(shown: string, keys: BarKey[]): Placed[] {
  const out: Placed[] = [{ id: "base", ...LAYERS.base }, { id: "light", ...LAYERS.light }];
  const digits = [...shown].filter((c) => c >= "0" && c <= "9").slice(0, TUBES.length);
  digits.forEach((c, k) => {
    const d = Number(c);
    out.push({ id: `tube-${k}`, digit: d, ...LAYERS.numerals[d], ...TUBES[k] });
    if (k === 0) out.push({ id: "dot", ...LAYERS.dot });
  });
  for (const k of keys) out.push({ id: `key-${k}`, ...LAYERS.keys[k] });
  return out;
}
