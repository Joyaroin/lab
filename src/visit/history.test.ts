import { describe, it, expect } from "vitest";
import { createVisit } from "./visit";
import { linkHistory, type HistoryHost } from "./history";

function setup(hash = "") {
  const calls: string[] = [];
  let pop: () => void = () => {};
  const host: HistoryHost = {
    history: {
      pushState: (_s, _t, url) => void calls.push(`push ${url}`),
      replaceState: (_s, _t, url) => void calls.push(`replace ${url}`),
    },
    location: { hash },
    addEventListener: (_t, l) => { pop = l; },
    removeEventListener: () => { pop = () => {}; },
  };
  const visit = createVisit({ reduced: false, now: () => 0 });
  const off = linkHistory(visit, host);
  return { visit, calls, off, host, popstate: (h: string) => { host.location.hash = h; pop(); } };
}

describe("linkHistory", () => {
  it("a move pushes one entry with the station's hash; back pushes the overview", () => {
    const { visit, calls } = setup();
    visit.go(1);
    visit.back();
    expect(calls).toEqual(["push #work", "push ./"]);
  });
  it("next and a re-target each push", () => {
    const { visit, calls } = setup();
    visit.next();
    visit.go(3);
    expect(calls).toEqual(["push #work", "push #home-lab"]);
  });
  it("a popstate moves the visit and pushes nothing", () => {
    const { visit, calls, popstate } = setup();
    popstate("#mediasafe");
    expect(visit.target()).toBe(2);
    popstate("");
    expect(visit.target()).toBe(0);
    expect(calls).toEqual([]);
  });
  it("a direct link lands there, with an overview entry under it, and no flight", () => {
    const { visit, calls } = setup("#work");
    expect(calls).toEqual(["replace ./", "push #work"]);
    expect(visit.where(0)).toEqual({ kind: "at", stop: 1 });
  });
  it("an unknown hash opens the overview and touches no history", () => {
    const { visit, calls } = setup("#nope");
    expect(calls).toEqual([]);
    expect(visit.where(0)).toEqual({ kind: "at", stop: 0 });
  });
  it("unlinking stops pushing", () => {
    const { visit, calls, off } = setup();
    off();
    visit.go(1);
    expect(calls).toEqual([]);
  });
});
