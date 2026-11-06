// Saves today's gap into the local file (see saved-gap.mjs). The build uses it in place of the
// committed src/gap-saved.json (see vite.config.ts). If the call fails, the newer of the old
// local file and the committed one stays.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "vite";
import { LOCAL_GAP, newestSaved, nextSaved } from "./saved-gap.mjs";

// gap.ts is TypeScript, so load it through Vite rather than keep a second copy of the logic.
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
const { readGap } = await vite.ssrLoadModule("/src/gap.ts");
await vite.close();

const read = (u) => (existsSync(u) ? JSON.parse(readFileSync(u, "utf8")) : undefined);
const committed = read(new URL("../src/gap-saved.json", import.meta.url));
const best = newestSaved(read(LOCAL_GAP), committed);
const r = await readGap(fetch, { deploys: -1, savedAt: "" });
if (r.live) console.log(`saved gap: ${r.deploys}`);
else console.warn("could not read the gap; keeping the newest saved value");
writeFileSync(LOCAL_GAP, JSON.stringify(nextSaved(r, best, new Date().toISOString()), null, 2) + "\n");
