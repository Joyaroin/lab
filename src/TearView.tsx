import { useEffect, useRef, useState } from "react";
import type { Play, Shift } from "./shift";
import { tearAt, TEAR_SEEDS } from "./tear";

const FILTER = "shift-tear", TURN_FILTER = "shift-tear-page"; // the whole view's, and a Work page turn's
// The map is noise that varies only down the screen, stepped into flat bands, so each band slips
// its own distance (left or right) as a whole. Each pose is a different cut (TEAR_SEEDS).
const BANDS = "0 .12 .86 .3 1 .5 0 .74 .95 .2 .6 .02 .9 .4";

/** A Work page turn's flick: the screen's element, and an `id` that changes for each turn. */
export type PageTurn = { el: HTMLElement; id: number };
/** What a screen calls when its page turns, with its element. */
export type OnPageTurn = (el: HTMLElement) => void;
/** What a play tells the shift when it really starts drawing (a frame or more after the shift fired). */
type OnTearStart = (kind: Play["kind"], nowMs: number) => void;

/** The shift's tear, in plain SVG and CSS (no library): while a shift plays, the room's canvas is
 *  drawn through an SVG filter that slips horizontal bands sideways and splits a red and a cyan
 *  edge off them. It runs only for the length of the shift and takes the filter off afterwards, so
 *  at rest it costs nothing. It subscribes to the shift: each new play starts one, and it plays out its own
 *  length even if the visitor leaves (the flash limit counted its snap back); reduced motion ends it.
 *  It reports when it really began, and when a page turn's flick did, straight to the shift.
 *  `turn` is a Work page turn: the same short flick, on that TV's screen only, through its own copy of
 *  the filter so it never fights a tear of the whole view. */
export function Tear({ shift, turn, reduced }: { shift: Shift; turn?: PageTurn | null; reduced: boolean }) {
  const [play, setPlay] = useState<Play | null>(null);
  // A null (the visitor left) is ignored: the tear finishes its own length.
  useEffect(() => shift.subscribe(() => { const p = shift.playing; if (p) setPlay(p); }), [shift]);
  const whole = useTear(FILTER, () => document.querySelector<HTMLElement>("canvas"), play, reduced, (kind, nowMs) => shift.tearStarted(kind, nowMs));
  const page = useTear(TURN_FILTER, () => turn?.el ?? null, turn ? { kind: "short", id: turn.id } : null, reduced, (_, nowMs) => shift.turnStarted(nowMs));
  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" style={{ position: "absolute" }}>
      <TearFilter id={FILTER} refs={whole} />
      <TearFilter id={TURN_FILTER} refs={page} />
    </svg>
  );
}

type Refs = { turb: React.RefObject<SVGFETurbulenceElement | null>; disp: React.RefObject<SVGFEDisplacementMapElement | null>; red: React.RefObject<SVGFEOffsetElement | null>; cyan: React.RefObject<SVGFEOffsetElement | null> };

function useTear(filter: string, target: () => HTMLElement | null, shift: Play | null, reduced: boolean, onStart?: OnTearStart): Refs {
  const refs: Refs = { turb: useRef<SVGFETurbulenceElement>(null), disp: useRef<SVGFEDisplacementMapElement>(null), red: useRef<SVGFEOffsetElement>(null), cyan: useRef<SVGFEOffsetElement>(null) };
  // Read each frame, so switching reduced motion on ends a play, and switching it off again with the page
  // open does not start it over (the effect below runs only for a new play, and never replays one).
  const reducedNow = useRef(reduced);
  reducedNow.current = reduced;
  useEffect(() => {
    const el = target();
    if (!shift || reducedNow.current || !el) return;
    const start = performance.now(); // the effect runs a frame or more after the shift fired; time it from here
    onStart?.(shift.kind, start);
    let raf = 0;
    const tick = () => {
      const t = tearAt((performance.now() - start) / 1000, shift.kind);
      if (t.done || reducedNow.current) { el.style.filter = ""; return; }
      const w = window.innerWidth;
      refs.turb.current?.setAttribute("seed", String(TEAR_SEEDS[shift.kind][t.pose]));
      refs.disp.current?.setAttribute("scale", String(t.slip * w * 2)); // the map spans ±half the scale
      refs.red.current?.setAttribute("dx", String(t.edge * w));
      refs.cyan.current?.setAttribute("dx", String(-t.edge * w));
      el.style.filter = `url(#${filter})`;
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); el.style.filter = ""; };
  }, [shift?.id, shift?.kind]); // eslint-disable-line react-hooks/exhaustive-deps
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
