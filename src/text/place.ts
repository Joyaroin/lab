import { Vector3, type Camera } from "three";
import { glassEdge, panelPoint, type Crt } from "../crts";
import { glassBox } from "../glass";
import { holdSpan, PANEL_SHOWN, panelStrength } from "../hold";
import { fitPanel, glassFontSize } from "../pin";
import type { Shift } from "../shift";
import { textOnGlass } from "../tour";
import { markMore, type MoreEl } from "./more";

/** What placing touches on a station's panel. A DOM element is one; unit tests use a plain object. */
export type PanelEl = MoreEl & {
  style: Pick<CSSStyleDeclaration, "opacity" | "visibility" | "pointerEvents" | "width" | "height" | "maxHeight" | "fontSize" | "transform">;
};

/** The panel's opacity and visibility count as "showing" for the meter's check when it is visible and
 *  at least this strong. */
const COVERS_AT = 0.3;

/** Is this station's text up enough to cover the meter? The meter's check asks this and reads no styles. */
export function textCovers(el: { style: { visibility: string; opacity: string } }): boolean {
  return el.style.visibility !== "hidden" && Number(el.style.opacity) >= COVERS_AT;
}

type Scratch = { c: Vector3; e: Vector3; p: Vector3 };
export const scratch = (): Scratch => ({ c: new Vector3(), e: new Vector3(), p: new Vector3() });

export type Frame = {
  camera: Camera;
  size: { width: number; height: number };
  progress: number;
  nowMs: number;
  shift: Shift;
  scratch: Scratch;
};

/** What each panel was last drawn as: held ("true"), resolving, or neither. Kept here, so the text never
 *  decides from the element; `data-gated` is only written out for the CSS and the browser specs. */
const drawn = new WeakMap<PanelEl, "true" | "resolving" | undefined>();

/**
 * Places one station's panel for this frame: its opacity and visibility, whether it takes the wheel,
 * and where it sits over its CRT. `k` is the station's index in `crts`. What it last drew is kept in this
 * module (and written to `data-gated` for the CSS), so the resolve starts once when held text comes out, and a return's text
 * just appears. Whether the text is held, resolving or showing is the shift's to say (`textState`).
 */
export function placeText(el: PanelEl, crt: Crt, k: number, f: Frame) {
  const { camera, size, progress, shift } = f;
  // Full for the whole hold. Held back (but still in the page, for readers and selection)
  // from arrival until the shift ends, then (first visit) it resolves out of the effect. A return's
  // text shows when the wait ends and the flick plays over it.
  const strength = panelStrength(progress, k + 1);
  const state = shift.textState(k + 1, progress, f.nowMs);
  const out = state !== "held";
  const before = drawn.get(el);
  let now = before;
  if (out && before === "true") now = state === "resolving" ? "resolving" : undefined; // only a first visit's text resolves; a return's just appears
  else if (!out) now = strength >= PANEL_SHOWN ? "true" : undefined;
  if (now !== before) {
    drawn.set(el, now);
    if (now) el.dataset.gated = now; else delete el.dataset.gated;
  }
  el.style.opacity = String(out ? strength : 0);
  el.style.visibility = strength < PANEL_SHOWN ? "hidden" : "visible";
  // Only during the hold does the panel take the wheel. Outside it the panel is shrinking or
  // growing with the camera, so its text overflows differently every frame and would eat the
  // wheel steps that should move the tour on.
  const [h0, h1] = holdSpan(k + 1);
  el.style.pointerEvents = out && progress >= h0 && progress <= h1 ? "auto" : "none";
  if (strength < PANEL_SHOWN) return;
  const aspect = size.width / size.height;
  if (textOnGlass(progress, k + 1, aspect)) {
    // Desktop: the camera is square to the glass, so the text is laid exactly over it.
    const { left, top, width, height } = glassBox(crt, camera, size);
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    if (el.style.maxHeight !== "none") el.style.maxHeight = "none"; // the fixed height is the limit
    el.style.fontSize = `${glassFontSize(width)}px`;
    el.dataset.glass = "true";
    el.style.transform = `translate(${left}px, ${top}px)`;
    markMore(el);
    return;
  }
  el.style.height = "";
  el.style.fontSize = "";
  delete el.dataset.glass;
  const { c, e, p } = f.scratch;
  const [x, y, z] = crt.screen;
  c.set(x, y, z).project(camera);
  e.set(...glassEdge(crt)).project(camera);
  p.set(...panelPoint(crt, aspect)).project(camera);
  const px = (p.x * 0.5 + 0.5) * size.width, py = (-p.y * 0.5 + 0.5) * size.height;
  const crtWidth = Math.hypot((e.x - c.x) * size.width, (e.y - c.y) * size.height);
  // Set the width first, then measure the natural height at that width and fit, so the
  // panel settles in this one frame: frames are only drawn on demand.
  el.style.width = `${fitPanel(size, px, py, crtWidth, 0).width}px`;
  // With no height limit nothing overflows, so the browser resets scrollTop to 0: keep it and
  // put it back once the limit is restored (it is clamped to the new range if the panel shrank).
  const kept = el.scrollTop;
  el.style.maxHeight = "none";
  const fit = fitPanel(size, px, py, crtWidth, el.scrollHeight);
  el.style.maxHeight = `${fit.maxHeight}px`;
  el.scrollTop = kept;
  el.style.transform = `translate(${fit.left}px, ${fit.top}px)`;
  markMore(el);
}
