import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { content } from "./content";
import { headTags } from "./page-html";
import { iconTags } from "./page-icon-tags";

// make favicon writes the two PNGs. The head says how big the icon is, so the file's own header must agree.
const pngSize = (file: string) => {
  const b = readFileSync(file);
  expect(b.subarray(1, 4).toString("latin1")).toBe("PNG");
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }; // IHDR: width, height
};

describe("the icon tags", () => {
  const tags = iconTags(content);
  it("link the favicon and the touch icon", () => {
    expect(tags).toEqual([
      '<link rel="icon" type="image/png" sizes="48x48" href="/favicon.png">',
      '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    ]);
  });
  it("are in the page's head", () => {
    for (const t of tags) expect(headTags(content)).toContain(t);
  });
  it("match the committed files' pixel sizes", () => {
    expect(pngSize("public/favicon.png")).toEqual({ width: 48, height: 48 });
    expect(pngSize("public/apple-touch-icon.png")).toEqual({ width: 180, height: 180 });
  });
});
