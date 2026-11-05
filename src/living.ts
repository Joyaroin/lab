// How long the CRT cursors blink: LIVING_FPS times a second, for LIVING_MS after the page starts
// and after each scroll or pointer move, then they stop with the cursor lit (see Phosphor in
// Effects.tsx). Kept apart from the three.js code so tests can read the numbers.
export const LIVING_FPS = 1;
export const LIVING_MS = 5000;
