import { crts, OVERVIEW, type Crt } from "../crts";
import { panelStrength, PANEL_SHOWN } from "../hold";
import type { Where } from "../where";
import { squareStop } from "../stop";
import { CAMERA_FOV } from "../crts";
import { flightPose, type Pose } from "../visit/flight";
import type { Launch } from "../visit";

// The framing: the one place the portrait split is decided. Two framings exist, and both stay.
//  - Square (a window at least as wide as tall): each station's square stop, worked out from the window
//    so the glass fills the space between the HUD and the meter; the text is laid over the glass; no
//    mouse parallax at a station.
//  - Portrait (taller than wide): the pull-back, or a phone stop, the text pinned beside the CRT, and
//    full parallax.
// `framingFor` is called with the current window each time, so rotating or resizing still switches it.

type V3 = [number, number, number];
export type FramingWindow = { width: number; height: number };

/** Where the mouse parallax begins and reaches full, in a flight away from a station (a share of the flight). */
export const PARALLAX_FROM = 0.2, PARALLAX_FULL = 0.45;

/** A framing's stops: camera and look per stop, the overview pose as stop 0, then one per station. */
export type StopList = { camera: V3; look: V3; exit?: V3[]; fov?: number }[];

export type Framing = {
  name: "square" | "portrait";
  /** The stops the visitor flies between in this framing, the overview pose first (the flight path is tested on these). */
  stops: StopList;
  /** The camera, what it looks at and its field of view at `where`. A flying `where` is the flight from `launch` (where
   *  the camera really began, `visit.launch(now)`; the `from` stop's pose when left out) to its `to` stop. */
  cameraAt(where: Where, launch?: Launch | null): { camera: V3; look: V3; fov: number };
  /** True while station `station`'s text is laid over its glass (panel showing). The text placing and the phosphor swap both ask this. */
  textOnGlass(where: Where, station: number): boolean;
  /** How much mouse parallax applies at `where`, 0 to 1. */
  parallaxStrength(where: Where): number;
  /** Where a station's text is pinned when it is not on the glass. */
  panelPoint(crt: Crt): V3;
};

// On a portrait window the camera stands further back along the same line, so a phone sees the
// station's desk, not only one CRT. The factor per station is in room-layout.json (1 if unset).
// A station with its own phone stop uses that instead (MediaSafe and Software factory, whose pulled-back
// view was mostly dark).
const portraitStops = crts.map((c) => {
  if (c.phone) return { camera: c.phone.camera, look: c.phone.look };
  const l = c.look, k = c.portrait;
  return { camera: [l[0] + (c.camera[0] - l[0]) * k, l[1] + (c.camera[1] - l[1]) * k, l[2] + (c.camera[2] - l[2]) * k] as V3, look: l };
});

/** Mouse parallax in square framing: none while at a station and until the text has faded
 *  (`PARALLAX_FROM`), so the glass stays square behind the flat text, then rising to full by
 *  `PARALLAX_FULL` of the way through a flight, and full through the rest. `f` is the flight's own share,
 *  so the fade does not depend on how long a flight lasts. */
function squareParallax(where: Where): number {
  let away: number; // how far the flight is from the nearest station, a share of the flight
  if (where.kind === "at") away = where.stop >= 1 ? 0 : 1; // the overview is a whole flight from a station
  else away = Math.min(where.from >= 1 ? where.f : Infinity, where.to >= 1 ? 1 - where.f : Infinity);
  return Math.min(1, Math.max(0, (away - PARALLAX_FROM) / (PARALLAX_FULL - PARALLAX_FROM)));
}

const portraitList: StopList = [
  { ...OVERVIEW.portrait },
  ...portraitStops,
];

/** The camera at `where` among `list`'s stops: a stop's own pose, or `flightPose` along the flight. A launch is
 *  resolved from the bottom up: a stop's pose, then `flightPose(fromPose, toPose, f)` for each re-target. */
function poseAt(list: StopList, where: Where, launch?: Launch | null): { camera: V3; look: V3; fov: number } {
  const stop = (i: number): Pose => list[i];
  const resolve = (l: Launch): Pose => l.kind === "at" ? stop(l.stop) : flightPose(resolve(l.from), stop(l.to), l.f);
  if (where.kind === "at") { const p = list[where.stop]; return { camera: [...p.camera], look: [...p.look], fov: p.fov ?? CAMERA_FOV }; }
  const { camera, look, fov } = flightPose(launch ? resolve(launch) : stop(where.from), stop(where.to), where.f);
  return { camera, look, fov };
}

const portrait: Framing = {
  name: "portrait",
  stops: portraitList,
  cameraAt: (where, launch) => poseAt(portraitList, where, launch),
  textOnGlass: () => false,
  parallaxStrength: () => 1, // phones are unchanged
  panelPoint: (crt) => crt.phone?.panel ?? crt.panel,
};

function square(win: FramingWindow): Framing {
  const squares = crts.map((c) => squareStop(c, win));
  const list: StopList = [{ camera: OVERVIEW.camera, look: OVERVIEW.look, exit: OVERVIEW.exit, fov: OVERVIEW.fov }, ...squares];
  return {
    name: "square",
    stops: list,
    cameraAt: (where, launch) => poseAt(list, where, launch),
    textOnGlass: (where, station) => panelStrength(where, station) >= PANEL_SHOWN,
    parallaxStrength: squareParallax,
    panelPoint: (crt) => crt.panel,
  };
}

/** The framing for a window of this size: Portrait when it is taller than wide, otherwise Square. */
export function framingFor(win: FramingWindow): Framing {
  return win.width / win.height < 1 ? portrait : square(win);
}
