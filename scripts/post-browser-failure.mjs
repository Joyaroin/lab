// Posts (or updates, on a later push) the failed Playwright tests on the open PR for this branch.
// Forgejo has no job-log API, so this is how workers and reviewers see why the browser job failed.
// Usage: node scripts/post-browser-failure.mjs <playwright-report.json>
// Env: SERVER_URL, REPOSITORY, BRANCH, SHA, TOKEN. Never fails the job: see the main() wrapper.
import { readFileSync } from "node:fs";
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

/** Hidden line that marks the comment as ours, so a later push updates it instead of adding another. */
export const MARKER = "<!-- ci-browser-failure -->";

/** The comment body. The first line must not start with verdict, pass or fail: merge-pr reads those. */
export function formatComment(tests, sha) {
  const lines = [`CI browser job output for ${sha.slice(0, 7)}`, ""];
  lines.push(`${tests.length} browser test(s) did not pass.`, "");
  for (const t of tests.slice(0, MAX_TESTS)) {
    const err = t.error.length > MAX_ERROR ? t.error.slice(0, MAX_ERROR) + "\n… (cut)" : t.error;
    lines.push(`**${t.name}**`, "", "~~~", err, "~~~", "");
  }
  if (tests.length > MAX_TESTS) lines.push(`… and ${tests.length - MAX_TESTS} more.`);
  return lines.join("\n").trimEnd() + `\n\n${MARKER}`;
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

/** Id of this script's earlier comment on the PR, or undefined. */
export async function findComment(env, pr) {
  for (let page = 1; page <= 10; page++) {
    const comments = await api(env, `/issues/${pr}/comments?limit=50&page=${page}`);
    const mine = comments.find((c) => c.body?.includes(MARKER));
    if (mine) return mine.id;
    if (comments.length < 50) return undefined;
  }
}

export async function main(file, env) {
  const tests = failedTests(JSON.parse(readFileSync(file, "utf8")));
  if (tests.length === 0) return console.log("No failed tests in the report; nothing to post.");
  const pr = await findPr(env);
  if (pr === undefined) return console.log(`No open PR for ${env.BRANCH}; nothing to post.`);
  const body = JSON.stringify({ body: formatComment(tests, env.SHA) });
  const earlier = await findComment(env, pr);
  if (earlier === undefined) await api(env, `/issues/${pr}/comments`, { method: "POST", body });
  else await api(env, `/issues/comments/${earlier}`, { method: "PATCH", body });
  console.log(`${earlier === undefined ? "Posted" : "Updated"} the failures on #${pr}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const e = process.env;
  main(process.argv[2], { SERVER_URL: e.SERVER_URL, REPOSITORY: e.REPOSITORY, BRANCH: e.BRANCH, SHA: e.SHA, TOKEN: e.TOKEN })
    // Posting is best effort. Say why it failed (the message never contains the token) and leave the job result alone.
    .catch((err) => console.log(`Could not post the failures: ${err.message}`));
}
