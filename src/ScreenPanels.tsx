import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { pageSwitch, stations, type Diagram, type Station } from "./content";

// Each station's text as real HTML. The room (Room.tsx) pins each panel to its CRT screen and
// sets its position, size and opacity; this file only holds how it looks: green phosphor with
// fine scanlines and a curved-glass vignette, all drawn by CSS behind the text so it stays sharp.
// When the text runs past the panel's height, a fade and a "more" hint sit at its bottom edge
// until the visitor has scrolled to the end.
export function ScreenPanels() {
  return (
    <>
      <style>{css}</style>
      {stations.map((s) => <StationPanel key={s.id} s={s} />)}
    </>
  );
}

function StationPanel({ s }: { s: Station }) {
  const ref = useRef<HTMLElement>(null);
  // A station with pages opens on its first (Work: Solace). Scrolling never changes it.
  const [open, setOpen] = useState(0);
  const page = s.pages?.[open];
  // A new page starts at its top, and the "more" cue is worked out for the new text.
  useLayoutEffect(() => { if (ref.current) { ref.current.scrollTop = 0; markMore(ref.current); } }, [open]);
  return (
    <section ref={ref} data-screen={s.id} aria-label={s.name} className="crt-panel" style={{ ...panel, visibility: "hidden" }}
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
      {s.pages && <Timeline pages={s.pages} open={open} onOpen={setOpen} />}
      {(page ? page.body : s.body).map((b, i) => <p key={i} style={para}>{b}</p>)}
      <div className="crt-more" aria-hidden="true"><span>more ▾</span></div>
    </section>
  );
}

// The timeline that is Work's diagram and its page switch: one real button per job, oldest on the
// left, each as wide as its months. The open one is filled and tagged "open" with a marker, the
// others are outlined with an arrow and brighten under the pointer or keyboard focus, so the open
// page never rests on colour alone and the rest look clickable.
function Timeline({ pages, open, onOpen }: { pages: NonNullable<Station["pages"]>; open: number; onOpen: (i: number) => void }) {
  const order = [...pages.keys()].reverse(); // oldest first, left to right
  return (
    <div role="group" aria-label={pageSwitch.name} data-timeline style={timeline}>
      <p style={hint}>{pageSwitch.hint}</p>
      <div style={{ display: "flex", gap: 6 }}>
        {order.map((i) => (
          <button key={pages[i].id} type="button" className="crt-seg" data-page={pages[i].id} data-open={i === open}
            aria-pressed={i === open} onClick={() => onOpen(i)} style={{ flex: `${pages[i].months} 1 0`, minWidth: "5.5em" }}>
            <span className="crt-seg-label"><span className="crt-seg-tag">{i === open ? `▸ ${pageSwitch.open}` : "›"}</span> {pages[i].label}</span>
            <span className="crt-seg-dates">{pages[i].dates}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
const timeline: CSSProperties = { margin: "0 0 0.7rem", padding: 0 };
const hint: CSSProperties = { margin: "0 0 0.25rem", fontSize: "0.75em", letterSpacing: "0.08em", color: "#ffb347" };

// A station's diagram as a line drawing. The labels are real SVG text (selectable, scaling with the
// panel); the figure as a whole carries the plain description for a screen reader.
const BOX_W = 92, BOX_H = 34, GAP = 72, H = 62, Y = 22;
function DiagramFigure({ d }: { d: Diagram }) {
  const n = d.steps.length;
  const w = n * BOX_W + (n - 1) * GAP;
  return (
    <figure data-diagram style={figure}>
      <svg viewBox={`0 0 ${w} ${H}`} role="img" aria-label={d.description} style={{ width: "100%", maxWidth: w * 1.6, display: "block" }}
        fill="none" stroke="#7dffb0" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        {d.steps.map((t, i) => {
          const x = i * (BOX_W + GAP);
          return (
            <g key={i}>
              <rect x={x + 1} y={Y} width={BOX_W - 2} height={BOX_H} rx={4} />
              <text x={x + BOX_W / 2} y={Y + BOX_H / 2 + 4} textAnchor="middle" fill="#b4ffd0" stroke="none" fontSize={13} fontFamily="inherit">{t}</text>
              {i < n - 1 && (
                <>
                  <path d={`M${x + BOX_W + 4} ${Y + BOX_H / 2} H${x + BOX_W + GAP - 5} m-5 -4 l5 4 l-5 4`} />
                  <text x={x + BOX_W + GAP / 2} y={Y + BOX_H / 2 - 7} textAnchor="middle" fill="#ffb347" stroke="none" fontSize={10} fontFamily="inherit">{d.hops[i]}</text>
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
.crt-seg { font: inherit; color: #b4ffd0; text-align: left; cursor: pointer; display: grid; padding: 0.2em 0.6em;
  background: rgba(10,40,22,0.6); border: 1px dashed #2f7a4d; border-top: 3px solid #2f7a4d; border-radius: 6px; text-shadow: inherit; }
.crt-seg:hover, .crt-seg:focus-visible { background: #0f4a28; border-color: #7dffb0; box-shadow: 0 0 10px rgba(80,255,150,0.4); }
.crt-seg:focus-visible { outline: 2px solid #ffb347; outline-offset: 2px; }
.crt-seg[data-open="true"] { background: #7dffb0; color: #02140a; text-shadow: none; border: 2px solid #7dffb0; border-top-width: 6px; cursor: default; font-weight: 700; }
.crt-seg-tag { font-size: 0.7em; letter-spacing: 0.1em; text-transform: uppercase; color: #ffb347; }
.crt-seg[data-open="true"] .crt-seg-tag { color: #02140a; }
.crt-seg-label { font-size: 1.05em; }
.crt-seg-dates { font-size: 0.8em; }
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
