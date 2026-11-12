// Posts (or updates, on a later push) why a CI job failed, on the open PR for this branch.
// On main, which has no PR, each failure is a new comment on the standing "CI failures on main" issue.
// Forgejo has no job-log API, so this is how workers and reviewers see why a job failed.
// Used by the frontend, facts, backend, integration, screenshots and secret-scan jobs in ci.yml, and the browser and
// screenshots jobs in release.yml. Configured by env, see cli() below.
import { existsSync, readFileSync } from "node:fs";
import { loadavg } from "node:os";
import { fileURLToPath } from "node:url";

const MAX_ERROR = 1500; // characters kept per test
const MAX_TESTS = 10;

const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, "");

/** Failed tests in a Playwright JSON report, as { name, error }. */
export function failedTests(report) {
  const out = [];
  const walk = (suite, titles) => {
    const path = suite.title && !suite.file?.endsWith(suite.title) ? [...titles, suite.title] : titles;
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        if (t.status !== "unexpected") continue;
        const last = t.results?.[t.results.length - 1];
        const err = last?.error?.message ?? last?.errors?.[0]?.message ?? "(no error message)";
        out.push({ name: [...path, spec.title].join(" > "), error: stripAnsi(err).trim() });
      }
    }
    for (const s of suite.suites ?? []) walk(s, path);
  };
  for (const s of report.suites ?? []) walk(s, []);
  return out;
}

/** Hidden line that marks a job's comment as ours, so a later push updates it instead of adding another. */
export const markerFor = (job) => `<!-- ci-${job}-failure -->`;
export const MARKER = markerFor("browser");

const TAIL_LINES = 40;
const MAX_TAIL = 6000; // characters

const read = (file) => (file && existsSync(file) ? readFileSync(file, "utf8") : undefined);

/** The first line of the output that matches "error", ignoring case, or undefined. */
export const firstErrorLine = (out) => out.split("\n").map((l) => stripAnsi(l).trim()).find((l) => /error/i.test(l));

/** Last lines of the output, plain text. */
export function tail(out) {
  const t = stripAnsi(out).trimEnd().split("\n").slice(-TAIL_LINES).join("\n");
  return t.length > MAX_TAIL ? "… (cut)\n" + t.slice(-MAX_TAIL) : t;
}

/** Replace every secret value with *** . */
export function mask(text, secrets) {
  let out = text;
  for (const v of secrets) if (v) out = out.split(v).join("***");
  return out;
}

/** The first step that did not succeed, from "id=outcome id=outcome ...", or undefined. */
export function failedStep(steps) {
  return steps.trim().split(/\s+/).map((p) => p.split("=")).find(([, outcome]) => outcome && outcome !== "success" && outcome !== "skipped")?.[0];
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

/** Text in a fence that its own content can't close: longer than the longest run of tildes inside. */
export function fenced(text) {
  const longest = Math.max(5, ...(text.match(/~+/g) ?? []).map((r) => r.length));
  const f = "~".repeat(longest + 1);
  return [f, text, f];
}

/** Inline code that the text can't break out of. */
const code = (s) => "`" + s.replace(/[`\r\n]+/g, "'") + "`";

/** The only fields of a gitleaks finding the comment uses. Match, Secret, Author, Email and Message are never read. */
export function findingsFrom(reportText) {
  if (!reportText?.trim()) return [];
  const parsed = JSON.parse(reportText);
  if (!Array.isArray(parsed)) return [];
  const str = (v) => (typeof v === "string" ? v : "");
  return parsed.map((f) => ({ rule: str(f.RuleID), file: str(f.File), line: Number(f.StartLine) || 0, commit: str(f.Commit).slice(0, 7) }));
}

const MAX_FINDINGS = 20;

/**
 * The comment body. The first line must not start with verdict, pass, fail or rebuild: merge-pr reads those.
 * `i` holds job, sha, step (failed step id), cmd, exit, out (output text or undefined), tests (browser only),
 * seconds (how long the job took) and load (load average).
 */
export function formatComment(i) {
  const lines = [`CI ${i.job} job output for ${i.sha.slice(0, 7)}`, ""];
  lines.push(`Job: ${i.job}`, `Failed step: ${i.step}`, `Took: ${formatDuration(i.seconds)}`, `Load average: ${i.load.map((n) => n.toFixed(2)).join(" ")}`, "");
  if (i.findings?.length) {
    lines.push(`Error: gitleaks found ${i.findings.length} possible secret(s). Values are redacted.`, "");
    for (const f of i.findings.slice(0, MAX_FINDINGS)) lines.push(`- ${code(f.rule)} in ${code(`${f.file}:${f.line}`)}, commit ${code(f.commit)}`);
    if (i.findings.length > MAX_FINDINGS) lines.push(`- … and ${i.findings.length - MAX_FINDINGS} more.`);
    lines.push("");
  } else if (i.job === "secret-scan") {
    lines.push(`Error: step ${i.step} failed with exit code ${i.exit ?? "unknown"}.`, "");
  } else if (i.tests?.length) {
    lines.push(`Error: ${i.tests.length} browser test(s) did not pass.`, "");
    for (const t of i.tests.slice(0, MAX_TESTS)) {
      const err = t.error.length > MAX_ERROR ? t.error.slice(0, MAX_ERROR) + "\n… (cut)" : t.error;
      lines.push(`**${t.name.replace(/[*`\r\n]+/g, "'")}**`, "", ...fenced(err), "");
    }
    if (i.tests.length > MAX_TESTS) lines.push(`… and ${i.tests.length - MAX_TESTS} more.`, "");
  } else if (i.out === undefined) {
    lines.push(`Error: step ${i.step} failed: no output captured.`, "");
  } else {
    lines.push(`Error: ${code(i.cmd)} exited with code ${i.exit ?? "unknown"}.`);
    const first = firstErrorLine(i.out);
    if (first) lines.push(`First error line: ${code(first)}`);
    lines.push("");
  }
  if (i.out !== undefined) lines.push(`Last ${TAIL_LINES} lines of output:`, "", ...fenced(tail(i.out)), "");
  return lines.join("\n").trimEnd() + `\n\n${markerFor(i.job)}`;
}

async function api(env, path, init) {
  const res = await fetch(`${env.SERVER_URL}/api/v1/repos/${env.REPOSITORY}${path}`, {
    ...init,
    headers: { Authorization: `token ${env.TOKEN}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path}: HTTP ${res.status}`);
  return res.json();
}

/** Number of the open PR whose head is this branch, or undefined. */
export async function findPr(env) {
  for (let page = 1; page <= 10; page++) {
    const prs = await api(env, `/pulls?state=open&limit=50&page=${page}`);
    const pr = prs.find((p) => p.head?.ref === env.BRANCH && p.head?.repo?.full_name === env.REPOSITORY);
    if (pr) return pr.number;
    if (prs.length < 50) return undefined;
  }
}

/** The user CI comments as: the job token belongs to it, and only it can edit its own comments. */
export const AUTHOR = "forgejo-actions";

/** Id of this job's earlier comment on the PR, or undefined. Only a comment written by CI (AUTHOR) counts, so one that quotes the marker is left alone. */
export async function findComment(env, pr, marker) {
  // Forgejo's comment list ignores limit and page and returns every comment in one go.
  const comments = await api(env, `/issues/${pr}/comments`);
  return comments.find((c) => c.body?.includes(marker) && c.user?.login === AUTHOR)?.id;
}

export const ISSUE_MARKER = "<!-- ci-main-failures -->";
export const ISSUE_TITLE = "CI failures on main";

/** Number of the standing "CI failures on main" issue, open or closed, created by CI. Creates it if missing and reopens it if closed. */
export async function findOrCreateIssue(env) {
  for (let page = 1; page <= 10; page++) {
    const issues = await api(env, `/issues?type=issues&state=all&q=${encodeURIComponent(ISSUE_TITLE)}&limit=50&page=${page}`);
    const found = issues.find((i) => i.body?.includes(ISSUE_MARKER) && i.user?.login === AUTHOR);
    if (found) {
      if (found.state === "closed") await api(env, `/issues/${found.number}`, { method: "PATCH", body: JSON.stringify({ state: "open" }) });
      return found.number;
    }
    if (issues.length < 50) break;
  }
  const body = `Every red CI run on main is posted here as a comment.\n\n${ISSUE_MARKER}`;
  return (await api(env, "/issues", { method: "POST", body: JSON.stringify({ title: ISSUE_TITLE, body }) })).number;
}

/**
 * `input`: job, steps, cmd, outFile, exitFile, startFile, report (browser only), secrets (values to mask),
 * now (ms, for tests). `env`: SERVER_URL, REPOSITORY, BRANCH, SHA, TOKEN.
 */
export async function main(input, env) {
  const secrets = input.secrets ?? [];
  // Mask before anything is cut, or a secret that crosses a cut leaks half its value.
  const clean = (t) => mask(stripAnsi(t), secrets);
  const rawOut = read(input.outFile);
  const out = rawOut === undefined ? undefined : clean(rawOut);
  const failed = failedStep(input.steps) ?? input.job;
  const reportText = input.report && failed === input.runStep ? read(input.report) : undefined;
  let tests = [];
  let findings;
  if (input.leaksReport && failed === input.runStep) {
    try {
      findings = findingsFrom(read(input.leaksReport));
    } catch {
      console.log("Could not read the gitleaks report; using the step and exit code.");
    }
  }
  try {
    if (reportText) tests = failedTests(JSON.parse(reportText)).map((t) => ({ name: clean(t.name), error: clean(t.error) }));
  } catch {
    console.log("Could not read the Playwright report; using the command and exit code.");
  }
  const start = Number(read(input.startFile)?.trim());
  const now = input.now ?? Date.now();
  const text = formatComment({
    job: input.job, sha: env.SHA, step: failed, cmd: clean(input.cmd ?? ""), exit: read(input.exitFile)?.trim(),
    out: input.leaksReport ? undefined : out, tests, findings, seconds: start ? now / 1000 - start : 0, load: loadavg(),
  });
  const marker = markerFor(input.job);
  const pr = await findPr(env);
  if (pr === undefined && env.BRANCH !== "main") return console.log(`No open PR for ${env.BRANCH}; nothing to post.`);
  if (pr === undefined) {
    const base = `${env.SERVER_URL}/${env.REPOSITORY}`;
    const links = [`Commit: ${base}/commit/${env.SHA}`];
    if (env.RUN_NUMBER) links.push(`Run: ${base}/actions/runs/${env.RUN_NUMBER}`);
    const issue = await findOrCreateIssue(env);
    await api(env, `/issues/${issue}/comments`, { method: "POST", body: JSON.stringify({ body: mask(`${links.join("\n")}\n\n${text}`, secrets) }) });
    return console.log(`Posted the ${input.job} failure on main to #${issue}.`);
  }
  const body = JSON.stringify({ body: mask(text, secrets) });
  const earlier = await findComment(env, pr, marker);
  if (earlier === undefined) await api(env, `/issues/${pr}/comments`, { method: "POST", body });
  else await api(env, `/issues/comments/${earlier}`, { method: "PATCH", body });
  console.log(`${earlier === undefined ? "Posted" : "Updated"} the ${input.job} failure on #${pr}.`);
}

/**
 * Reads the job's settings from env: JOB, STEPS ("id=outcome ..." for every step), RUN_STEP (id of the run step),
 * CMD, OUT_FILE, EXIT_FILE, START_FILE, REPORT, LEAKS_REPORT (secret-scan: gitleaks JSON report), MASK_ENV (names of env vars whose values to hide), and
 * SERVER_URL, REPOSITORY, BRANCH, SHA, TOKEN, and optionally GITHUB_RUN_NUMBER (for the run link). Posting is best effort: it says why it failed and returns normally.
 */
export async function cli(e) {
  try {
    const secrets = (e.MASK_ENV ?? "").split(",").filter(Boolean).map((n) => e[n]);
    await main(
      { job: e.JOB, steps: e.STEPS ?? "", runStep: e.RUN_STEP, cmd: e.CMD, outFile: e.OUT_FILE, exitFile: e.EXIT_FILE, startFile: e.START_FILE, report: e.REPORT, leaksReport: e.LEAKS_REPORT, secrets },
      { SERVER_URL: e.SERVER_URL, REPOSITORY: e.REPOSITORY, BRANCH: e.BRANCH, SHA: e.SHA, TOKEN: e.TOKEN, RUN_NUMBER: e.GITHUB_RUN_NUMBER },
    );
  } catch (err) {
    // The message never contains the token. Leave the job result alone.
    console.log(`Could not post the failure: ${mask(String(err.message), [e.TOKEN])}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await cli(process.env);
