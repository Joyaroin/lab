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
  /** dim terminal lines drawn on the CRT glass behind the text. Only facts that stay true:
   *  names of hosts and tools. Never a status or result, which would read as live data. */
  terminal: string[];
};
export type Content = {
  identity: { name: string; title: string; availability: string };
  links: Link[];
  stations: Station[];
};

// Links that more than one station or the HUD uses, written once.
const LINKEDIN: Link = { label: "LinkedIn", href: "https://www.linkedin.com/in/adham-sedik-971a57184/" };
const GITHUB: Link = { label: "GitHub", href: "https://github.com/Joyaroin" };
const SITE_SOURCE: Link = { label: "This site's source", href: "https://github.com/Joyaroin/lab" };

/** The longest terminal line the CRT glass has room for, in characters. */
export const TERMINAL_MAX = 20;

export const content: Content = {
  identity: {
    name: "Adham Sedik",
    title: "SWE & Platform",
    availability: "Graduating Dec 2027. Open to co-op and full-time.",
  },

  links: [
    { label: "Résumé", href: "/resume.pdf" },
    LINKEDIN,
    GITHUB,
  ],

  // Real copy, in tour order. Plain descriptions; lab language lives in the world-line labels only.
  // Every fact here comes from ticket #11. Add nothing that is not there.
  stations: [
    {
      id: "work", name: "Work", worldLine: "World line 01", reading: 214,
      heading: "Work experience",
      body: [
        "Solace: Software Developer Co-op, Platform Engineering. Ottawa, Sep to Dec 2026.",
        "Made the EC2 proxies behind CI/CD builds self-healing. CloudWatch alarms defined in Terraform reboot an out-of-memory instance, and a Lambda posts its status to Slack. A failure that sat unnoticed for hours became an unattended recovery, since proven on a real outage.",
        "Provisioned an S3 artifact store in Terraform, with versioning and lifecycle rules, giving a customer-facing UI pinned releases that can be rolled back.",
        "Wrote a Python check that fails any pull request where a pipeline drifts from its template.",
        "Automated product offboarding in an internal security dashboard across UI, API, data model and scripts, ending 30 to 60 minutes of manual cleanup each time.",
        "Barracuda Networks: Software Engineer Co-op, BarracudaONE Platform. Ottawa, Sep 2025 to Aug 2026.",
        "Built a GitHub Actions workflow that opens hotfix branches from the commit actually in production, serving 18 service repos and saving 5 to 10 minutes per ticket.",
        "Authored Terraform for production AWS infrastructure: VPC, ALB, IAM, ECR and External Secrets.",
        "Set up a Grafana dashboard with threshold alerts on SaaS metrics, used daily by the team.",
        "Built a test-scenario generator on the Claude API and a Jira MCP server, adopted by all 15 developers, cutting test-note writing by roughly 40%.",
        "Delivered C# and .NET services and React/TypeScript UI across some 60 tickets, and brought open-source license scanning into CI.",
      ],
      links: [LINKEDIN],
      terminal: ["$ cat roles.txt", "solace     platform", "barracuda  platform"],
    },
    {
      id: "mediasafe", name: "MediaSafe", worldLine: "World line 02", reading: 377,
      heading: "MediaSafe",
      body: [
        "A personal tracker for shows and films, built, deployed and operated end to end by one person. Next.js 16 and Postgres.",
        "Live at mediasafe.space, which needs a Google sign-in.",
        "Argo CD syncs the cluster from Git, and a commit is the only way it changes. Merges ship to staging automatically; production is promoted by hand. Secrets live in Vault with nightly snapshots to Cloudflare R2 and a scripted restore drill.",
        "As of November 2026: about 700 commits and 170+ merged pull requests since August 2026.",
      ],
      links: [
        { label: "MediaSafe repo", href: "https://github.com/Joyaroin/MediaSafe" },
        { label: "Deploy repo", href: "https://github.com/Joyaroin/morioh-cho-gitops" },
        { label: "mediasafe.space (Google sign-in)", href: "https://mediasafe.space" },
      ],
      terminal: ["$ cat stack.txt", "next.js 16", "postgres", "argo cd  vault"],
    },
    {
      id: "home-lab", name: "Home lab", worldLine: "World line 03", reading: 512,
      heading: "Home lab and Proxmox",
      body: [
        "Two Proxmox hosts, jonathan (HP ProDesk) and joseph (GEEKOM A5), run a two-node k3s cluster on VMs hamon and hermit.",
        "No ports are open at home: traffic arrives only through a Cloudflare Tunnel. Traefik with Gateway API, cert-manager, Vault, External Secrets.",
        "Git hosting and CI runners run at home too, with the CI runner firewalled from the home network and cluster. Production and staging are pinned to separate nodes.",
        "This site runs on that cluster.",
      ],
      links: [SITE_SOURCE],
      terminal: ["$ cat hosts.txt", "jonathan  proxmox", "joseph    proxmox", "hamon  hermit  k3s"],
    },
    {
      id: "order-tracker", name: "Order Tracker", worldLine: "World line 04", reading: 640,
      heading: "Order Tracker GitOps Platform",
      body: [
        "A GitOps delivery pipeline: Argo CD ApplicationSets and Kustomize overlays generate per-environment apps.",
        "Reusable Terraform modules for the network, cluster, registry, IAM and remote state.",
        "GitHub Actions pushes images to ECR with OIDC instead of static AWS keys. Pull requests against hotfix branches spin up isolated EKS environments.",
        "The repo is private, so there is no link.",
      ],
      links: [],
      terminal: ["$ cat stack.txt", "argo cd  kustomize", "terraform  eks", "github actions"],
    },
    {
      id: "wc2026-predictor", name: "WC2026 Predictor", worldLine: "World line 05", reading: 733,
      heading: "WC2026 Predictor",
      body: [
        "A live score-prediction game for the 2026 FIFA World Cup: friends join a group, call scorelines and climb leaderboards that move as goals go in.",
        "React 19, TypeScript, Express 5, single-table DynamoDB, Terraform, Helm and Argo CD.",
      ],
      links: [{ label: "Repo", href: "https://github.com/Joyaroin/wc2026-predictor" }],
      terminal: ["$ cat stack.txt", "react 19  express 5", "dynamodb  terraform", "helm  argo cd"],
    },
    {
      id: "contact", name: "Contact", worldLine: "World line 06", reading: 861,
      heading: "Contact",
      body: [
        "Adham Sedik. SWE & Platform.",
        "Honours Computer Science, Software Engineering stream, Carleton University, Ottawa, expected Dec 2027. Open to co-op and full-time roles.",
      ],
      links: [
        { label: "adhamsedik@cmail.carleton.ca", href: "mailto:adhamsedik@cmail.carleton.ca" },
        LINKEDIN,
        GITHUB,
        SITE_SOURCE,
      ],
      terminal: ["$ cat contact.txt", "github.com/Joyaroin", "in/adham-sedik"],
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

// Words that make a terminal line read as a live result ("hamon Ready", "Synced", "42 passing").
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
  const linkList = (path: string, list: unknown) => {
    if (!Array.isArray(list)) return void problems.push(`${path}: missing`);
    list.forEach((l: Partial<Link>, i) => {
      text(`${path}[${i}].label`, l?.label);
      text(`${path}[${i}].href`, l?.href, true);
    });
  };

  text("identity.name", c.identity?.name);
  text("identity.title", c.identity?.title);
  text("identity.availability", c.identity?.availability);
  linkList("links", c.links);
  if (!Array.isArray(c.stations) || c.stations.length === 0) problems.push("stations: missing");
  (c.stations ?? []).forEach((s, i) => {
    const p = `stations[${i}]`;
    for (const f of ["id", "name", "worldLine", "heading"] as const) text(`${p}.${f}`, s[f]);
    if (typeof s.reading !== "number" || !Number.isFinite(s.reading)) problems.push(`${p}.reading: missing`);
    if (!Array.isArray(s.body) || s.body.length === 0) problems.push(`${p}.body: missing`);
    else s.body.forEach((b, j) => text(`${p}.body[${j}]`, b));
    linkList(`${p}.links`, s.links);
    if (!Array.isArray(s.terminal) || s.terminal.length === 0) problems.push(`${p}.terminal: missing`);
    else s.terminal.forEach((l, j) => {
      text(`${p}.terminal[${j}]`, l);
      if (typeof l === "string" && l.length > TERMINAL_MAX) problems.push(`${p}.terminal[${j}]: longer than ${TERMINAL_MAX} characters`);
      if (LIVE_STATUS.test(l)) problems.push(`${p}.terminal[${j}]: reads as a live status`);
    });
  });
  return problems;
}
