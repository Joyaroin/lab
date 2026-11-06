import { test, expect, type Page } from "@playwright/test";
import { stations } from "../src/content";
import { holdSpan } from "../src/hold";

// Ticket 55: Work is two pages on one TV, switched by a timeline of two buttons.
const work = stations.find((s) => s.id === "work")!;
const panel = (page: Page, id = "work") => page.locator(`[data-screen="${id}"]`);
const seg = (page: Page, id: string) => panel(page).locator(`button[data-page="${id}"]`);

async function openWork(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto("/");
  await expect(page.getByLabel("Boot log")).toBeHidden();
  await page.getByRole("navigation", { name: "HUD" }).locator('a[href="#work"]').click();
  await expect(panel(page)).toHaveCSS("opacity", "1");
  await page.waitForTimeout(1000); // let the camera arrive
}
const shown = (page: Page) => panel(page).locator("p").allInnerTexts();

for (const [w, h] of [[1280, 800], [1920, 1080]]) {
  test(`desktop ${w}x${h}: Work opens on Solace, and a click or Enter on a segment turns the page`, async ({ page }) => {
    test.setTimeout(90_000);
    await openWork(page, w, h);
    const [solace, barracuda] = work.pages!;

    // opens on Solace, with its text only; the open page is marked in words and shape, not colour
    await expect(seg(page, "solace")).toHaveAttribute("aria-pressed", "true");
    await expect(seg(page, "barracuda")).toHaveAttribute("aria-pressed", "false");
    await expect(seg(page, "solace")).toContainText("open");
    await expect(seg(page, "barracuda")).not.toContainText("open");
    const widthOf = async (id: string) => (await seg(page, id).boundingBox())!;
    expect((await widthOf("barracuda")).x).toBeLessThan((await widthOf("solace")).x); // oldest on the left
    expect(await shown(page)).toEqual(expect.arrayContaining(solace.body));
    expect(await shown(page)).not.toContain(barracuda.body[0]);
    expect(await seg(page, "barracuda").evaluate((e) => getComputedStyle(e).cursor)).toBe("pointer");
    await page.screenshot({ path: `test-results/work-${w}x${h}-solace.png` });

    // a click on the other segment
    await seg(page, "barracuda").click();
    await expect(seg(page, "barracuda")).toHaveAttribute("aria-pressed", "true");
    await expect(seg(page, "barracuda")).toContainText("open");
    await expect(seg(page, "solace")).not.toContainText("open");
    expect(await shown(page)).toEqual(expect.arrayContaining(barracuda.body));
    expect(await shown(page)).not.toContain(solace.body[0]);
    await page.screenshot({ path: `test-results/work-${w}x${h}-barracuda.png` });

    // Enter on the focused segment, from the keyboard
    await seg(page, "solace").focus();
    await page.keyboard.press("Enter");
    await expect(seg(page, "solace")).toHaveAttribute("aria-pressed", "true");
    expect(await shown(page)).toEqual(expect.arrayContaining(solace.body));
    await page.screenshot({ path: `test-results/work-${w}x${h}-solace-focus.png` });

    // every paragraph of the old copy is reachable on one page or the other
    const seen = new Set(await shown(page));
    await seg(page, "barracuda").focus();
    await page.keyboard.press("Enter");
    (await shown(page)).forEach((t) => seen.add(t));
    for (const b of work.body) expect(seen, b).toContain(b);
  });
}

test("scrolling does not turn the page, and a turn starts the new page at its top", async ({ page }) => {
  test.setTimeout(90_000);
  await openWork(page, 1280, 800);
  const box = (await panel(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 30); await page.waitForTimeout(80); }
  await expect(seg(page, "solace")).toHaveAttribute("aria-pressed", "true");
  await panel(page).evaluate((e) => { e.scrollTop = 1e6; });
  await seg(page, "barracuda").click();
  expect(await panel(page).evaluate((e) => e.scrollTop)).toBe(0);
});

/** Waits for the page to move past `prev` and then stop, so a slow runner doesn't read as a stuck wheel.
 *  Returns undefined if it never moved. */
async function movedFrom(page: Page, prev: number) {
  let now = prev;
  for (let i = 0; i < 40 && now <= prev; i++) { await page.waitForTimeout(75); now = await page.evaluate(() => scrollY); }
  if (now <= prev) return undefined;
  for (let last = -1, i = 0; i < 20 && now !== last; i++) { last = now; await page.waitForTimeout(60); now = await page.evaluate(() => scrollY); }
  return now;
}

// Leaving Work: once the hold is over, the panel shrinks with the camera and has more text than
// room, which used to swallow the wheel. Every step must now move the tour on.
test("leaving Work, every wheel step over the panel moves the page on", async ({ page }) => {
  test.setTimeout(90_000);
  await openWork(page, 1280, 800);
  const end = holdSpan(1)[1];
  const to = (f: number) => page.evaluate((f) => { scrollTo(0, f * (document.documentElement.scrollHeight - innerHeight)); }, f);
  await panel(page).evaluate((e) => { e.scrollTop = 1e6; }); // read to the end first
  await to(end - 0.001);
  await page.waitForTimeout(800);
  const box = (await panel(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
  let prev = await page.evaluate(() => scrollY), stuck: number[] = [], arrived = false;
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, 40);
    const now = await movedFrom(page, prev);
    if (now === undefined) { stuck.push(i); continue; }
    const f = now / (await page.evaluate(() => document.documentElement.scrollHeight - innerHeight));
    if (f >= holdSpan(2)[0]) { arrived = true; break; } // arrived at MediaSafe, whose own panel then reads
    prev = now;
  }
  expect(stuck, "wheel steps that did not move the page").toEqual([]);
  expect(arrived, "reached MediaSafe's hold").toBe(true);
});
