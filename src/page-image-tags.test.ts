import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { content } from "./content";
import { headTags } from "./page-html";
import { imageTags } from "./page-image-tags";

// make og-image takes public/og-image.png. The head says how big it is, so the file's own header must agree.
const tagValue = (tags: string[], key: string) => {
  const t = tags.find((x) => x.includes(`property="${key}"`));
  return t && /content="([^"]*)"/.exec(t)?.[1];
};
const pngSize = (file: string) => {
  const b = readFileSync(file);
  expect(b.subarray(1, 4).toString("latin1")).toBe("PNG");
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }; // IHDR: width, height
};

describe("the preview image tags", () => {
  const tags = imageTags(content);
  it("name the image by its absolute URL, with its size and alt text", () => {
    expect(tagValue(tags, "og:image")).toBe("https://lab.mediasafe.space/og-image.png");
    expect(tagValue(tags, "og:image:width")).toBe("1200");
    expect(tagValue(tags, "og:image:height")).toBe("630");
    expect(tagValue(tags, "og:image:alt")).toBe(content.identity.imageAlt.replace(/'/g, "&#39;"));
  });
  it("are in the page's head", () => {
    for (const t of tags) expect(headTags(content)).toContain(t);
  });
  it("match the committed file's pixel size", () => {
    expect(existsSync("public/og-image.png")).toBe(true);
    const { width, height } = pngSize("public/og-image.png");
    expect(String(width)).toBe(tagValue(tags, "og:image:width"));
    expect(String(height)).toBe(tagValue(tags, "og:image:height"));
  });
});
