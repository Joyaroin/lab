import { holdSpan, progressFor } from "../../src/hold";

// Scroll positions for unit tests that still drive the shift and the text through the scroll adapter
// (`whereAt`). Tests only: the app reads a Where, and these go when the adapter does.

/** The scroll progress in the middle of station `i`'s hold. */
export const midHold = progressFor;
/** The scroll progress where station `i`'s hold starts and ends. */
export const holdEdges = holdSpan;
