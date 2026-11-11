import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { identity } from "./content";
import { readdirSync } from "node:fs";

import { validateContent, content, pageSwitch, ui, fill, type Diagram, type Station } from "./content";
import { WORK_COPY, WORK_LEADS } from "../tests/fixtures/work-copy";

const good = () => structuredClone(content);

describe("the page's description and preview alt text", () => {
  it("are the approved words", () => {
    expect(identity.description).toBe(
      "Adham Sedik, Software & Platform Engineer. Tour a 3D home lab: my work, MediaSafe, my home Kubernetes cluster and the AI software factory that built this site.");
    expect(identity.description).toHaveLength(159);
    expect(identity.imageAlt).toBe("The lab at night: five lit monitors and a nixie meter on a desk, with Adham Sedik's name");
  });
});

describe("validateContent", () => {
  it("accepts the shipped content", () => {
    expect(validateContent(content)).toEqual([]);
  });

  describe("missing fields", () => {
    it.each(["name", "worldLine", "heading"] as const)("rejects a station with no %s", (field) => {
      const c = good();
      (c.stations[1] as Record<string, unknown>)[field] = "";
      expect(validateContent(c).join("\n")).toContain(`stations[1].${field}`);
    });
    it("rejects a station with no body", () => {
      const c = good();
      c.stations[2].body = [];
      expect(validateContent(c).join("\n")).toContain("stations[2].body");
    });
    it("rejects a station with no reading", () => {
      const c = good();
      delete (c.stations[0] as Record<string, unknown>).reading;
      expect(validateContent(c).join("\n")).toContain("stations[0].reading");
    });
    it("rejects a link with no href", () => {
      const c = good();
      c.stations[0].links = [{ label: "x", href: "" }];
      expect(validateContent(c).join("\n")).toContain("stations[0].links[0].href");
    });
    it("rejects a missing description and preview alt text", () => {
      const c = good();
      c.identity.description = "";
      c.identity.imageAlt = " ";
      const problems = validateContent(c).join("\n");
      expect(problems).toContain("identity.description");
      expect(problems).toContain("identity.imageAlt");
    });
    it("rejects missing identity", () => {
      const c = good();
      c.identity.title = " ";
      expect(validateContent(c).join("\n")).toContain("identity.title");
    });
  });

  describe("blocked content", () => {
    const withBody = (text: string) => {
      const c = good();
      c.stations[1].body = [text]; // not Work: its body must match its pages
      return validateContent(c).join("\n");
    };
    it.each([
      "Call 613-555-0142",
      "Call (613) 555 0142",
      "Call +1 613 555 0142",
      "Call 6135550142",
      "Call 613.555.0142",
    ])("blocks a phone number: %s", (t) => {
      expect(withBody(t)).toContain("phone number");
    });
    it.each(["Co-op 2024-2025", "Reading 0.000861", "Since 2022, 9 deploys"])("allows %s", (t) => {
      expect(withBody(t)).toBe("");
    });
    it.each([
      "10.0.0.5",
      "192.168.1.20",
      "172.16.4.4",
      "172.31.255.1",
      "127.0.0.1",
      "100.101.102.103",
      "169.254.1.1",
      "fd7a:115c:a1e0::1",
      "fe80::1",
      "hermit.tail1234.ts.net",
      "nas.local",
      "localhost",
    ])("blocks a private or tailnet address: %s", (t) => {
      expect(withBody(`Runs on ${t}`)).toContain("private address");
    });
    it("allows public addresses", () => {
      expect(withBody("Served at 8.8.8.8 and 172.32.0.1 and lab.mediasafe.space")).toBe("");
    });
    it("checks link hrefs and labels too", () => {
      const c = good();
      c.stations[0].links = [{ label: "x", href: "http://192.168.1.5/admin" }];
      expect(validateContent(c).join("\n")).toContain("stations[0].links[0].href");
    });
    it("rejects unsafe link schemes", () => {
      const c = good();
      c.stations[0].links = [{ label: "x", href: "javascript:alert(1)" }];
      expect(validateContent(c).join("\n")).toContain("stations[0].links[0].href");
    });
    it("checks the top-level links", () => {
      const c = good();
      c.links[0].href = "https://hermit.tail1.ts.net/";
      expect(validateContent(c).join("\n")).toContain("links[0].href");
    });
  });
});

// A count goes stale, so each says since when.
it.each([["mediasafe"], ["software-factory"]])("%s: its pull request count says since a date", (id) => {
  const bullets = content.stations.find((s) => s.id === id)!.body;
  expect(bullets.filter((b) => /pull requests/i.test(b)).join(" ")).toMatch(/\d\+? merged pull requests since (\d+ )?[A-Z][a-z]+ 2026/);
});

// Every station's text is a one-line lead and at most three bullets (Work: per page).
describe("lead and bullets", () => {
  const plain = content.stations.filter((s) => !s.pages);
  it.each(plain.map((s) => [s.id]))("%s has a lead and at most three bullets", (id) => {
    const s = content.stations.find((x) => x.id === id)!;
    expect(s.lead).toBeTruthy();
    expect(s.body.length).toBeGreaterThan(0);
    expect(s.body.length).toBeLessThanOrEqual(3);
  });
  it("each Work page has a lead and at most three bullets", () => {
    const pages = content.stations.find((s) => s.id === "work")!.pages!;
    for (const pg of pages) {
      expect(pg.lead).toBeTruthy();
      expect(pg.body.length).toBeGreaterThan(0);
      expect(pg.body.length).toBeLessThanOrEqual(3);
    }
  });
  it("the stations are, in order, work, mediasafe, home-lab, software-factory, contact", () => {
    expect(content.stations.map((s) => s.id)).toEqual(["work", "mediasafe", "home-lab", "software-factory", "contact"]);
  });
  it("the world lines run 01 to 05 and the readings keep their values", () => {
    expect(content.stations.map((s) => s.worldLine)).toEqual(["World line 01", "World line 02", "World line 03", "World line 04", "World line 05"]);
    expect(content.stations.map((s) => s.reading)).toEqual([214, 377, 512, 733, 861]);
  });
  it("Software factory links to this site's source", () => {
    expect(content.stations.find((s) => s.id === "software-factory")!.links.map((l) => l.href)).toContain("https://github.com/Joyaroin/lab");
  });
  it("rejects a station with no lead and no pages", () => {
    const c = good();
    delete c.stations[1].lead;
    expect(validateContent(c).join("\n")).toContain("stations[1].lead: missing");
  });
  it("rejects a station with four bullets", () => {
    const c = good();
    c.stations[1].body.push("A fourth bullet.");
    expect(validateContent(c).join("\n")).toContain("stations[1].body: at most 3 bullets");
  });
  it("rejects a Work page with no lead", () => {
    const c = good();
    c.stations[0].pages![0].lead = "";
    expect(validateContent(c).join("\n")).toContain("pages[0].lead: missing");
  });
  it("rejects a Work page with four bullets", () => {
    const c = good();
    const pg = c.stations[0].pages![0];
    pg.body.push("A fourth bullet.");
    c.stations[0].body = c.stations[0].pages!.flatMap((x) => x.body);
    expect(validateContent(c).join("\n")).toContain("pages[0].body: at most 3 bullets");
  });
  it("accepts Work with no lead of its own", () => {
    expect(good().stations[0].lead).toBeUndefined();
    expect(validateContent(good())).toEqual([]);
  });
});

it("has no placeholder copy left", () => {
  expect(JSON.stringify(content)).not.toMatch(/placeholder/i);
});

// The title card on each TV is the station's worldLine and name. Nothing on a TV may read as live.
describe("title card text", () => {
  it.each(["name", "worldLine"] as const)("rejects a %s that reads as a live status", (field) => {
    for (const line of ["hamon Ready", "Synced", "42 passing", "build OK", "3 pods Running"]) {
      const c = good();
      c.stations[0][field] = line;
      expect(validateContent(c).join("\n")).toContain(`stations[0].${field}: reads as a live status`);
    }
  });
});

// A station's optional diagram is held as data and checked like other copy.
describe("diagram", () => {
  const media = () => {
    const c = good();
    return { c, d: c.stations.find((s) => s.id === "mediasafe")!.diagram! };
  };
  it("MediaSafe has one: Git to Argo CD to staging, then production by hand", () => {
    const { d } = media();
    expect(d.steps).toEqual(["Git", "Argo CD", "Staging", "Production"]);
    expect(d.hops).toEqual(["", "every merge", "by hand"]);
  });
  it("hops that are not a list are reported, not a crash", () => {
    for (const bad of ["by hand", { length: 2 }, null, 7]) {
      const { c, d } = media();
      (d as { hops: unknown }).hops = bad;
      expect(validateContent(c).join("\n")).toContain("diagram.hops");
    }
  });
  // Whole words, so "automatic" does not pass for "automatically". Only plain connectives are free.
  const diagramText = (d: Diagram) => [d.description, ...d.steps, ...d.hops];
  const FREE = new Set(["a", "an", "the", "to", "and", "by", "from", "is", "are", "with", "which"]);
  const words = (t: string) => t.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  /** Words in a station's diagram that its copy doesn't have, as "word in text". */
  const missingWords = (s: Pick<Station, "body" | "heading" | "name" | "diagram"> & { lead?: string }) => {
    const copy = new Set(words((s.lead ?? "") + " " + s.body.join(" ") + " " + s.heading + " " + s.name));
    return diagramText(s.diagram!).flatMap((t) => words(t).filter((w) => !FREE.has(w) && !copy.has(w)).map((w) => `"${w}" in "${t}"`));
  };
  it.each(content.stations.filter((s) => s.diagram).map((s) => [s.id]))("%s: every word of its diagram, description included, is in its copy", (id) => {
    expect(missingWords(content.stations.find((x) => x.id === id)!)).toEqual([]);
  });
  it("the word check counts the lead as copy", () => {
    const s = { lead: "Plan first.", body: ["x"], heading: "h", name: "n", diagram: { description: "Plan", steps: ["Plan"], hops: [] } };
    expect(missingWords(s)).toEqual([]);
    expect(missingWords({ ...s, lead: undefined })).toEqual(['"plan" in "Plan"', '"plan" in "Plan"']);
  });
  it("the word check does not pass a near miss", () => {
    const s = { body: ["It deploys automatically."], heading: "h", name: "n", diagram: { description: "It deploys", steps: ["automatic"], hops: [] } };
    expect(missingWords({ ...s, diagram: { ...s.diagram, steps: ["automatically"] } })).toEqual([]);
    expect(missingWords(s)).toEqual(['"automatic" in "automatic"']);
  });
  it("exactly MediaSafe, Home lab and Software factory have one; Work and Contact do not", () => {
    expect(content.stations.filter((s) => s.diagram).map((s) => s.id)).toEqual(["mediasafe", "home-lab", "software-factory"]);
  });
  describe.each(content.stations.filter((s) => s.diagram).map((s) => [s.id]))("%s", (id) => {
    it("is checked for live-status words like the other copy", () => {
      const c = good();
      c.stations.find((x) => x.id === id)!.diagram!.steps[0] = "passing";
      expect(validateContent(c).join("\n")).toMatch(/diagram\.steps\[0\]: reads as a live status/);
    });
    it("shows no score, leaderboard or result", () => {
      expect(diagramText(content.stations.find((x) => x.id === id)!.diagram!).join(" ")).not.toMatch(/score|leader|\d+\s*[-:–]\s*\d+|win|goal|result/i);
    });
  });
  it("a station without one is still valid", () => {
    const c = good();
    delete c.stations[0].diagram;
    expect(validateContent(c)).toEqual([]);
  });
  it.each(["description", "step", "hop"])("checks the %s text like other copy", (what) => {
    const { c, d } = media();
    const bad = "Call 613-555-0142";
    if (what === "description") d.description = bad;
    if (what === "step") d.steps[1] = "10.0.0.5";
    if (what === "hop") d.hops[2] = bad;
    expect(validateContent(c).join("\n")).toMatch(/diagram/);
  });
  it("rejects a missing description, since a screen reader needs one", () => {
    const { c, d } = media();
    d.description = "";
    expect(validateContent(c).join("\n")).toContain("diagram.description");
  });
  it("rejects hops that do not fit the steps", () => {
    const { c, d } = media();
    d.hops.pop();
    expect(validateContent(c).join("\n")).toContain("diagram.hops");
  });
  it("rejects a step that reads as a live status", () => {
    const { c, d } = media();
    d.steps[2] = "Synced";
    expect(validateContent(c).join("\n")).toContain("reads as a live status");
  });
});

// Work is two pages, Barracuda then Solace on the timeline, holding exactly the approved text.
describe("Work's pages", () => {
  const work = () => { const c = good(); return { c, w: c.stations.find((s) => s.id === "work")! }; };
  it("are Solace and Barracuda, and between them hold every bullet of the body in order", () => {
    const { w } = work();
    expect(w.pages!.map((p) => p.label)).toEqual(["Solace", "Barracuda"]);
    expect(w.pages!.map((p) => p.dates)).toEqual(["Sep to Dec 2026", "Sep 2025 to Aug 2026"]);
    expect(w.pages!.map((p) => p.months)).toEqual([4, 12]);
    expect(w.pages!.map((p) => p.lead)).toEqual(WORK_LEADS);
    expect(w.pages!.flatMap((p) => p.body)).toEqual(WORK_COPY); // the approved wording, pinned in a fixture
    expect(w.body).toEqual(WORK_COPY);
  });
  it("rejects a page with no months", () => {
    const { c, w } = work();
    w.pages![1].months = 0;
    expect(validateContent(c).join("\n")).toContain("pages[1].months");
  });
  it("rejects a page with no paragraphs", () => {
    const { c, w } = work();
    w.pages![1].body = [];
    expect(validateContent(c).join("\n")).toContain("pages[1].body");
  });
  it("rejects pages whose paragraphs differ from the station's text, or are out of order", () => {
    const { c, w } = work();
    w.pages![0].body = [...w.pages![0].body].reverse();
    expect(validateContent(c).join("\n")).toContain("stations[0].pages: bullets must be the same");
    const o = work();
    o.w.pages!.reverse();
    expect(validateContent(o.c).join("\n")).toContain("pages: bullets must be the same");
  });
  it.each(["label", "dates"] as const)("rejects a page %s that reads as a live status", (f) => {
    const { c, w } = work();
    w.pages![0][f] = "Synced";
    expect(validateContent(c).join("\n")).toContain(`pages[0].${f}: reads as a live status`);
  });
  it("rejects a page with a phone number in it", () => {
    const { c, w } = work();
    w.pages![0].body[0] = "Call 613-555-0142";
    expect(validateContent(c).join("\n")).toContain("pages[0].body[0]");
  });
});

// Each TV's bezel carries a maker's plate and a sticky note. Both are drawn on a TV, so neither may
// read as a status or result, and no two TVs share a note.
describe("bezel words", () => {
  it.each(["plate", "note"] as const)("rejects a %s that reads as a live status", (field) => {
    for (const line of ["All Synced", "42 passing", "build OK", "Running"]) {
      const c = good();
      c.stations[0].bezel[field] = line;
      expect(validateContent(c).join("\n")).toContain(`stations[0].bezel.${field}: reads as a live status`);
    }
  });
  it.each(["plate", "note"] as const)("rejects a station with no %s", (field) => {
    const c = good();
    c.stations[0].bezel[field] = "";
    expect(validateContent(c).join("\n")).toContain(`stations[0].bezel.${field}: missing`);
  });
  it("gives every TV its own plate and note", () => {
    for (const f of ["plate", "note"] as const) {
      const all = content.stations.map((s) => s.bezel[f]);
      expect(new Set(all).size).toBe(all.length);
    }
  });
});

// The timeline's own words are drawn on a TV too, so they are checked like the rest. The words come
// from the Content given, so every key it holds is validated, including ones added later.
describe("timeline words", () => {
  it.each(Object.keys(pageSwitch))("rejects a %s that is empty or reads as live", (f) => {
    const c = good();
    c.pageSwitch[f as keyof typeof pageSwitch] = "";
    expect(validateContent(c).join("\n")).toContain(`pageSwitch.${f}: missing`);
    c.pageSwitch[f as keyof typeof pageSwitch] = "Synced";
    expect(validateContent(c).join("\n")).toContain(`pageSwitch.${f}: reads as a live status`);
  });
  it("validates a key added to the timeline words", () => {
    const c = good();
    (c.pageSwitch as Record<string, string>).extra = "";
    expect(validateContent(c).join("\n")).toContain("pageSwitch.extra: missing");
  });
});

// Every other word the app shows or announces: the HUD, the meter's labels, the boot log, the signal
// lost screen, the gap's sentence. They move here from the components, so validation covers them.
describe("interface words", () => {
  const keys = Object.keys(ui);
  it("accepts the shipped words", () => {
    expect(validateContent(content)).toEqual([]);
  });
  it.each(keys)("rejects %s when it is removed or empty", (k) => {
    const c = good();
    delete (c.ui as Record<string, string>)[k];
    expect(validateContent(c).join("\n")).toContain(`ui.${k}: missing`);
    (c.ui as Record<string, string>)[k] = " ";
    expect(validateContent(c).join("\n")).toContain(`ui.${k}: missing`);
  });
  it("rejects a missing ui block, not a crash", () => {
    const c = good();
    delete (c as Partial<typeof c>).ui;
    expect(validateContent(c).join("\n")).toContain("ui.room: missing");
  });
  it("rejects a template that lost its placeholder", () => {
    const c = good();
    c.ui.gapBehind = "{n} deploys behind";
    expect(validateContent(c).join("\n")).toContain("ui.gapBehind: must contain {noun}");
  });
  it("has the words the stop controls use", () => {
    expect([ui.keyPrev, ui.keyRoom, ui.keyNext, ui.keyStart]).toEqual(["PREV", "ROOM", "NEXT", "START"]);
    expect([ui.prevStation, ui.backToRoom, ui.nextStation, ui.startTour]).toEqual(
      ["Previous station", "Back to the room", "Next station", "Start the tour"]);
    expect(fill(ui.stopLine, { label: "Work", n: 1, total: 5 })).toBe("Work · 1 of 5");
  });
  it.each(["label", "n", "total"])("rejects stopLine without {%s}", (ph) => {
    const c = good();
    c.ui.stopLine = c.ui.stopLine.replace(`{${ph}}`, "x");
    expect(validateContent(c).join("\n")).toContain(`ui.stopLine: must contain {${ph}}`);
  });
  it("says the gap in the new sentence", () => {
    expect(fill(ui.gapBehind, { n: 9, noun: "deploys" })).toBe("MediaSafe: 9 staging deploys since the last prod release");
    expect(fill(ui.gapBehindAtLeast, { n: 9, noun: "deploys" })).toBe("MediaSafe: at least 9 staging deploys since the last prod release");
  });
  it("says the gap in the short form for a short window", () => {
    expect(fill(ui.gapBehindShort, { n: 9, noun: "deploys" })).toBe("MediaSafe: 9 deploys ahead of prod");
    expect(fill(ui.gapBehindAtLeastShort, { n: 9, noun: "deploys" })).toBe("MediaSafe: 9+ deploys ahead of prod");
  });
  it.each(["gapBehindShort", "gapBehindAtLeastShort"] as const)("rejects %s without {n} or {noun}", (k) => {
    for (const ph of ["n", "noun"]) {
      const c = good();
      c.ui[k] = c.ui[k].replace(`{${ph}}`, "x");
      expect(validateContent(c).join("\n")).toContain(`ui.${k}: must contain {${ph}}`);
    }
  });
  it("blocks a phone number in them like other copy", () => {
    const c = good();
    c.ui.room = "Call 613-555-0142";
    expect(validateContent(c).join("\n")).toContain("ui.room: looks like a phone number");
  });
  it("fill puts values in their placeholders", () => {
    expect(fill("a {x} b {y}", { x: "1", y: "2" })).toBe("a 1 b 2");
  });
  it("keeps the words visitors saw before", () => {
    expect(ui.room).toBe("Room");
    expect(ui.more).toBe("more ▾");
    expect(ui.readingPending).toBe("reading prod and staging…");
    expect(fill(ui.meterReading, { digits: "0.000214" })).toBe("Reading 0.000214");
    expect([ui.loadProgress, ui.bootLog, ui.signalLost]).toEqual(["Load progress", "Boot log", "SIGNAL LOST"]);
    expect(fill(ui.logDone, { step: ui.stepCode })).toBe("[ ok ] room code");
    expect(fill(ui.logPending, { step: ui.stepScene })).toBe("[ .. ] room scene");
    expect(ui.logPowerOn).toBe("[ ok ] meter power-on");
    expect(ui.stepCapability).toBe("capability check");
  });
});

// No copy sits in app code outside the content module: no component or helper holds one of these
// words as a quoted string or as text between tags.
describe("no copy outside the content module", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) && e.name !== "content.ts" ? [`${dir}/${e.name}`] : []);
  const sources = files("src").map((f) => [f, readFileSync(f, "utf8")] as const);
  const words = [...Object.values(ui), ...Object.values(identity)].filter((w) => w.length >= 4);
  it("finds the source files", () => expect(sources.length).toBeGreaterThan(15));
  it.each(sources)("%s", (_f, src) => {
    for (const w of words) {
      for (const q of ['"', "'", "`"]) expect(src, w).not.toContain(`${q}${w}${q}`);
      expect(src, w).not.toContain(`>${w}<`);
    }
  });
});

describe("the pull request count", () => {
  it("says 100+ in Software factory's last bullet, and nothing says 76", () => {
    const factory = content.stations.find((s) => s.id === "software-factory")!;
    expect(factory.body.at(-1)).toContain("This site has 100+ merged pull requests since 5 November 2026.");
    expect(JSON.stringify(content)).not.toMatch(/\b76\b/);
  });
});

describe("station readings", () => {
  const readings = content.stations.map((s) => s.reading);
  it("are not numbers from the series", () => {
    // A few well-known divergence readings, as six-decimal strings.
    const series = ["0.337187", "0.571024", "0.456903", "0.523299", "0.409431", "1.048596", "1.130426"];
    for (const r of readings) expect(series).not.toContain((r / 1e6).toFixed(6));
  });
  it("are distinct, so each station is identifiable", () => {
    expect(new Set(readings).size).toBe(readings.length);
  });
});
