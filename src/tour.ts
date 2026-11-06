import { stations } from "./content";
import { ARCS, crts, ENTRANCE, isPortrait } from "./crts";
import { squareStop } from "./stop";
import { holdSpan, panelStrength, PANEL_SHOWN, progressFor, STATION_COUNT, TOTAL, TRAVEL, PER_STATION } from "./hold";

/** Where the mouse parallax begins and reaches full, in travel away from a stop (a share of one stretch). */
export const PARALLAX_FROM = 0.2, PARALLAX_FULL = 0.45;

type V3 = [number, number, number];

// The tour: scroll position in, current station, camera position and meter reading out.
// Stop 0 is the entrance (shows the gap, close on the desk meter); stops 1..STATION_COUNT are
// the stations.

// Camera position at each stop, entrance first, then one per CRT (see crts.ts).
const stops: V3[] = [ENTRANCE.camera, ...crts.map((c) => c.camera)];
// What the camera looks at from each stop: into the room at the entrance, then at each CRT.
const looks: V3[] = [ENTRANCE.look, ...crts.map((c) => c.look)];
// On a portrait window the camera stands further back along the same line, so a phone sees the
// station's desk, not only one CRT. The factor per stop is in room-layout.json (1 if unset).
// A station with its own phone stop uses that instead (MediaSafe and WC2026, whose pulled-back
// view was mostly dark).
const pulls: number[] = [ENTRANCE.portrait, ...crts.map((c) => c.portrait)];
const phones = [undefined, ...crts.map((c) => c.phone)];
const portraitStops: V3[] = stops.map((c, i) => {
  const phone = phones[i];
  if (phone) return phone.camera;
  const l = looks[i], k = pulls[i];
  return [l[0] + (c[0] - l[0]) * k, l[1] + (c[1] - l[1]) * k, l[2] + (c[2] - l[2]) * k];
});
const portraitLooks: V3[] = looks.map((l, i) => phones[i]?.look ?? l);

export type TourState = { station: number; camera: V3; look: V3; reading: number };

/** True while station `i`'s text is laid over its glass (desktop, panel showing). The pin and the
 *  phosphor swap both use this, so they cannot drift apart. */
export function textOnGlass(progress: number, i: number, aspect: number): boolean {
  return !isPortrait(aspect) && panelStrength(progress, i) >= PANEL_SHOWN;
}

/** A quadratic curve from `a` to `b` that passes through `mid` halfway along. */
const curveThrough = (mid: V3) => (a: V3, b: V3, f: number): V3 =>
  [0, 1, 2].map((k) => {
    const c = 2 * mid[k] - (a[k] + b[k]) / 2;
    return (1 - f) ** 2 * a[k] + 2 * (1 - f) * f * c + f ** 2 * b[k];
  }) as V3;

const line = (a: V3, b: V3, f: number): V3 => [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * f) as V3;

/** How much mouse parallax applies at scroll progress `progress`: none for the whole hold and until
 *  the text has faded (`PARALLAX_FROM`), so the glass stays square behind the flat text, then rising
 *  to full by `PARALLAX_FULL` of the way through travel, and full through the rest. On a portrait
 *  window (`aspect` below 1) it is always full. */
export function parallaxStrength(progress: number, aspect: number): number {
  if (isPortrait(aspect)) return 1; // phones are unchanged
  const p = Math.min(Math.max(Number.isFinite(progress) ? progress : 0, 0), 1);
  let away = Infinity;
  for (let i = 1; i <= STATION_COUNT; i++) {
    const [a, b] = holdSpan(i);
    away = Math.min(away, p < a ? a - p : p > b ? p - b : 0);
  }
  return Math.min(1, Math.max(0, ((away * TOTAL) / TRAVEL - PARALLAX_FROM) / (PARALLAX_FULL - PARALLAX_FROM)));
}

/** The window the tour is laid out for, in px. `reduced` (reduced motion) makes travel between
 *  stations a straight line, not an arc. The leg from the entrance stays curved: the entrance isn't
 *  a station, and the wide view of the room on the way in is kept for everyone. */
export type TourWindow = { width: number; height: number; reduced?: boolean };

/** A window wider than tall uses each station's square stop, worked out from the window's size so
 *  the glass fills the space between the HUD and the meter at any size. Below an aspect of 1
 *  (portrait) the portrait stops are used. */
export function tourAt(progress: number, gap: number, win: TourWindow): TourState {
  const p = Math.min(Math.max(Number.isFinite(progress) ? progress : 0, 0), 1);
  const u = p * TOTAL;
  const i = Math.min(Math.floor(u / PER_STATION), STATION_COUNT - 1); // travel i leads to station i+1
  const r = u - i * PER_STATION;
  const f = Math.min(r / TRAVEL, 1); // 1 for the whole hold: the camera is on the stop
  const x = i + f;
  const readingAt = (s: number) => (s === 0 ? gap : stations[s - 1].reading);
  const lerp = (a: number, b: number) => (f === 1 ? b : a + (b - a) * f);
  const square = isPortrait(win.width / win.height) ? undefined : crts.map((c) => squareStop(c, win));
  const path = square ? [stops[0], ...square.map((s) => s.camera)] : portraitStops;
  const aims = square ? [looks[0], ...square.map((s) => s.look)] : portraitLooks;
  const a = path[i], b = path[i + 1], la = aims[i], lb = aims[i + 1];
  // Leaving the entrance, the camera pulls back from the meter through the wide view of the room
  // (ENTRANCE.reveal) on one smooth curve. Between stations it does the same through that leg's
  // wide view of the room (ARCS), so the room shows halfway between two TVs, unless reduced motion
  // asks for a straight line there. The entrance leg always curves.
  const mid = i === 0 ? ENTRANCE.reveal : ARCS[i - 1];
  const straight = win.reduced && i > 0;
  const along = (from: V3, to: V3, via: V3) => (straight ? line : curveThrough(via))(from, to, f);
  // In a hold the camera is exactly on the stop, not a lerp that lands within rounding of it.
  return {
    station: Math.round(x),
    camera: f === 1 ? [...b] : along(a, b, mid.camera),
    look: f === 1 ? [...lb] : along(la, lb, mid.look),
    reading: lerp(readingAt(i), readingAt(i + 1)),
  };
}

/** Slight mouse parallax: where to move the camera, in room coordinates, for a pointer at
 *  (`x`, `y`), each -1..1 across the window. The shift is along the camera's own right and up,
 *  so it slides the view sideways rather than toward or away from what it looks at, and it is a
 *  fixed share of the distance to the look point, so it feels the same close up and from afar. */
export const PARALLAX = { right: 0.1, up: 0.05 };
export function parallax(camera: V3, look: V3, pointer: { x: number; y: number }, strength = 1): V3 {
  const f = [look[0] - camera[0], look[1] - camera[1], look[2] - camera[2]];
  const d = Math.hypot(f[0], f[1], f[2]);
  if (d === 0) return [0, 0, 0];
  // right = forward x world up, as three.js's lookAt builds it; up = right x forward
  const rl = Math.hypot(f[2], f[0]);
  if (rl === 0) return [0, 0, 0];
  const r = [-f[2] / rl, 0, f[0] / rl];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]].map((v) => v / d);
  const a = pointer.x * PARALLAX.right * d * strength, b = pointer.y * PARALLAX.up * d * strength;
  return [r[0] * a + u[0] * b, r[1] * a + u[1] * b, r[2] * a + u[2] * b];
}
