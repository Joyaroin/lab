import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkFacts } from "./check-facts.mjs";

/** A throwaway repo holding the given files. */
function repo(files) {
  const dir = mkdtempSync(join(tmpdir(), "facts-"));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
}
// Tags are built at runtime, so the literal text never appears in this file for the checker to find.
const tag = (name) => "@" + name;
const said = (problems) => problems.map((p) => `${p.doc}:${p.line} ${p.message}`);

describe("checkFacts", () => {
  it("passes a repo with no docs", () => {
    expect(checkFacts(repo({ "src/a.ts": "" }))).toEqual([]);
  });

  it("finds a path from the repo root, and reports one that's gone with its doc and line", () => {
    const dir = repo({ "src/a.ts": "", "CONTEXT.md": "Lives in `src/a.ts`.\nAnd `src/gone.ts`.\n" });
    expect(said(checkFacts(dir))).toEqual(["CONTEXT.md:2 src/gone.ts doesn't exist"]);
  });

  it("checks a directory named with a trailing slash", () => {
    const dir = repo({ "docs/x.md": "", "CLAUDE.md": "See `docs/` and `docs/adr/`.\n" });
    expect(said(checkFacts(dir))).toEqual(["CLAUDE.md:1 docs/adr/ doesn't exist"]);
  });

  it("finds a bare file name anywhere in the repo, but not in node_modules", () => {
    const dir = repo({
      "src/view/Room.tsx": "",
      "node_modules/x/Hidden.tsx": "",
      "CONTEXT.md": "`Room.tsx` and `Hidden.tsx`\n",
    });
    expect(said(checkFacts(dir))).toEqual(["CONTEXT.md:1 Hidden.tsx doesn't exist"]);
  });

  it("drops a line number after a path", () => {
    const dir = repo({ "src/a.ts": "", "CONTEXT.md": "`src/a.ts:12`\n" });
    expect(checkFacts(dir)).toEqual([]);
  });

  it("leaves alone code that only looks like a path", () => {
    const dir = repo({
      "CLAUDE.md": [
        "`image.tag` `shift.hold` `origin/main` `@vitejs/plugin-react` `src/**/*.test.ts`",
        "`~/.claude/x.md` `/etc/hosts.yml` `<name>.md` `https://a.b/c.md` `$TEST_PORT` `../up.md`",
      ].join("\n"),
    });
    expect(checkFacts(dir)).toEqual([]);
  });

  it("checks make targets, using the word after make", () => {
    const dir = repo({
      Makefile: ".PHONY: browser\nbrowser: setup\n\tnpx playwright test\nsetup:\n\ttrue\n",
      "CLAUDE.md": "Run `make browser PW_ARGS=x`, `make setup` and `make lint`.\n",
    });
    expect(said(checkFacts(dir))).toEqual(["CLAUDE.md:1 make lint: no such target in the Makefile"]);
  });

  it("checks npm scripts, including npm test", () => {
    const dir = repo({
      "package.json": JSON.stringify({ scripts: { build: "vite build" } }),
      "docs/agents/testing.md": "| Unit | `npm test` |\n| Build | `npm run build` |\n",
    });
    expect(said(checkFacts(dir))).toEqual(["docs/agents/testing.md:1 npm test: no such script in package.json"]);
  });

  it("checks that each tag in the testing facts tags at least one test", () => {
    const dir = repo({
      "tests/limits.spec.ts": `test("a tear ${tag("timing")}", () => {});\n`,
      "docs/agents/testing.md": `| Timing | \`${tag("timing")}\` |\n| Heavy rendering | \`${tag("render")}\` |\n`,
    });
    expect(said(checkFacts(dir))).toEqual([`docs/agents/testing.md:2 ${tag("render")} tags no test`]);
  });

  it("doesn't count a tag that only appears in the docs", () => {
    const dir = repo({
      "README.md": `\`${tag("render")}\` marks heavy specs\n`,
      "docs/agents/testing.md": `\`${tag("render")}\`\n`,
    });
    expect(said(checkFacts(dir))).toEqual([`docs/agents/testing.md:1 ${tag("render")} tags no test`]);
  });

  it("doesn't count a tag that only appears in non-test files", () => {
    const dir = repo({
      "src/helper.ts": `export const t = "${tag("render")}";\n`,
      "package.json": `{"scripts":{"x":"${tag("render")}"}}`,
      "scripts/other.mjs": `// ${tag("render")}\n`,
      "docs/agents/testing.md": `\`${tag("render")}\`\n`,
    });
    expect(said(checkFacts(dir))).toEqual([`docs/agents/testing.md:1 ${tag("render")} tags no test`]);
  });

  it("checks a path that carries a line range, a column or a #L anchor", () => {
    const dir = repo({
      "CLAUDE.md": "`src/gone.ts:12-20` `src/gone.ts#L3` `src/gone.ts:12:3` `src/gone.ts#L3-L9` `src/gone.ts:12`\n",
    });
    expect(said(checkFacts(dir))).toEqual(Array(5).fill("CLAUDE.md:1 src/gone.ts doesn't exist"));
  });

  it("accepts a path with a line range or anchor when the file exists", () => {
    const dir = repo({ "src/a.ts": "", "CLAUDE.md": "`src/a.ts:12-20` `src/a.ts#L3` `src/a.ts:1:2`\n" });
    expect(checkFacts(dir)).toEqual([]);
  });

  it("doesn't read a make flag as a target", () => {
    const dir = repo({
      Makefile: "x:\n\ttrue\nbrowser:\n\ttrue\n",
      "CLAUDE.md": "`make -C sub x` and `make -j4 browser` and `make -C sub nope`\n",
    });
    expect(said(checkFacts(dir))).toEqual(["CLAUDE.md:1 make nope: no such target in the Makefile"]);
  });

  it("reads only the project's own docs, not the generic tracker docs", () => {
    const dir = repo({ "docs/agents/domain.md": "Read `CONTEXT-MAP.md` if it exists.\n" });
    expect(checkFacts(dir)).toEqual([]);
  });

  describe("CI jobs in the testing facts", () => {
    const ci = "name: CI\njobs:\n  frontend:\n    runs-on: docker\n  facts:\n    runs-on: docker\n";
    const release = "jobs:\n  staging:\n    runs-on: docker\n";
    const testing = (bullets) => `## What CI runs\n${bullets}\n`;

    it("reports a named job that no workflow defines, and finds jobs in any workflow", () => {
      const dir = repo({
        ".forgejo/workflows/ci.yml": ci,
        ".forgejo/workflows/release.yml": release,
        "docs/agents/testing.md": testing(
          "- `frontend`, `ghost`: targets\n- `facts`: `make facts`\n- `staging`: moved on main",
        ),
        Makefile: "facts:\n\ttrue\n",
      });
      expect(said(checkFacts(dir))).toEqual(["docs/agents/testing.md:2 ghost: no such CI job"]);
    });

    it("takes only the spans before the colon, and only on bullets that start with one", () => {
      const dir = repo({
        ".forgejo/workflows/ci.yml": ci,
        "docs/agents/testing.md": testing(
          "- `frontend`: runs `nope` here\n- `facts`: ok\n- On `main`, it builds",
        ),
      });
      expect(checkFacts(dir)).toEqual([]);
    });

    it("ignores indented sub-bullets, and a bullet with no colon names no job", () => {
      const dir = repo({
        ".forgejo/workflows/ci.yml": ci,
        "docs/agents/testing.md": testing(
          "- `frontend`, `facts`: x\n  - `sub`: x\n- `other` runs here, nothing else",
        ),
      });
      expect(checkFacts(dir)).toEqual([]);
    });

    it("reads jobs after a jobs: line with a trailing comment", () => {
      const dir = repo({
        ".forgejo/workflows/ci.yml": ci.replace("jobs:", "jobs: # all"),
        "docs/agents/testing.md": testing("- `frontend`, `facts`: x"),
      });
      expect(checkFacts(dir)).toEqual([]);
    });

    it("reports a ci.yml job the section doesn't name, at the heading", () => {
      const dir = repo({
        ".forgejo/workflows/ci.yml": ci,
        "docs/agents/testing.md": "# T\n\n## What CI runs\n- `frontend`: x\n",
      });
      expect(said(checkFacts(dir))).toEqual(["docs/agents/testing.md:3 CI job facts isn't listed"]);
    });

    it("reports a missing What CI runs section at line 1", () => {
      const dir = repo({
        ".forgejo/workflows/ci.yml": ci,
        "docs/agents/testing.md": "# T\n\n## Commands\n- `frontend`: x\n",
      });
      expect(said(checkFacts(dir))).toEqual([
        'docs/agents/testing.md:1 no "What CI runs" section, so CI jobs can\'t be checked',
      ]);
    });

    it("reports a renamed What CI runs heading the same way", () => {
      const dir = repo({
        ".forgejo/workflows/ci.yml": ci,
        "docs/agents/testing.md": "# T\n\n## What CI runs today\n- `frontend`, `facts`: x\n",
      });
      expect(said(checkFacts(dir))).toEqual([
        'docs/agents/testing.md:1 no "What CI runs" section, so CI jobs can\'t be checked',
      ]);
    });

    it("adds no problem when there is no testing doc or ci.yml has no jobs", () => {
      expect(checkFacts(repo({ ".forgejo/workflows/ci.yml": ci }))).toEqual([]);
      const dir = repo({
        ".forgejo/workflows/ci.yml": "name: CI\n",
        "docs/agents/testing.md": "# T\n",
      });
      expect(checkFacts(dir)).toEqual([]);
    });

    it("ignores job names outside the What CI runs section", () => {
      const dir = repo({
        ".forgejo/workflows/ci.yml": ci,
        "docs/agents/testing.md": "## Commands\n- `ghost`: x\n\n## What CI runs\n- `frontend`, `facts`: x\n",
      });
      expect(checkFacts(dir)).toEqual([]);
    });
  });

  it("checks the path in a node <path> span", () => {
    const dir = repo({
      "scripts/x.mjs": "",
      "CLAUDE.md": "`node scripts/x.mjs` `node scripts/gone.mjs --flag` `node -e foo` `node --version` `node scripts/noext`\n",
    });
    expect(said(checkFacts(dir))).toEqual(["CLAUDE.md:1 scripts/gone.mjs doesn't exist"]);
  });

  it("skips placeholders, relative and absolute paths in a node <path> span, and finds a bare name", () => {
    const dir = repo({
      "scripts/x.mjs": "",
      "CLAUDE.md": "`node scripts/<name>.mjs` `node ../x.mjs` `node /abs/x.mjs` `node x.mjs` `node gone.mjs`\n",
    });
    expect(said(checkFacts(dir))).toEqual(["CLAUDE.md:1 gone.mjs doesn't exist"]);
  });

  it("counts a tag only as a whole word", () => {
    const dir = repo({
      "tests/a.spec.ts": `test("x ${tag("realistic")}", () => {});\n`,
      "docs/agents/testing.md": `\`${tag("rea")}\` \`${tag("realistic")}\`\n`,
    });
    expect(said(checkFacts(dir))).toEqual([`docs/agents/testing.md:1 ${tag("rea")} tags no test`]);
  });
});
