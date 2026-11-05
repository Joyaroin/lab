import { test, expect } from "@playwright/test";
import { createServer, type Server, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";


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

// Mouse parallax is a slight sideways shift, so moving the pointer at the close-up entrance
// never pushes the desk meter out of frame and the bar's own digits never pop up over it.
test("moving the pointer at the entrance keeps the desk meter in view (desktop)", async ({ page }) => {
  await page.setViewportSize(sizes.desktop);
  await page.emulateMedia({ reducedMotion: "no-preference" }); // parallax is on
  await startTour(page);
  const bar = page.getByRole("button", { name: /^Meter/ });
  await expect(bar).toHaveAttribute("data-desk-meter", "in-view");
  const { width, height } = sizes.desktop;
  for (const [x, y] of [[1, height / 2], [width - 2, height / 2], [1, 1], [width - 2, height - 2], [width / 2, height / 2]]) {
    await page.mouse.move(x, y, { steps: 8 });
    // Watch the camera ease all the way to its new place: the bar must say in view throughout.
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(200);
      expect(await bar.getAttribute("data-desk-meter"), `pointer at ${x},${y}`).toBe("in-view");
    }
    await expect(bar.getByTestId("tube").first()).not.toBeInViewport();
    if (x === 1 && y === height / 2) await page.screenshot({ path: "test-results/entrance-pointer-left-desktop.png" });
  }
});

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

// --- launch polish (ticket 27) ---
test("a load that hangs with no error reaches signal lost, and the links work from there", async ({ page }) => {
  await page.clock.install(); // so the test doesn't have to wait out the real timeout
  // The room's code request is accepted and then never answered: no error, no data.
  await page.route("**/assets/Room-*.js", () => {});
  await page.goto("/");
  await expect(page.getByLabel("Boot log")).toBeVisible();
  await page.clock.fastForward("00:20"); // a slow phone link must not trip it this early
  await expect(page.getByLabel("Boot log")).toBeVisible();
  await page.clock.fastForward("01:00");
  await signalLost(page);
  for (const name of ["Résumé", "LinkedIn", "GitHub"])
    await expect(page.getByRole("link", { name })).toBeInViewport();
});

// --- stall detection (ticket 34) ---
// Serves the room model from a local server whose chunks the test releases one at a time, and
// points the page's request for it there. The page clock is separate from the real one, so the
// test decides how much page time passes between chunks.
async function slowModel(page: import("@playwright/test").Page) {
  const glb = readFileSync("src/assets/room.glb");
  let res: ServerResponse | undefined;
  let sent = 0;
  const server: Server = createServer((_req, r) => {
    res = r;
    r.writeHead(200, {
      "content-type": "model/gltf-binary", "content-length": glb.length,
      "access-control-allow-origin": "*",
    });
    r.flushHeaders();
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await page.route("**/*.glb", (route) => route.continue({ url: `${origin}/room.glb` }));
  const chunk = async (bytes: number) => {
    await expect.poll(() => res !== undefined).toBe(true); // the page has asked for the model
    const part = glb.subarray(sent, Math.min(sent + bytes, glb.length));
    sent += part.length;
    await new Promise<void>((ok) => res!.write(part, () => ok()));
    await page.waitForTimeout(150); // real time for the page to receive it
  };
  return {
    chunk,
    rest: () => chunk(glb.length - sent).then(() => res!.end()),
    size: glb.length,
    close: () => { res?.destroy(); server.close(); },
  };
}

test("a slow load that keeps making progress past the old 120 s limit does not reach signal lost", async ({ page }) => {
  await page.clock.install();
  const model = await slowModel(page);
  try {
    await page.goto("/");
    const piece = Math.floor(model.size / 10);
    for (let i = 0; i < 7; i++) { // 7 x 20 s = 140 s of page time, a chunk arriving in each
      await model.chunk(piece);
      await page.clock.fastForward("00:20");
    }
    await expect(page.getByRole("alert")).toBeHidden();
    await expect(page.getByLabel("Boot log")).toBeVisible();
    await model.rest();
    await expect(page.locator("canvas")).toBeVisible();
    await expect(page.getByLabel("Boot log")).toBeHidden();
  } finally { model.close(); }
});

test("a hang on the room model file, after some of it arrived, reaches signal lost", async ({ page }) => {
  await page.clock.install();
  const model = await slowModel(page);
  try {
    await page.goto("/");
    await model.chunk(Math.floor(model.size / 10));
    await page.clock.fastForward("00:20");
    await expect(page.getByLabel("Boot log")).toBeVisible();
    await page.clock.fastForward("01:00"); // no more bytes
    await signalLost(page);
  } finally { model.close(); }
});

test("a hang on the room model file, with no bytes at all, reaches signal lost", async ({ page }) => {
  await page.clock.install();
  await page.route("**/*.glb", () => {}); // accepted, never answered
  await page.goto("/");
  await expect(page.getByLabel("Boot log")).toBeVisible();
  await page.clock.fastForward("01:00");
  await signalLost(page);
});

for (const [name, size] of Object.entries({ desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 780 } })) {
  test(`Contact's email link is on screen without scrolling (${name})`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("https://api.github.com/**", (r) => r.fulfill({ status: 403, json: {} }));
    await page.goto("/");
    const hud = page.getByRole("navigation", { name: "HUD" });
    await expect(hud).toBeVisible();
    await hud.getByRole("link", { name: "Contact" }).click();
    const panel = page.locator('[data-screen="contact"]');
    await expect(panel).toHaveCSS("opacity", "1");
    await page.waitForTimeout(300); // let the pin settle
    expect(await panel.evaluate((e) => e.scrollTop)).toBe(0);
    const email = panel.getByRole("link", { name: /@/ });
    await expect(email).toBeInViewport({ ratio: 1 }); // clipped by the panel's own scroll area counts as not visible
    await page.screenshot({ path: `test-results/ticket-27-contact-${name}.png` });
  });
}

test("the HUD's Résumé link points at the PDF", async ({ page, request }) => {
  await page.goto("/");
  const link = page.getByRole("navigation", { name: "HUD" }).getByRole("link", { name: "Résumé" });
  await expect(link).toBeVisible();
  // The link itself must be the PDF, not just /resume.pdf existing.
  await expect(link).toHaveAttribute("href", "/resume.pdf");
  const res = await request.get((await link.getAttribute("href"))!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("pdf");
  expect((await res.body()).subarray(0, 4).toString()).toBe("%PDF");
});
