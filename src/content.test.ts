import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { identity } from "./content";

it("index.html shows the same name and title as content, before any script runs", () => {
  const html = readFileSync("index.html", "utf8");
  const root = html.slice(html.indexOf('<div id="root">'), html.indexOf("<script"));
  expect(root).toContain(identity.name);
  expect(root).toContain(identity.title.replace("&", "&amp;"));
});

import { validateContent, content, pageSwitch, type Diagram, type Station } from "./content";
import { WORK_COPY } from "../tests/fixtures/work-copy";

const good = () => structuredClone(content);

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

it("dates the MediaSafe commit and pull request counts", () => {
  const body = content.stations.find((s) => s.id === "mediasafe")!.body.join(" ");
  expect(body).toMatch(/as of November 2026.*commits.*pull requests/i);
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
    expect(d.hops[2]).toMatch(/by hand/i);
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
  const missingWords = (s: Pick<Station, "body" | "heading" | "name" | "diagram">) => {
    const copy = new Set(words(s.body.join(" ") + " " + s.heading + " " + s.name));
    return diagramText(s.diagram!).flatMap((t) => words(t).filter((w) => !FREE.has(w) && !copy.has(w)).map((w) => `"${w}" in "${t}"`));
  };
  it.each(content.stations.filter((s) => s.diagram).map((s) => [s.id]))("%s: every word of its diagram, description included, is in its copy", (id) => {
    expect(missingWords(content.stations.find((x) => x.id === id)!)).toEqual([]);
  });
  it("the word check does not pass a near miss", () => {
    const s = { body: ["It deploys automatically."], heading: "h", name: "n", diagram: { description: "It deploys", steps: ["automatic"], hops: [] } };
    expect(missingWords({ ...s, diagram: { ...s.diagram, steps: ["automatically"] } })).toEqual([]);
    expect(missingWords(s)).toEqual(['"automatic" in "automatic"']);
  });
  it("exactly Home lab, MediaSafe, Order Tracker and WC2026 have one; Work and Contact do not", () => {
    expect(content.stations.filter((s) => s.diagram).map((s) => s.id)).toEqual(["mediasafe", "home-lab", "order-tracker", "wc2026-predictor"]);
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

// Work is two pages, Barracuda then Solace on the timeline, holding exactly the old text.
describe("Work's pages", () => {
  const work = () => { const c = good(); return { c, w: c.stations.find((s) => s.id === "work")! }; };
  it("are Solace and Barracuda, and between them hold every paragraph of the body in order", () => {
    const { w } = work();
    expect(w.pages!.map((p) => p.label)).toEqual(["Solace", "Barracuda"]);
    expect(w.pages!.map((p) => p.dates)).toEqual(["Sep to Dec 2026", "Sep 2025 to Aug 2026"]);
    expect(w.pages!.map((p) => p.months)).toEqual([4, 12]);
    expect(w.pages!.flatMap((p) => p.body)).toEqual(WORK_COPY); // the old wording, pinned in a fixture
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
    w.pages![0].body = [...w.pages![0].body].reverse().concat("An extra line.");
    expect(validateContent(c).join("\n")).toContain("stations[0].pages: paragraphs must be the same");
    const o = work();
    o.w.pages!.reverse();
    expect(validateContent(o.c).join("\n")).toContain("pages: paragraphs must be the same");
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

// The timeline's own words are drawn on a TV too, so they are checked like the rest.
describe("page switch words", () => {
  const original = { ...pageSwitch };
  afterEach(() => Object.assign(pageSwitch, original));
  it.each(Object.keys(original) as (keyof typeof original)[])("rejects a %s that is empty or reads as live", (f) => {
    pageSwitch[f] = "";
    expect(validateContent(content).join("\n")).toContain(`pageSwitch.${f}: missing`);
    pageSwitch[f] = "Synced";
    expect(validateContent(content).join("\n")).toContain(`pageSwitch.${f}: reads as a live status`);
  });
});
