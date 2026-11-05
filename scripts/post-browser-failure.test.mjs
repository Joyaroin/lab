import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failedTests, formatComment, main } from "./post-browser-failure.mjs";

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
  async function run(prs, file = report) {
    const posts = [];
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        if (req.method === "POST") posts.push({ url: req.url, body: JSON.parse(body) });
        res.setHeader("content-type", "application/json");
        res.end(req.method === "POST" ? "{}" : JSON.stringify(prs));
      });
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const f = join(mkdtempSync(join(tmpdir(), "pw-")), "r.json");
    writeFileSync(f, JSON.stringify(file));
    const env = { SERVER_URL: `http://127.0.0.1:${server.address().port}`, REPOSITORY: "projects/lab", BRANCH: "ticket-66", SHA: "abcdef1234", TOKEN: "t" };
    return { posts, run: () => main(f, env) };
  }
  const pr = (n, ref) => ({ number: n, head: { ref, repo: { full_name: "projects/lab" } } });

  it("comments on the PR for the branch", async () => {
    const t = await run([pr(5, "other"), pr(7, "ticket-66")]);
    await t.run();
    expect(t.posts).toHaveLength(1);
    expect(t.posts[0].url).toBe("/api/v1/repos/projects/lab/issues/7/comments");
    expect(t.posts[0].body.body).toMatch(/HUD appears/);
  });
  it("posts nothing without an open PR", async () => {
    const t = await run([pr(5, "other")]);
    await t.run();
    expect(t.posts).toEqual([]);
  });
  it("posts nothing when no test failed", async () => {
    const t = await run([pr(7, "ticket-66")], { suites: [] });
    await t.run();
    expect(t.posts).toEqual([]);
  });
});
