import { expect, test, type Locator, type Page } from "@playwright/test";
import { identity, links, stations, ui } from "../src/content";
import { clearances, COMPACT_MIN_W, hudTier, LINK_ROW_H, LINK_ROW_W, NAME_BLOCK_W, ONE_ROW_MIN_W, TWO_LINE_MIN_W } from "../src/pin";
import { clickLink, goTo, hudLink, landedAt, openTour } from "./lib/page";

// The HUD (#222): a name block, one row of links, the current stop marked, all inside the boxes and clearances
// src/pin.ts gives. Light: it only reads the page's layout, so no station's render is waited for beyond the landing.

const hud = (page: Page) => page.getByRole("navigation", { name: ui.hud });
const nameBlock = (page: Page) => page.locator("[data-name-block]");
const linkRow = (page: Page) => page.locator("[data-link-row]");
const hint = (page: Page) => page.locator("[data-hint]");

type Box = { x: number; y: number; width: number; height: number };
const box = async (l: Locator) => (await l.boundingBox())! as Box;
const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function open(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await openTour(page);
  await expect(nameBlock(page)).toBeVisible();
}

// Landscape windows: the one-row HUD where the window is at least ONE_ROW_MIN_W wide, the row on its own line below,
// and under TWO_LINE_MIN_W the row wrapped as two whole groups (a third line, the third clearance tier).
for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768], [800, 600], [700, 500]]) {
  const oneRow = width >= ONE_ROW_MIN_W;
  test(`${width}x${height}: name block and link row, ${oneRow ? "on one line" : "the row under the name block"}, inside the boxes and clearances`, async ({ page }) => {
    await open(page, width, height);
    const clear = clearances({ width, height });
    for (const stop of [0, 2]) { // the overview, then a station
      if (stop) await goTo(page, stop);
      await expect(nameBlock(page)).toContainText(identity.name);
      await expect(nameBlock(page)).toContainText(identity.title);
      await expect(nameBlock(page)).toContainText(identity.availability);
      const name = await box(nameBlock(page)), row = await box(linkRow(page));
      expect(overlap(name, row), "the name block and the link row do not overlap").toBe(false);
      if (oneRow) {
        expect(row.y + row.height, "the row is on the name block's line").toBeLessThanOrEqual(name.y + name.height + 1);
        expect(row.x, "the row is right of the name block").toBeGreaterThanOrEqual(name.x + name.width);
        expect(name.width, "name block width").toBeLessThanOrEqual(NAME_BLOCK_W);
        expect(row.width, "link row width").toBeLessThanOrEqual(LINK_ROW_W);
        expect(row.height, "link row height").toBeLessThanOrEqual(LINK_ROW_H);
        // The box is a maximum the row can overflow, so read what is inside it: every link sits in the box, on one line.
        const inside = await linkRow(page).locator("a").evaluateAll((as, r) => as.map((a) => a.getBoundingClientRect()).every((b) => b.left >= r.x - 0.5 && b.right <= r.x + r.width + 0.5 && b.top >= r.y - 0.5 && b.bottom <= r.y + r.height + 0.5), row);
        expect(inside, "every link is inside the link row's box").toBe(true);
      } else {
        expect(row.y, "the row is under the name block").toBeGreaterThanOrEqual(name.y + name.height);
        // One line of links, or two whole groups: no row of the link row holds a single link. Under TWO_LINE_MIN_W it is two rows.
        const wrapped = width < TWO_LINE_MIN_W;
        const ys = await linkRow(page).locator("a").evaluateAll((as) => as.map((a) => Math.round(a.getBoundingClientRect().y)));
        const perLine = [...new Set(ys)].map((y) => ys.filter((v) => v === y).length);
        expect(Math.min(...perLine), `links per line ${perLine}`).toBeGreaterThan(1);
        expect(perLine.length, `lines of links ${perLine}`).toBe(wrapped ? 2 : 1);
        if (wrapped) expect(perLine, "the stations, then the outside links").toEqual([1 + stations.length, links.length]);
      }
      const bottom = Math.max(name.y + name.height, row.y + row.height);
      expect(bottom, "the HUD is no taller than the top clearance").toBeLessThanOrEqual(clear.top);
      expect((await box(hud(page))).height, "the nav is no taller than the top clearance").toBeLessThanOrEqual(clear.top);
    }
  });
}

// Short landscape windows (a phone held sideways, 560x400): the compact HUD (#222). Two lines from COMPACT_MIN_W wide: the name,
// the title and the outside links, then the stops. Narrower, three: the name and title, the outside links, the stops. No
// availability line. It is no taller than the top clearance for its tier, so the glass and the panel stay above the meter.
for (const [width, height, tier] of [[667, 375, "compactTwo"], [740, 360, "compactTwo"], [560, 400, "compactThree"]] as const) {
  test(`${width}x${height}: the compact HUD, ${tier === "compactTwo" ? "two lines" : "three short lines"}, no taller than the top clearance`, async ({ page }) => {
    expect(hudTier({ width, height })).toBe(tier);
    expect(width >= COMPACT_MIN_W).toBe(tier === "compactTwo");
    await open(page, width, height);
    const clear = clearances({ width, height });
    for (const stop of [0, 2]) {
      if (stop) await goTo(page, stop);
      await expect(nameBlock(page)).toContainText(identity.name);
      await expect(nameBlock(page)).toContainText(identity.title);
      await expect(hud(page)).not.toContainText(identity.availability);
      const name = await box(nameBlock(page)), row = await box(linkRow(page));
      // The lines of the HUD from top to bottom: each box is one line tall and none overlaps another.
      const lines = [name, ...(tier === "compactThree" ? [await box(page.locator("[data-outside]"))] : []), row];
      expect(lines.length, "lines").toBe(tier === "compactTwo" ? 2 : 3);
      for (let i = 1; i < lines.length; i++) expect(lines[i].y, `line ${i + 1} is under line ${i}`).toBeGreaterThanOrEqual(lines[i - 1].y + lines[i - 1].height);
      // The name and the title are one line each (they do not wrap to fit), and nothing in the line runs past its box.
      const [nameH, titleH] = await nameBlock(page).locator("> div").evaluateAll((ds) => ds.slice(0, 2).map((d) => d.getBoundingClientRect().height));
      expect(nameH, "the name is one line").toBeLessThanOrEqual(1.25 * 16 * 1.2 + 1);
      expect(titleH, "the title is one line").toBeLessThanOrEqual(14 * 1.3 + 1);
      expect(await nameBlock(page).evaluate((e) => e.scrollWidth <= e.clientWidth + 1), "the first line fits its box").toBe(true);
      // Every link sits on one of those lines, and every line that has links has more than one: no row with a single link.
      const ys = await hud(page).locator("a").evaluateAll((as) => as.map((a) => Math.round(a.getBoundingClientRect().y)));
      const perLine = [...new Set(ys)].map((y) => ys.filter((v) => v === y).length);
      expect(perLine, `links per line ${perLine}`).toEqual([links.length, 1 + stations.length]);
      expect(await nameBlock(page).locator("a").count(), "the outside links are beside the name and title when there is room").toBe(tier === "compactTwo" ? links.length : 0);
      // Nothing runs past the window's sides.
      const right = await hud(page).locator("a").evaluateAll((as) => Math.max(...as.map((a) => a.getBoundingClientRect().right)));
      expect(right, "the links end inside the window").toBeLessThanOrEqual(width - 8);
      const bottom = Math.max(...lines.map((l) => l.y + l.height));
      expect(bottom, "the HUD is no taller than the top clearance").toBeLessThanOrEqual(clear.top);
      expect((await box(hud(page))).height, "the nav is no taller than the top clearance").toBeLessThanOrEqual(clear.top);
    }
  });
}

// COMPACT_MIN_W is the narrowest two-line width, so the first line has no slack there: every link must still sit inside the
// name block's backdrop and the window (the first build overflowed from 655 to 666 px, a 4 px space before each mark).
test(`${COMPACT_MIN_W}x375: every link sits inside the HUD's backdrop and inside the window`, async ({ page }) => {
  const width = COMPACT_MIN_W;
  expect(hudTier({ width, height: 375 })).toBe("compactTwo");
  await open(page, width, 375);
  const name = await box(nameBlock(page));
  const rights = await hud(page).locator("a").evaluateAll((as) => as.map((a) => ({ text: a.textContent, left: a.getBoundingClientRect().left, right: a.getBoundingClientRect().right })));
  expect(rights.length, "every link is there").toBe(links.length + 1 + stations.length);
  for (const a of rights) {
    expect(a.left, `${a.text} starts inside the window`).toBeGreaterThanOrEqual(0);
    expect(a.right, `${a.text} ends inside the window, with its margin`).toBeLessThanOrEqual(width - 8);
  }
  for (const l of links) {
    const a = await box(nameBlock(page).getByRole("link", { name: l.label }));
    expect(a.x + a.width, `${l.label} ends inside the name block's backdrop`).toBeLessThanOrEqual(name.x + name.width + 0.5);
  }
  expect(await nameBlock(page).evaluate((e) => e.scrollWidth <= e.clientWidth), "the first line fits its box with no overflow").toBe(true);
});

test("1024x768: the row holds Room, the stations and the outside links as whole groups", async ({ page }) => {
  await open(page, 1024, 768);
  expect(await linkRow(page).locator("a").count()).toBe(1 + stations.length + links.length);
});

test("390x844: the name block has the name, the title and the three outside links, and no availability line", async ({ page }) => {
  await open(page, 390, 844);
  const block = nameBlock(page);
  await expect(block).toContainText(identity.name);
  await expect(block).toContainText(identity.title);
  await expect(block).not.toContainText(identity.availability);
  await expect(page.getByText(identity.availability)).toHaveCount(0);
  await expect(block.getByRole("link")).toHaveCount(links.length);
  for (const l of links) await expect(block.getByRole("link", { name: l.label })).toBeVisible();
  const b = await box(block);
  expect(b.y + b.height, "the name block is no taller than the top clearance").toBeLessThanOrEqual(clearances({ width: 390, height: 844 }).top);
  expect(b.width, "the name block spans the top").toBeGreaterThanOrEqual(390 - 1);
  expect(await page.locator("[data-menu]").count()).toBe(1);
});

// The hint line stands 8 px above the bottom clearance, so it clears the meter device, and it clears the meter bar
// (the digits, the line and the keys) too, which is the room the clearance leaves.
for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768], [800, 600], [700, 500], [667, 375], [740, 360], [560, 400], [390, 844]]) {
  test(`${width}x${height}: the hint line's bottom edge is above the bottom clearance and the meter bar`, async ({ page }) => {
    await open(page, width, height);
    await expect(hint(page)).toBeVisible();
    const h = await box(hint(page)), bar = await box(page.locator("[data-meter-bar]"));
    expect(h.y + h.height).toBeLessThanOrEqual(height - clearances({ width, height }).bottom);
    expect(h.y + h.height, "the hint is above the meter bar's keys").toBeLessThanOrEqual(bar.y);
  });
}

// Every piece of HUD text is at least 14 px: the name block, the links, the phone menu and the hint.
for (const [width, height] of [[1280, 800], [1024, 768], [667, 375], [560, 400], [390, 844]]) {
  test(`${width}x${height}: every piece of HUD text is at least 14 px`, async ({ page }) => {
    await open(page, width, height);
    const sizes = await page.evaluate(() => {
      const roots = [...document.querySelectorAll('nav[aria-label="HUD"], [data-menu], [data-hint]')];
      const out: { text: string; px: number }[] = [];
      for (const root of roots)
        for (const el of [root, ...root.querySelectorAll("*")]) {
          const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
          if (own) out.push({ text: el.textContent!.trim().slice(0, 30), px: parseFloat(getComputedStyle(el).fontSize) });
        }
      return out;
    });
    expect(sizes.length).toBeGreaterThan(8);
    for (const s of sizes) expect(s.px, `"${s.text}"`).toBeGreaterThanOrEqual(14);
  });
}

test("the outside links open a new tab, noopener noreferrer, and carry the ↗ mark", async ({ page }) => {
  for (const [width, height] of [[1280, 800], [390, 844]]) {
    await open(page, width, height);
    for (const l of links) {
      const a = page.locator(`[data-name-block] a[href="${l.href}"], [data-link-row] a[href="${l.href}"]`);
      await expect(a).toHaveCount(1);
      await expect(a).toHaveAttribute("target", "_blank");
      await expect(a).toHaveAttribute("rel", "noopener noreferrer");
      await expect(a).toContainText("↗");
      await expect(a).toHaveAccessibleName(l.label); // the mark is decoration
    }
  }
});

// The current stop is marked in weight and background as well as by aria-current; in a flight none is.
for (const [width, height] of [[1280, 800], [390, 844]]) {
  test(`${width}x${height}: the current stop differs in weight and background; in a flight no link is marked`, async ({ page }) => {
    await open(page, width, height);
    const look = (stop: number) => hudLink(page, stop).evaluate((el) => {
      const s = getComputedStyle(el);
      return { weight: s.fontWeight, background: s.backgroundColor, current: el.getAttribute("aria-current") };
    });
    await landedAt(page, 0);
    const here = await look(0);
    for (let i = 1; i <= stations.length; i++) {
      const other = await look(i);
      expect(other.current).toBeNull();
      expect(other.weight, `link ${i} weight`).not.toBe(here.weight);
      expect(other.background, `link ${i} background`).not.toBe(here.background);
    }
    // The flight: read right after the click, before the landing (0.9 s or more away), with no wait.
    await clickLink(page, 3);
    await expect(hud(page).locator("[aria-current]")).toHaveCount(0);
    for (let i = 0; i <= stations.length; i++) {
      const l = await look(i);
      expect(l.weight, `flight: link ${i} weight`).not.toBe(here.weight);
      expect(l.background, `flight: link ${i} background`).not.toBe(here.background);
    }
    await landedAt(page, 3);
    const at = await look(3);
    expect(at.weight).toBe(here.weight);
    expect(at.background).toBe(here.background);
    expect(await look(0)).toMatchObject({ current: null });
    expect((await look(0)).background).not.toBe(here.background);
  });
}
