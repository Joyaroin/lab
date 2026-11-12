import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

// Agents share the Mac, so each gets its own port in $TEST_PORT. CI leaves it unset.
const port = Number(process.env.TEST_PORT) || 4173;
const origin = `http://127.0.0.1:${port}`;

// CI draws WebGL on Mesa's llvmpipe (LAB_WEBGL=llvmpipe, set in release.yml and ci.yml, run under Xvfb): a third of SwiftShader's CPU at the
// same frame rate. It needs the full Chromium, because the headless shell has no display for OpenGL, and ANGLE on GL.
// Anywhere else Playwright's default stands.
const llvmpipe = process.env.LAB_WEBGL === "llvmpipe"
  ? { channel: "chromium", launchOptions: { args: ["--use-angle=gl", "--ignore-gpu-blocklist", "--enable-gpu"] } }
  : {};

export default defineConfig({
  // Where TEST_PORT is set (agent sessions on the Mac) one worker, so one session can't take the CPU from the others.
  // CI: 3, because the runner draws WebGL on its CPUs and runs up to 3 jobs at once; Playwright's default (half the
  // CPUs, 6) overloaded it and timing specs missed frames. A Mac without TEST_PORT keeps the default.
  workers: process.env.TEST_PORT ? 1 : process.env.CI ? 3 : undefined,
  testDir: "tests",
  testMatch: "*.spec.ts",
  webServer: {
    command: `npm run build && npm run preview -- --port ${port}`,
    // The repo root, so the tests run the same from any working directory.
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    url: origin,
    reuseExistingServer: false,
  },
  use: { baseURL: origin, ...llvmpipe },
  // The meter and HUD only appear once the room is ready. WebGL draws on the CPU, in CI and on the
  // agents' Mac, which takes a few seconds, so the timeout stays generous.
  expect: { timeout: 15_000 },
});
