import type { CSSProperties } from "react";
import { stations, type Diagram } from "./content";

// Each station's text as real HTML. The room (Room.tsx) pins each panel to its CRT screen and
// sets its position, size and opacity; this file only holds how it looks: green phosphor with
// fine scanlines and a curved-glass vignette, all drawn by CSS behind the text so it stays sharp.
// When the text runs past the panel's height, a fade and a "more" hint sit at its bottom edge
// until the visitor has scrolled to the end.
export function ScreenPanels() {
  return (
    <>
      <style>{css}</style>
      {stations.map((s) => (
        <section key={s.id} data-screen={s.id} aria-label={s.name} className="crt-panel" style={{ ...panel, visibility: "hidden" }}
          onScroll={(e) => markMore(e.currentTarget)}>
          <p style={worldLine}>{s.worldLine}</p>
          <h2 style={heading}>{s.heading}</h2>
          {/* links first, so they are on screen without scrolling even in a phone's short panel */}
          <p style={linkRow}>
            {s.links.map((l) => (
              <a key={l.label + l.href} href={l.href} style={link}
                {...(l.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                {l.label}
              </a>
            ))}
          </p>
          {s.diagram && <DiagramFigure d={s.diagram} />}
          {s.body.map((b, i) => <p key={i} style={para}>{b}</p>)}
          <div className="crt-more" aria-hidden="true"><span>more ▾</span></div>
        </section>
      ))}
    </>
  );
}

// A station's diagram as a line drawing. The labels are real SVG text (selectable, scaling with the
// panel); the figure as a whole carries the plain description for a screen reader.
// Boxes and arrows size to their labels, so longer words never spill out of a box.
const BOX_H = 34, H = 62, Y = 22;
const boxWidth = (t: string) => Math.max(66, t.length * 7.4 + 18);
const arrowLen = (t: string) => Math.max(48, t.length * 5.8 + 16);
function DiagramFigure({ d }: { d: Diagram }) {
  const n = d.steps.length;
  const bw = d.steps.map(boxWidth), al = d.hops.map(arrowLen);
  const xs: number[] = [];
  let w = 0;
  d.steps.forEach((_, i) => { xs.push(w); w += bw[i] + (al[i] ?? 0); });
  return (
    <figure data-diagram style={figure}>
      <svg viewBox={`0 0 ${w} ${H}`} role="img" aria-label={d.description} style={{ width: "100%", maxWidth: w * 1.6, display: "block" }}
        fill="none" stroke="#7dffb0" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        {d.steps.map((t, i) => {
          const x = xs[i], mid = Y + BOX_H / 2;
          return (
            <g key={i}>
              <rect x={x + 1} y={Y} width={bw[i] - 2} height={BOX_H} rx={4} />
              <text x={x + bw[i] / 2} y={mid + 4} textAnchor="middle" fill="#b4ffd0" stroke="none" fontSize={13} fontFamily="inherit">{t}</text>
              {i < n - 1 && (
                <>
                  <path d={`M${x + bw[i] + 4} ${mid} H${x + bw[i] + al[i] - 5} m-5 -4 l5 4 l-5 4`} />
                  {d.hops[i] && <text x={x + bw[i] + al[i] / 2} y={mid - 7} textAnchor="middle" fill="#ffb347" stroke="none" fontSize={10} fontFamily="inherit">{d.hops[i]}</text>}
                </>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
const figure: CSSProperties = { margin: "0 0 0.7rem", padding: 0 };

/** Marks a panel whose text runs on below its bottom edge, which shows the "more" cue. */
export function markMore(el: HTMLElement) {
  const more = el.scrollHeight - el.clientHeight - el.scrollTop > 4;
  if (el.dataset.more !== String(more)) el.dataset.more = String(more);
}

const css = `
.crt-panel { padding: 0.9rem 1rem; border: 1px solid #2f7a4d; border-radius: 14px;
  box-shadow: inset 0 0 28px rgba(0,0,0,0.75), 0 0 22px rgba(60,255,140,0.18);
  background:
  repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0 2px, rgba(0,0,0,0.22) 2px 3px),
  radial-gradient(ellipse at 50% 45%, #10391f, #04140b 70%, #010804);
  background-attachment: local; }
/* The cue adds nothing to the scrollable height (the negative top margin cancels its height), and is
   hidden with visibility rather than display: otherwise showing and hiding it changes how far the
   panel can scroll, and the browser moves the visitor's position when it hides at the end. */
.crt-more { position: sticky; bottom: -0.9rem; margin: -2.6rem -1rem 0; height: 2.6rem; visibility: hidden; display: flex;
  align-items: flex-end; justify-content: center; padding-bottom: 0.3rem; pointer-events: none;
  background: linear-gradient(to bottom, rgba(4,20,11,0), rgba(4,20,11,0.97) 70%); }
.crt-more span { font-size: 0.8em; letter-spacing: 0.1em; color: #ffb347; text-shadow: 0 0 6px rgba(255,140,30,0.6); }
.crt-panel[data-more="true"] .crt-more { visibility: visible; }
/* The text resolves out of the shift: it comes in from a red and cyan split that closes up, in a few
   steps like a signal locking, not a smooth fade. Until then the panel is held at opacity 0 by the
   room (still in the page). Reduced motion never gets the attribute, so its text just appears. */
.crt-panel[data-gated="resolving"] { animation: crt-resolve 0.22s steps(5, end); }
@keyframes crt-resolve {
  0% { opacity: 0; text-shadow: -4px 0 rgba(255,60,60,0.9), 4px 0 rgba(60,255,255,0.9); }
  60% { opacity: 0.8; text-shadow: -2px 0 rgba(255,60,60,0.7), 2px 0 rgba(60,255,255,0.7); }
  100% { opacity: 1; text-shadow: 0 0 5px rgba(80,255,150,0.45); }
}
.crt-panel[data-glass="true"] { background: repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0 2px, rgba(0,0,0,0.18) 2px 3px); border: 0; border-radius: 0; box-shadow: none; padding: 0.6em 1.2em; }
.crt-panel[data-glass="true"] .crt-more { margin: -2.6em -1.2em 0; bottom: -0.6em; height: 2.6em;
  background: linear-gradient(to bottom, rgba(2,10,5,0), rgba(2,10,5,0.95) 70%); }
`;

const panel: CSSProperties = {
  position: "fixed", top: 0, left: 0, zIndex: 5, boxSizing: "border-box", overflowY: "auto",
  color: "#b4ffd0", textShadow: "0 0 5px rgba(80,255,150,0.45)", fontSize: "1rem", lineHeight: 1.45,
  userSelect: "text", cursor: "auto", willChange: "transform",
};
const worldLine: CSSProperties = { margin: 0, fontSize: "0.75em", letterSpacing: "0.12em", textTransform: "uppercase", color: "#ffb347" };
const heading: CSSProperties = { margin: "0.2rem 0 0.5rem", fontSize: "1.25em" };
const para: CSSProperties = { margin: "0 0 0.6rem" };
const linkRow: CSSProperties = { margin: "0 0 0.7rem", display: "flex", flexWrap: "wrap", gap: "0.3rem 1rem" };
const link: CSSProperties = { color: "#7dffb0", textDecoration: "underline" };
