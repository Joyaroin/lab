import { test, expect } from "@playwright/test";

const signalLost = (page: import("@playwright/test").Page) =>
  expect(page.getByRole("alert")).toContainText("SIGNAL LOST");

test("name and title are in the HTML before the script runs", async ({ page }) => {
  await page.route("**/assets/*.js", (r) => r.abort());
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Adham Sedik" })).toBeVisible();
  await expect(page.getByText("SWE & Platform")).toBeVisible();
});

test("room starts and boot screen goes away", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByLabel("Boot log")).toBeHidden();
  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/room.png" });
});

test("signal lost when WebGL is disabled", async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...a: any[]) {
      return /webgl/.test(type) ? null : (orig as any).call(this, type, ...a);
    } as any;
  });
  await page.goto("/");
  await signalLost(page);
  for (const name of ["Résumé", "LinkedIn", "GitHub"])
    await expect(page.getByRole("link", { name })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Adham Sedik" })).toBeVisible();
  await page.screenshot({ path: "test-results/signal-lost.png" });
});

test("signal lost when the scene fails to load", async ({ page }) => {
  await page.route("**/assets/Room-*.js", (r) => r.abort());
  await page.goto("/");
  await signalLost(page);
});

const commits = (...subjects: string[]) => subjects.map((message) => ({ commit: { message } }));
const deploys = (n: number) => Array.from({ length: n }, (_, i) => `Deploy MediaSafe ${i} to staging`);

test("meter shows the live gap with a plain label", async ({ page }) => {
  await page.route("https://api.github.com/**", (r) =>
    r.fulfill({ json: commits(...deploys(9), "Promote MediaSafe abc to prod") }),
  );
  await page.goto("/");
  await expect(page.getByText("prod is 9 deploys behind staging", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Reading 0.000009" })).toBeVisible();
  await page.screenshot({ path: "test-results/meter-live.png" });
});

test("meter shows the saved value and says so when the call fails", async ({ page }) => {
  await page.route("https://api.github.com/**", (r) => r.fulfill({ status: 403, json: {} }));
  await page.goto("/");
  await expect(page.getByText(/saved value, not live/)).toBeVisible();
  await expect(page.getByRole("img", { name: /^Reading 0\.\d{6}$/ })).toBeVisible();
  await page.screenshot({ path: "test-results/meter-saved.png" });
});

test("meter does not say 'saved value' while the live call is still pending", async ({ page }) => {
  // Hold the answer until the pending label has been seen, however long the room takes to load.
  let answer!: () => void;
  const answered = new Promise<void>((res) => (answer = res));
  await page.route("https://api.github.com/**", async (r) => {
    await answered;
    await r.fulfill({ json: commits(...deploys(2), "Promote MediaSafe abc to prod") });
  });
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByText("reading prod and staging…")).toBeVisible();
  await expect(page.getByText(/saved value/)).toHaveCount(0);
  answer();
  await expect(page.getByText("prod is 2 deploys behind staging", { exact: true })).toBeVisible();
});

// --- tour ---
const scrollFraction = (page: import("@playwright/test").Page) =>
  page.evaluate(() => window.scrollY / (document.documentElement.scrollHeight - innerHeight));

async function startTour(page: import("@playwright/test").Page) {
  await page.route("https://api.github.com/**", (r) =>
    r.fulfill({ json: commits(...deploys(9), "Promote MediaSafe abc to prod") }),
  );
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "HUD" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "HUD" })).toContainText("Open to co-op and full-time");
}

test("scrolling moves the tour and rolls the meter, and back again", async ({ page }) => {
  await startTour(page);
  const reading = page.getByRole("img", { name: /^Reading/ });
  await expect(reading).toHaveAttribute("aria-label", "Reading 0.000009");
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await expect(reading).toHaveAttribute("aria-label", "Reading 0.000861");
  await page.evaluate(() => scrollTo(0, 0));
  await expect(reading).toHaveAttribute("aria-label", "Reading 0.000009");
});

test("HUD links and the meter jump to stations; the HUD stays reachable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); // jumps land at once
  await startTour(page);
  const reading = page.getByRole("img", { name: /^Reading/ });
  await page.getByRole("navigation", { name: "HUD" }).getByRole("link", { name: "Home lab" }).click();
  await expect(reading).toHaveAttribute("aria-label", "Reading 0.000512");
  await page.screenshot({ path: "test-results/tour-home-lab.png" });
  await page.getByRole("button", { name: /^Meter/ }).click(); // next station
  await expect(reading).toHaveAttribute("aria-label", "Reading 0.000640");
  await page.screenshot({ path: "test-results/tour-order-tracker.png" });
  for (const f of [0, 0.3, 0.7, 1]) {
    await page.evaluate((f) => scrollTo(0, f * (document.documentElement.scrollHeight - innerHeight)), f);
    for (const name of ["Résumé", "LinkedIn", "GitHub", "Contact"])
      await expect(page.getByRole("navigation", { name: "HUD" }).getByRole("link", { name })).toBeInViewport();
  }
  await expect(reading).toHaveAttribute("aria-label", "Reading 0.000861");
  await page.screenshot({ path: "test-results/tour-contact.png" });
  await page.getByRole("button", { name: /^Meter/ }).click(); // wraps to the entrance
  await expect(reading).toHaveAttribute("aria-label", "Reading 0.000009");
  await expect.poll(() => scrollFraction(page)).toBe(0);
});

test("reduced motion: jumps are instant; otherwise they glide", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await startTour(page);
  await page.getByRole("link", { name: "Contact" }).click();
  expect(await scrollFraction(page)).toBeCloseTo(1, 2);

  const page2 = await page.context().newPage();
  await page2.emulateMedia({ reducedMotion: "no-preference" });
  await startTour(page2);
  await page2.getByRole("link", { name: "Contact" }).click();
  expect(await scrollFraction(page2)).toBeLessThan(0.99);
  await expect.poll(() => scrollFraction(page2)).toBeCloseTo(1, 2);
});

// --- text on the CRT screens ---
const sizes = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 780 } };

for (const [name, size] of Object.entries(sizes)) {
  test(`station text is readable, selectable and links work (${name})`, async ({ page, context }) => {
    await page.setViewportSize(size);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await startTour(page);
    await page.getByRole("navigation", { name: "HUD" }).getByRole("link", { name: "Contact" }).click();

    const panel = page.locator('[data-screen="contact"]');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveCSS("opacity", "1");
    // Other stations' text is not showing.
    await expect(page.locator('[data-screen="work"]')).toBeHidden();

    // Readable: real text at 14px or more, fully inside the window.
    const fontSize = await panel.locator("p").nth(1).evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(14);
    const box = (await panel.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(size.height);
    await page.screenshot({ path: `test-results/screen-contact-${name}.png` });

    // Selectable: selecting a paragraph yields its text.
    const para = panel.getByText("Open to co-op and full-time roles.");
    await para.selectText();
    expect(await page.evaluate(() => getSelection()!.toString())).toContain("Open to co-op and full-time roles.");

    // Links work: the link opens its address.
    await context.route("https://github.com/**", (r) => r.fulfill({ body: "ok", contentType: "text/html" }));
    const popup = page.waitForEvent("popup");
    await panel.getByRole("link", { name: "GitHub" }).click();
    expect((await popup).url()).toBe("https://github.com/Joyaroin");
  });
}

// Every panel must be fully inside the window at every station, at both sizes.
const stationIds = ["work", "mediasafe", "home-lab", "order-tracker", "wc2026-predictor", "contact"];
for (const [name, size] of Object.entries(sizes)) {
  test(`each station's panel appears, fully inside the window (${name})`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await startTour(page);
    for (const id of stationIds) {
      await page.getByRole("navigation", { name: "HUD" }).locator(`a[href="#${id}"]`).click();
      const panel = page.locator(`[data-screen="${id}"]`);
      await expect(panel).toBeVisible();
      await expect(panel).toHaveCSS("opacity", "1");
      for (const other of stationIds.filter((o) => o !== id)) await expect(page.locator(`[data-screen="${other}"]`)).toBeHidden();
      await page.waitForTimeout(300); // let the pin settle
      const box = (await panel.boundingBox())!;
      expect(box.x, `${id} left`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${id} right`).toBeLessThanOrEqual(size.width);
      const hud = (await page.getByRole("navigation", { name: "HUD" }).boundingBox())!;
      expect(box.y, `${id} clear of the HUD`).toBeGreaterThanOrEqual(hud.y + hud.height);
      expect(box.y + box.height, `${id} bottom`).toBeLessThanOrEqual(size.height);
      await page.screenshot({ path: `test-results/screen-${id}-${name}.png` });
    }
  });
}

// --- the desk meter and the scroll cue (ticket 9) ---
// --- the entrance is the meter, then the room (ticket 29) ---
for (const [name, size] of Object.entries(sizes)) {
  test(`the entrance shows the desk meter large; scrolling reveals the room and back returns to it (${name})`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await startTour(page);
    const bar = page.getByRole("button", { name: /^Meter/ });
    await expect(bar).toHaveAttribute("data-desk-meter", "in-view");
    await expect(bar.getByTestId("tube").first()).not.toBeInViewport(); // visually hidden, still read out
    await expect(page.getByText("prod is 9 deploys behind staging", { exact: true })).toBeVisible(); // the plain label stays
    await page.screenshot({ path: `test-results/entrance-${name}.png` });

    const to = (f: number) => page.evaluate((f) => scrollTo(0, f * (document.documentElement.scrollHeight - innerHeight)), f);
    await to(1 / 12); // halfway to the first station: the wide view of the room
    await page.mouse.move(10, 400); // a frame at the new position
    await page.waitForTimeout(300);
    await page.screenshot({ path: `test-results/entrance-reveal-${name}.png` });
    await to(1); // a station: the desk meter is out of frame, so the bar shows the digits
    await expect(bar).toHaveAttribute("data-desk-meter", "out-of-view");
    await expect(bar.getByTestId("tube").first()).toBeVisible();
    await to(0);
    await expect(bar).toHaveAttribute("data-desk-meter", "in-view");
    await expect(page.getByRole("img", { name: /^Reading/ })).toHaveAttribute("aria-label", "Reading 0.000009");
  });
}

test("a panel that scrolls shows a 'more' cue until its end (phone)", async ({ page }) => {
  await page.setViewportSize(sizes.phone);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await startTour(page);
  await page.getByRole("navigation", { name: "HUD" }).locator('a[href="#work"]').click();
  const panel = page.locator('[data-screen="work"]');
  await expect(panel).toHaveAttribute("data-more", "true");
  await expect(panel.getByText("more ▾")).toBeVisible();
  await panel.evaluate((e) => e.scrollTo(0, e.scrollHeight));
  await expect(panel).toHaveAttribute("data-more", "false");
  await expect(panel.getByText("more ▾")).toBeHidden();
});
