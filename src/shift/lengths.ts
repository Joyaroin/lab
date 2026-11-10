// The shift's lengths. No imports, so the nixie module and the tear can both read them without a cycle.

/** How long a shift runs, in seconds: the full one is about the length of the tear, the short one is a
 *  quick flick. */
export const SHIFT_SECONDS = { full: 0.4, short: 0.25 } as const;

export type ShiftKind = keyof typeof SHIFT_SECONDS;
