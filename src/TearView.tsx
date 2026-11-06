import { useEffect, useRef } from "react";
import type { ShiftKind } from "./nixie";
import { tearAt } from "./tear";

const FILTER = "shift-tear", TURN_FILTER = "shift-tear-page"; // the whole view's, and a Work page turn's
// Different cuts of the bands, one per pose. The map is noise that varies only down the screen,
// stepped into flat bands, so each band slips its own distance (left or right) as a whole.
const SEEDS = [11, 4, 27];
const BANDS = "0 .12 .86 .3 1 .5 0 .74 .95 .2 .6 .02 .9 .4";

type Play = { kind: ShiftKind; id: number } | null;

/** The shift's tear, in plain SVG and CSS (no library): while a shift plays, the room's canvas is
 *  drawn through an SVG filter that slips horizontal bands sideways and splits a red and a cyan
 *  edge off them. It runs only for the length of the shift and takes the filter off afterwards, so
 *  at rest it costs nothing. A new `shift.id` starts one; `shift` null (or reduced motion) ends it.
 *  `turn` is a Work page turn: the same short flick, on that TV's screen only, through its own copy of
 *  the filter so it never fights a tear of the whole view. */
export function Tear({ shift, turn, reduced, onStart }: { shift: Play; turn?: { el: HTMLElement; id: number } | null; reduced: boolean; onStart?: (kind: ShiftKind, nowMs: number) => void }) {
  const whole = useTear(FILTER, () => document.querySelector<HTMLElement>("canvas"), shift, reduced, onStart);
  const page = useTear(TURN_FILTER, () => turn?.el ?? null, turn ? { kind: "short", id: turn.id } : null, reduced);
  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" style={{ position: "absolute" }}>
      <TearFilter id={FILTER} refs={whole} />
      <TearFilter id={TURN_FILTER} refs={page} />
    </svg>
  );
}

type Refs = { turb: React.RefObject<SVGFETurbulenceElement | null>; disp: React.RefObject<SVGFEDisplacementMapElement | null>; red: React.RefObject<SVGFEOffsetElement | null>; cyan: React.RefObject<SVGFEOffsetElement | null> };

function useTear(filter: string, target: () => HTMLElement | null, shift: Play, reduced: boolean, onStart?: (kind: ShiftKind, nowMs: number) => void): Refs {
  const refs: Refs = { turb: useRef<SVGFETurbulenceElement>(null), disp: useRef<SVGFEDisplacementMapElement>(null), red: useRef<SVGFEOffsetElement>(null), cyan: useRef<SVGFEOffsetElement>(null) };
  useEffect(() => {
    const el = target();
    if (!shift || reduced || !el) return;
    const start = performance.now(); // the effect runs a frame or more after the shift fired; time it from here
    onStart?.(shift.kind, start);
    let raf = 0;
    const tick = () => {
      const t = tearAt((performance.now() - start) / 1000, shift.kind);
      if (t.done) { el.style.filter = ""; return; }
      const w = window.innerWidth;
      refs.turb.current?.setAttribute("seed", String(SEEDS[t.pose]));
      refs.disp.current?.setAttribute("scale", String(t.slip * w * 2)); // the map spans ±half the scale
      refs.red.current?.setAttribute("dx", String(t.edge * w));
      refs.cyan.current?.setAttribute("dx", String(-t.edge * w));
      el.style.filter = `url(#${filter})`;
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); el.style.filter = ""; };
  }, [shift?.id, shift?.kind, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  return refs;
}

function TearFilter({ id, refs: { turb, disp, red, cyan } }: { id: string; refs: Refs }) {
  return (
    <filter id={id} x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
      <feTurbulence ref={turb} type="fractalNoise" baseFrequency="0 0.03" numOctaves="1" seed="11" result="noise" />
      <feComponentTransfer in="noise" result="bands">
        <feFuncR type="discrete" tableValues={BANDS} />
        <feFuncG type="linear" slope="0" intercept="0" />
        <feFuncB type="linear" slope="0" intercept="0.5" />
        <feFuncA type="linear" slope="0" intercept="1" />
      </feComponentTransfer>
      <feDisplacementMap ref={disp} in="SourceGraphic" in2="bands" scale="0" xChannelSelector="R" yChannelSelector="B" result="slipped" />
      <feColorMatrix in="slipped" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
      <feOffset ref={red} in="r" dx="0" result="rOut" />
      <feColorMatrix in="slipped" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="c" />
      <feOffset ref={cyan} in="c" dx="0" result="cOut" />
      <feBlend in="rOut" in2="cOut" mode="screen" />
    </filter>
  );
}
