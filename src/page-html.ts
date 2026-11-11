// The page's HTML, written from the content module: the head tags, and what #root holds before the
// room boots. A pure function of the content. vite.config.ts applies it (transformIndexHtml), so
// `npm run dev` and the build both get it. createRoot().render replaces #root's contents at boot.
import type { Content, Station } from "./content";
import { iconTags } from "./page-icon-tags";
import { imageTags } from "./page-image-tags";

export const CANONICAL_URL = "https://lab.mediasafe.space/";

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const e = escapeHtml;

/** The standard clip pattern: a 1x1 px box that screen readers and crawlers still read (display:none would hide it). */
export const CLIP_STYLE =
  "position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap";

const meta = (attr: "name" | "property", key: string, value: string) => `<meta ${attr}="${key}" content="${e(value)}" />`;

/** Head tags: title, description, canonical and the Open Graph and Twitter tags. */
export function headTags(c: Content): string[] {
  const { pageTitle, description } = c.identity;
  return [
    `<title>${e(pageTitle)}</title>`,
    meta("name", "description", description),
    `<link rel="canonical" href="${CANONICAL_URL}" />`,
    meta("property", "og:type", "website"),
    meta("property", "og:url", CANONICAL_URL),
    meta("property", "og:title", pageTitle),
    meta("property", "og:description", description),
    meta("name", "twitter:card", "summary_large_image"),
    // Each of these has a file of its own, so the tickets that fill them don't edit the same lines.
    ...imageTags(c),
    ...iconTags(c),
  ];
}

const list = (items: string[]) => `<ul>${items.map((b) => `<li>${e(b)}</li>`).join("")}</ul>`;
const link = (l: { label: string; href: string }) => `<a href="${e(l.href)}" tabindex="-1">${e(l.label)}</a>`;

function stationHtml(s: Station): string {
  const parts = [`<h2>${e(s.heading)}</h2>`];
  if (s.pages) {
    // Work's body repeats its pages' bullets, so it is written through its pages only.
    if (s.lead) parts.push(`<p>${e(s.lead)}</p>`);
    for (const p of s.pages) parts.push(`<h3>${e(p.label)}</h3>`, `<p>${e(p.dates)}</p>`, `<p>${e(p.lead)}</p>`, list(p.body));
  } else {
    if (s.lead) parts.push(`<p>${e(s.lead)}</p>`);
    parts.push(list(s.body));
  }
  if (s.links.length) parts.push(`<p>${s.links.map(link).join(" ")}</p>`);
  return `<section>${parts.join("")}</section>`;
}

/** What #root holds before boot: the name and title, visible, then every station's text, visually hidden. */
export function rootHtml(c: Content): string {
  const { name, title } = c.identity;
  return (
    `<main style="padding:12vh 8vw"><h1 style="margin:0;font-size:clamp(2rem,6vw,4rem)">${e(name)}</h1>` +
    `<p style="margin:.5rem 0 2rem;font-size:clamp(1rem,2.5vw,1.5rem)">${e(title)}</p></main>` +
    `<div style="${CLIP_STYLE}">${c.stations.map(stationHtml).join("")}</div>`
  );
}

/** Writes the head tags and #root's markup into index.html. */
export function transformPage(html: string, c: Content): string {
  return html
    .replace("</head>", () => `    ${headTags(c).join("\n    ")}\n  </head>`)
    .replace('<div id="root"></div>', () => `<div id="root">${rootHtml(c)}</div>`);
}
