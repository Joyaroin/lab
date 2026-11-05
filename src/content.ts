// All visitor-facing text and links. Change copy here and nowhere else: no 3D code holds copy.
// `validateContent` runs in the tests (and so in `make frontend`); it blocks phone numbers and
// private or tailnet addresses. Internal employer names are NOT caught here: Adham's review of
// any content PR catches those.
//
// The name and title are also written into index.html so they show before any script runs:
// keep the two in step (a test checks this).

export type Link = { label: string; href: string };
export type Station = {
  id: string;
  name: string;
  worldLine: string;
  /** the station's fixed meter reading: arbitrary, and not a number from the series */
  reading: number;
  /** plain heading shown on the CRT */
  heading: string;
  /** plain paragraphs shown on the CRT */
  body: string[];
  links: Link[];
};
export type Content = {
  identity: { name: string; title: string };
  links: Link[];
  stations: Station[];
};

export const content: Content = {
  identity: {
    name: "Adham Sedik",
    title: "SWE & Platform",
  },

  // The résumé PDF is added at launch (#12).
  links: [
    { label: "Résumé", href: "/resume.pdf" },
    { label: "LinkedIn", href: "https://www.linkedin.com/in/adham-sedik" },
    { label: "GitHub", href: "https://github.com/Joyaroin" },
  ],

  // PLACEHOLDER copy, in tour order. Real text comes in a later PR that Adham reviews before merge.
  stations: [
    {
      id: "work", name: "Work", worldLine: "World line 01", reading: 214,
      heading: "Work experience",
      body: [
        "Placeholder: the employer and role go here, newest first.",
        "Placeholder: one plain sentence on what was built or run there.",
      ],
      links: [{ label: "LinkedIn", href: "https://www.linkedin.com/in/adham-sedik" }],
    },
    {
      id: "mediasafe", name: "MediaSafe", worldLine: "World line 02", reading: 377,
      heading: "MediaSafe",
      body: [
        "Placeholder: what MediaSafe is, in one plain sentence.",
        "Placeholder: how it is deployed, from staging to production.",
      ],
      links: [{ label: "Deploy repo", href: "https://github.com/Joyaroin/morioh-cho-gitops" }],
    },
    {
      id: "home-lab", name: "Home lab", worldLine: "World line 03", reading: 512,
      heading: "Home lab and Proxmox",
      body: [
        "Placeholder: what the lab runs and why it is built this way.",
        "Placeholder: the hypervisor, the cluster and how changes reach them.",
      ],
      links: [{ label: "GitHub", href: "https://github.com/Joyaroin" }],
    },
    {
      id: "order-tracker", name: "Order Tracker", worldLine: "World line 04", reading: 640,
      heading: "Order Tracker",
      body: ["Placeholder: what Order Tracker does and what it was built with."],
      links: [{ label: "GitHub", href: "https://github.com/Joyaroin" }],
    },
    {
      id: "wc2026-predictor", name: "wc2026-predictor", worldLine: "World line 05", reading: 733,
      heading: "wc2026-predictor",
      body: ["Placeholder: what the predictor does and how it was built."],
      links: [{ label: "GitHub", href: "https://github.com/Joyaroin" }],
    },
    {
      id: "contact", name: "Contact", worldLine: "World line 06", reading: 861,
      heading: "Contact",
      body: [
        "Placeholder: availability for co-op and full-time roles, and the graduation date.",
        "Reach me through the links below.",
      ],
      links: [
        { label: "LinkedIn", href: "https://www.linkedin.com/in/adham-sedik" },
        { label: "GitHub", href: "https://github.com/Joyaroin" },
      ],
    },
  ],
};

export const { identity, links, stations } = content;

// --- validation ---

// A run of digits and separators holding 10 or more digits: 613-555-0142, (613) 555 0142,
// +1 613 555 0142, 6135550142. Years like "2024-2025" have only 8 digits and pass.
const PHONE_RUN = /\+?\d[\d\s().-]{8,}\d/g;
const hasPhoneNumber = (s: string) =>
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

const SAFE_HREF = /^(https:\/\/|mailto:|\/(?!\/))/i;

export function validateContent(c: Content): string[] {
  const problems: string[] = [];
  const text = (path: string, v: unknown, isHref = false) => {
    if (typeof v !== "string" || v.trim() === "") return void problems.push(`${path}: missing`);
    if (hasPhoneNumber(v)) problems.push(`${path}: looks like a phone number`);
    if (hasPrivateAddress(v)) problems.push(`${path}: contains a private address`);
    if (isHref && !SAFE_HREF.test(v)) problems.push(`${path}: must be https:, mailto: or a site path`);
  };
  const linkList = (path: string, list: unknown) => {
    if (!Array.isArray(list)) return void problems.push(`${path}: missing`);
    list.forEach((l: Partial<Link>, i) => {
      text(`${path}[${i}].label`, l?.label);
      text(`${path}[${i}].href`, l?.href, true);
    });
  };

  text("identity.name", c.identity?.name);
  text("identity.title", c.identity?.title);
  linkList("links", c.links);
  if (!Array.isArray(c.stations) || c.stations.length === 0) problems.push("stations: missing");
  (c.stations ?? []).forEach((s, i) => {
    const p = `stations[${i}]`;
    for (const f of ["id", "name", "worldLine", "heading"] as const) text(`${p}.${f}`, s[f]);
    if (typeof s.reading !== "number" || !Number.isFinite(s.reading)) problems.push(`${p}.reading: missing`);
    if (!Array.isArray(s.body) || s.body.length === 0) problems.push(`${p}.body: missing`);
    else s.body.forEach((b, j) => text(`${p}.body[${j}]`, b));
    linkList(`${p}.links`, s.links);
  });
  return problems;
}
