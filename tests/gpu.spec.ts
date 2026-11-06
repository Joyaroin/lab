import { test, expect } from "@playwright/test";

// CI only: it fails the browser job if Chromium fell back to the CPU (SwiftShader), because
// Forgejo has no job-log API and nobody would see a printed line. CI sets CI=true.
test.skip(!process.env.CI, "Only CI has the GPU");

test("WebGL draws on the real GPU, not SwiftShader", async ({ page }) => {
  await page.goto("/");
  const renderer = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    return gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "no WebGL";
  });
  expect(renderer).not.toMatch(/swiftshader|no webgl/i);
  expect(renderer).toMatch(/AMD|Radeon/i);
});
