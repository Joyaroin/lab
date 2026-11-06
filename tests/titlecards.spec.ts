import { test, expect, type Page } from "@playwright/test";
import { transformWithOxc } from "vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PerspectiveCamera, Vector3 } from "three";
import { stations } from "../src/content";
import { CAMERA_FOV, crts } from "../src/crts";
import { glassOnScreen } from "../src/glass";
import { travelProgress } from "../src/hold";
import { tourAt } from "../src/tour";
import { readCamera, readShot, scrollToProgress } from "./lib/page";

// A TV you aren't at carries a title card: its station's world line over its name, drawn on the
// glass. This scrolls to each TV on the way into it (its text not yet showing), finds the glass on
// screen from the tour's own camera, and works out WHICH card is there: it draws every station's
// card with the app's own drawing code (src/card.ts, run in a blank page) and checks that the glass
// matches its own station's card better than any other station's, and better than plain glass.
// Counting green pixels would pass on another station's card, or on a lit patch of glass.
// The other half, that the card is gone behind the text at the stop, is checked in boot.spec.ts
// ("the text sits on the glass with no card and no phosphor behind it").

const size = { width: 1280, height: 800 };
// Far enough into the travel that the TV is nearly square on, but before its text starts to fade in.
const INTO_TRAVEL = 0.8;
// The comparison grid, in cells across and down the glass.
const GRID = { w: 64, h: 50 };

/** The tour's camera at progress `p`, on the path the page flies with normal motion. */
const viewAt = (p: number) => tourAt(p, 0, size.width / size.height, size.height);

/** Scrolls to `p` and waits until the camera has arrived there: it eases toward the scroll position,
 *  so the glass is only where the test works it out to be once the canvas reports that position. */
async function scrollAndArrive(page: Page, p: number) {
  await scrollToProgress(page, p);
  const want = viewAt(p).camera;
  await expect.poll(async () => Math.hypot(...(await readCamera(page)).map((g, k) => g - want[k])), { message: "camera arrived at the scroll position" }).toBeLessThan(0.02);
}

/** The glass's four corners on screen (texture corners top-left, top-right, bottom-left, bottom-right). */
function glassCornersAt(i: number, p: number) {
  const s = viewAt(p);
  const cam = new PerspectiveCamera(CAMERA_FOV, size.width / size.height, 0.1, 1000);
  cam.position.set(...s.camera); cam.lookAt(new Vector3(...s.look)); cam.updateMatrixWorld();
  const [bl, tl, br, tr] = glassOnScreen(crts[i], cam, size); // glassCorners' order: x then y
  return [tl, tr, bl, br];
}

/** The map from the glass's own (u, v) in 0..1 to window pixels, as nine numbers (a homography). */
function homography(c: { x: number; y: number }[]) {
  const uv = [[0, 0], [1, 0], [0, 1], [1, 1]];
  const m: number[][] = [];
  uv.forEach(([u, v], k) => {
    const { x, y } = c[k];
    m.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x], [0, 0, 0, u, v, 1, -u * y, -v * y, y]);
  });
  for (let col = 0; col < 8; col++) { // Gaussian elimination with pivoting
    let piv = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    [m[col], m[piv]] = [m[piv], m[col]];
    for (let r = 0; r < 8; r++) if (r !== col) {
      const f = m[r][col] / m[col][col];
      for (let k = col; k < 9; k++) m[r][k] -= f * m[col][k];
    }
  }
  return [...m.map((row, r) => row[8] / row[r]), 1];
}

/** Brightness of what the window shows over the glass, on a GRID of cells, averaging 3x3 samples in each. */
const sampleGlass = (page: Page, shot: Buffer, h: number[]) => readShot(page, shot, (img, a) => {
  const out: number[] = [];
  for (let gy = 0; gy < a.grid.h; gy++) for (let gx = 0; gx < a.grid.w; gx++) {
    let sum = 0;
    for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
      const u = (gx + (sx + 0.5) / 3) / a.grid.w, v = (gy + (sy + 0.5) / 3) / a.grid.h;
      const d = a.h[6] * u + a.h[7] * v + 1;
      const x = Math.min(img.width - 1, Math.max(0, Math.round((a.h[0] * u + a.h[1] * v + a.h[2]) / d)));
      const y = Math.min(img.height - 1, Math.max(0, Math.round((a.h[3] * u + a.h[4] * v + a.h[5]) / d)));
      const k = (y * img.width + x) * 4;
      sum += 0.2126 * img.data[k] + 0.7152 * img.data[k + 1] + 0.0722 * img.data[k + 2];
    }
    out.push(sum / 9);
  }
  return out;
}, { h, grid: GRID });

/** Draws plain glass and each station's card with the app's own code (src/card.ts) in a blank page,
 *  and returns each as brightness on the same GRID. */
async function expectedCards(page: Page): Promise<Expected> {
  const file = fileURLToPath(new URL("../src/card.ts", import.meta.url));
  const source = (await transformWithOxc(readFileSync(file, "utf8"), file, { lang: "ts" })).code.replace(/^export /gm, "") + "\nwindow.drawPhosphor = drawPhosphor; window.CARD_PX = CARD_PX;";
  const blank = await page.context().newPage();
  try {
    await blank.addScriptTag({ content: source });
    return await blank.evaluate(({ cards, grid }) => {
      const w = window as unknown as { drawPhosphor: (c: HTMLCanvasElement, card?: { worldLine: string; name: string }) => void; CARD_PX: { width: number; height: number } };
      const thumb = (card?: { worldLine: string; name: string }) => {
        const big = document.createElement("canvas");
        big.width = w.CARD_PX.width; big.height = w.CARD_PX.height;
        w.drawPhosphor(big, card);
        const small = document.createElement("canvas");
        small.width = grid.w; small.height = grid.h;
        const g = small.getContext("2d")!;
        g.imageSmoothingQuality = "high";
        g.drawImage(big, 0, 0, grid.w, grid.h);
        const d = g.getImageData(0, 0, grid.w, grid.h).data, out: number[] = [];
        for (let k = 0; k < d.length; k += 4) out.push(0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2]);
        return out;
      };
      return { clear: thumb(), cards: cards.map(thumb) };
    }, { cards: stations.map((s) => ({ worldLine: s.worldLine, name: s.name })), grid: GRID });
  } finally {
    await blank.close();
  }
}

/** Only the middle of the glass is compared, where the text is: the bright rim the baked glass shows
 *  around the card, and the fall-off at the corners, are not part of the card. */
const inMiddle = (_: number, k: number) => {
  const u = ((k % GRID.w) + 0.5) / GRID.w, v = (Math.floor(k / GRID.w) + 0.5) / GRID.h;
  return u > 0.1 && u < 0.9 && v > 0.2 && v < 0.75;
};

/** How alike two brightness maps are over the middle of the glass, ignoring overall brightness and
 *  contrast: -1 to 1. */
function alike(a: number[], b: number[]) {
  a = a.filter(inMiddle); b = b.filter(inMiddle);
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length, ma = mean(a), mb = mean(b);
  let ab = 0, aa = 0, bb = 0;
  for (let k = 0; k < a.length; k++) { ab += (a[k] - ma) * (b[k] - mb); aa += (a[k] - ma) ** 2; bb += (b[k] - mb) ** 2; }
  return ab / Math.sqrt(aa * bb || 1);
}

type Expected = { clear: number[]; cards: number[][] };

/** How well what the window shows over the glass (`seen`) matches each station's card. All the cards
 *  share their layout, "World line 0N" and the glow, so first take away plain glass and what every
 *  card has in common; what is left of each is what makes that station's card its own. The same is
 *  done to what was seen, after fitting out the shared part. */
function scoreOf(want: Expected, seen: number[]) {
  const over = want.cards.map((c) => c.map((x, k) => x - want.clear[k]));
  const common = over[0].map((_, k) => over.reduce((s, c) => s + c[k], 0) / over.length);
  const unique = over.map((c) => c.map((x, k) => x - common[k]));
  const obs = seen.map((x, k) => x - want.clear[k]);
  const mid = (v: number[]) => v.filter(inMiddle);
  const [o, cm] = [mid(obs), mid(common)];
  const gain = o.reduce((s, x, k) => s + x * cm[k], 0) / (cm.reduce((s, x) => s + x * x, 0) || 1);
  const left = obs.map((x, k) => x - gain * common[k]);
  return unique.map((u) => alike(left, u));
}

test("every TV shows its own title card from the wide view", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(size);
  await page.route("https://api.github.com/**", (r) => r.fulfill({ status: 403, json: {} }));
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "HUD" })).toBeVisible();
  const want = await expectedCards(page);
  const rows: string[] = [];
  for (const [i, s] of stations.entries()) {
    const p = travelProgress(i + 1, INTO_TRAVEL);
    const corners = glassCornersAt(i, p);
    for (const c of corners) {
      expect(c.x, `${s.id}: glass inside the window`).toBeGreaterThan(0); expect(c.x).toBeLessThan(size.width);
      expect(c.y, `${s.id}: glass inside the window`).toBeGreaterThan(0); expect(c.y).toBeLessThan(size.height);
    }
    await scrollAndArrive(page, p);
    await expect(page.locator(`[data-screen="${s.id}"]`)).toBeHidden(); // its text isn't showing
    const full = await page.screenshot({ path: `test-results/titlecard-full-desktop-${s.id}.png` }); // for the PR's contact sheet
    const seen = await sampleGlass(page, full, homography(corners));
    const own = scoreOf(want, seen)[i], others = scoreOf(want, seen).filter((_, j) => j !== i);
    rows.push(`${s.id}: own ${own.toFixed(2)}, best other ${Math.max(...others).toFixed(2)}`);
    expect(own, `${s.id}: its own card, not another's. ${rows[rows.length - 1]}`).toBeGreaterThan(Math.max(...others) + 0.15);
  }
  test.info().annotations.push({ type: "card match", description: rows.join("; ") });
});

test("the matching tells cards apart: each card is found as itself, and plain glass matches none", async ({ page }) => {
  // Guards the method, so the test above can't pass by matching everything to everything. A card
  // drawn dimmer, as lit glass would show it, must still be taken for its own station.
  await page.goto("about:blank");
  const want = await expectedCards(page);
  for (const [i, c] of want.cards.entries()) {
    const dim = c.map((x, k) => want.clear[k] + (x - want.clear[k]) * 0.6);
    const scores = scoreOf(want, dim);
    expect(scores.indexOf(Math.max(...scores)), `${stations[i].id} is taken for itself`).toBe(i);
    expect(scores[i], stations[i].id).toBeGreaterThan(0.9);
  }
  const plain = scoreOf(want, want.clear);
  expect(Math.max(...plain), "plain glass matches no card").toBeLessThan(0.3);
});
