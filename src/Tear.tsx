import { useEffect, useRef } from "react";
import type { ShiftKind } from "./nixie";
import { tearAt } from "./tear";

const FILTER = "shift-tear";
// Different cuts of the bands, one per pose. The map is noise that varies only down the screen,
// stepped into flat bands, so each band slips its own distance (left or right) as a whole.
const SEEDS = [11, 4, 27];
const BANDS = "0 .12 .86 .3 1 .5 0 .74 .95 .2 .6 .02 .9 .4";

/** The shift's tear, in plain SVG and CSS (no library): while a shift plays, the room's canvas is
 *  drawn through an SVG filter that slips horizontal bands sideways and splits a red and a cyan
 *  edge off them. It runs only for the length of the shift and takes the filter off afterwards, so
 *  at rest it costs nothing. A new `shift.id` starts one; `shift` null (or reduced motion) ends it. */
export function Tear({ shift, reduced }: { shift: { kind: ShiftKind; id: number; at: number } | null; reduced: boolean }) {
  const turb = useRef<SVGFETurbulenceElement>(null);
  const disp = useRef<SVGFEDisplacementMapElement>(null);
  const red = useRef<SVGFEOffsetElement>(null);
  const cyan = useRef<SVGFEOffsetElement>(null);

  useEffect(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("canvas");
    if (!shift || reduced || !canvas) return;
    const start = shift.at; // the moment the shift fired, the same clock as the text's
    let raf = 0;
    const tick = () => {
      const t = tearAt((performance.now() - start) / 1000, shift.kind);
      if (t.done) { canvas.style.filter = ""; return; }
      const w = window.innerWidth;
      turb.current?.setAttribute("seed", String(SEEDS[t.pose]));
      disp.current?.setAttribute("scale", String(t.slip * w * 2)); // the map spans ±half the scale
      red.current?.setAttribute("dx", String(t.edge * w));
      cyan.current?.setAttribute("dx", String(-t.edge * w));
      canvas.style.filter = `url(#${FILTER})`;
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); canvas.style.filter = ""; };
  }, [shift?.id, shift?.kind, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" style={{ position: "absolute" }}>
      <filter id={FILTER} x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
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
    </svg>
  );
}
