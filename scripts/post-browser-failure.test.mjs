import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AUTHOR, failedTests, formatComment, main, MARKER } from "./post-browser-failure.mjs";

const test = (status, message) => ({ status, results: [{ error: message && { message } }] });
const report = {
  suites: [
    {
      title: "room.spec.ts", file: "room.spec.ts",
      specs: [
        { title: "meter shows", tests: [test("expected")] },
        { title: "HUD appears", tests: [test("unexpected", "\u001b[31mExpected: 1\u001b[39m\nReceived: 2")] },
      ],
      suites: [{ title: "tour", specs: [{ title: "stops", tests: [test("unexpected", "boom")] }] }],
    },
  ],
};

describe("failedTests", () => {
  it("lists only failed tests, with plain-text errors", () => {
    expect(failedTests(report)).toEqual([
      { name: "HUD appears", error: "Expected: 1\nReceived: 2" },
      { name: "tour > stops", error: "boom" },
    ]);
  });
  it("finds nothing in a passing report", () => {
    expect(failedTests({ suites: [{ title: "a", file: "a", specs: [{ title: "x", tests: [test("expected")] }] }] })).toEqual([]);
  });
});

describe("formatComment", () => {
  it("starts with a line merge-pr does not read as a verdict", () => {
    const first = formatComment(failedTests(report), "abcdef1234").split("\n")[0];
    expect(first).toBe("CI browser job output for abcdef1");
    expect(first).not.toMatch(/^\s*(verdict|pass|fail)/i);
  });
  it("cuts long errors and long lists", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ name: `t${i}`, error: "x".repeat(5000) }));
    const body = formatComment(many, "abcdef1");
    expect(body.length).toBeLessThan(20000);
    expect(body).toMatch(/and 20 more/);
  });
});

describe("main against a fake Forgejo", () => {
  let server;
  afterEach(() => server?.close());
  // `comments` is what the PR already has. POST adds to it and PATCH changes one, as Forgejo does.
  async function run(prs, file = report, comments = []) {
    const calls = [];
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        res.setHeader("content-type", "application/json");
        if (req.method === "POST" || req.method === "PATCH") {
          calls.push({ method: req.method, url: req.url, body: JSON.parse(body) });
          return res.end("{}");
        }
        res.end(JSON.stringify(req.url.includes("/comments") ? comments : prs));
      });
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const f = join(mkdtempSync(join(tmpdir(), "pw-")), "r.json");
    writeFileSync(f, JSON.stringify(file));
    const env = { SERVER_URL: `http://127.0.0.1:${server.address().port}`, REPOSITORY: "projects/lab", BRANCH: "ticket-66", SHA: "abcdef1234", TOKEN: "t" };
    return { calls, run: () => main(f, env) };
  }
  const pr = (n, ref) => ({ number: n, head: { ref, repo: { full_name: "projects/lab" } } });

  it("comments on the PR for the branch", async () => {
    const t = await run([pr(5, "other"), pr(7, "ticket-66")]);
    await t.run();
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0].method).toBe("POST");
    expect(t.calls[0].url).toBe("/api/v1/repos/projects/lab/issues/7/comments");
    expect(t.calls[0].body.body).toMatch(/HUD appears/);
    expect(t.calls[0].body.body).toContain(MARKER);
  });
  it("updates its earlier comment instead of posting a second one", async () => {
    const earlier = [
      { id: 11, body: "someone else", user: { login: "adham" } },
      { id: 12, body: `CI browser job output for 1111111\n\n${MARKER}`, user: { login: AUTHOR } },
    ];
    const t = await run([pr(7, "ticket-66")], report, earlier);
    await t.run();
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0].method).toBe("PATCH");
    expect(t.calls[0].url).toBe("/api/v1/repos/projects/lab/issues/comments/12");
    expect(t.calls[0].body.body).toMatch(/for abcdef1/);
    expect(t.calls[0].body.body).toContain(MARKER);
  });
  it("leaves alone a comment that only quotes the marker", async () => {
    const quote = [{ id: 13, body: `> ${MARKER}\nwhy is this here?`, user: { login: "adham" } }];
    const t = await run([pr(7, "ticket-66")], report, quote);
    await t.run();
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0].method).toBe("POST");
  });
  it("posts nothing without an open PR", async () => {
    const t = await run([pr(5, "other")]);
    await t.run();
    expect(t.calls).toEqual([]);
  });
  it("posts nothing when no test failed", async () => {
    const t = await run([pr(7, "ticket-66")], { suites: [] });
    await t.run();
    expect(t.calls).toEqual([]);
  });
});
