// Puts the screenshots job's images on the open PR for this branch, as one comment that each push
// replaces. Images are uploaded to Forgejo as the comment's attachments, never committed.
//   node scripts/post-screenshots.mjs find   writes `pr=<number>` (empty if none) to $GITHUB_OUTPUT
//   node scripts/post-screenshots.mjs post   uploads every PNG in $SHOTS_DIR and updates the comment
// Env: SERVER_URL, REPOSITORY, BRANCH, SHA, TOKEN, and for `post` PR and SHOTS_DIR.
// The token goes only into the Authorization header. Every message that leaves this script is masked.
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findComment, findPr, mask } from "./post-ci-failure.mjs";

export const MARKER = "<!-- ci-screenshots -->";

/** "home-lab-desktop.png" is the Home lab station at desktop size, as the file names say. */
export const parseName = (file) => {
  const m = /^(.+)-(desktop|phone)\.png$/.exec(basename(file));
  return m ? { station: m[1], size: m[2] } : undefined;
};

/** The comment: a table with one row per station, desktop and phone side by side. `links` maps file name to URL. */
export function formatComment(sha, links) {
  const rows = new Map();
  for (const [file, url] of Object.entries(links)) {
    const p = parseName(file);
    if (!p) continue;
    rows.set(p.station, { ...rows.get(p.station), [p.size]: url });
  }
  const img = (url, alt) => (url ? `![${alt}](${url})` : "missing");
  const lines = [`CI screenshots for ${sha.slice(0, 7)}: every station at desktop (1280x800) and phone (390x844)`, "", "| Station | Desktop | Phone |", "| --- | --- | --- |"];
  for (const [station, r] of rows) lines.push(`| ${station} | ${img(r.desktop, `${station} desktop`)} | ${img(r.phone, `${station} phone`)} |`);
  return lines.join("\n") + `\n\n${MARKER}`;
}

async function call(env, path, init = {}) {
  const res = await fetch(`${env.SERVER_URL}/api/v1/repos/${env.REPOSITORY}${path}`, {
    ...init,
    headers: { Authorization: `token ${env.TOKEN}`, ...init.headers },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path}: HTTP ${res.status}`);
  return res.status === 204 ? undefined : res.json();
}
const json = (body) => ({ body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

/** Replaces the screenshots comment on PR `pr` with `files` (paths of PNGs). Returns the comment id. */
export async function post(env, pr, files) {
  if (files.length === 0) throw new Error("no screenshots to post");
  let id = await findComment(env, pr, MARKER);
  if (id === undefined) id = (await call(env, `/issues/${pr}/comments`, { method: "POST", ...json({ body: `Taking screenshots…\n\n${MARKER}` }) })).id;
  const old = await call(env, `/issues/comments/${id}/assets`);
  const links = {};
  for (const f of files) {
    const form = new FormData();
    form.append("attachment", new Blob([readFileSync(f)], { type: "image/png" }), basename(f));
    links[basename(f)] = (await call(env, `/issues/comments/${id}/assets?name=${encodeURIComponent(basename(f))}`, { method: "POST", body: form })).browser_download_url;
  }
  await call(env, `/issues/comments/${id}`, { method: "PATCH", ...json({ body: formatComment(env.SHA, links) }) });
  for (const a of old) await call(env, `/issues/comments/${id}/assets/${a.id}`, { method: "DELETE" });
  return id;
}

export async function cli(e, mode) {
  try {
    if (mode === "find") {
      const pr = await findPr({ SERVER_URL: e.SERVER_URL, REPOSITORY: e.REPOSITORY, BRANCH: e.BRANCH, TOKEN: e.TOKEN });
      console.log(pr === undefined ? `No open PR for ${e.BRANCH}; nothing to attach.` : `Open PR for ${e.BRANCH}: #${pr}`);
      if (e.GITHUB_OUTPUT) appendFileSync(e.GITHUB_OUTPUT, `pr=${pr ?? ""}\n`);
    } else if (mode === "post") {
      const dir = e.SHOTS_DIR;
      const files = readdirSync(dir).filter((n) => parseName(n)).sort().map((n) => join(dir, n));
      const id = await post(e, e.PR, files);
      console.log(`Updated the screenshots comment ${id} on #${e.PR} with ${files.length} images.`);
    } else throw new Error("usage: post-screenshots.mjs find|post");
  } catch (err) {
    console.log(`Screenshots: ${mask(String(err.message), [e.TOKEN])}`);
    process.exitCode = 1; // unlike the failure reports, a missing screenshot fails the job
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await cli(process.env, process.argv[2]);
