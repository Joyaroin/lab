import { holdSpan, TOTAL, TRAVEL } from "../../src/hold";

/** Scroll progress `f` (0..1) of the way through the travel into station `i`: 0 is where the travel
 *  starts (the previous stop's hold ends, or the entrance), 1 is where this station's hold begins.
 *  Tests only: the app never asks where the middle of a travel is. */
export const travelProgress = (i: number, f: number) => holdSpan(i)[0] - ((1 - f) * TRAVEL) / TOTAL;
