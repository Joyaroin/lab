import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { identity } from "./content";

it("index.html shows the same name and title as content, before any script runs", () => {
  const html = readFileSync("index.html", "utf8");
  const root = html.slice(html.indexOf('<div id="root">'), html.indexOf("<script"));
  expect(root).toContain(identity.name);
  expect(root).toContain(identity.title.replace("&", "&amp;"));
});

import { validateContent, content } from "./content";

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
      c.stations[0].body = [text];
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

it("has no placeholder copy left", () => {
  expect(JSON.stringify(content)).not.toMatch(/placeholder/i);
});

describe("CRT terminal text", () => {
  it("every station has terminal lines, short enough for the CRT", () => {
    for (const s of content.stations) {
      expect(s.terminal.length, s.id).toBeGreaterThan(0);
      for (const l of s.terminal) expect(l.length, `${s.id}: ${l}`).toBeLessThanOrEqual(20);
    }
  });
  it("rejects a station with no terminal lines", () => {
    const c = good();
    c.stations[3].terminal = [];
    expect(validateContent(c).join("\n")).toContain("stations[3].terminal");
  });
  it("validates terminal lines like any other copy", () => {
    const c = good();
    c.stations[0].terminal = ["$ ssh 192.168.1.5"];
    expect(validateContent(c).join("\n")).toContain("stations[0].terminal[0]: contains a private address");
  });
  // Nothing on a CRT may read as a live result: these are what the old invented text claimed.
  it.each(["hamon   Ready", "mediasafe-prd  Synced", "  42 passing", "group A ... ok", "build OK", "3 pods Running"])(
    "rejects a line that reads as a live status: %s", (line) => {
      const c = good();
      c.stations[0].terminal = [line];
      expect(validateContent(c).join("\n")).toContain("stations[0].terminal[0]: reads as a live status");
    });
  it("the shipped terminal lines hold no counts or statuses", () => {
    for (const s of content.stations) for (const l of s.terminal) expect(l, s.id).not.toMatch(/\d+\s+(passing|failing|ok)/i);
  });
});
