#!/usr/bin/env node
/**
 * Serve the built single-file workbench.
 *
 * The office handover machine only needs Node and a Chromium-based browser, so
 * this server uses nothing but `node:http` and `node:fs`. No dependencies, no
 * network access, no build step.
 *
 * Why not open `dist/index.html` directly? Chromium blocks IndexedDB for
 * `file://` documents, so a case would appear to save and then vanish on
 * reload. Serving over loopback gives the page a real origin and real storage.
 *
 * Usage:
 *   node scripts/serve.mjs            # http://127.0.0.1:4173
 *   node scripts/serve.mjs --port 8080
 */

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
const HOST = "127.0.0.1";

const argv = process.argv.slice(2);
const portFlag = argv.indexOf("--port");
const port = Number(portFlag >= 0 ? argv[portFlag + 1] : process.env.PORT ?? 4173);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("Invalid port. Use --port <1-65535>.");
  process.exit(1);
}

const MEDIA_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

// Sent as a header (not a meta tag) so frame-ancestors is actually enforced.
const CSP = [
  "default-src 'self' blob: data:",
  "script-src 'self' 'unsafe-inline' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

const entry = join(ROOT, "index.html");
try {
  const info = await stat(entry);
  if (!info.isFile() || info.size === 0) throw new Error("empty");
} catch {
  console.error(`No build found at ${entry}.`);
  console.error("Run `npm run build` first, then start this server again.");
  process.exit(1);
}

const server = createServer(async (request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  } catch {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end("Bad request");
    return;
  }

  if (pathname === "/" || pathname.endsWith("/")) pathname += "index.html";

  const target = resolve(join(ROOT, normalize(pathname)));
  if (target !== ROOT && !target.startsWith(ROOT + sep)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  try {
    const info = await stat(target);
    if (!info.isFile()) throw new Error("not a file");
    const headers = {
      "content-type": MEDIA_TYPES[extname(target).toLowerCase()] ?? "application/octet-stream",
      "content-length": String(info.size),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-security-policy": CSP,
    };
    response.writeHead(200, headers);
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Try: node scripts/serve.mjs --port 8080`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

server.listen(port, HOST, () => {
  console.log("");
  console.log(`  PBGC Case Workbench — serving ${ROOT}`);
  console.log(`  Open:  http://${HOST}:${port}`);
  console.log("");
  console.log("  Keep this window open while you work. Press Ctrl+C to stop.");
  console.log("  Do not open dist/index.html directly: browsers block storage");
  console.log("  for file:// pages, so nothing would be saved.");
  console.log("");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
