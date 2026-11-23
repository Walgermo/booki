// Writes public/sitemap.xml from the routes a visitor can land on: the
// marketing pages and one docs page per catalogue entry. The bench pages are
// fixtures for the agent benchmark, kept out of the index (robots.txt).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const site = "https://booki.dev";
const here = dirname(fileURLToPath(import.meta.url));
const catalog = readFileSync(join(here, "../src/catalog.ts"), "utf8");
const docs = [...catalog.matchAll(/^\s+name: "([a-z0-9-]+)",$/gm)].map((m) => m[1]);
const pages = [
  "/",
  "/features",
  "/announcing-agent-first-ui-with-booki",
  "/close",
  "/erp-teams",
  "/demo",
  "/docs",
  "/docs/installation",
  "/docs/examples",
];
// These names redirect to /docs, so they are not pages of their own.
const redirects = new Set(["introduction", "installation", "demo", "month-end", "erp-teams"]);
const urls = [...new Set([...pages, ...docs.filter((name) => !redirects.has(name)).map((name) => `/docs/${name}`)])];
writeFileSync(
  join(here, "../public/sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${site}${url}</loc></url>`).join("\n")}\n</urlset>\n`,
);
console.log(`sitemap: ${urls.length} urls`);
