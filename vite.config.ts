import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LOCAL_GAP } from "./scripts/saved-gap.mjs";

// The build saves today's gap to this file (scripts/save-gap.mjs). Once it exists, which is
// after any local build, dev, tests and builds all use it in place of the committed gap-saved.json.
// Git ignores it, so building leaves the working tree clean.
const local = fileURLToPath(LOCAL_GAP);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: existsSync(local) ? [{ find: /^\.\/gap-saved\.json$/, replacement: local }] : [],
  },
  test: { include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"] },
});
