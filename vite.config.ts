import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LOCAL_GAP } from "./scripts/saved-gap.mjs";
import { content } from "./src/content";
import { transformPage } from "./src/page-html";

// The build saves today's gap to this file (scripts/save-gap.mjs). Once it exists, which is
// after any local build, dev, tests and builds all use it in place of the committed gap-saved.json.
// Git ignores it, so building leaves the working tree clean.
const local = fileURLToPath(LOCAL_GAP);

export default defineConfig({
  // The head tags and the pre-boot #root are written from the content module, in dev and in the build.
  plugins: [react(), { name: "page-html", transformIndexHtml: (html) => transformPage(html, content) }],
  // The meter device's images are files of their own: dot.png and numeral-1.png are under the default 4 KB limit.
  build: { assetsInlineLimit: (file) => (file.includes("/assets/meter/") ? false : undefined) },
  resolve: {
    alias: existsSync(local) ? [{ find: /^\.\/gap-saved\.json$/, replacement: local }] : [],
  },
  test: { include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"] },
});
