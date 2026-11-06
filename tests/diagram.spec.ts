import { test, expect } from "@playwright/test";
import { stations } from "../src/content";

// Ticket 53: MediaSafe shows a line diagram under its links, drawn from data in the content module.
// Other stations that have none look as they did.
const mediasafe = stations.find((s) => s.id === "mediasafe")!;

for (const [w, h] of [[1280, 800], [1920, 1080]]) {
  test(`desktop ${w}x${h}: MediaSafe's diagram sits under its links, and Work has none`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/");
    await expect(page.getByLabel("Boot log")).toBeHidden();
    const hud = page.getByRole("navigation", { name: "HUD" });

    await hud.locator('a[href="#work"]').click();
    const work = page.locator('[data-screen="work"]');
    await expect(work).toHaveCSS("opacity", "1");
    await expect(work.locator("figure")).toHaveCount(0);
    await page.screenshot({ path: `test-results/diagram-${w}x${h}-work.png` });

    await hud.locator('a[href="#mediasafe"]').click();
    const panel = page.locator('[data-screen="mediasafe"]');
    await expect(panel).toHaveCSS("opacity", "1");
    await page.waitForTimeout(800); // let the camera arrive
    const fig = panel.locator("figure[data-diagram]");
    await expect(fig).toBeVisible();

    // real text, in order, readable by a screen reader's description too
    await expect(fig.locator("svg text")).toHaveText(["Git", "Argo CD", "automatically", "Staging", "by hand", "Production"]);
    await expect(fig.getByRole("img", { name: mediasafe.diagram!.description })).toBeVisible();

    // under the links, above the body, inside the panel and the window
    const y = async (sel: string) => (await panel.locator(sel).first().boundingBox())!;
    const links = await y("a"), fb = (await fig.boundingBox())!, body = await y("p:not(:has(a)):nth-of-type(n+3)");
    expect(fb.y).toBeGreaterThanOrEqual(links.y + links.height);
    expect(fb.y + fb.height).toBeLessThanOrEqual(body.y + 1);
    const pb = (await panel.boundingBox())!;
    expect(fb.x).toBeGreaterThanOrEqual(pb.x);
    expect(fb.x + fb.width).toBeLessThanOrEqual(pb.x + pb.width);
    // each label is big enough to read
    const size = await fig.locator("svg text").first().evaluate((t) => t.getBoundingClientRect().height);
    expect(size).toBeGreaterThanOrEqual(10);
    await page.screenshot({ path: `test-results/diagram-${w}x${h}-mediasafe.png` });
  });
}

test("phone: MediaSafe still shows its panel with the diagram not breaking the layout", async ({ browser }) => {
  test.setTimeout(60_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.getByLabel("Boot log")).toBeHidden();
  await page.getByRole("navigation", { name: "HUD" }).locator('a[href="#mediasafe"]').click();
  const panel = page.locator('[data-screen="mediasafe"]');
  await expect(panel).toHaveCSS("opacity", "1");
  await page.waitForTimeout(800);
  const pb = (await panel.boundingBox())!;
  expect(pb.x).toBeGreaterThanOrEqual(0);
  expect(pb.x + pb.width).toBeLessThanOrEqual(390);
  expect(await panel.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.screenshot({ path: "test-results/diagram-390x844-mediasafe.png" });
  await ctx.close();
});

// Ticket 54: Home lab, Order Tracker and WC2026 get one too; Contact never does.
for (const id of ["home-lab", "order-tracker", "wc2026-predictor", "contact"]) {
  test(`desktop 1280x800: ${id} ${id === "contact" ? "has no diagram" : "shows its diagram, drawn from its copy, inside the panel"}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.getByLabel("Boot log")).toBeHidden();
    await page.getByRole("navigation", { name: "HUD" }).locator(`a[href="#${id}"]`).click();
    const panel = page.locator(`[data-screen="${id}"]`);
    await expect(panel).toHaveCSS("opacity", "1");
    await page.waitForTimeout(800);
    const d = stations.find((s) => s.id === id)!.diagram;
    if (!d) {
      await expect(panel.locator("figure")).toHaveCount(0);
      await page.screenshot({ path: `test-results/diagram-1280x800-${id}.png` });
      return;
    }
    const fig = panel.locator("figure[data-diagram]");
    await expect(fig).toBeVisible();
    // labels in order; an arrow with no label draws no text
    await expect(fig.locator("svg text")).toHaveText(d.steps.flatMap((t, i) => (d.hops[i] ? [t, d.hops[i]] : [t])));
    await expect(fig.getByRole("img", { name: d.description })).toBeVisible();
    const pb = (await panel.boundingBox())!, fb = (await fig.boundingBox())!;
    expect(fb.x).toBeGreaterThanOrEqual(pb.x);
    expect(fb.x + fb.width).toBeLessThanOrEqual(pb.x + pb.width);
    expect(await panel.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
    // every label sits inside the drawing and is big enough to read
    const bad = await fig.locator("svg text").evaluateAll((ts) => ts.filter((t) => {
      const r = t.getBoundingClientRect(), s = (t as SVGTextElement).ownerSVGElement!.getBoundingClientRect();
      return r.left < s.left - 0.5 || r.right > s.right + 0.5 || r.height < 9;
    }).length);
    expect(bad).toBe(0);
    await page.screenshot({ path: `test-results/diagram-1280x800-${id}.png` });
  });
}
