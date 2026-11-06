import { shiftDigits, type ShiftKind } from "../../src/nixie";

/** When each of `tubes` tubes locks on its true digit in a shift, in ms, found through the public
 *  `shiftDigits` rather than from nixie's private numbers. The random digits are fixed to one that the
 *  true digits (all zero) never equal, so a tube is locked from the first moment it shows a zero. */
export function lockTimesMs(kind: ShiftKind, tubes: number): number[] {
  const truth = "0".repeat(tubes), rand = () => 0.99;
  const times = Array<number>(tubes).fill(NaN);
  for (let ms = 0; ms < 2_000; ms += 0.5) {
    const shown = shiftDigits(ms / 1000, truth, kind, rand).digits;
    for (let k = 0; k < tubes; k++) if (Number.isNaN(times[k]) && shown[k] === "0") times[k] = ms;
  }
  return times;
}
