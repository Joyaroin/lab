import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { stations } from "../src/content";
import { GAP_TIMEOUT_MS } from "../src/gap";
import { STATION_COUNT } from "../src/hold";
import { goBack, goTo, landedAt, readCamera, readShot, stationIds, waitForCamera } from "./lib/page";

const signalLost = async (page: Page, reason?: string) => {
  await expect(page.getByRole("alert")).toContainText("SIGNAL LOST");
  if (reason) await expect(page.getByRole("alert")).toContainText(`(${reason})`);
};
const hud = (page: Page) => page.getByRole("navigation", { name: "HUD" });

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
  await page.clock.install();
  await page.route("**/assets/Room-*.js", (r) => r.abort());
  await page.goto("/");
  await signalLost(page, "scene-load-failed");
  // The stall watch stops when the load fails, so it can't change the reason later.
  await page.clock.fastForward("01:00");
  await signalLost(page, "scene-load-failed");
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
  // The gap call gives up after GAP_TIMEOUT_MS of real time, which a slow runner can reach before
  // the room is ready. Keep that one timer from ever firing, so only the test decides when the
  // call ends. (The timeout itself is covered by the gap module's unit tests.)
  await page.addInitScript((ms) => {
    const set = window.setTimeout.bind(window);
    window.setTimeout = ((fn: TimerHandler, delay?: number, ...args: unknown[]) =>
      set(fn, delay === ms ? 2 ** 31 - 1 : delay, ...args)) as typeof window.setTimeout;
  }, GAP_TIMEOUT_MS);
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
async function startTour(page: Page) {
  await page.route("https://api.github.com/**", (r) =>
    r.fulfill({ json: commits(...deploys(9), "Promote MediaSafe abc to prod") }),
  );
  await page.goto("/");
  await expect(hud(page)).toBeVisible();
  await expect(hud(page)).toContainText("Open to co-op and full-time");
}

test("visiting a station rolls the meter, and Room rolls it back", async ({ page }) => {
  await startTour(page);
  const reading = page.getByRole("img", { name: /^Reading/ });
  await expect(reading).toHaveAttribute("aria-label", "Reading 0.000009");
  await goTo(page, STATION_COUNT);
  await expect(reading).toHaveAttribute("aria-label", "Reading 0.000861");
  await goBack(page);
  await expect(reading).toHaveAttribute("aria-label", "Reading 0.000009");
});

// The wheel never moves the camera. At the overview there is no panel to take it, and the page has nothing to scroll.
test("the wheel at the overview moves nothing", async ({ page }) => {
  await startTour(page);
  await landedAt(page, 0);
  await page.mouse.move(640, 400); // the pointer's parallax settles first: only the wheel is under test
  const camera = await waitForCamera(page);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 300); await page.waitForTimeout(100); }
  expect(await waitForCamera(page), "the camera did not move").toEqual(camera);
  expect(await page.evaluate(() => scrollY), "the page did not scroll").toBe(0);
  await landedAt(page, 0);
});

test("HUD links and the meter jump to stations; the HUD stays reachable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); // a move is a quick fade
  await startTour(page);
  const reading = page.getByRole("img", { name: /^Reading/ });
  await goTo(page, stationIds.indexOf("home-lab") + 1);
  await expect(reading).toHaveAttribute("aria-label", "Reading 0.000512");
  await page.screenshot({ path: "test-results/tour-home-lab.png" });
  await page.getByRole("button", { name: /^Meter/ }).click(); // next station
  await expect(reading).toHaveAttribute("aria-label", "Reading 0.000640");
  await page.screenshot({ path: "test-results/tour-order-tracker.png" });
  for (const stop of [0, 1, 3, STATION_COUNT]) {
    await goTo(page, stop);
    for (const name of ["Résumé", "LinkedIn", "GitHub", "Contact"])
      await expect(hud(page).getByRole("link", { name })).toBeInViewport();
  }
  await expect(reading).toHaveAttribute("aria-label", "Reading 0.000861");
  await page.screenshot({ path: "test-results/tour-contact.png" });
  await page.getByRole("button", { name: /^Meter/ }).click(); // wraps to the overview
  await expect(reading).toHaveAttribute("aria-label", "Reading 0.000009");
  await landedAt(page, 0);
});

// Records every camera position the canvas draws (its data-camera), so a flight can be told from a cut: a flight
// passes through places between the two ends, a cut shows only the two ends.
const recordCamera = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { __camera: string[] };
    w.__camera = [];
    const watch = () => {
      const canvas = document.querySelector("canvas");
      if (!canvas) return requestAnimationFrame(watch);
      new MutationObserver(() => w.__camera.push(canvas.dataset.camera ?? "")).observe(canvas, { attributes: true, attributeFilter: ["data-camera"] });
    };
    watch();
  });
const camerasSeen = (page: Page) => page.evaluate(() => [...new Set((window as unknown as { __camera: string[] }).__camera)]);

test("reduced motion: a move is a cut, otherwise a flight", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await recordCamera(page);
  await startTour(page);
  await waitForCamera(page);
  const start = (await camerasSeen(page)).length;
  await goTo(page, STATION_COUNT);
  await waitForCamera(page);
  expect((await camerasSeen(page)).length - start, "a cut shows only where the camera lands").toBeLessThanOrEqual(1);

  const page2 = await page.context().newPage();
  await page2.emulateMedia({ reducedMotion: "no-preference" });
  await recordCamera(page2);
  await startTour(page2);
  await waitForCamera(page2);
  const start2 = (await camerasSeen(page2)).length;
  await goTo(page2, STATION_COUNT);
  await waitForCamera(page2);
  // ...and the camera really did fly: it passed through places between the start and the end.
  expect((await camerasSeen(page2)).length - start2, "positions seen part-way along").toBeGreaterThanOrEqual(3);
});

// --- text on the CRT screens ---
const sizes = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 780 } };

for (const [name, size] of Object.entries(sizes)) {
  test(`station text is readable, selectable and links work (${name})`, async ({ page, context }) => {
    await page.setViewportSize(size);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await startTour(page);
    await hud(page).getByRole("link", { name: "Contact" }).click();

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
    const para = panel.getByText("I'm open to co-op and full-time roles.");
    await para.selectText();
    expect(await page.evaluate(() => getSelection()!.toString())).toContain("I'm open to co-op and full-time roles.");

    // Links work: the link opens its address.
    await context.route("https://github.com/**", (r) => r.fulfill({ body: "ok", contentType: "text/html" }));
    const popup = page.waitForEvent("popup");
    await panel.getByRole("link", { name: "GitHub" }).click();
    expect((await popup).url()).toBe("https://github.com/Joyaroin");
  });
}

// Every panel must be fully inside the window at every station, at both sizes.
for (const [name, size] of Object.entries(sizes)) {
  // Only the desktop run visits every station at desktop size: it carries @render.
  const tag = name === "desktop" ? ["@render"] : [];
  test(`each station's panel appears, fully inside the window (${name})`, { tag }, async ({ page }) => {
    await page.setViewportSize(size);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await startTour(page);
    for (const id of stationIds) {
      await hud(page).locator(`a[href="#${id}"]`).click();
      const panel = page.locator(`[data-screen="${id}"]`);
      await expect(panel).toBeVisible();
      await expect(panel).toHaveCSS("opacity", "1");
      for (const other of stationIds.filter((o) => o !== id)) await expect(page.locator(`[data-screen="${other}"]`)).toBeHidden();
      await page.waitForTimeout(300); // let the pin settle
      const box = (await panel.boundingBox())!;
      expect(box.x, `${id} left`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${id} right`).toBeLessThanOrEqual(size.width);
      const bar = (await hud(page).boundingBox())!;
      expect(box.y, `${id} clear of the HUD`).toBeGreaterThanOrEqual(bar.y + bar.height);
      expect(box.y + box.height, `${id} bottom`).toBeLessThanOrEqual(size.height);
      await page.screenshot({ path: `test-results/screen-${id}-${name}.png` });
    }
  });
}

// --- the overview, with the gap on the meter, then a station (ticket 29, click-to-visit #174) ---
for (const [name, size] of Object.entries(sizes)) {
  test(`the site opens on the overview with the gap on the meter; a station shows its digits and Room returns (${name})`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await startTour(page);
    const bar = page.getByRole("button", { name: /^Meter/ });
    await landedAt(page, 0);
    await expect(page.getByText("prod is 9 deploys behind staging", { exact: true })).toBeVisible(); // the plain label stays
    await expect(page.getByRole("img", { name: /^Reading/ })).toHaveAttribute("aria-label", "Reading 0.000009");
    await page.screenshot({ path: `test-results/overview-${name}.png` });

    await goTo(page, 1); // a station: the desk meter is out of frame, so the bar shows the digits
    await expect(bar).toHaveAttribute("data-desk-meter", "out-of-view");
    await expect(bar.getByTestId("tube").first()).toBeVisible();
    await goBack(page);
    await expect(page.getByRole("img", { name: /^Reading/ })).toHaveAttribute("aria-label", "Reading 0.000009");
  });
}

// A panel that overflows shows a "more" cue until its end. Which panel overflows depends on the copy,
// so this makes one: it appends paragraphs to a panel until it is longer than its box, whatever
// the copy says. (The app marks the cue on the next drawn frame, which the click and a wheel tick ask for.)
const overflow = (page: Page, id: string) => page.locator(`[data-screen="${id}"]`).evaluate((e) => {
  const clientHeight = e.clientHeight;
  while (e.scrollHeight - clientHeight < clientHeight) {
    const p = document.createElement("p");
    p.textContent = "Filler paragraph added by the test so that this panel runs past its bottom edge. ".repeat(4);
    e.insertBefore(p, e.querySelector(".crt-more"));
  }
});

test("a panel that scrolls shows a 'more' cue until its end (phone)", async ({ page }) => {
  await page.setViewportSize(sizes.phone);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await startTour(page);
  await hud(page).locator('a[href="#contact"]').click();
  const panel = page.locator('[data-screen="contact"]');
  await expect(panel).toHaveCSS("opacity", "1");
  await overflow(page, "contact");
  await panel.evaluate((e) => e.dispatchEvent(new Event("scroll"))); // the panel's own scroll handler marks the cue
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
  await signalLost(page, "load-timed-out");
  for (const name of ["Résumé", "LinkedIn", "GitHub"])
    await expect(page.getByRole("link", { name })).toBeInViewport();
});

// --- stall detection (ticket 34) ---
// Serves the room model from a local server whose chunks the test releases one at a time, and
// points the page's request for it there. The page clock is separate from the real one, so the
// test decides how much page time passes between chunks.
async function slowModel(page: Page) {
  const glb = readFileSync(fileURLToPath(new URL("../src/assets/room.glb", import.meta.url)));
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
  // The browser reports each piece of the model as it receives it, so a test can wait for that
  // instead of guessing how long the page needs.
  const cdp = await page.context().newCDPSession(page);
  const modelRequests = new Set<string>();
  let received = 0;
  cdp.on("Network.requestWillBeSent", (e) => { if (e.request.url.endsWith(".glb")) modelRequests.add(e.requestId); });
  cdp.on("Network.dataReceived", (e) => { if (modelRequests.has(e.requestId)) received += e.dataLength; });
  await cdp.send("Network.enable");
  const chunk = async (bytes: number) => {
    await expect.poll(() => res !== undefined).toBe(true); // the page has asked for the model
    const part = glb.subarray(sent, Math.min(sent + bytes, glb.length));
    sent += part.length;
    await new Promise<void>((ok) => res!.write(part, () => ok()));
    await expect.poll(() => received).toBe(sent); // the page has the piece
  };
  return {
    chunk,
    rest: () => chunk(glb.length - sent).then(() => res!.end()),
    size: glb.length,
    close: () => { res?.destroy(); server.close(); },
  };
}

// The limit is 30 s without progress (STALL_LIMIT_MS in src/App.tsx). The gaps here are 28 s, so
// a limit shorter than that fails them (checked with 21 s). A limit that is too long is only
// caught loosely: the page clock keeps running in real time while the test waits, so signal lost
// shows up as soon as the limit has passed in total, up to the expect timeout later.
test("a slow load that keeps making progress, for far longer than 30 s in all, does not reach signal lost", async ({ page }) => {
  await page.clock.install();
  const model = await slowModel(page);
  try {
    await page.goto("/");
    const piece = Math.floor(model.size / 10);
    for (let i = 0; i < 7; i++) { // 7 x 28 s = 196 s of page time, a chunk arriving in each
      await model.chunk(piece);
      await page.clock.fastForward("00:28");
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
    await page.clock.fastForward("00:28");
    await expect(page.getByLabel("Boot log")).toBeVisible(); // 28 s without progress is within the limit
    await page.clock.fastForward("00:03"); // 31 s in all, and no more bytes
    await signalLost(page, "load-timed-out");
  } finally { model.close(); }
});

test("a hang on the room model file, with no bytes at all, reaches signal lost", async ({ page }) => {
  await page.clock.install();
  await page.route("**/*.glb", () => {}); // accepted, never answered
  await page.goto("/");
  await expect(page.getByLabel("Boot log")).toBeVisible();
  await page.clock.fastForward("01:00");
  await signalLost(page, "load-timed-out");
});

for (const [name, size] of Object.entries(sizes)) {
  test(`Contact's email link is on screen without scrolling (${name})`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("https://api.github.com/**", (r) => r.fulfill({ status: 403, json: {} }));
    await page.goto("/");
    await expect(hud(page)).toBeVisible();
    await hud(page).getByRole("link", { name: "Contact" }).click();
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
  await page.route("https://api.github.com/**", (r) => r.fulfill({ status: 403, json: {} }));
  await page.goto("/");
  const link = hud(page).getByRole("link", { name: "Résumé" });
  await expect(link).toBeVisible();
  // The link itself must be the PDF, not just /resume.pdf existing.
  await expect(link).toHaveAttribute("href", "/resume.pdf");
  const res = await request.get("/resume.pdf");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("pdf");
  expect((await res.body()).subarray(0, 4).toString()).toBe("%PDF");
});

// --- ticket 49: the text is on the glass, not a card on it ---
const bigSizes = { "1280x800": { width: 1280, height: 800 }, "1920x1080": { width: 1920, height: 1080 } };
for (const [name, size] of Object.entries(bigSizes)) {
  test(`at every station the text sits on the glass with no card and no phosphor behind it (${name})`, { tag: "@render" }, async ({ page }) => {
    test.setTimeout(90_000); // six stops, each with a full-panel screenshot, on software WebGL
    await page.setViewportSize(size);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await startTour(page);
    for (const id of stationIds) {
      await hud(page).locator(`a[href="#${id}"]`).click();
      const panel = page.locator(`[data-screen="${id}"]`);
      await expect(panel).toHaveCSS("opacity", "1");
      await page.waitForTimeout(400); // let the pin settle
      // No card: no border, no own background colour or shadow.
      const style = await panel.evaluate((e) => { const s = getComputedStyle(e); return { border: s.borderTopWidth, radius: s.borderTopLeftRadius, bg: s.backgroundColor, shadow: s.boxShadow }; });
      expect(style, id).toEqual({ border: "0px", radius: "0px", bg: "rgba(0, 0, 0, 0)", shadow: "none" });
      // Nothing from the 3D layer shows behind or around the text: hide the text, then sample the
      // whole panel including its edges. A title card's text is #7dffb0 and the baked glass is a flat
      // bright green (150+); a clear phosphor stays dark (under ~90).
      const box = (await panel.boundingBox())!;
      const hide = await page.addStyleTag({ content: `[data-screen] * { visibility: hidden !important; }` });
      let shot: Buffer;
      try {
        shot = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } });
      } finally {
        await hide.evaluate((tag) => (tag as Element).remove()); // by the handle addStyleTag gave back
      }
      const { inner, rim } = await readShot(page, shot, (img) => {
        const edge = 12; // px band along each side, where the rim showed
        let inner = 0, rim = 0;
        for (let py = 0; py < img.height; py++) for (let px = 0; px < img.width; px++) {
          const g = img.data[(py * img.width + px) * 4 + 1];
          const onEdge = px < edge || py < edge || px >= img.width - edge || py >= img.height - edge;
          if (onEdge) rim = Math.max(rim, g); else inner = Math.max(inner, g);
        }
        return { inner, rim };
      }, null);
      expect(inner, `${id}: title card shows behind the text`).toBeLessThan(90);
      expect(rim, `${id}: bright glass rim around the panel edge`).toBeLessThan(90);
      const fonts = await panel.evaluate((e) => ({ panel: parseFloat(getComputedStyle(e).fontSize), h2: parseFloat(getComputedStyle(e.querySelector("h2")!).fontSize) }));
      expect(fonts.h2, id).toBeGreaterThan(fonts.panel);
      expect(fonts.panel, `${id} type at ${name}`).toBeGreaterThanOrEqual(name === "1920x1080" ? 24 : 16);
      await page.screenshot({ path: `test-results/glass-${id}-${name}.png` });
      // The "more" cue (shown where the text overflows) fades the cut-off line and scales with the
      // type. Every panel is made to overflow for this, so it is checked at every station, not only
      // where today's copy happens to run long.
      await overflow(page, id);
      await panel.evaluate((e) => e.dispatchEvent(new Event("scroll")));
      await expect(panel).toHaveAttribute("data-more", "true");
      const cue = await panel.evaluate((e) => { const m = e.querySelector(".crt-more")!; return { bg: getComputedStyle(m).backgroundImage, font: parseFloat(getComputedStyle(m.querySelector("span")!).fontSize), panel: parseFloat(getComputedStyle(e).fontSize) }; });
      expect(cue.bg, `${id}: the more cue fades the text under it`).toContain("linear-gradient");
      expect(cue.font / cue.panel, `${id}: the more cue scales with the type`).toBeCloseTo(0.8, 1);
    }
  });
}

test("the type is larger at 1920x1080 than at 1280x800 at every station", { tag: "@render" }, async ({ page }) => {
  test.setTimeout(120_000); // 12 stops, each re-sized and settled
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(bigSizes["1280x800"]);
  await startTour(page);
  const fontAt = async (size: { width: number; height: number }, id: string) => {
    await page.setViewportSize(size);
    await hud(page).locator(`a[href="#${id}"]`).click();
    const panel = page.locator(`[data-screen="${id}"]`);
    await expect(panel).toHaveCSS("opacity", "1");
    await page.waitForTimeout(400);
    return panel.evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  };
  for (const id of stationIds) {
    const small = await fontAt(bigSizes["1280x800"], id);
    const big = await fontAt(bigSizes["1920x1080"], id);
    expect(big, id).toBeGreaterThan(small * 1.3);
  }
});
