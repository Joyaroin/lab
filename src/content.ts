// All copy in the app: visible text, aria labels, boot log lines, the signal lost screen and the
// gap's sentence, plus links. Change copy here and nowhere else: no component or 3D code holds copy.
// The build writes the page's head tags and the pre-boot markup from this module (src/page-html.ts);
// nothing is hand-kept in index.html.
// `validateContent` runs in the tests (and so in `make frontend`); it blocks phone numbers and
// private or tailnet addresses. Internal employer names are NOT caught here: Adham's review of
// any content PR catches those.

export type Link = { label: string; href: string };
export type Station = {
  id: string;
  name: string;
  worldLine: string;
  /** the station's fixed meter reading: arbitrary, and not a number from the series */
  reading: number;
  /** plain heading shown on the CRT */
  heading: string;
  /** one line shown under the heading. Optional only when the station has `pages`, which each have one. */
  lead?: string;
  /** the station's bullets shown on the CRT, at most three (per page, for a station with pages) */
  body: string[];
  links: Link[];
  /** optional line drawing of facts already in the lead and `body` */
  diagram?: Diagram;
  /** optional split of `body` into pages the visitor switches between (Work). `body` stays the
   *  whole text in order; the pages' bullets are the same strings, in the same order. */
  pages?: Page[];
  /** words on the TV's bezel: the maker's plate and the sticky note. Neither may read as a status. */
  bezel: Bezel;
};
/** One page of a station: `label` and `dates` name it on the timeline that switches pages, and
 *  `months` is how long the job ran, which sets its segment's width. */
export type Page = { id: string; label: string; dates: string; months: number; lead: string; body: string[] };
/** The most bullets a station, or a page, may have. */
export const MAX_BULLETS = 3;
/** `plate` is an invented maker and model (no real brand, nothing from the series, ADR-0002). */
export type Bezel = { plate: string; note: string };
/** A chain of steps drawn left to right. `hops[i]` labels the arrow from step i to step i+1
 *  ("" for none), so it has one entry fewer than `steps`. `description` is the plain-text version
 *  a screen reader gets. */
export type Diagram = { description: string; steps: string[]; hops: string[] };
/** The words on the timeline that switches a station's pages. `openMark` and `closedMark` sit before
 *  a segment's tag: the open page is `openMark open`, the others just `closedMark`. */
export const pageSwitch = { name: "Pages", hint: "Click a job to read it", open: "open", openMark: "▸", closedMark: "›" };
/** The app's other words. Strings with `{name}` in them are templates: `fill` puts the values in. */
export const ui = {
  /** the HUD's link back to the overview, and the nav's aria label */
  room: "Room",
  hud: "HUD",
  /** the hint line on the overview, until the first landing at a station: landscape, and portrait (the menu is below) */
  hintLandscape: "Click a monitor",
  hintPortrait: "Tap a monitor, or pick one below",
  /** the cue at the foot of a panel with more text below */
  more: "more ▾",
  /** the meter's label while the gap is still being read */
  readingPending: "reading prod and staging…",
  /** the meter's accessible name ({digits}) */
  meterReading: "Reading {digits}",
  /** the gap's sentence: {n} deploys, {noun} one of the two nouns */
  gapBehind: "MediaSafe: {n} staging {noun} since the last prod release",
  gapBehindAtLeast: "MediaSafe: at least {n} staging {noun} since the last prod release",
  /** the same two sentences, short, for a short landscape window (the compact HUD), where the line under the device must stay one line */
  gapBehindShort: "MediaSafe: {n} {noun} ahead of prod",
  gapBehindAtLeastShort: "MediaSafe: {n}+ {noun} ahead of prod",
  gapSaved: "{gap} (saved value, not live)",
  deploy: "deploy",
  deploys: "deploys",
  /** the boot screen */
  loadProgress: "Load progress",
  bootLog: "Boot log",
  stepCapability: "capability check",
  stepCode: "room code",
  stepScene: "room scene",
  logDone: "[ ok ] {step}",
  logPending: "[ .. ] {step}",
  logPowerOn: "[ ok ] meter power-on",
  /** the signal lost screen; {reason} is the failure's code, which is not copy */
  signalLost: "SIGNAL LOST",
  signalLostReason: "The 3D room could not start in this browser ({reason}).",
  /** the stop controls: the keys' caps, the buttons' aria labels, and the line naming the stop */
  keyPrev: "PREV",
  keyRoom: "ROOM",
  keyNext: "NEXT",
  keyStart: "START",
  prevStation: "Previous station",
  backToRoom: "Back to the room",
  nextStation: "Next station",
  startTour: "Start the tour",
  stopLine: "{label} · {n} of {total}",
};
/** The placeholders each template must keep. */
const PLACEHOLDERS: Record<string, string[]> = {
  meterReading: ["digits"], gapBehind: ["n", "noun"], gapBehindAtLeast: ["n", "noun"],
  gapBehindShort: ["n", "noun"], gapBehindAtLeastShort: ["n", "noun"],
  gapSaved: ["gap"], stopLine: ["label", "n", "total"], logDone: ["step"], logPending: ["step"], signalLostReason: ["reason"],
};
export const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m));
export type Content = {
  identity: { name: string; title: string; pageTitle: string; availability: string; description: string; imageAlt: string };
  links: Link[];
  stations: Station[];
  pageSwitch: typeof pageSwitch;
  ui: typeof ui;
};

// Links that more than one station or the HUD uses, written once.
const LINKEDIN: Link = { label: "LinkedIn", href: "https://www.linkedin.com/in/adham-sedik-971a57184/" };
const GITHUB: Link = { label: "GitHub", href: "https://github.com/Joyaroin" };
const SITE_SOURCE: Link = { label: "This site's source", href: "https://github.com/Joyaroin/lab" };

// Work's two jobs, written once: the station shows them as two pages, each with its own lead.
const SOLACE_LEAD = "Solace · Software Developer Co-op, Platform Engineering · Sep–Dec 2026";
const SOLACE = [
  "I made the EC2 proxies behind CI/CD builds heal themselves: an out-of-memory instance reboots and reports to Slack on its own, since proven on a real outage.",
  "I built an S3 artifact store in Terraform that gives a customer-facing UI pinned releases it can roll back.",
  "I automated product offboarding across UI, API, data model and scripts, ending 30–60 minutes of manual cleanup each time.",
];
const BARRACUDA_LEAD = "Barracuda Networks · Software Engineer Co-op, BarracudaONE Platform · Sep 2025–Aug 2026";
const BARRACUDA = [
  "I built a hotfix workflow that branches from the commit actually in production. It's used by 18 service repos and saves 5–10 minutes per ticket.",
  "I built a Claude API test-scenario generator with a Jira MCP server. All 15 developers use it, and it cut test-note writing by about 40%.",
  "I wrote Terraform for production AWS (VPC, ALB, IAM, ECR, External Secrets) and shipped C#/.NET and React features across about 60 tickets.",
];

export const content: Content = {
  pageSwitch,
  ui,
  identity: {
    name: "Adham Sedik",
    title: "Software & Platform Engineer",
    pageTitle: "Adham Sedik · Lab",
    availability: "Graduating Dec 2027. Open to co-op and full-time.",
    /** the meta description, and the link preview's text */
    description:
      "Adham Sedik, Software & Platform Engineer. Tour a 3D home lab: my work, MediaSafe, my home Kubernetes cluster and the AI software factory that built this site.",
    /** the preview image's alt text */
    imageAlt: "The lab at night: five lit monitors and a nixie meter on a desk, with Adham Sedik's name",
  },

  links: [
    { label: "Résumé", href: "/resume.pdf" },
    LINKEDIN,
    GITHUB,
  ],

  // Real copy, in tour order. Plain descriptions; lab language lives in the world-line labels only.
  // Every fact here comes from spec #165. Add nothing that is not there.
  stations: [
    {
      id: "work", name: "Work", worldLine: "World line 01", reading: 214,
      heading: "Work experience",
      // `body` is the whole text in order (Solace, then Barracuda); `pages` splits the same bullets.
      // Work has no lead of its own: each page has one.
      body: [...SOLACE, ...BARRACUDA],
      pages: [
        { id: "solace", label: "Solace", dates: "Sep to Dec 2026", months: 4, lead: SOLACE_LEAD, body: SOLACE },
        { id: "barracuda", label: "Barracuda", dates: "Sep 2025 to Aug 2026", months: 12, lead: BARRACUDA_LEAD, body: BARRACUDA },
      ],
      links: [LINKEDIN],
      bezel: { plate: "HALDEN HX-101", note: "Call\nFriday" },
    },
    {
      id: "mediasafe", name: "MediaSafe", worldLine: "World line 02", reading: 377,
      heading: "MediaSafe",
      lead: "My tracker for shows and films, built and run by me alone. Next.js 16 and Postgres.",
      body: [
        "Git is the only way it changes: Argo CD ships every merge to staging, and I promote to production by hand.",
        "Secrets live in Vault, backed up nightly to Cloudflare R2, with a restore I've tested.",
        "170+ merged pull requests since August 2026.",
      ],
      diagram: {
        description: "Git is the only way it changes. Argo CD ships every merge to staging. I promote to production by hand.",
        steps: ["Git", "Argo CD", "Staging", "Production"],
        hops: ["", "every merge", "by hand"],
      },
      links: [
        { label: "MediaSafe repo", href: "https://github.com/Joyaroin/MediaSafe" },
        { label: "Deploy repo", href: "https://github.com/Joyaroin/morioh-cho-gitops" },
        { label: "mediasafe.space (Google sign-in)", href: "https://mediasafe.space" },
      ],
      bezel: { plate: "HALDEN HX-214", note: "Buy\ntape" },
    },
    {
      id: "home-lab", name: "Home lab", worldLine: "World line 03", reading: 512,
      heading: "Home lab and Proxmox",
      lead: "I run my own Kubernetes cluster at home, and this site runs on it.",
      body: [
        "Two Proxmox hosts run a two-node k3s cluster, with production and staging on separate nodes.",
        "No ports are open at home: all traffic comes in through a Cloudflare Tunnel.",
        "My Git server and CI runners live here too, with the runner firewalled off from the rest of the network.",
      ],
      diagram: {
        description: "All traffic comes in through a Cloudflare Tunnel. Two Proxmox hosts run a two-node k3s cluster.",
        steps: ["Cloudflare Tunnel", "Proxmox hosts", "k3s cluster"],
        hops: ["traffic", "run"],
      },
      links: [SITE_SOURCE],
      bezel: { plate: "HALDEN HX-330", note: "Water\nthe fern" },
    },
    {
      id: "software-factory", name: "Software factory", worldLine: "World line 04", reading: 733,
      heading: "Software factory",
      lead: "My AI software factory: I plan, and agents build, review and merge. It built this site.",
      body: [
        "I plan a feature with an orchestrator agent, which cuts it into small tickets. Builder agents write each ticket test-first on my Mac and open a pull request.",
        "Every PR runs full CI on my own runner. Then a fresh reviewer agent decides whether it merges by itself, needs me, or goes back for a rebuild.",
        "This site has 90+ merged pull requests since 5 November 2026. Production moves only when I promote it.",
      ],
      diagram: {
        description: "I plan, agents build each ticket and open a PR, a reviewer agent decides, and it merges.",
        steps: ["Plan", "Build", "Review", "Merge"],
        hops: ["tickets", "PR", "decides"],
      },
      links: [SITE_SOURCE],
      bezel: { plate: "HALDEN HX-552", note: "Lunch\nat 1" },
    },
    {
      id: "contact", name: "Contact", worldLine: "World line 05", reading: 861,
      heading: "Contact",
      lead: "I'm Adham Sedik, a software and platform engineer.",
      body: [
        "Honours Computer Science, Software Engineering stream, at Carleton University in Ottawa. I graduate in December 2027.",
        "I'm open to co-op and full-time roles.",
      ],
      links: [
        { label: "adhamsedik@cmail.carleton.ca", href: "mailto:adhamsedik@cmail.carleton.ca" },
        LINKEDIN,
        GITHUB,
        SITE_SOURCE,
      ],
      bezel: { plate: "HALDEN HX-607", note: "Fix the\nshelf" },
    },
  ],
};

export const { identity, links, stations } = content;

// --- validation ---

// A run of digits and separators holding 10 or more digits: 613-555-0142, (613) 555 0142,
// +1 613 555 0142, 6135550142. Years like "2024-2025" have only 8 digits and pass.
const PHONE_RUN = /\+?\d[\d\s().-]{8,}\d/g;
export const hasPhoneNumber = (s: string) =>
  (s.match(PHONE_RUN) ?? []).some((run) => run.replace(/\D/g, "").length >= 10);

const IPV4 = /(?<![\d.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\d.]*\d)/g;
function hasPrivateIPv4(s: string) {
  for (const m of s.matchAll(IPV4)) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT range, which tailnets use
  }
  return false;
}
const PRIVATE_IPV6 = /(?<![\w:])(f[cd][0-9a-f]{2}|fe[89ab][0-9a-f]):[0-9a-f:]*/i; // ULA, link-local
const PRIVATE_HOST = /(?<![\w-])(localhost|[\w-]+(\.[\w-]+)*\.(ts\.net|local|lan|internal|home\.arpa|intranet))(?![\w-])/i;
const hasPrivateAddress = (s: string) =>
  hasPrivateIPv4(s) || PRIVATE_IPV6.test(s) || PRIVATE_HOST.test(s);

// Words that make a title card read as a live result ("hamon Ready", "Synced", "42 passing").
// The card is drawn on a TV, and nothing on a TV may look like live data.
const LIVE_STATUS = /\b(ready|synced|passing|failing|ok|healthy|running|failed|error|degraded|up to date)\b/i;

const SAFE_HREF = /^(https:\/\/|mailto:|\/(?!\/))/i;

export function validateContent(c: Content): string[] {
  const problems: string[] = [];
  const text = (path: string, v: unknown, isHref = false) => {
    if (typeof v !== "string" || v.trim() === "") return void problems.push(`${path}: missing`);
    if (hasPhoneNumber(v)) problems.push(`${path}: looks like a phone number`);
    if (hasPrivateAddress(v)) problems.push(`${path}: contains a private address`);
    if (isHref && !SAFE_HREF.test(v)) problems.push(`${path}: must be https:, mailto: or a site path`);
  };
  const paragraphs = (path: string, list: unknown) => {
    if (!Array.isArray(list) || list.length === 0) return void problems.push(`${path}: missing`);
    list.forEach((b, i) => text(`${path}[${i}]`, b));
  };
  // Text drawn on a TV (title card, diagram) is checked like other copy, and must not read as live.
  const tvText = (path: string, v: unknown) => {
    text(path, v);
    if (typeof v === "string" && LIVE_STATUS.test(v)) problems.push(`${path}: reads as a live status`);
  };
  const linkList = (path: string, list: unknown) => {
    if (!Array.isArray(list)) return void problems.push(`${path}: missing`);
    list.forEach((l: Partial<Link>, i) => {
      text(`${path}[${i}].label`, l?.label);
      text(`${path}[${i}].href`, l?.href, true);
    });
  };

  for (const [f, v] of Object.entries(c.pageSwitch ?? {})) tvText(`pageSwitch.${f}`, v);
  // Every shipped key must be present, and a key added to the given content is checked too.
  const words: Record<string, unknown> = c.ui ?? {};
  for (const k of new Set([...Object.keys(ui), ...Object.keys(words)])) {
    text(`ui.${k}`, words[k]);
    const v = words[k];
    if (typeof v === "string") for (const ph of PLACEHOLDERS[k] ?? []) if (!v.includes(`{${ph}}`)) problems.push(`ui.${k}: must contain {${ph}}`);
  }
  text("identity.name", c.identity?.name);
  text("identity.title", c.identity?.title);
  text("identity.pageTitle", c.identity?.pageTitle);
  text("identity.availability", c.identity?.availability);
  text("identity.description", c.identity?.description);
  text("identity.imageAlt", c.identity?.imageAlt);
  linkList("links", c.links);
  if (!Array.isArray(c.stations) || c.stations.length === 0) problems.push("stations: missing");
  (c.stations ?? []).forEach((s, i) => {
    const p = `stations[${i}]`;
    for (const f of ["id", "heading"] as const) text(`${p}.${f}`, s[f]);
    for (const f of ["name", "worldLine"] as const) tvText(`${p}.${f}`, s[f]);
    if (typeof s.reading !== "number" || !Number.isFinite(s.reading)) problems.push(`${p}.reading: missing`);
    paragraphs(`${p}.body`, s.body);
    if (s.lead === undefined || s.lead === "") { if (!s.pages) problems.push(`${p}.lead: missing`); }
    else text(`${p}.lead`, s.lead);
    if (!s.pages && Array.isArray(s.body) && s.body.length > MAX_BULLETS) problems.push(`${p}.body: at most ${MAX_BULLETS} bullets`);
    linkList(`${p}.links`, s.links);
    if (s.pages) {
      const pp = `${p}.pages`;
      if (!Array.isArray(s.pages) || s.pages.length < 2) problems.push(`${pp}: need at least two`);
      else {
        s.pages.forEach((pg, j) => {
          text(`${pp}[${j}].id`, pg.id);
          for (const f of ["label", "dates"] as const) tvText(`${pp}[${j}].${f}`, pg[f]);
          if (!Number.isInteger(pg.months) || pg.months <= 0) problems.push(`${pp}[${j}].months: missing`);
          text(`${pp}[${j}].lead`, pg.lead);
          paragraphs(`${pp}[${j}].body`, pg.body);
          if (Array.isArray(pg.body) && pg.body.length > MAX_BULLETS) problems.push(`${pp}[${j}].body: at most ${MAX_BULLETS} bullets`);
        });
        const joined = s.pages.flatMap((pg) => (Array.isArray(pg.body) ? pg.body : []));
        if (JSON.stringify(joined) !== JSON.stringify(s.body)) problems.push(`${pp}: bullets must be the same as ${p}.body, in order`);
      }
    }
    for (const f of ["plate", "note"] as const) tvText(`${p}.bezel.${f}`, s.bezel?.[f]);
    if (s.diagram) {
      const d = s.diagram, dp = `${p}.diagram`;
      tvText(`${dp}.description`, d.description);
      if (!Array.isArray(d.steps) || d.steps.length === 0) problems.push(`${dp}.steps: missing`);
      else d.steps.forEach((t, j) => tvText(`${dp}.steps[${j}]`, t));
      if (!Array.isArray(d.hops)) problems.push(`${dp}.hops: must be a list`);
      else {
        if (Array.isArray(d.steps) && d.hops.length !== d.steps.length - 1) problems.push(`${dp}.hops: need one fewer than steps`);
        d.hops.forEach((t, j) => { if (t !== "") tvText(`${dp}.hops[${j}]`, t); });
      }
    }
  });
  return problems;
}
