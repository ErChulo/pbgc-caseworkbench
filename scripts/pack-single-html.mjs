// scripts/pack-single-html.mjs
import fs from "fs";
import path from "path";

const ROOT = process.cwd(); // repo root, because we now run packer from repo root
const WEB_DIST = path.resolve(ROOT, "web", "dist");
const OUT = path.resolve(ROOT, "release", "pbgc-workbench.html");

function read(p) {
  return fs.readFileSync(p, "utf8");
}

function inlineAll(html) {
  // Inline <link rel="icon" href="/assets/...">
  html = html.replace(
    /<link[^>]+rel="icon"[^>]+href="([^"]+)"[^>]*>/g,
    (m, href) => {
      if (!href.startsWith("/assets/")) return m;
      const p = path.join(WEB_DIST, href.replace(/^\//, ""));
      const ext = path.extname(p).slice(1) || "svg+xml";
      const mime =
        ext === "svg" ? "image/svg+xml" :
        ext === "png" ? "image/png" :
        ext === "ico" ? "image/x-icon" :
        `image/${ext}`;
      const data = fs.readFileSync(p);
      const b64 = data.toString("base64");
      return `<link rel="icon" href="data:${mime};base64,${b64}">`;
    }
  );

  // Inline <link rel="stylesheet" href="/assets/..css">
  html = html.replace(
    /<link[^>]+rel="stylesheet"[^>]+href="([^"]+\.css)"[^>]*>/g,
    (m, href) => {
      const p = path.join(WEB_DIST, href.replace(/^\//, ""));
      const css = read(p);
      return `<style>\n${css}\n</style>`;
    }
  );

  // Inline <script type="module" src="/assets/..js"></script>
  html = html.replace(
    /<script[^>]+type="module"[^>]+src="([^"]+\.js)"[^>]*><\/script>/g,
    (m, src) => {
      const p = path.join(WEB_DIST, src.replace(/^\//, ""));
      const js = read(p);
      return `<script type="module">\n${js}\n</script>`;
    }
  );

  return html;
}

const indexPath = path.join(WEB_DIST, "index.html");
let html = read(indexPath);
html = inlineAll(html);

// Hard requirement: no external asset references remain.
if (html.includes('src="/assets/') || html.includes('href="/assets/')) {
  console.error("ERROR: Not fully inlined. Aborting.");
  process.exit(1);
}

fs.writeFileSync(OUT, html, "utf8");
console.log(`Wrote ${OUT}`);
