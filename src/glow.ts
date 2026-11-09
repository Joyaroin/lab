/** The hover glow eases at this rate per second (about 0.3 s to settle). */
export const GLOW_RATE = 8;

/** One frame of the glow's ease from `v` towards `goal`, `dt` seconds long. It eases the same under reduced
 *  motion: a 0.3 s opacity swell is not movement, and a snap would be a sudden flash (#176). */
export function easeGlow(v: number, goal: number, dt: number): number {
  const next = v + (goal - v) * (1 - Math.exp(-Math.min(dt, 0.1) * GLOW_RATE));
  return Math.abs(goal - next) < 0.01 ? goal : next;
}
