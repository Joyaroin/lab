import { describe, it, expect } from "vitest";
import { barFor, createHover, meterDigits, previewStop, PREVIEW_REST_MS, type Preview } from "./bar";
import { stations } from "./content";
import { formatReading } from "./gap";
import { STATION_COUNT } from "./hold";
import { SHIFT_SECONDS } from "./nixie";
import { readingAt } from "./tour";
import type { Where } from "./where";

const at = (stop: number): Where => ({ kind: "at", stop });
const flying = (from: number, to: number, f = 0.5): Where => ({ kind: "flying", from, to, f });

describe("the bar's keys and stop", () => {
  it("at the overview shows START alone, on either framing", () => {
    for (const framing of ["square", "portrait"] as const) expect(barFor(at(0), framing)).toEqual({ keys: ["start"], stop: 0 });
  });

  it("at a station on a landscape window shows PREV, ROOM, NEXT, for that station", () => {
    for (let i = 1; i <= STATION_COUNT; i++) expect(barFor(at(i), "square")).toEqual({ keys: ["prev", "room", "next"], stop: i });
  });

  it("at a station on a portrait window shows PREV and NEXT, for that station", () => {
    for (let i = 1; i <= STATION_COUNT; i++) expect(barFor(at(i), "portrait")).toEqual({ keys: ["prev", "next"], stop: i });
  });

  it("in a flight is everything of the stop being flown to, at any share of it", () => {
    for (const f of [0, 0.3, 0.5, 0.99]) {
      expect(barFor(flying(0, 2, f), "square")).toEqual({ keys: ["prev", "room", "next"], stop: 2 });
      expect(barFor(flying(3, 2, f), "portrait")).toEqual({ keys: ["prev", "next"], stop: 2 });
      expect(barFor(flying(2, 0, f), "square")).toEqual({ keys: ["start"], stop: 0 });
      expect(barFor(flying(STATION_COUNT, 0, f), "portrait")).toEqual({ keys: ["start"], stop: 0 });
    }
  });
});

// ---- the hover preview (#228)
const DEPLOYS = 12;
const gapReading = readingAt(at(0), DEPLOYS);
const clock = () => { const c = { t: 1000, now: () => c.t }; return c; };
const digitsOf = (who: "bar" | "desk", where: Where, preview: Preview | null, now: number, extra: Partial<Parameters<typeof meterDigits>[0]> = {}) =>
  meterDigits({ who, where, preview, deploys: DEPLOYS, now, playing: null, reduced: false, ...extra });

describe("the hover preview's rest", () => {
  it("starts when the pointer comes onto a station's TV or link, and ends when it leaves", () => {
    const c = clock(), h = createHover(c.now);
    expect(h.preview()).toBeNull();
    h.point("link", 2);
    expect(h.preview()).toEqual({ stop: 2, since: 1000 });
    h.point("link", null);
    expect(h.preview()).toBeNull();
  });

  it("starts again when the pointer moves to another station, and keeps its start while it stays on one", () => {
    const c = clock(), h = createHover(c.now);
    h.point("tv", 2);
    c.t = 1100;
    h.point("tv", 2);
    expect(h.preview()).toEqual({ stop: 2, since: 1000 });
    h.point("link", 3);
    expect(h.preview()).toEqual({ stop: 3, since: 1100 });
  });

  it("a source leaving does not clear what the other source took over", () => {
    const c = clock(), h = createHover(c.now);
    h.point("tv", 2);
    h.point("link", 3); // the pointer went from the TV onto a link; the TV's leave may come after
    h.point("tv", null);
    expect(h.preview()).toEqual({ stop: 3, since: 1000 });
    h.point("link", null);
    expect(h.preview()).toBeNull();
  });

  it("rest() starts the rest again, for a pointer that stayed put through a visit", () => {
    const c = clock(), h = createHover(c.now);
    h.point("link", 2);
    c.t = 5000;
    h.rest();
    expect(h.preview()).toEqual({ stop: 2, since: 5000 });
  });

  it("tells its subscribers of each change, and of nothing else", () => {
    const c = clock(), h = createHover(c.now);
    let n = 0;
    const off = h.subscribe(() => n++);
    h.point("tv", 2); h.point("tv", 2); h.point("tv", null); h.point("tv", null);
    expect(n).toBe(2);
    off(); h.point("tv", 1);
    expect(n).toBe(2);
  });
});

describe("what a preview shows", () => {
  const p = (stop: number, since = 1000): Preview => ({ stop, since });

  it("previews only at the overview: never at a station or in a flight", () => {
    for (let s = 1; s <= STATION_COUNT; s++) expect(previewStop(at(s), p(2))).toBeNull();
    for (const f of [0, 0.5, 1]) { expect(previewStop(flying(0, 2, f), p(2))).toBeNull(); expect(previewStop(flying(2, 0, f), p(2))).toBeNull(); }
    expect(previewStop(at(0), p(2))).toBe(2);
    expect(previewStop(at(0), null)).toBeNull();
  });

  it("the line's station is the preview's at once; the digits stay the gap's until the pointer has rested 150 ms", () => {
    expect(PREVIEW_REST_MS).toBe(150);
    for (const who of ["bar", "desk"] as const) {
      for (const now of [1000, 1001, 1149]) expect(digitsOf(who, at(0), p(2), now)).toEqual({ reading: Math.round(gapReading), digits: formatReading(Math.round(gapReading)), scramble: null });
    }
  });

  it("from 150 ms the digits are the station's, and a short scramble plays onto them", () => {
    for (const who of ["bar", "desk"] as const) {
      const d = digitsOf(who, at(0), p(2), 1150);
      expect(d.reading).toBe(stations[1].reading);
      expect(d.digits).toBe(formatReading(stations[1].reading));
      expect(d.scramble).toMatchObject({ kind: "short" });
      expect(SHIFT_SECONDS[d.scramble!.kind]).toBe(0.25);
      expect(digitsOf(who, at(0), p(2), 5000).scramble).toEqual(d.scramble); // the same play at any later time, so no replay
    }
  });

  it("moving to another station before 150 ms starts the rest again, and its scramble is a new one", () => {
    const first = digitsOf("bar", at(0), p(2, 1000), 1150);
    expect(digitsOf("bar", at(0), p(3, 1100), 1150).scramble).toBeNull(); // 50 ms into the new rest
    expect(digitsOf("bar", at(0), p(3, 1100), 1249).digits).toBe(formatReading(Math.round(gapReading)));
    const second = digitsOf("bar", at(0), p(3, 1100), 1250);
    expect(second.reading).toBe(stations[2].reading);
    expect(second.scramble!.id).not.toBe(first.scramble!.id);
  });

  it("leaving puts the gap back at once, with no scramble", () => {
    const d = digitsOf("bar", at(0), null, 1160);
    expect(d).toEqual({ reading: Math.round(gapReading), digits: formatReading(Math.round(gapReading)), scramble: null });
  });

  it("nothing previews at a station or in a flight: the digits are the stop's, as without a preview", () => {
    expect(digitsOf("bar", at(3), p(2), 5000).reading).toBe(stations[2].reading);
    expect(digitsOf("bar", at(3), p(2), 5000).scramble).toBeNull();
    expect(digitsOf("bar", flying(0, 4, 0.5), p(2), 5000).reading).toBe(stations[3].reading);
  });

  it("under reduced motion the digits change at 150 ms with no scramble", () => {
    for (const who of ["bar", "desk"] as const) {
      expect(digitsOf(who, at(0), p(2), 1149, { reduced: true }).reading).toBe(Math.round(gapReading));
      const d = digitsOf(who, at(0), p(2), 1150, { reduced: true });
      expect(d.reading).toBe(stations[1].reading);
      expect(d.scramble).toBeNull();
    }
  });

  it("the desk meter and the meter bar get the same digits and scramble through a preview, at every moment of it", () => {
    for (const now of [1000, 1100, 1150, 1300, 9000]) {
      expect(digitsOf("desk", at(0), p(4), now)).toEqual(digitsOf("bar", at(0), p(4), now));
    }
  });
});

describe("what the meters show outside a preview", () => {
  it("both pass the shift that is playing, and none under reduced motion", () => {
    const playing = { kind: "full" as const, id: 7 };
    for (const who of ["bar", "desk"] as const) {
      expect(digitsOf(who, at(2), null, 0, { playing }).scramble).toEqual(playing);
      expect(digitsOf(who, at(2), null, 0, { playing, reduced: true }).scramble).toBeNull();
    }
  });

  it("in a flight the bar shows the stop flown to and the desk meter counts as now", () => {
    const w = flying(0, 2, 0.5);
    expect(digitsOf("bar", w, null, 0).reading).toBe(stations[1].reading);
    expect(digitsOf("desk", w, null, 0).reading).toBe(Math.round(readingAt(w, DEPLOYS)));
    expect(digitsOf("desk", w, null, 0).digits).toBe(formatReading(Math.round(readingAt(w, DEPLOYS))));
  });

  it("at a stop both show that stop's reading", () => {
    for (let s = 0; s <= STATION_COUNT; s++) for (const who of ["bar", "desk"] as const) expect(digitsOf(who, at(s), null, 0).reading).toBe(Math.round(readingAt(at(s), DEPLOYS)));
  });
});
