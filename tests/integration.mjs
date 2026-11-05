// Serves the built site the way a static host would and checks the first response.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import assert from "node:assert/strict";

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer(async (req, res) => {
  try {
    const path = req.url === "/" ? "/index.html" : req.url;
    const body = await readFile(join("dist", path));
    res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  const page = await fetch(base + "/");
  assert.equal(page.status, 200);
  const html = await page.text();
  const script = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  assert.ok(script, "index.html references a script");
  assert.equal((await fetch(base + script)).status, 200);
  console.log("integration ok");
} finally {
  server.close();
}
