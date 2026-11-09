import { describe, it, expect } from "vitest";
import { createVisit, FADE_MS, FLIGHT_MS } from "./visit";
import { linkHistory, type HistoryHost } from "./history";
import { hashForStop, stopForHash } from "./route";

/** The visit and history modules over a fake clock and a fake history stack, driven by presses. */
type Op =
  | ["go", number] | ["next"] | ["back"] // the visitor's presses: a TV or HUD link, the meter, Esc / Room
  | ["Back"] | ["Fwd"]; // the browser's buttons
type Step = [dtMs: number, op: Op];

function rig(reduced: boolean, startHash = "") {
  const stack = ["./"];
  let i = 0;
  let clock = 0;
  let pop: () => void = () => {};
  // Opening a direct link: the page starts on that entry.
  if (startHash) stack[0] = startHash;
  const host: HistoryHost = {
    history: {
      pushState: (_s, _t, url) => { stack.splice(i + 1, stack.length, String(url)); i++; },
      replaceState: (_s, _t, url) => { stack[i] = String(url); },
    },
    location: { get hash() { return stack[i] === "./" ? "" : stack[i]; } } as Location,
    addEventListener: (_t, l) => { pop = l; },
    removeEventListener: () => {},
  };
  const visit = createVisit({ reduced, now: () => clock });
  linkHistory(visit, host);
  const stops: number[] = []; // each fade or flight start, in ms, to check the rate
  visit.subscribe((e) => { if (e.type === "move" && e.from.kind === "at" && e.from.stop !== e.to) stops.push(clock); });
  const urlStop = () => stopForHash(stack[i] === "./" ? "" : stack[i]);
  return {
    visit, stack, stops, urlStop, index: () => i,
    advance(ms: number) { clock += ms; visit.where(clock); },
    press(op: Op) {
      if (op[0] === "go") visit.go(op[1]);
      else if (op[0] === "next") visit.next();
      else if (op[0] === "back") visit.back();
      else if (op[0] === "Back") { if (i > 0) { i--; pop(); } }
      else if (i < stack.length - 1) { i++; pop(); }
    },
    settle() { clock += 3 * (reduced ? FADE_MS : FLIGHT_MS) * 4; visit.where(clock); },
  };
}

/** Runs a sequence; returns a description of what is wrong, or null. */
function check(steps: Step[], reduced: boolean, startHash = ""): string | null {
  const r = rig(reduced, startHash);
  for (const [dt, op] of steps) { r.advance(dt); r.press(op); }
  r.settle();
  const where = r.visit.where(1e9);
  const at = where.kind === "at" ? where.stop : -1;
  if (at !== r.visit.target()) return `visitor ${at} vs target ${r.visit.target()}`;
  if (r.urlStop() !== at) return `URL shows ${r.urlStop()} (${r.stack[r.index()]}), visitor at ${at}`;
  if (r.stack[0] !== "./" && !startHash) return `entry 0 is ${r.stack[0]}`;
  // Back from here reaches the overview without leaving the site, whatever happened.
  let guard = 0;
  while (r.index() > 0 && guard++ < 50) { r.press(["Back"]); r.settle(); }
  if (r.stack[r.index()] !== "./" && !startHash) return `Back ends on ${r.stack[r.index()]}`;
  if (startHash && r.index() === 0 && r.stack[0] !== "./") return "no overview entry under the direct link";
  return null;
}

/** The reviewer's notation: `x@+N` = advance N ms, then act. Back is the browser's button; back is visit.back(). */
function parse(text: string): Step[] {
  return text.split(",").map((s) => {
    const [a, d] = s.trim().split("@+");
    const op: Op = a === "Back" ? ["Back"] : a === "Fwd" ? ["Fwd"] : a === "back" ? ["back"] : a === "next" ? ["next"]
      : ["go", Number(a.slice(3, -1))];
    return [Number(d), op] as Step;
  });
}

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomSteps(rand: () => number): Step[] {
  const n = 3 + Math.floor(rand() * 12);
  const gaps = [0, 10, 20, 100, 120, 200, 350, 1300];
  return Array.from({ length: n }, (): Step => {
    const dt = gaps[Math.floor(rand() * gaps.length)];
    const k = rand();
    const op: Op = k < 0.3 ? ["go", 1 + Math.floor(rand() * 5)] : k < 0.45 ? ["next"] : k < 0.6 ? ["back"]
      : k < 0.7 ? ["go", 0] : k < 0.85 ? ["Back"] : ["Fwd"];
    return [dt, op];
  });
}

const FIXED: [string, string][] = [
  ["Work, Back mid-fade, Work", "go(1)@+0, Back@+100, go(1)@+20"],
  ["Work, Back mid-fade, Work twice", "go(1)@+0, Back@+100, go(1)@+20, go(1)@+10"],
  ["Work, Back, Mediasafe, Work", "go(1)@+0, Back@+100, go(2)@+20, go(1)@+10"],
  ["next, Back, Esc, Work", "next@+200, Back@+200, go(0)@+0, go(1)@+0"],
  ["reviewer 2", "next@+0, back@+20, Back@+350, next@+20, back@+100"],
  ["reviewer 3", "go(4)@+1300, back@+100, go(0)@+1300, Back@+20, back@+20, go(0)@+20"],
  ["reviewer 4", "go(3)@+1300, go(3)@+1300, Back@+0, Fwd@+200, back@+20, back@+20"],
  ["reviewer 5", "Fwd@+0, go(3)@+350, go(2)@+200, Back@+1300, go(2)@+200, go(2)@+0"],
  ["Work, Back mid-fade, Room", "go(1)@+0, Back@+100, go(0)@+20"],
];

describe("the URL shows where the visitor is", () => {
  for (const reduced of [true, false]) {
    for (const [name, text] of FIXED) {
      it(`${name} (${reduced ? "reduced motion" : "flights"})`, () => {
        expect(check(parse(text), reduced)).toBeNull();
      });
    }
  }

  it("Back from a direct link reaches the overview", () => {
    for (const reduced of [true, false]) {
      const r = rig(reduced, "#work");
      expect(r.stack).toEqual(["./", "#work"]);
      r.press(["Back"]);
      expect(r.urlStop()).toBe(0);
      expect(r.visit.target()).toBe(0);
    }
  });

  it("random sequences settle with the URL on the visitor's stop", () => {
    const N = 6000;
    const failures: string[] = [];
    for (let seed = 1; seed <= N; seed++) {
      const rand = rng(seed);
      const reduced = seed % 2 === 0;
      const hash = rand() < 0.2 ? hashForStop(1 + Math.floor(rand() * 5)) : "";
      const steps = randomSteps(rand);
      const bad = check(steps, reduced, hash);
      if (bad) failures.push(`seed ${seed} reduced=${reduced} hash=${hash || "-"}: ${bad}`);
    }
    if (process.env.COUNT_FAILS) console.log(`FAILED ${failures.length} of ${N}`);
    expect(failures.slice(0, 5)).toEqual([]);
  });

  it("reduced-motion fades start at least FADE_MS apart, whatever the presses", () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const rand = rng(seed * 7);
      const r = rig(true);
      for (const [dt, op] of randomSteps(rand)) { r.advance(dt); if (op[0] !== "Back" && op[0] !== "Fwd") r.press(op); }
      r.settle();
      for (let k = 1; k < r.stops.length; k++) expect(r.stops[k] - r.stops[k - 1]).toBeGreaterThanOrEqual(FADE_MS);
    }
  });
});
