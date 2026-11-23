import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium, type Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inPage } from "../src/page.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const fixture = (name: string) => pathToFileURL(path.join(root, "test", "fixtures", `${name}.html`)).href;

function newest(dir: string): number {
  return Math.max(
    0,
    ...readdirSync(dir).map((entry) => {
      const full = path.join(dir, entry);
      const stat = statSync(full);
      return stat.isDirectory() ? newest(full) : stat.mtimeMs;
    }),
  );
}

/** Builds dist with the package's own tsup config when it is missing or older than the source. */
function ensureBuilt() {
  const index = path.join(dist, "index.js");
  const sources = Math.max(newest(path.join(root, "src")), statSync(path.join(root, "tsup.config.ts")).mtimeMs);
  if (existsSync(index) && statSync(index).mtimeMs >= sources) return;
  execFileSync(path.join(root, "node_modules", ".bin", "tsup"), { cwd: root, stdio: "ignore" });
}

let browser: Browser;
beforeAll(async () => {
  ensureBuilt();
  browser = await chromium.launch({ channel: "chrome" });
}, 120_000);
afterAll(async () => {
  await browser?.close();
});

describe("the published build in a page of the caller's", () => {
  it("has no __name helper calls in what it ships", () => {
    for (const file of readdirSync(dist).filter((f) => f.endsWith(".js"))) {
      expect(readFileSync(path.join(dist, file), "utf8"), file).not.toMatch(/__name\(/);
    }
  });

  it("check(page) runs in a plain page that defines no __name", async () => {
    const { check } = (await import(
      pathToFileURL(path.join(dist, "index.js")).href
    )) as typeof import("../src/index.js");
    // A page of the caller's: no init script of the tool's, so nothing defines __name.
    const page = await browser.newPage();
    try {
      await page.goto(fixture("fields"));
      expect(await page.evaluate("typeof globalThis.__name")).toBe("undefined");
      const report = await check(page);
      expect(report.findings.filter((f) => f.rule === "field-unnamed")).toHaveLength(3);
      expect(
        report.findings.find((f) => f.rule === "field-unnamed" && f.element?.role === "textbox")?.element,
      ).toMatchObject({ context: "Beløp (NOK)" });
      expect(await page.evaluate("typeof globalThis.__name")).toBe("undefined");
    } finally {
      await page.close();
    }
  });

  it("inPage gives a function compiled with keepNames its own __name", async () => {
    // What esbuild with keepNames makes of an inner arrow function.
    const compiled = new Function(
      'return function probe(el) { const label = __name(() => el.tagName.toLowerCase(), "label"); return label(); }',
    )() as (el: Element) => string;
    const page = await browser.newPage();
    try {
      await page.setContent("<main></main>");
      await expect(page.locator("main").evaluate(compiled)).rejects.toThrow(/__name/);
      expect(await page.locator("main").evaluate(inPage(compiled))).toBe("main");
    } finally {
      await page.close();
    }
  });
});
