#!/usr/bin/env node
/**
 * Writes every page a visitor can land on as HTML into dist, so a reader
 * without JavaScript (an agent fetching the page, a search engine, a link
 * preview) gets the content and not an empty root. Then, from that HTML, a
 * Markdown copy of each page (`/docs/kpi-stat.md`) and `/llms.txt`, the index
 * a model reads first. In the browser, main.tsx renders the same pages again,
 * with the agent bridge.
 *
 * The components were written for a browser, so the render runs with a
 * browser-like global (jsdom): English, light, no stored choices.
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import Beasties from "beasties";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

/**
 * The CSS a page needs to draw its first screen goes inline in its <head>; the
 * stylesheet itself loads without blocking. The Night theme is switched on by
 * a script, so its rules are kept whatever the static page shows.
 */
const critical = new Beasties({
  path: join(dirname(fileURLToPath(import.meta.url)), "..", "dist"),
  publicPath: "/",
  preload: "media",
  // Beasties does not see fonts named through CSS variables; withFonts inlines the @font-face rules instead.
  inlineFonts: false,
  pruneSource: false,
  allowRules: [/data-bk-theme/, /prefers-color-scheme/],
  logLevel: "warn",
});

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "../dist");

/**
 * The stylesheet's @font-face rules, inline in the head. Without them the first
 * paint is in a system font and the hero title paints again in Geist when the
 * stylesheet arrives: a second, later largest paint.
 */
const fontFaces = readdirSync(join(dist, "assets"))
  .filter((name) => name.endsWith(".css"))
  .flatMap((name) => readFileSync(join(dist, "assets", name), "utf8").match(/@font-face\{[^}]*\}/g) ?? []);
const withFonts = (html) =>
  fontFaces.length ? html.replace("</head>", `<style>${fontFaces.join("")}</style></head>`) : html;
const site = "https://booki.dev";

const dom = new JSDOM("<!doctype html><html lang='en'><body></body></html>", { url: `${site}/` });
const globals = {
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  localStorage: dom.window.localStorage,
  sessionStorage: dom.window.sessionStorage,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  requestAnimationFrame: (callback) => setTimeout(() => callback(Date.now()), 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
};
for (const [name, value] of Object.entries(globals)) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}
dom.window.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
});
for (const name of ["ResizeObserver", "IntersectionObserver", "MutationObserver"]) {
  globalThis[name] ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
  dom.window[name] ??= globalThis[name];
}

/** The first h1 and the paragraph after it, for a page with no meta of its own. */
function firstHeading(body) {
  const doc = new JSDOM(`<!doctype html><body>${body}</body>`).window.document;
  const h1 = doc.querySelector("main h1") ?? doc.querySelector("h1");
  if (!h1) return null;
  const clean = (text) => (text ?? "").replace(/\s+/g, " ").trim();
  // The paragraphs after the heading, until there is enough for a search result's snippet.
  let description = "";
  for (let next = h1.nextElementSibling; next && description.length < 110; next = next.nextElementSibling) {
    if (next.tagName === "P") description = clean(`${description} ${next.textContent}`);
  }
  // What a reader hears: text marked aria-hidden (the hero title's turning word) is a copy for the eye.
  const heard = h1.cloneNode(true);
  for (const hidden of heard.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return { title: clean(heard.textContent), description };
}

/** At most 160 characters, what a search result shows: whole sentences when they fit, else whole words. */
function snippet(text) {
  if (text.length <= 160) return text;
  const sentences = text.slice(0, 160).match(/^.*[.!?](?=\s|$)/)?.[0];
  if (sentences && sentences.length >= 90) return sentences;
  return `${text.slice(0, 157).replace(/\s+\S*$/, "")}…`;
}

/**
 * Structured data for search engines and answer engines: the site and the
 * library on the front page, with its questions; an article and its place
 * in the docs elsewhere. Only what the page shows.
 */
function structuredData(url, { title, description, body }) {
  const doc = new JSDOM(`<!doctype html><body>${body}</body>`).window.document;
  const clean = (text) => (text ?? "").replace(/\s+/g, " ").trim();
  const publisher = { "@type": "Organization", name: "Booki", url: `${site}/` };
  const graph = [];
  if (url === "/") {
    graph.push(
      { "@type": "WebSite", name: "Booki", url: `${site}/`, description, publisher },
      {
        "@type": "SoftwareSourceCode",
        name: "Booki",
        description,
        url: `${site}/`,
        codeRepository: "https://github.com/Walgermo/booki",
        programmingLanguage: ["TypeScript", "React"],
        license: "https://opensource.org/licenses/MIT",
      },
    );
    const faq = [...doc.querySelectorAll(".site-faq__item")]
      .map((item) => ({
        q: clean(item.querySelector("[data-slot='collapsible-trigger']")?.textContent),
        a: clean(item.querySelector(".site-faq__answer")?.textContent),
      }))
      .filter((item) => item.q && item.a);
    if (faq.length) {
      graph.push({
        "@type": "FAQPage",
        mainEntity: faq.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      });
    }
  } else {
    const published = doc.querySelector("time[datetime]")?.getAttribute("datetime");
    graph.push({
      "@type": url.startsWith("/docs") ? "TechArticle" : published ? "BlogPosting" : "WebPage",
      headline: title.replace(/ · Booki$/, ""),
      description,
      url: `${site}${url}`,
      ...(published ? { datePublished: published } : {}),
      inLanguage: "en",
      image: `${site}/og.png`,
      author: publisher,
      publisher,
    });
    if (url.startsWith("/docs/")) {
      graph.push({
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Docs", item: `${site}/docs` },
          { "@type": "ListItem", position: 2, name: title.replace(/ · Booki$/, ""), item: `${site}${url}` },
        ],
      });
    }
  }
  const json = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}

const escapeAttr = (text) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** The page's own title, description, address and Markdown copy in the head. */
function withMeta(template, { url, title, description, markdownPath }) {
  const set = (html, pattern, value) => {
    if (!pattern.test(html)) throw new Error(`index.html has no ${pattern}`);
    return html.replace(pattern, value);
  };
  let html = template;
  html = set(html, /<title>[^<]*<\/title>/, `<title>${escapeAttr(title)}</title>`);
  html = set(html, /(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${escapeAttr(description)}$2`);
  html = set(html, /(<meta property="og:title" content=")[^"]*(")/, `$1${escapeAttr(title)}$2`);
  html = set(html, /(<meta\s+property="og:description"\s+content=")[^"]*(")/, `$1${escapeAttr(description)}$2`);
  html = set(html, /(<meta property="og:url" content=")[^"]*(")/, `$1${site}${url}$2`);
  html = set(html, /(<meta\s+name="twitter:title"\s+content=")[^"]*(")/, `$1${escapeAttr(title)}$2`);
  html = set(html, /(<meta\s+name="twitter:description"\s+content=")[^"]*(")/, `$1${escapeAttr(description)}$2`);
  return html.replace(
    "</head>",
    `    <link rel="canonical" href="${site}${url}" />\n    <link rel="alternate" type="text/markdown" href="${markdownPath}" />\n  </head>`,
  );
}

/**
 * The page as Markdown: what a model reads without parsing HTML. Headings,
 * paragraphs, lists, tables, code and links; navigation, icons and anything
 * hidden from people are left out.
 */
function toMarkdown(body, { url, title, description }) {
  const doc = new JSDOM(`<!doctype html><body>${body}</body>`).window.document;
  const root = doc.querySelector("main") ?? doc.body;
  // A collapsed section (the FAQ, code behind a disclosure) is content a person opens with
  // one click: its title becomes a line of bold text and its panel stays, before buttons
  // and hidden elements are dropped below.
  for (const section of root.querySelectorAll('[data-slot="collapsible"]')) {
    const trigger = section.querySelector(':scope > [data-slot="collapsible-trigger"]');
    const panel = section.querySelector(':scope > [data-slot="collapsible-panel"]');
    if (!trigger || !panel) continue;
    const name = (trigger.querySelector("span") ?? trigger).textContent.replace(/\s+/g, " ").trim();
    const title = doc.createElement("p");
    if (name) title.append(Object.assign(doc.createElement("strong"), { textContent: name }));
    trigger.replaceWith(title);
    panel.removeAttribute("hidden");
  }
  for (const el of root.querySelectorAll(
    "nav, header, footer, svg, script, style, [aria-hidden='true'], [hidden], [data-markdown-hidden], button",
  )) {
    el.remove();
  }
  const inline = (node) => {
    if (node.nodeType === 3) return node.textContent.replace(/\s+/g, " ");
    if (node.nodeType !== 1) return "";
    const tag = node.tagName.toLowerCase();
    const inner = [...node.childNodes].map(inline).join("");
    if (tag === "code") return `\`${node.textContent}\``;
    if (tag === "strong" || tag === "b") return inner.trim() ? `**${inner.trim()}**` : "";
    if (tag === "em" || tag === "i") return inner.trim() ? `*${inner.trim()}*` : "";
    if (tag === "br") return "\n";
    if (tag === "a") {
      const href = node.getAttribute("href") ?? "";
      const target = href.startsWith("/") ? `${site}${href}` : href;
      return inner.trim() && target ? `[${inner.trim()}](${target})` : inner;
    }
    return inner;
  };
  const blocks = [];
  const walk = (node) => {
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    const text = () =>
      inline(node)
        .replace(/[ \t]+/g, " ")
        .trim();
    if (/^h[1-6]$/.test(tag)) return void (text() && blocks.push(`${"#".repeat(Number(tag[1]))} ${text()}`));
    if (tag === "p" || tag === "figcaption" || tag === "dt" || tag === "dd" || tag === "caption") {
      return void (text() && blocks.push(text()));
    }
    if (tag === "pre")
      return void blocks.push(`\`\`\`${node.dataset.language ?? ""}\n${node.textContent.trim()}\n\`\`\``);
    if (tag === "ul" || tag === "ol") {
      const items = [...node.children].filter((li) => li.tagName === "LI");
      const lines = items.map(
        (li, i) => `${tag === "ol" ? `${i + 1}.` : "-"} ${inline(li).replace(/\s+/g, " ").trim()}`,
      );
      return void (lines.length && blocks.push(lines.join("\n")));
    }
    if (tag === "table") {
      const rows = [...node.querySelectorAll("tr")].map((tr) =>
        [...tr.children].map((cell) => inline(cell).replace(/\s+/g, " ").replace(/\|/g, "\\|").trim()),
      );
      if (!rows.length) return;
      const width = Math.max(...rows.map((row) => row.length));
      const line = (row) => `| ${[...row, ...Array(width - row.length).fill("")].join(" | ")} |`;
      return void blocks.push([line(rows[0]), `|${" --- |".repeat(width)}`, ...rows.slice(1).map(line)].join("\n"));
    }
    // A div that holds only text is a paragraph too (the Money preview's amounts).
    if (tag === "div" && node.children.length === 0) {
      return void (text() && blocks.push(text()));
    }
    for (const child of node.children) walk(child);
  };
  walk(root);
  const content = blocks.filter((block, i) => block !== blocks[i - 1]).join("\n\n");
  return `# ${title}\n\n> ${description}\n\nSource: ${site}${url}\n\n${content}\n`;
}

/** The index a model reads first: what Booki is, and every page as Markdown. */
function llmsTxt(pages) {
  const link = (page) => `- [${page.title}](${site}${page.markdownPath}): ${page.description}`;
  const docs = pages.filter((page) => page.url.startsWith("/docs/"));
  const rest = pages.filter((page) => !page.url.startsWith("/docs/"));
  return [
    "# Booki",
    "",
    "> Open-source UI components for people and AI agents working in the same app. Agents operate named controls under the app's rules, with human approval where required. Before 1.0, on npm as @booki-aui/*.",
    "",
    "Every page here is also Markdown: add .md to its address. The agent bridge on each page (window.agent, and WebMCP where the browser has it) gives snapshot, query and act.",
    "",
    "## Start",
    "",
    ...rest.map(link),
    "",
    "## Controls and guides",
    "",
    ...docs.map(link),
    "",
    "## For coding agents",
    "",
    `- [Setup prompt](${site}/prompt.md): the prompt the homepage copies, for your coding agent to try Booki on one screen and ask before it changes anything`,
    `- [Whole-app prompt](${site}/prompt-full.md): for your coding agent to adapt every workflow in your app; takes hours`,
    `- [Booki skill](${site}/skills/booki/SKILL.md): how to install and wire Booki in an app`,
    "- [Control catalogue](https://raw.githubusercontent.com/Walgermo/booki/main/packages/react/docs/llms.txt): every control and its agent actions",
    "- [Agent Contract](https://raw.githubusercontent.com/Walgermo/booki/main/spec/agent-contract.md): the draft specification (one implementation so far)",
    "",
  ].join("\n");
}

const { render, AGENT_PROMPT, AGENT_PROMPT_FULL } = await import(
  pathToFileURL(join(here, "../dist-server/entry-server.js")).href
);
const template = readFileSync(join(dist, "index.html"), "utf8");
const urls = [...readFileSync(join(here, "../public/sitemap.xml"), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
  m[1].replace(site, ""),
);

const failures = [];
const pages = [];
for (const url of urls) {
  const errors = [];
  const origError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(" ").slice(0, 300));
  let body = "";
  let meta = null;
  try {
    ({ html: body, meta } = await render(url));
  } catch (error) {
    errors.push(String(error));
  } finally {
    console.error = origError;
  }
  const text = body
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (errors.length || text.length < 200)
    failures.push(`${url}: ${errors[0] ?? `only ${text.length} characters of text`}`);
  // Agent-first: everything a person can press or type in is a control the bridge sees.
  // A ui-sdk or Booki part carries data-slot; a bare element does not. The one
  // exception is marked data-plain-html: the landing page's plain-HTML comparison.
  const page = new JSDOM(`<!doctype html><body>${body}</body>`).window.document;
  const bare = [...page.querySelectorAll("button, input, select, textarea")].filter(
    (el) =>
      el.getAttribute("type") !== "hidden" &&
      !el.closest("[data-slot]") &&
      !el.closest("[data-plain-html]") &&
      !el.closest("[data-agent-hidden]"),
  );
  for (const el of bare) {
    failures.push(
      `${url}: a <${el.tagName.toLowerCase()}> the agent bridge cannot see: "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 60)}"`,
    );
  }
  // A page with no meta of its own: its first heading and paragraph, not the site's.
  const own = meta && meta.title.en !== template.match(/<title>([^<]*)<\/title>/)?.[1];
  const fallback = own ? null : firstHeading(body);
  const title = own ? meta.title.en : fallback?.title ? `${fallback.title} · Booki` : "Booki";
  const description = own ? meta.description.en : (fallback?.description ?? meta?.description.en ?? "");
  const markdownPath = url === "/" ? "/index.md" : `${url}.md`;
  const html = withMeta(template, { url, title, description: snippet(description), markdownPath })
    .replace("</head>", `    ${structuredData(url, { title, description: snippet(description), body })}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`);
  const file = url === "/" ? "index.html" : `${url.slice(1)}.html`;
  mkdirSync(dirname(join(dist, file)), { recursive: true });
  writeFileSync(join(dist, file), withFonts(await critical.process(html)));
  const markdown = toMarkdown(body, { url, title, description });
  writeFileSync(join(dist, markdownPath.slice(1)), markdown);
  pages.push({ url, title, description, markdownPath, words: markdown.split(/\s+/).length });
  // What the Markdown must not lose: a collapsed FAQ answer, the US controls on an English
  // docs page, and the Money preview's amounts.
  const expected = {
    "/": ["**What is Booki?**", "Ready-made controls for accounting screens"],
    "/docs/bank-account-input": ["routing"],
    "/docs/money": ["$125.00"],
  }[url];
  for (const text of expected ?? []) {
    if (!markdown.includes(text)) failures.push(`${markdownPath}: the Markdown has no "${text}"`);
  }
}
if (failures.length) {
  console.error(`prerender: ${failures.length} page(s) did not render whole:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
writeFileSync(join(dist, "prompt.md"), `${AGENT_PROMPT.trim()}\n`);
writeFileSync(join(dist, "prompt-full.md"), `${AGENT_PROMPT_FULL.trim()}\n`);
// The skill the setup prompt links to, from skills/booki: one copy, so the site never serves an old one.
mkdirSync(join(dist, "skills", "booki"), { recursive: true });
copyFileSync(join(here, "../../../skills/booki/SKILL.md"), join(dist, "skills", "booki", "SKILL.md"));
writeFileSync(join(dist, "llms.txt"), llmsTxt(pages));
console.log(`prerender: ${pages.length} pages, each as HTML and Markdown, and llms.txt`);
