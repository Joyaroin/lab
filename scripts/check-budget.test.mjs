import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { checkBudget } from "./check-budget.mjs";

function site(files) {
  const dir = mkdtempSync(join(tmpdir(), "budget-"));
  mkdirSync(join(dir, "assets"));
  for (const [name, data] of Object.entries(files)) writeFileSync(join(dir, name), data);
  return dir;
}
const html = (js) => `<script type="module" src="/assets/${js}"></script>`;

describe("checkBudget", () => {
  it("passes a small first screen", () => {
    const dir = site({ "index.html": html("a.js"), "assets/a.js": "x" });
    expect(checkBudget(dir, { firstScreen: 1000, total: 10000 }).ok).toBe(true);
  });
  it("fails when the first screen is over budget", () => {
    const dir = site({ "index.html": html("a.js"), "assets/a.js": randomBytes(5000) });
    const r = checkBudget(dir, { firstScreen: 1000, total: 10000 });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/first screen/);
  });
  it("ignores assets the first screen does not reference", () => {
    const dir = site({ "index.html": html("a.js"), "assets/a.js": "x", "assets/room.glb": randomBytes(5000) });
    expect(checkBudget(dir, { firstScreen: 1000, total: 10000 }).ok).toBe(true);
  });
  it("fails when the whole site is over budget", () => {
    const dir = site({ "index.html": html("a.js"), "assets/a.js": "x", "assets/room.glb": randomBytes(5000) });
    const r = checkBudget(dir, { firstScreen: 1000, total: 2000 });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/whole site/);
  });
});
