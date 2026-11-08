import { crts, ENTRANCE, OVERVIEW, type Crt } from "../crts";
import { panelStrength, PANEL_SHOWN } from "../hold";
import type { Where } from "../where";
import { squareStop } from "../stop";
import { flyAlong } from "../tour";

// The framing: the one place the portrait split is decided. Two framings exist, and both stay.
//  - Square (a window at least as wide as tall): each station's square stop, worked out from the window
//    so the glass fills the space between the HUD and the meter; the text is laid over the glass; no
//    mouse parallax in a hold.
//  - Portrait (taller than wide): the pull-back, or a phone stop, the text pinned beside the CRT, and
//    full parallax.
// `framingFor` is called with the current window each time, so rotating or resizing still switches it.

type V3 = [number, number, number];
export type FramingWindow = { width: number; height: number };

/** Where the mouse parallax begins and reaches full, in travel away from a stop (a share of one stretch). */
export const PARALLAX_FROM = 0.2, PARALLAX_FULL = 0.45;

/** A framing's stops: camera and look per stop, the overview pose as stop 0, then one per station. */
export type StopList = { camera: V3; look: V3; exit?: V3[]; fov?: number }[];

export type Framing = {
  name: "square" | "portrait";
  /** The stops the visitor flies between in this framing, the overview pose first (the flight path is tested on these). */
  stops: StopList;
  /** The camera and what it looks at at `where`. `reduced` (reduced motion) straightens the legs between stations. */
  cameraAt(where: Where, reduced?: boolean): { camera: V3; look: V3 };
  /** True while station `station`'s text is laid over its glass (panel showing). The text placing and the phosphor swap both ask this. */
  textOnGlass(where: Where, station: number): boolean;
  /** How much mouse parallax applies at `where`, 0 to 1. */
  parallaxStrength(where: Where): number;
  /** Where a station's text is pinned when it is not on the glass. */
  panelPoint(crt: Crt): V3;
};

// The camera at each stop and what it looks at: the entrance first, then one per CRT.
const stops: V3[] = [ENTRANCE.camera, ...crts.map((c) => c.camera)];
const looks: V3[] = [ENTRANCE.look, ...crts.map((c) => c.look)];
// On a portrait window the camera stands further back along the same line, so a phone sees the
// station's desk, not only one CRT. The factor per stop is in room-layout.json (1 if unset).
// A station with its own phone stop uses that instead (MediaSafe and Software factory, whose pulled-back
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

/** Mouse parallax in square framing: none for the whole hold and until the text has faded
 *  (`PARALLAX_FROM`), so the glass stays square behind the flat text, then rising to full by
 *  `PARALLAX_FULL` of the way through travel, and full through the rest. */
function squareParallax(where: Where): number {
  let away: number; // travel away from the nearest station, a share of one stretch
  if (where.kind === "at") away = where.stop >= 1 ? 0 : 1; // the entrance is one stretch from station 1
  else away = Math.min(where.from >= 1 ? where.f : Infinity, where.to >= 1 ? 1 - where.f : Infinity);
  return Math.min(1, Math.max(0, (away - PARALLAX_FROM) / (PARALLAX_FULL - PARALLAX_FROM)));
}

const portraitList: StopList = [
  { ...OVERVIEW.portrait },
  ...portraitStops.slice(1).map((camera, i) => ({ camera, look: portraitLooks[i + 1] })),
];

const portrait: Framing = {
  name: "portrait",
  stops: portraitList,
  cameraAt: (where, reduced) => flyAlong(portraitStops, portraitLooks, where, reduced),
  textOnGlass: () => false,
  parallaxStrength: () => 1, // phones are unchanged
  panelPoint: (crt) => crt.phone?.panel ?? crt.panel,
};

function square(win: FramingWindow): Framing {
  const squares = crts.map((c) => squareStop(c, win));
  const cameras: V3[] = [stops[0], ...squares.map((s) => s.camera)];
  const aims: V3[] = [looks[0], ...squares.map((s) => s.look)];
  return {
    name: "square",
    stops: [{ camera: OVERVIEW.camera, look: OVERVIEW.look, exit: OVERVIEW.exit, fov: OVERVIEW.fov }, ...squares],
    cameraAt: (where, reduced) => flyAlong(cameras, aims, where, reduced),
    textOnGlass: (where, station) => panelStrength(where, station) >= PANEL_SHOWN,
    parallaxStrength: squareParallax,
    panelPoint: (crt) => crt.panel,
  };
}

/** The framing for a window of this size: Portrait when it is taller than wide, otherwise Square. */
export function framingFor(win: FramingWindow): Framing {
  return win.width / win.height < 1 ? portrait : square(win);
}
