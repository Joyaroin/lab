// Fails the build when the first screen or the whole site is too heavy.
// Sizes are gzip bytes. Budgets come from the spec (about 100 KB and 15 MB):
// don't change them quietly, ask first.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const BUDGETS = { firstScreen: 100 * 1024, total: 15 * 1024 * 1024 };

const gz = (file) => gzipSync(readFileSync(file)).length;

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function checkBudget(dir, budgets = BUDGETS) {
  const html = join(dir, "index.html");
  const refs = [...readFileSync(html, "utf8").matchAll(/(?:src|href)="\/([^"]+)"/g)]
    .map((m) => join(dir, m[1]))
    .filter((p) => existsSync(p));
  const first = [html, ...refs].reduce((n, f) => n + gz(f), 0);
  const total = walk(dir).reduce((n, f) => n + gz(f), 0);
  const errors = [];
  if (first > budgets.firstScreen)
    errors.push(`first screen is ${first} B gzip, budget ${budgets.firstScreen} B`);
  if (total > budgets.total)
    errors.push(`whole site is ${total} B gzip, budget ${budgets.total} B`);
  return { ok: errors.length === 0, first, total, errors };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = checkBudget(process.argv[2] ?? "dist");
  console.log(`budget: first screen ${r.first} B, whole site ${r.total} B (gzip)`);
  if (!r.ok) {
    r.errors.forEach((e) => console.error(`FAIL: ${e}`));
    process.exit(1);
  }
}
