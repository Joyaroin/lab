import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cli, formatComment, MARKER, parseName, post } from "./post-screenshots.mjs";

const TOKEN = ["tok", "en", "-", "value", "-1234"].join(""); // built at runtime: not a literal

afterEach(() => vi.unstubAllGlobals());

/** A fake Forgejo: records every call, answers from `state`. */
function forgejo(state) {
  const calls = [];
  vi.stubGlobal("fetch", async (url, init = {}) => {
    const path = new URL(url).pathname.replace("/api/v1/repos/o/r", "");
    calls.push({ method: init.method ?? "GET", path, query: new URL(url).search, auth: init.headers?.Authorization, body: init.body });
    const ok = (data) => ({ ok: true, status: 200, json: async () => data });
    if (path === "/pulls") return ok(state.prs);
    if (path === "/issues/7/comments" && init.method === "POST") return ok({ id: 99 });
    if (path === "/issues/7/comments") return ok(state.comments);
    if (/assets$/.test(path) && !init.method) return ok(state.assets ?? []);
    if (/assets$/.test(path) && init.method === "POST") return ok({ browser_download_url: `https://f/${new URL(url).searchParams.get("name")}` });
    return ok({});
  });
  return calls;
}
const env = { SERVER_URL: "https://forge.test", REPOSITORY: "o/r", BRANCH: "b", SHA: "abcdef123456", TOKEN };
const shots = () => {
  const dir = mkdtempSync(join(tmpdir(), "shots-"));
  const files = ["home-lab-desktop.png", "home-lab-phone.png"].map((n) => join(dir, n));
  for (const f of files) writeFileSync(f, "png");
  return { dir, files };
};

describe("screenshot comment", () => {
  it("reads station and size from a file name", () => {
    expect(parseName("/x/wc2026-predictor-phone.png")).toEqual({ station: "wc2026-predictor", size: "phone" });
    expect(parseName("notes.txt")).toBeUndefined();
  });
  it("puts each station's two sizes in one row", () => {
    const text = formatComment("abcdef123", { "a-desktop.png": "https://f/1", "a-phone.png": "https://f/2" });
    expect(text).toContain("| a | ![a desktop](https://f/1) | ![a phone](https://f/2) |");
    expect(text.endsWith(MARKER)).toBe(true);
  });
  it("marks a missing size", () => {
    expect(formatComment("abcdef123", { "a-phone.png": "https://f/2" })).toContain("| a | missing |");
  });
});

describe("post", () => {
  it("adds a comment on the first push and attaches every image to it", async () => {
    const calls = forgejo({ comments: [] });
    await post(env, 7, shots().files);
    expect(calls.filter((c) => c.method === "POST" && c.path === "/issues/7/comments")).toHaveLength(1);
    expect(calls.filter((c) => c.path === "/issues/comments/99/assets" && c.query.startsWith("?name="))).toHaveLength(2);
    expect(calls.find((c) => c.method === "PATCH").body).toContain("https://f/home-lab-desktop.png");
  });
  it("replaces its own earlier comment and deletes the old images, instead of adding another", async () => {
    const calls = forgejo({ comments: [{ id: 41, body: MARKER, user: { login: "forgejo-actions" } }], assets: [{ id: 5 }] });
    await post(env, 7, shots().files);
    expect(calls.some((c) => c.method === "POST" && c.path === "/issues/7/comments")).toBe(false);
    expect(calls.some((c) => c.method === "PATCH" && c.path === "/issues/comments/41")).toBe(true);
    expect(calls.some((c) => c.method === "DELETE" && c.path === "/issues/comments/41/assets/5")).toBe(true);
  });
  it("leaves another user's comment that quotes the marker alone", async () => {
    const calls = forgejo({ comments: [{ id: 41, body: MARKER, user: { login: "someone" } }] });
    await post(env, 7, shots().files);
    expect(calls.some((c) => c.path === "/issues/comments/41")).toBe(false);
  });
  it("refuses to post nothing", async () => {
    forgejo({ comments: [] });
    await expect(post(env, 7, [])).rejects.toThrow(/no screenshots/);
  });
});

describe("cli", () => {
  it("passes with no PR: writes an empty pr and sets no failure", async () => {
    forgejo({ prs: [] });
    const out = join(mkdtempSync(join(tmpdir(), "out-")), "output");
    writeFileSync(out, "");
    process.exitCode = undefined;
    await cli({ ...env, GITHUB_OUTPUT: out }, "find");
    expect(process.exitCode).toBeUndefined();
    expect(require_read(out)).toBe("pr=\n");
  });
  it("finds this branch's PR", async () => {
    forgejo({ prs: [{ number: 7, head: { ref: "b", repo: { full_name: "o/r" } } }] });
    const out = join(mkdtempSync(join(tmpdir(), "out-")), "output");
    writeFileSync(out, "");
    await cli({ ...env, GITHUB_OUTPUT: out }, "find");
    expect(require_read(out)).toBe("pr=7\n");
  });
  it("fails the job when posting fails, and never prints the token", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal("fetch", async () => { throw new Error(`boom ${TOKEN}`); });
    process.exitCode = undefined;
    await cli({ ...env, PR: "7", SHOTS_DIR: shots().dir }, "post");
    expect(process.exitCode).toBe(1);
    expect(log.mock.calls.flat().join("\n")).not.toContain(TOKEN);
    process.exitCode = undefined;
    log.mockRestore();
  });
});

import { readFileSync } from "node:fs";
const require_read = (f) => readFileSync(f, "utf8");
