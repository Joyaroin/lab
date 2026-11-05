// Saves today's gap into src/gap-saved.json, the fallback the meter shows when the
// browser can't read the live value. If the call fails, the old file stays.
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "vite";

// gap.ts is TypeScript, so load it through Vite rather than keep a second copy of the logic.
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
const { readGap } = await vite.ssrLoadModule("/src/gap.ts");
await vite.close();

const file = new URL("../src/gap-saved.json", import.meta.url);
const r = await readGap(fetch, { deploys: -1, savedAt: "" });
const old = JSON.parse(readFileSync(file, "utf8"));
if (r.live && r.deploys !== old.deploys) {
  writeFileSync(file, JSON.stringify({ deploys: r.deploys, savedAt: new Date().toISOString() }, null, 2) + "\n");
  console.log(`saved gap: ${r.deploys}`);
} else if (!r.live) {
  console.warn("could not read the gap; keeping the committed saved value");
}
