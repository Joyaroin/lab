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
  it("the shipped cards read as no status", () => {
    expect(validateContent(content)).toEqual([]);
  });
});
