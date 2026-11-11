import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { content, identity, stations, type Content } from "./content";
import { CLIP_STYLE, escapeHtml, headTags, rootHtml, transformPage } from "./page-html";

const tags = headTags(content);
const root = rootHtml(content);
const esc = escapeHtml;

describe("head tags", () => {
  it("has the page title", () => expect(tags).toContain(`<title>${esc(identity.pageTitle)}</title>`));
  it("has the meta description", () => expect(tags).toContain(`<meta name="description" content="${esc(identity.description)}" />`));
  it("has the canonical link", () => expect(tags).toContain('<link rel="canonical" href="https://lab.mediasafe.space/" />'));
  it("has the Open Graph tags", () => {
    expect(tags).toContain('<meta property="og:type" content="website" />');
    expect(tags).toContain('<meta property="og:url" content="https://lab.mediasafe.space/" />');
    expect(tags).toContain(`<meta property="og:title" content="${esc(identity.pageTitle)}" />`);
    expect(tags).toContain(`<meta property="og:description" content="${esc(identity.description)}" />`);
  });
  it("has the Twitter card", () => expect(tags).toContain('<meta name="twitter:card" content="summary_large_image" />'));
  it("escapes what it writes into attributes", () => {
    const c: Content = structuredClone(content);
    c.identity.description = `a "b" <c> & 'd'`;
    expect(headTags(c)).toContain('<meta name="description" content="a &quot;b&quot; &lt;c&gt; &amp; &#39;d&#39;" />');
  });
});

describe("#root before boot", () => {
  it("shows the name and title, visible", () => {
    const visible = root.slice(0, root.indexOf(`<div style="${CLIP_STYLE}">`));
    expect(visible).toContain(`>${esc(identity.name)}</h1>`);
    expect(visible).toContain(`>${esc(identity.title)}</p>`);
    expect(visible).not.toContain("clip");
  });
  it("hides the station block with the clip pattern, not display:none", () => {
    expect(root).toContain(`<div style="${CLIP_STYLE}">`);
    expect(CLIP_STYLE).toMatch(/width:1px;height:1px/);
    expect(CLIP_STYLE).toContain("clip:rect(0 0 0 0)");
    expect(root).not.toContain("display:none");
  });
  it.each(stations.map((s) => [s.id, s] as const))("%s: heading, lead and bullets are in the block, escaped", (_id, s) => {
    expect(root).toContain(`<h2>${esc(s.heading)}</h2>`);
    if (s.lead) expect(root).toContain(`<p>${esc(s.lead)}</p>`);
    for (const b of s.pages ? s.pages.flatMap((p) => p.body) : s.body) expect(root).toContain(`<li>${esc(b)}</li>`);
  });
  it("writes Work's pages: label, dates, lead and body", () => {
    for (const p of stations.find((s) => s.id === "work")!.pages!) {
      expect(root).toContain(`<h3>${esc(p.label)}</h3>`);
      expect(root).toContain(`<p>${esc(p.dates)}</p>`);
      expect(root).toContain(`<p>${esc(p.lead)}</p>`);
    }
  });
  it("writes Work's bullets once", () => {
    for (const b of stations.find((s) => s.id === "work")!.body) expect(root.split(`<li>${esc(b)}</li>`)).toHaveLength(2);
  });
  it("puts every station link in as a link that keyboard focus skips", () => {
    for (const l of stations.flatMap((s) => s.links)) expect(root).toContain(`<a href="${esc(l.href)}" tabindex="-1">${esc(l.label)}</a>`);
    for (const a of root.match(/<a [^>]*>/g) ?? []) expect(a).toContain('tabindex="-1"');
  });
  it("escapes the text it writes", () => {
    const c: Content = structuredClone(content);
    c.stations[1].heading = "A <b>&</b>";
    c.identity.name = "N & <m>";
    const html = rootHtml(c);
    expect(html).toContain("<h2>A &lt;b&gt;&amp;&lt;/b&gt;</h2>");
    expect(html).toContain(">N &amp; &lt;m&gt;</h1>");
    expect(html).not.toContain("<b>");
  });
});

describe("transformPage", () => {
  const page = transformPage(readFileSync("index.html", "utf8"), content);
  it("writes the head tags into the head and the markup into #root", () => {
    expect(page.indexOf("<title>")).toBeLessThan(page.indexOf("</head>"));
    expect(page).toContain(`<div id="root">${root}</div>`);
    expect(page).toContain('<script type="module" src="/src/main.tsx">');
  });
});

describe("index.html", () => {
  it("holds only what isn't copy", () => {
    const html = readFileSync("index.html", "utf8");
    expect(html).toContain('<div id="root"></div>');
    expect(html).not.toContain("<title>");
    expect(html).not.toContain(identity.name);
  });
});
