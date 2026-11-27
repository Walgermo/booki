import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const locale = "nb-NO";
const viewport = { width: 1440, height: 900 };
const browser = await chromium.launch({ channel: "chrome" });
const output = new URL("../../apps/www/src/data/public-documents.json", import.meta.url);

// DOM child positions distinguish repeated controls with the same accessible name.
function nodeKey(element) {
  const segments = [];
  while (element !== document.body && element?.parentElement) {
    segments.push(Array.prototype.indexOf.call(element.parentElement.children, element));
    element = element.parentElement;
  }
  return ["body", ...segments.reverse()].join(".");
}

function findNode(node, key) {
  if (node.key === key) return node;
  for (const child of node.children || []) {
    if (typeof child === "string") continue;
    const match = findNode(child, key);
    if (match) return match;
  }
}

async function addAccessibilityNames(session, scene) {
  const [{ root }, { nodes }] = await Promise.all([
    session.send("DOM.getDocument", { depth: -1 }),
    session.send("Accessibility.getFullAXTree"),
  ]);
  const byId = new Map(
    nodes.flatMap((node) => {
      const name = node.name?.value;
      return node.backendDOMNodeId && name && !node.ignored ? [[node.backendDOMNodeId, name]] : [];
    }),
  );
  const html = (root.children || []).find((node) => node.localName === "html");
  const body = (html?.children || []).find((node) => node.localName === "body");
  function indexDom(element, key, byKey) {
    if (!element) return;
    const name = byId.get(element.backendNodeId);
    if (name) byKey.set(key, name);
    (element.children || [])
      .filter((child) => child.nodeType === 1)
      .forEach((child, index) => indexDom(child, key + "." + index, byKey));
  }
  const byKey = new Map();
  indexDom(body, "body", byKey);
  scene.coverage.accessibilityNames = 0;
  function applyNames(node) {
    const name = byKey.get(node.key);
    if (name) {
      node.name = name;
      scene.coverage.accessibilityNames++;
    }
    for (const child of node.children || []) {
      if (typeof child !== "string") applyNames(child);
    }
  }
  applyNames(scene.tree);
}

async function capture(page, session) {
  const scene = await page.evaluate(() => {
    const coverage = {
      sourceElements: 0,
      capturedElements: 0,
      hiddenElements: 0,
      textNodes: 0,
      ignoredElements: {},
      ignoredTextNodes: 0,
      embeddedDocuments: [],
      strippedAttributes: {},
    };
    const url = new URL(location.href);
    // Preserve the semantic document while keeping website code and vector artwork inert.
    const ignored = new Set(["script", "style", "svg", "noscript", "link", "meta"]);
    const attribute =
      /^(?:id|href|src|srcset|(?:[a-z]+-)?role|name|type|title|alt|label|for|headers|scope|colspan|rowspan|start|reversed|open|hidden|disabled|readonly|checked|selected|multiple|required|placeholder|autocomplete|inputmode|min|max|step|value|datetime|lang|dir|tabindex|inert|aria-[a-z-]+)$/;
    const safeUrl = (value) => {
      if (value.startsWith("#")) return value;
      try {
        const parsed = new URL(value, url);
        if (!["https:", "http:", "mailto:", "tel:"].includes(parsed.protocol)) return null;
        if (parsed.protocol === "https:" || parsed.protocol === "http:") {
          for (const key of new Set(parsed.searchParams.keys())) {
            if (/^(?:utm_|pk_|mc_|fbclid|gclid|msclkid|dclid|_ga)/i.test(key)) parsed.searchParams.delete(key);
          }
          if (parsed.username || parsed.password) return null;
        }
        return parsed.href;
      } catch {
        return null;
      }
    };
    const cleanText = (value) => value.replace(/\s+/g, " ");
    function skip(node, reason) {
      coverage.sourceElements++;
      coverage.ignoredElements[reason] = (coverage.ignoredElements[reason] ?? 0) + 1;
      for (const child of node.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE) skip(child, reason);
        if (child.nodeType === Node.TEXT_NODE && child.data.trim()) coverage.ignoredTextNodes++;
      }
    }
    function walk(element, key, inheritedHidden) {
      const tag = element.localName;
      if (ignored.has(tag)) {
        skip(element, tag);
        return null;
      }
      coverage.sourceElements++;
      coverage.capturedElements++;
      const style = getComputedStyle(element);
      const closedDetailsChild =
        element.parentElement?.matches("details:not([open])") &&
        element !== element.parentElement.querySelector(":scope > summary");
      const hidden =
        inheritedHidden ||
        closedDetailsChild ||
        element.hidden === true ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        tag === "template" ||
        element.getAttribute("aria-hidden") === "true";
      if (hidden) coverage.hiddenElements++;
      const node = { tag, key };
      const attrs = {};
      for (const { name, value } of element.attributes) {
        if (!attribute.test(name)) {
          coverage.strippedAttributes[name] = (coverage.strippedAttributes[name] ?? 0) + 1;
        } else if (name === "href" || name === "src") {
          const cleaned = safeUrl(value);
          if (cleaned) attrs[name] = cleaned;
        } else if (name !== "srcset" && (name !== "value" || element.matches("option, button, meter, progress"))) {
          attrs[name] = value;
        }
      }
      if (Object.keys(attrs).length) node.attrs = attrs;
      if (hidden) node.hidden = true;
      if (tag === "iframe" || tag === "object" || tag === "embed") {
        const source = attrs.src || safeUrl(element.getAttribute("data") || "");
        const origin = source && new URL(source, url).origin;
        const embedded = { key, tag, ...(source ? { source } : {}), crossOrigin: !!origin && origin !== url.origin };
        if (tag === "iframe" && element.contentDocument?.body) {
          embedded.accessible = true;
          node.children = [walk(element.contentDocument.body, key + ".frame", hidden)];
        } else {
          embedded.accessible = false;
        }
        coverage.embeddedDocuments.push(embedded);
        return node;
      }
      const names = [];
      for (const id of (attrs["aria-labelledby"] || "").split(/\s+/)) {
        const ref = id && element.ownerDocument.getElementById(id);
        if (ref) names.push(ref.textContent.trim());
      }
      const isNamed =
        /^(?:a|button|input|textarea|select|fieldset|legend|summary|img|h[1-6]|nav|main|section|form|table|th|option)$/.test(
          tag,
        ) || attrs.role;
      if (isNamed || names.length || attrs["aria-label"]) {
        const label = cleanText(
          names.join(" ") ||
            attrs["aria-label"] ||
            [...(element.labels || [])].map((entry) => entry.textContent).join(" ") ||
            attrs.alt ||
            (element.matches("input,textarea,select,img,nav,main,section,form,table") ? "" : element.textContent) ||
            attrs.title ||
            "",
        ).trim();
        if (label) node.name = label;
      }
      const children = [];
      let index = 0;
      const container = tag === "template" ? element.content : element;
      for (const child of container.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const collected = walk(child, key + "." + index++, hidden);
          if (collected) children.push(collected);
        } else if (child.nodeType === Node.TEXT_NODE && child.data) {
          if (child.data.trim()) coverage.textNodes++;
          children.push(cleanText(child.data));
        }
      }
      if (children.length) node.children = children;
      return node;
    }

    const tree = walk(document.body, "body", false);
    coverage.renderedTextChars = document.body.innerText.length;
    return { url: location.href, title: document.title, lang: document.documentElement.lang, tree, coverage };
  });
  await addAccessibilityNames(session, scene);
  console.error("Captured", scene.url, scene.coverage.capturedElements, "of", scene.coverage.sourceElements);
  return scene;
}

async function run(home, visit) {
  const context = await browser.newContext({ locale, viewport });
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  page.setDefaultTimeout(30000);
  const scenes = {};
  const transitions = [];
  try {
    await page.goto(home, { waitUntil: "domcontentloaded" });
    const scene = async (name) => {
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      scenes[name] = await capture(page, session);
    };
    const move = async (from, to, locator, enter = false) => {
      const key = await locator.evaluate(nodeKey);
      const recorded = findNode(scenes[from].tree, key);
      assert.ok(recorded && !recorded.hidden, `Missing visible transition ${from} → ${to}: ${key}`);
      transitions.push({ from, to, key });
      if (enter) await locator.press("Enter");
      else await locator.click();
    };
    await visit({ page, scene, move });
    return { scenes, transitions };
  } finally {
    await context.close();
  }
}

try {
  const [nav, posten, brreg] = await Promise.allSettled([
    run("https://www.nav.no/", async ({ page, scene, move }) => {
      const decline = page.getByRole("button", { name: "Nei", exact: true });
      await decline.waitFor({ state: "visible" });
      await scene("homeConsent");
      await move("homeConsent", "home", decline);
      await decline.waitFor({ state: "hidden" });
      await scene("home");
      const guidance = page.getByRole("main").getByRole("link", { name: /Saksbehandlingstider/ });
      await move("home", "guidance", guidance);
      await page.getByRole("heading", { level: 1, name: "Saksbehandlingstider" }).waitFor();
      const card = page.getByRole("region", { name: "Dagpenger", exact: true });
      await card.getByRole("button", { name: "Vis mer", exact: true }).waitFor();
      await scene("guidance");
      await move("guidance", "guidanceExpanded", card.getByRole("button", { name: "Vis mer", exact: true }));
      await card.getByRole("cell", { name: "6 uker", exact: true }).first().waitFor();
      await card.getByRole("cell", { name: "4 måneder", exact: true }).first().waitFor();
      await scene("guidanceExpanded");
    }),
    run("https://www.posten.no/", async ({ page, scene, move }) => {
      const decline = page.getByRole("button", { name: "Avvis alle", exact: true });
      await decline.waitFor({ state: "visible" });
      await scene("homeConsent");
      await move("homeConsent", "home", decline);
      await decline.waitFor({ state: "hidden" });
      await scene("home");
      const guidance = page.getByRole("main").getByRole("link", { name: "Se julens sendefrister", exact: true });
      await move("home", "guidance", guidance);
      await page.getByRole("heading", { level: 1, name: "Sendefrister for julepost 2026" }).waitFor();
      await page
        .getByText(/Norgespakke(?:™)? liten/i)
        .first()
        .waitFor({ state: "attached" });
      await scene("guidance");
    }),
    run("https://www.brreg.no/", async ({ page, scene, move }) => {
      const guidance = page.locator('a[href$="/innsending-av-arsregnskap/"]').first();
      await guidance.waitFor();
      await scene("home");
      await move("home", "guidance", guidance, true);
      await page.getByRole("heading", { level: 1, name: "Innsending av årsregnskap" }).waitFor();
      await page
        .getByRole("main")
        .getByRole("link", { name: /^Forsinkelsesgebyr/ })
        .waitFor();
      await scene("guidance");
    }),
  ]);
  const observedOn = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(new Date());
  const failures = [nav, posten, brreg].filter((run) => run.status === "rejected");
  if (failures.length)
    throw new AggregateError(
      failures.map((run) => run.reason),
      "Incomplete capture",
    );
  await writeFile(
    output,
    JSON.stringify({
      version: 1,
      observedOn,
      browser: `Google Chrome ${browser.version()}`,
      viewport,
      locale,
      routes: { nav: nav.value, posten: posten.value, brreg: brreg.value },
    }) + "\n",
  );
} finally {
  await browser.close();
}
