import { test, expect } from "@playwright/test";

// CI only (LAB_WEBGL=llvmpipe): fails the release browser job if Chromium fell back from Mesa's llvmpipe to SwiftShader, which it
// does without a word when there is no display. SwiftShader takes about three times the CPU and overloads the runner.
test.skip(process.env.LAB_WEBGL !== "llvmpipe", "Only CI draws on llvmpipe");

test("WebGL draws on Mesa's llvmpipe, not SwiftShader", async ({ page }) => {
  await page.goto("about:blank");
  const renderer = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    return gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "no WebGL";
  });
  expect(renderer).toMatch(/llvmpipe/i);
});
