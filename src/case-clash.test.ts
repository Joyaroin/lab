import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

// macOS and Windows treat names that differ only by case as one file, so CI on Linux can't see the
// clash (#60, #83). Directories count too: "a/x" and "A/y" clash. The extension is ignored for the
// last part, because `import "./tear"` is what breaks when src/Tear.tsx sits beside src/tear.ts.
function caseClashes(paths: string[]): string[][] {
  const groups = new Map<string, Set<string>>();
  for (const p of paths) {
    const parts = p.split("/");
    parts[parts.length - 1] = parts[parts.length - 1].replace(/\.[^.]+$/, "");
    for (let i = 1; i <= parts.length; i++) {
      const prefix = parts.slice(0, i).join("/");
      const key = prefix.toLowerCase();
      if (!groups.has(key)) groups.set(key, new Set());
      groups.get(key)!.add(prefix);
    }
  }
  return [...groups.values()].filter((g) => g.size > 1).map((g) => [...g].sort());
}

describe("file names", () => {
  it("spots names that differ only by case", () => {
    expect(caseClashes(["src/Tear.tsx", "src/tear.ts"])).toEqual([["src/Tear", "src/tear"]]);
    expect(caseClashes(["src/Tear.tsx", "src/tear.tsx"])).toEqual([["src/Tear", "src/tear"]]);
    expect(caseClashes(["src/tear.ts", "src/tear.test.ts", "src/TearView.tsx"])).toEqual([]);
    expect(caseClashes(["a/x.ts", "A/y.ts"])).toEqual([["A", "a"]]);
  });

  it("no two tracked files differ only by case", () => {
    const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      encoding: "utf8",
    })
      .split("\0")
      .filter(Boolean);
    expect(files.length).toBeGreaterThan(0);
    expect(caseClashes(files)).toEqual([]);
  });
});
