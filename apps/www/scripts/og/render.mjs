/**
 * Renders the share image: scripts/og/og.html → public/og.png (1200 x 630, 2x).
 * Uses the benchmark's playwright-core and the installed Chrome.
 *
 *   node apps/www/scripts/og/render.mjs
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, "../../../../package.json"));
const { chromium } = require("playwright-core");

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(path.join(here, "og.html")).href);
await page.evaluate(() => document.fonts.ready);
const out = path.resolve(here, "../../public/og.png");
await page.screenshot({ path: out, type: "png" });
await browser.close();
console.log(`Wrote ${path.relative(process.cwd(), out)}`);
