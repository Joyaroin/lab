import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { identity } from "./content";

it("index.html shows the same name and title as content, before any script runs", () => {
  const html = readFileSync("index.html", "utf8");
  const root = html.slice(html.indexOf('<div id="root">'), html.indexOf("<script"));
  expect(root).toContain(identity.name);
  expect(root).toContain(identity.title.replace("&", "&amp;"));
});
