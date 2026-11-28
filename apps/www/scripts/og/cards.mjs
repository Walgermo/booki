/**
 * Renders a share card for every prerendered page except the front page
 * (which keeps public/og.png from og.html): public/og/<route>.jpg, 1200 x 630.
 *
 * Each card shows the page's title beside a picture of the page itself: the
 * live preview on a component page, the page's own figure elsewhere. The
 * picture is taken from the built site in a light, English browser, so a
 * card never shows something the page does not.
 *
 *   pnpm --filter @booki-aui/www build
 *   node apps/www/scripts/og/cards.mjs            # every card
 *   node apps/www/scripts/og/cards.mjs docs/button # only these
 *
 * Then build again, so the prerender points each page at its card. The
 * build fails for a page with no card, or whose title has changed since its
 * card was made (scripts/og/cards.json): run this for that page and commit.
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const www = resolve(here, "../..");
const dist = join(www, "dist");
const out = join(www, "public/og");
if (!existsSync(join(dist, "index.html"))) throw new Error("Build the site first: pnpm --filter @booki-aui/www build");

/**
 * Pages whose card needs its own words or picture. `figure` lists selectors;
 * the first visible match is the picture. The demo and the month-end story
 * run a Norwegian company, so their card takes the English page title and
 * a kicker of its own rather than the page's first heading.
 */
const PAGES = {
  "/demo": {
    kicker: "Live demo",
    title: "An app where agents and people share the screen",
    figure: [".erp-dashboard"],
  },
  "/close": { kicker: "Walkthrough", figure: ["section:has(#close-queue) .site-rows"] },
  "/features": { kicker: "Features", figure: ["article .site-sheet", "article section.site-section .min-w-0"] },
  "/erp-teams": { kicker: "For ERP teams", figure: ["dl.site-figures"] },
  "/announcing-agent-first-ui-with-booki": { kicker: "Launch", figure: ["figure.dia"], fit: "crop" },
  "/docs": { kicker: "Documentation", from: "/docs/voucher-composer" },
  "/docs/installation": { kicker: "Documentation", figure: [".code-panel"] },
  "/docs/first-action": { kicker: "Documentation", figure: [".site-sheet"] },
  "/docs/examples": { kicker: "Documentation", figure: ["section.site-section .min-w-0 > div.grid"] },
  "/docs/icons": { kicker: "Documentation", figure: [".site-icons-grid"] },
  // The page shows the button that opens it; the card shows the dialog.
  "/docs/confirm-dialog": { open: "#preview button", figure: ["[role='alertdialog']", "[role='dialog']"] },
};
/** A component page: its live preview, without the "The person sees" label. */
const COMPONENT_FIGURE = ["#preview .doc-sheet", "#preview"];

/** Every prerendered page, as its route. */
function routes(dir = dist, base = "") {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return ["assets", "fonts", "og", "skills"].includes(name) ? [] : routes(path, `${base}/${name}`);
    if (!name.endsWith(".html") || name === "index.html") return [];
    return [`${base}/${name.slice(0, -5)}`];
  });
}

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".md": "text/markdown",
};
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const candidates = [join(dist, path), join(dist, `${path}.html`), join(dist, path, "index.html")];
  const file = candidates.find((c) => c.startsWith(dist) && existsSync(c) && statSync(c).isFile());
  if (!file) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

// The card is set as content on a blank page, which cannot read file URLs:
// the fonts go in as data.
const template = readFileSync(join(here, "card.html"), "utf8").replace(
  /url\("\.\.\/\.\.\/public\/fonts\/([^"]+)"\)/g,
  (_, name) => `url("data:font/woff2;base64,${readFileSync(join(www, "public/fonts", name)).toString("base64")}")`,
);
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const only = process.argv.slice(2).map((r) => `/${r.replace(/^\/|\.jpg$/g, "")}`);
const all = routes().filter((r) => !only.length || only.includes(r));

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
  locale: "en-US",
  colorScheme: "light",
  reducedMotion: "reduce",
});
const page = await context.newPage();
const card = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });

// Kept outside public/: the build reads it, the site does not serve it.
const manifestFile = join(here, "cards.json");
const manifest = only.length && existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) : {};
let withFigure = 0;
for (const route of all) {
  await page.goto(origin + route, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  // No caret, focus ring or toast in the picture.
  await page.addStyleTag({
    content:
      "*{caret-color:transparent!important}[data-sonner-toaster],[data-slot='toast-region']{display:none!important}",
  });
  const own = PAGES[route] ?? {};
  const found = await page.evaluate(() => ({
    kicker: document.querySelector("main .site-kicker")?.textContent?.trim() ?? "",
    title: document.querySelector("main h1")?.textContent?.trim() ?? document.title.replace(/ · Booki$/, ""),
    page: document.title,
  }));
  const kicker = own.kicker ?? (found.kicker || (route.startsWith("/docs") ? "Documentation" : ""));
  const title = own.title ?? found.title;

  // A page with no picture of its own borrows one: the docs overview shows a component.
  if (own.from) await page.goto(origin + own.from, { waitUntil: "networkidle" });
  if (own.open) {
    await page.locator(own.open).first().click();
    await page.waitForTimeout(400);
  }
  let figure = null;
  for (const selector of own.figure ?? COMPONENT_FIGURE) {
    const el = page.locator(selector).first();
    if (!(await el.count()) || !(await el.isVisible())) continue;
    await el.scrollIntoViewIfNeeded();
    // Lazy previews arrive after the page settles: wait until the element
    // stops changing for half a second (at most five).
    await el.evaluate(
      (node) =>
        new Promise((done) => {
          let last = "";
          let still = 0;
          const tick = setInterval(() => {
            const now = `${node.innerHTML.length}:${node.getBoundingClientRect().height}`;
            still = now === last && !node.querySelector("[aria-busy='true']") ? still + 1 : 0;
            last = now;
            if (still >= 5) done(clearInterval(tick));
          }, 100);
          setTimeout(() => done(clearInterval(tick)), 5000);
        }),
    );
    // A preview keeps room around its control; the picture is what is drawn
    // in it: the box around its text, fields and graphics, with a margin,
    // inside the element, from its top to at most a screenful down.
    const measure = (node) => {
      const inside = node.getBoundingClientRect();
      const boxes = [...node.querySelectorAll("*")]
        .filter((child) => {
          const box = child.getBoundingClientRect();
          if (!box.width || !box.height || getComputedStyle(child).visibility === "hidden") return false;
          if (child.matches("input, select, textarea, button, svg, img, canvas, table, hr")) return true;
          return [...child.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        })
        .map((child) => child.getBoundingClientRect());
      if (!boxes.length) return null;
      const top = Math.max(inside.top, Math.min(...boxes.map((b) => b.top)) - 24);
      const left = Math.max(inside.left, Math.min(...boxes.map((b) => b.left)) - 24);
      const right = Math.min(inside.right, Math.max(...boxes.map((b) => b.right)) + 24);
      const bottom = Math.min(inside.bottom, Math.max(...boxes.map((b) => b.bottom)) + 24);
      return { x: left, y: top, width: right - left, height: Math.min(bottom, window.innerHeight) - top };
    };
    // Nothing pinned to the window (the site header, the agent cursor) over the picture.
    await el.evaluate((node) => {
      for (const other of document.querySelectorAll("body *")) {
        if (node.contains(other) || other.contains(node)) continue;
        if (/fixed|sticky/.test(getComputedStyle(other).position)) other.style.visibility = "hidden";
      }
    });
    const first = await el.evaluate(measure);
    if (first) await page.evaluate((y) => window.scrollBy(0, y - 40), first.y);
    const clip = first ? await el.evaluate(measure) : null;
    figure = (await page.screenshot({ type: "png", animations: "disabled", ...(clip ? { clip } : {}) })).toString(
      "base64",
    );
    if (!clip) figure = (await el.screenshot({ type: "png", animations: "disabled" })).toString("base64");
    break;
  }
  if (figure) withFigure++;

  const html = template
    .replace("{{kicker}}", escape(kicker))
    .replace("{{title}}", escape(title))
    .replace("{{layout}}", figure ? "figure" : "text")
    .replace("{{fit}}", own.fit ?? "scale")
    .replace("{{figure}}", figure ? `<img src="data:image/png;base64,${figure}" alt="" />` : "");
  await card.setContent(html, { waitUntil: "load" });
  await card.evaluate(() => document.fonts.ready);
  // Long titles step down until they fit three lines.
  await card.evaluate(() => {
    const h1 = document.querySelector("h1");
    let size = parseFloat(getComputedStyle(h1).fontSize);
    const lines = () => Math.round(h1.getBoundingClientRect().height / parseFloat(getComputedStyle(h1).lineHeight));
    while (lines() > 3 && size > 36) h1.style.fontSize = `${(size -= 2)}px`;
  });
  const file = join(out, `${route.slice(1)}.jpg`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, await card.screenshot({ type: "jpeg", quality: 86 }));
  // The page title the card was made for: the build refuses a page whose
  // title has moved on, or that has no card.
  manifest[route] = {
    page: found.page,
    alt: `Booki · ${kicker ? `${kicker}: ` : ""}${title}${figure ? ", beside a picture of the page" : ""}`,
  };
  console.log(`${figure ? "◼" : "·"} ${relative(process.cwd(), file)}  ${title}`);
}

const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(manifestFile, `${JSON.stringify(sorted, null, 2)}\n`);
await browser.close();
server.close();
console.log(`${all.length} cards, ${withFigure} with a picture of the page.`);
