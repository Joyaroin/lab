import { describe, it, expect, afterEach, vi } from "vitest";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AUTHOR, cli, findingsFrom, failedTests, failedStep, formatComment, main, markerFor, MARKER, ISSUE_MARKER } from "./post-ci-failure.mjs";

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

const JOBS = ["frontend", "backend", "integration", "browser"];
const ALL_JOBS = [...JOBS, "secret-scan"];
const base = { sha: "abcdef1234", step: "run", cmd: "make frontend", exit: "2", seconds: 125, load: [0.5, 1, 1.5] };
const out = Array.from({ length: 60 }, (_, i) => (i === 3 ? "src/a.ts: TypeError: bad" : `line ${i}`)).join("\n");

describe("formatComment", () => {
  it.each(JOBS)("%s builds a comment with its own marker and every listed item", (job) => {
    const body = formatComment({ ...base, job, out });
    expect(body.endsWith(markerFor(job))).toBe(true);
    for (const other of JOBS.filter((j) => j !== job)) expect(body).not.toContain(markerFor(other));
    expect(body).toContain(`Job: ${job}`);
    expect(body).toContain("Failed step: run");
    expect(body).toContain("`make frontend` exited with code 2");
    expect(body).toContain("First error line: `src/a.ts: TypeError: bad`");
    expect(body).toContain("line 59");
    expect(body).toContain("line 20");
    expect(body).not.toContain("line 19\n");
    expect(body).toContain("Took: 2m 5s");
    expect(body).toContain("Load average: 0.50 1.00 1.50");
  });
  it("keeps the old browser marker", () => {
    expect(MARKER).toBe("<!-- ci-browser-failure -->");
  });
  it.each(ALL_JOBS)("%s comment does not start with a word merge-pr reads as a verdict", (job) => {
    const first = formatComment({ ...base, job, out }).split("\n")[0];
    expect(first).toBe(`CI ${job} job output for abcdef1`);
    expect(first).not.toMatch(/^\s*(verdict|pass|fail|rebuild)/i);
  });
  it.each(["download", "checksum"])("secret-scan %s comment does not start with a verdict word", (step) => {
    const first = formatComment({ ...base, job: "secret-scan", step, out: undefined }).split("\n")[0];
    expect(first).not.toMatch(/^\s*(verdict|pass|fail|rebuild)/i);
  });
  it("uses the failed tests as the browser error", () => {
    const body = formatComment({ ...base, job: "browser", out, tests: failedTests(report) });
    expect(body).toMatch(/HUD appears/);
    expect(body).toMatch(/Expected: 1/);
    expect(body).not.toContain("exited with code");
  });
  it("leaves out the error line when nothing matches", () => {
    const body = formatComment({ ...base, job: "frontend", out: "all fine\nbut exit 1" });
    expect(body).not.toContain("First error line");
  });
  it("says so when a step produced no output", () => {
    const body = formatComment({ ...base, job: "frontend", step: "checkout", out: undefined });
    expect(body).toContain("Failed step: checkout");
    expect(body).toContain("no output captured");
  });
  it("cuts long errors and long lists", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ name: `t${i}`, error: "x".repeat(5000) }));
    const body = formatComment({ ...base, job: "browser", tests: many });
    expect(body.length).toBeLessThan(20000);
    expect(body).toMatch(/and 20 more/);
  });
});

// What gitleaks 8.30.1 --redact writes per finding. Match and Secret hold REDACTED; the commit fields are never read.
const LEAK = {
  RuleID: "aws-access-token", Description: "AWS key", File: "src/a.ts", StartLine: 7, Commit: "1234567890abcdef",
  Match: "key = REDACTED", Secret: "REDACTED", Author: "Some One", Email: "someone@example.test", Message: "oops a commit message",
};
const scanBase = { job: "secret-scan", sha: "abcdef1234", step: "scan", cmd: "gitleaks git", exit: "1", seconds: 65, load: [0.5, 1, 1.5] };
const items = (body, job = "secret-scan") => {
  expect(body.endsWith(markerFor(job))).toBe(true);
  expect(body).toContain(`Job: ${job}`);
  expect(body).toContain("Took: 1m 5s");
  expect(body).toContain("Load average: 0.50 1.00 1.50");
  expect(body).not.toMatch(/lines of output/);
  expect(body).not.toContain("~~~");
};

describe("secret-scan comment", () => {
  it("uses only the redacted report's rule, file, line and commit", () => {
    expect(findingsFrom(JSON.stringify([LEAK]))).toEqual([{ rule: "aws-access-token", file: "src/a.ts", line: 7, commit: "1234567" }]);
    const body = formatComment({ ...scanBase, findings: findingsFrom(JSON.stringify([LEAK])) });
    for (const v of ["REDACTED", "Some One", "someone@example.test", "oops a commit message", "key ="]) expect(body).not.toContain(v);
  });
  it("findings version carries its marker and every item", () => {
    const body = formatComment({ ...scanBase, findings: findingsFrom(JSON.stringify([LEAK])) });
    items(body);
    expect(body).toContain("Failed step: scan");
    expect(body).toContain("`aws-access-token` in `src/a.ts:7`, commit `1234567`");
  });
  it.each(["download", "checksum"])("%s version has the step and exit code but no findings", (step) => {
    const body = formatComment({ ...scanBase, step, exit: "22" });
    items(body);
    expect(body).toContain(`Failed step: ${step}`);
    expect(body).toContain(`step ${step} failed with exit code 22`);
    expect(body).not.toContain("possible secret");
  });
  it.each([["[]"], [""], [undefined]])("a scan failure with report %j uses the no-findings shape", (text) => {
    const body = formatComment({ ...scanBase, findings: findingsFrom(text) });
    items(body);
    expect(body).toContain("step scan failed with exit code 1");
    expect(body).not.toContain("possible secret");
  });
  it("cuts a long list", () => {
    const body = formatComment({ ...scanBase, findings: findingsFrom(JSON.stringify(Array(30).fill(LEAK))) });
    expect(body).toContain("and 10 more");
  });
});

describe("failedStep", () => {
  it("names the first step that did not succeed", () => {
    expect(failedStep("start=success checkout=failure run=skipped")).toBe("checkout");
    expect(failedStep("start=success checkout=success run=failure")).toBe("run");
  });
});

describe("main against a fake Forgejo", () => {
  let server;
  afterEach(() => server?.close());
  // `comments` is what the PR already has. POST adds to it and PATCH changes one, as Forgejo does.
  const NOOUT = "boom: Error here\nmore";
  async function run(prs, { comments = [], job = "browser", rep = report, output = NOOUT, status = 200, secrets = [], issues = [], branch = "ticket-66" } = {}) {
    const calls = [];
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        res.setHeader("content-type", "application/json");
        if (status !== 200) { res.statusCode = status; return res.end("{}"); }
        if (req.method === "POST" || req.method === "PATCH") {
          calls.push({ method: req.method, url: req.url, body: JSON.parse(body) });
          return res.end(JSON.stringify({ number: 50 }));
        }
        const list = req.url.includes("/comments") ? comments : req.url.includes("/issues") ? issues : prs;
        res.end(JSON.stringify(list));
      });
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const dir = mkdtempSync(join(tmpdir(), "pw-"));
    const files = { report: join(dir, "r.json"), outFile: join(dir, "out.log"), exitFile: join(dir, "exit"), startFile: join(dir, "start") };
    if (rep) writeFileSync(files.report, JSON.stringify(rep));
    if (output !== null) writeFileSync(files.outFile, output);
    writeFileSync(files.exitFile, "3\n");
    writeFileSync(files.startFile, "1000\n");
    const env = { SERVER_URL: `http://127.0.0.1:${server.address().port}`, REPOSITORY: "projects/lab", BRANCH: branch, SHA: "abcdef1234", TOKEN: "t" };
    const input = { job, steps: "start=success checkout=success run=failure", runStep: "run", cmd: `make ${job}`, ...files, secrets, now: 1090000 };
    return { calls, env, input, dir, run: () => main(input, env) };
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
    expect(t.calls[0].body.body).toContain("Took: 1m 30s");
  });
  it("updates its earlier comment on a second failure and adds no new one", async () => {
    const earlier = [
      { id: 11, body: "someone else", user: { login: "adham" } },
      { id: 12, body: `CI browser job output for 1111111\n\n${MARKER}`, user: { login: AUTHOR } },
    ];
    const t = await run([pr(7, "ticket-66")], { comments: earlier });
    await t.run();
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0].method).toBe("PATCH");
    expect(t.calls[0].url).toBe("/api/v1/repos/projects/lab/issues/comments/12");
    expect(t.calls[0].body.body).toMatch(/for abcdef1/);
  });
  it("does not touch another job's comment", async () => {
    const earlier = [{ id: 12, body: `x\n\n${markerFor("frontend")}`, user: { login: AUTHOR } }];
    const t = await run([pr(7, "ticket-66")], { comments: earlier, job: "backend" });
    await t.run();
    expect(t.calls[0].method).toBe("POST");
    expect(t.calls[0].body.body).toContain(markerFor("backend"));
  });
  it("leaves alone a comment that only quotes the marker", async () => {
    const quote = [{ id: 13, body: `> ${MARKER}\nwhy is this here?`, user: { login: "adham" } }];
    const t = await run([pr(7, "ticket-66")], { comments: quote });
    await t.run();
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0].method).toBe("POST");
  });
  it("posts nothing without an open PR", async () => {
    const t = await run([pr(5, "other")]);
    await t.run();
    expect(t.calls).toEqual([]);
  });
  describe("main with no PR", () => {
    const mainRun = (o = {}) => run([pr(5, "other")], { branch: "main", ...o });
    const standing = (extra = {}) => ({ number: 40, state: "open", body: `Standing.\n\n${ISSUE_MARKER}`, user: { login: AUTHOR }, ...extra });
    it("creates the issue and comments on it", async () => {
      const t = await mainRun();
      t.env.RUN_NUMBER = "812";
      await t.run();
      expect(t.calls.map((c) => `${c.method} ${c.url.replace("/api/v1/repos/projects/lab", "")}`)).toEqual(["POST /issues", "POST /issues/50/comments"]);
      expect(t.calls[0].body.title).toBe("CI failures on main");
      expect(t.calls[0].body.body).toContain(ISSUE_MARKER);
      expect(t.calls[1].body.body).toMatch(/HUD appears/);
      expect(t.calls[1].body.body).toContain("/commit/abcdef1234");
      expect(t.calls[1].body.body).toContain("/actions/runs/812");
    });
    it("adds a new comment to an open issue, never editing an earlier one", async () => {
      const t = await mainRun({ issues: [standing()], comments: [{ id: 3, body: markerFor("browser"), user: { login: AUTHOR } }] });
      await t.run();
      expect(t.calls).toHaveLength(1);
      expect(t.calls[0].method).toBe("POST");
      expect(t.calls[0].url).toMatch(/issues\/40\/comments$/);
    });
    it("reopens a closed issue, then comments", async () => {
      const t = await mainRun({ issues: [standing({ state: "closed" })] });
      await t.run();
      expect(t.calls.map((c) => c.method)).toEqual(["PATCH", "POST"]);
      expect(t.calls[0].url).toMatch(/issues\/40$/);
      expect(t.calls[0].body).toEqual({ state: "open" });
    });
    it("ignores a lookalike issue not made by CI", async () => {
      const t = await mainRun({ issues: [standing({ user: { login: "adham" } })] });
      await t.run();
      expect(t.calls[0].url).toMatch(/\/issues$/);
    });
    it("posts nothing for another branch without a PR", async () => {
      const t = await run([pr(5, "other")], { branch: "ticket-66" });
      await t.run();
      expect(t.calls).toEqual([]);
    });
    it("masks secrets on the issue path", async () => {
      const planted = ["s3cr3t", "value"].join("-");
      const t = await mainRun({ job: "frontend", rep: null, output: `Error: ${planted}`, secrets: [planted] });
      await t.run();
      expect(JSON.stringify(t.calls)).not.toContain(planted);
      expect(t.calls[1].body.body).toContain("Error: ***");
    });
  });
  it("browser falls back to the command and exit code when there is no report", async () => {
    const t = await run([pr(7, "ticket-66")], { rep: null });
    await t.run();
    const body = t.calls[0].body.body;
    expect(body).toContain("`make browser` exited with code 3");
    expect(body).toContain("First error line: `boom: Error here`");
  });
  it("browser falls back when the report has no failed test", async () => {
    const t = await run([pr(7, "ticket-66")], { rep: { suites: [] } });
    await t.run();
    expect(t.calls[0].body.body).toContain("`make browser` exited with code 3");
  });
  it("says no output captured when the failing step saved none", async () => {
    const t = await run([pr(7, "ticket-66")], { job: "frontend", rep: null, output: null });
    t.input.steps = "start=success checkout=failure run=skipped";
    await t.run();
    const body = t.calls[0].body.body;
    expect(body).toContain("Failed step: checkout");
    expect(body).toContain("no output captured");
  });
  describe("secret-scan end to end", () => {
    const go = async ({ steps, reportText, comments = [] }) => {
      const t = await run([pr(7, "ticket-66")], { job: "secret-scan", rep: null, output: null, comments });
      const leaks = join(t.dir, "leaks.json");
      if (reportText !== undefined) writeFileSync(leaks, reportText);
      Object.assign(t.input, { steps, runStep: "scan", leaksReport: leaks });
      await t.run();
      return t.calls;
    };
    const ok = "start=success checkout=success download=success checksum=success";
    it("reads the report when the scan step failed", async () => {
      const calls = await go({ steps: `${ok} scan=failure`, reportText: JSON.stringify([LEAK]) });
      expect(calls[0].body.body).toContain("`aws-access-token` in `src/a.ts:7`");
      expect(calls[0].body.body).not.toContain("REDACTED");
    });
    it("ignores a report left over when the download step failed", async () => {
      const calls = await go({ steps: "start=success checkout=success download=failure checksum=skipped scan=skipped", reportText: JSON.stringify([LEAK]) });
      expect(calls[0].body.body).toContain("Failed step: download");
      expect(calls[0].body.body).toContain("exit code 3");
      expect(calls[0].body.body).not.toContain("src/a.ts");
    });
    it("uses the no-findings shape for a missing or unreadable report", async () => {
      for (const reportText of [undefined, "", "[]", "{not json"]) {
        const calls = await go({ steps: `${ok} scan=failure`, reportText });
        expect(calls[0].body.body).toContain("step scan failed with exit code 3");
      }
    });
    it("updates its earlier comment instead of adding one", async () => {
      const earlier = [{ id: 21, body: `old\n\n${markerFor("secret-scan")}`, user: { login: AUTHOR } }];
      const calls = await go({ steps: `${ok} scan=failure`, reportText: JSON.stringify([LEAK]), comments: earlier });
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("PATCH");
      expect(calls[0].url).toMatch(/comments\/21$/);
    });
  });
  it("never lets a planted value into the comment", async () => {
    const planted = ["s3cr3t", "value"].join("-");
    const t = await run([pr(7, "ticket-66")], { job: "frontend", rep: null, output: `Error: auth ${planted} rejected\n${planted}`, secrets: [planted] });
    await t.run();
    expect(JSON.stringify(t.calls[0].body)).not.toContain(planted);
    expect(t.calls[0].body.body).toContain("Error: auth *** rejected");
  });
  const PLANTED = "0123456789abcdef".repeat(3).slice(0, 40);
  const leaks = (body) => { for (let i = 0; i + 8 <= PLANTED.length; i++) if (body.includes(PLANTED.slice(i, i + 8))) return true; return false; };
  it("masks a secret that crosses the 6000-character tail cut", async () => {
    const t = await run([pr(7, "ticket-66")], { job: "frontend", rep: null, output: "value: " + PLANTED + "y".repeat(5980), secrets: [PLANTED] });
    await t.run();
    expect(leaks(t.calls[0].body.body)).toBe(false);
  });
  it("masks a secret that crosses the 1500-character test-error cut", async () => {
    const r = { suites: [{ title: "a.spec.ts", file: "a.spec.ts", specs: [{ title: "t", tests: [{ status: "unexpected", results: [{ error: { message: "z".repeat(1480) + PLANTED } }] }] }] }] };
    const t = await run([pr(7, "ticket-66")], { rep: r, secrets: [PLANTED] });
    await t.run();
    expect(leaks(t.calls[0].body.body)).toBe(false);
  });
  it("browser falls back when playwright.json is cut off", async () => {
    const t = await run([pr(7, "ticket-66")], { rep: null });
    writeFileSync(t.input.report, '{"suites":[');
    await t.run();
    expect(t.calls[0].body.body).toContain("`make browser` exited with code 3");
  });
  it("log text cannot close the code fence", async () => {
    const t = await run([pr(7, "ticket-66")], { job: "frontend", rep: null, output: "a\n~~~~~~~~\n@everyone" });
    await t.run();
    const body = t.calls[0].body.body;
    expect(body).toContain("~~~~~~~~~\na\n~~~~~~~~\n@everyone\n~~~~~~~~~");
  });
  it("a failed post exits 0 and logs the reason", async () => {
    const t = await run([pr(7, "ticket-66")], { status: 500 });
    const lines = [];
    const spy = vi.spyOn(console, "log").mockImplementation((m) => lines.push(m));
    try {
      await cli({ ...t.env, JOB: "browser", STEPS: t.input.steps, RUN_STEP: "run", CMD: "make browser", OUT_FILE: t.input.outFile });
    } finally { spy.mockRestore(); }
    expect(lines.join("\n")).toMatch(/Could not post the failure: GET .*HTTP 500/);
  });
  it("the script process exits 0 when posting fails", async () => {
    const t = await run([pr(7, "ticket-66")], { status: 500 });
    const env = { ...process.env, ...t.env, JOB: "frontend", STEPS: "run=failure", RUN_STEP: "run", CMD: "make frontend" };
    const stdout = await new Promise((resolve, reject) =>
      execFile(process.execPath, [fileURLToPath(new URL("./post-ci-failure.mjs", import.meta.url))], { env }, (err, so) => (err ? reject(err) : resolve(so))));
    expect(stdout).toMatch(/Could not post the failure: .*HTTP 500/);
  });
});

describe("ci.yml", () => {
  const yml = readFileSync(new URL("../.forgejo/workflows/ci.yml", import.meta.url), "utf8");
  it("every post step has continue-on-error: true", () => {
    const posts = yml.split(/\n      - /).filter((b) => b.includes("post-ci-failure.mjs"));
    expect(posts).toHaveLength(6);
    for (const p of posts) expect(p).toMatch(/continue-on-error: true/);
  });
  it("has no full browser suite: release.yml runs it", () => {
    expect(yml).not.toMatch(/^  browser:/m);
    expect(yml).not.toContain("make browser");
  });
});

describe("release.yml", () => {
  const yml = readFileSync(new URL("../.forgejo/workflows/release.yml", import.meta.url), "utf8");
  const job = (name) => yml.slice(yml.indexOf(`\n  ${name}:\n`) + 1).split(/\n  (?=[a-z-]+:\n)/)[0];
  it("moves staging only after the image, the full browser suite and the screenshots pass", () => {
    expect(job("staging")).toMatch(/^    needs: \[image, browser, screenshots\]$/m);
  });
  it("runs the full suite and every shot", () => {
    expect(job("browser")).toContain('make browser PW_ARGS="--reporter=list,json"');
    expect(job("screenshots")).toContain("npx playwright test -c playwright.screenshots.config.ts");
  });
  it("every post step has continue-on-error: true and masks the token", () => {
    const posts = yml.split(/\n      - /).filter((b) => b.includes("post-ci-failure.mjs"));
    expect(posts).toHaveLength(2);
    for (const p of posts) {
      expect(p).toMatch(/continue-on-error: true/);
      expect(p).toMatch(/MASK_ENV: TOKEN/);
    }
  });
  it("can be run by hand, to try again after a flaky failure", () => {
    expect(yml).toMatch(/^  workflow_dispatch:/m);
  });
});

describe("ci.yml screenshots job", () => {
  const yml = readFileSync(new URL("../.forgejo/workflows/ci.yml", import.meta.url), "utf8");
  const job = yml.slice(yml.indexOf("  screenshots:"), yml.indexOf("  secret-scan:"));
  it("masks the token in its failure report and takes it from GITHUB_TOKEN only", () => {
    expect(job).toMatch(/MASK_ENV: TOKEN/);
    expect(job.match(/TOKEN: (.*)/g)?.every((l) => l.endsWith("${{ secrets.GITHUB_TOKEN }}"))).toBe(true);
  });
  it("skips the browser steps when there is no open PR", () => {
    for (const id of ["drivers", "run", "post"]) {
      const step = job.slice(job.indexOf(`id: ${id}`)).split("\n      - ")[0];
      expect(step, id).toContain("if: steps.pr.outputs.pr != ''");
    }
  });
});
