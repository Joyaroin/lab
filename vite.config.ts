import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The build saves today's gap here (scripts/save-gap.mjs). It is ignored by git, so building
// leaves the working tree clean. Without it (dev, tests) the committed gap-saved.json is used.
const local = fileURLToPath(new URL("./src/gap-saved.local.json", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: existsSync(local) ? [{ find: /^\.\/gap-saved\.json$/, replacement: local }] : [],
  },
  test: { include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"] },
});
