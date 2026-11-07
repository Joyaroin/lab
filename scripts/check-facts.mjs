// Checks that the project's own docs name things that exist: paths, bare file names, make targets,
// npm scripts, and the test tags in docs/agents/testing.md. CI runs it, so a PR that leaves a doc
// naming something gone goes red. It reads only code spans (`like this`), and only the project's
// own docs: the generic tracker docs mention optional files on purpose.
//   node scripts/check-facts.mjs [repo]    prints each problem as doc:line, exits 1 if any
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const DOCS = ["CONTEXT.md", "CLAUDE.md", "AGENTS.md", "README.md", "docs/agents/testing.md"];
const TESTING = "docs/agents/testing.md";
// Extensions of real files. A span like `image.tag` or `shift.hold` is a key or a call, not a file.
const FILE = /\.(md|mdx|ts|tsx|mts|cts|js|jsx|mjs|cjs|json|ya?ml|toml|sh|py|css|html|txt|glb|svg|png|jpe?g|webp)$/;
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "test-results", "playwright-report"]);

function files(root, dir = root, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) files(root, join(dir, e.name), out); }
    else out.push(relative(root, join(dir, e.name)));
  }
  return out;
}

// A tag counts only in a real test file: *.spec.* or *.test.*
const TEST_FILE = /\.(spec|test)\.[cm]?[jt]sx?$/;
// A line range, column or #L anchor after a path: :12  :12-20  :12:3  #L3  #L3-L9
const LOCATION = /(:\d+(-\d+)?){1,2}$|#L\d+(-L?\d+)?$/;

// The first target after `make`, skipping flags and the argument of -C, -f, -I, -o and -W.
function makeTarget(span) {
  const words = span.split(/\s+/);
  if (words[0] !== "make") return null;
  for (let i = 1; i < words.length; i++) {
    if (/^-[CfIoW]$/.test(words[i])) i++;
    else if (!words[i].startsWith("-")) return words[i].match(/^[A-Za-z0-9_.][A-Za-z0-9_.-]*/);
  }
  return null;
}

const spans = (line) => [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());

function makeTargets(root) {
  const f = join(root, "Makefile");
  if (!existsSync(f)) return null;
  return new Set([...readFileSync(f, "utf8").matchAll(/^([A-Za-z0-9_.-]+):/gm)].map((m) => m[1]));
}

function npmScripts(root) {
  const f = join(root, "package.json");
  if (!existsSync(f)) return null;
  return new Set(Object.keys(JSON.parse(readFileSync(f, "utf8")).scripts ?? {}));
}

/** Every problem in the project's docs, as { doc, line, message }. */
export function checkFacts(root) {
  const all = files(root);
  const names = new Set(all.map((p) => p.split("/").pop()));
  const tests = all.filter((p) => TEST_FILE.test(p));
  let targets, scripts;
  const problems = [];

  for (const doc of DOCS) {
    const path = join(root, doc);
    if (!existsSync(path)) continue;
    readFileSync(path, "utf8").split("\n").forEach((text, i) => {
      const say = (message) => problems.push({ doc, line: i + 1, message });
      for (const span of spans(text)) {
        const make = makeTarget(span);
        const npm = span.match(/^npm\s+(?:run\s+([A-Za-z0-9:_.-]+)|(test|start))\b/);
        if (make) {
          targets ??= makeTargets(root);
          if (!targets?.has(make[0])) say(`make ${make[0]}: no such target in the Makefile`);
        } else if (npm) {
          const name = npm[1] ?? npm[2];
          scripts ??= npmScripts(root);
          if (!scripts?.has(name)) say(`${span}: no such script in package.json`);
        } else if (doc === TESTING && /^@[a-z][a-z0-9-]*$/.test(span)) {
          const used = tests.some((p) => readFileSync(join(root, p), "utf8").includes(span));
          if (!used) say(`${span} tags no test`);
        } else if (!/[\s*<>$~{}]|^\/|^\.\.|:\/\//.test(span)) {
          const p = span.replace(LOCATION, "");
          if (p.includes("/")) {
            if ((p.endsWith("/") || FILE.test(p)) && !existsSync(join(root, p))) say(`${p} doesn't exist`);
          } else if (FILE.test(p) && !names.has(p)) say(`${p} doesn't exist`);
        }
      }
    });
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = checkFacts(process.argv[2] ?? ".");
  for (const p of problems) console.log(`${p.doc}:${p.line} ${p.message}`);
  if (problems.length) {
    console.log(`\n${problems.length} fact(s) in the docs don't match the code. Fix the doc, or the code if the doc is right.`);
    process.exit(1);
  }
  console.log("Every path, command and tag the docs name exists.");
}
