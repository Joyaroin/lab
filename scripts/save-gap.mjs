// Saves today's gap into src/gap-saved.local.json, the fallback the meter shows when the
// browser can't read the live value. The build uses it in place of the committed
// src/gap-saved.json (see vite.config.ts), so a build never changes a tracked file.
// If the call fails, the newer of the old local file and the committed one stays.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "vite";

// gap.ts is TypeScript, so load it through Vite rather than keep a second copy of the logic.
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
const { readGap } = await vite.ssrLoadModule("/src/gap.ts");
await vite.close();

const read = (u) => (existsSync(u) ? JSON.parse(readFileSync(u, "utf8")) : undefined);
const committed = read(new URL("../src/gap-saved.json", import.meta.url));
const local = new URL("../src/gap-saved.local.json", import.meta.url);
const old = read(local);
const best = old && old.savedAt > committed.savedAt ? old : committed;
const r = await readGap(fetch, { deploys: -1, savedAt: "" });
let out = best;
if (r.live) {
  out = { deploys: r.deploys, savedAt: new Date().toISOString() };
  console.log(`saved gap: ${r.deploys}`);
} else {
  console.warn("could not read the gap; keeping the newest saved value");
}
writeFileSync(local, JSON.stringify(out, null, 2) + "\n");
