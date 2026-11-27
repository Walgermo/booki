// Run against the built preview, or pass the deployed origin as the first argument.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:4173";
const browser = await chromium.launch({ channel: "chrome" });
try {
  const context = await browser.newContext({
    baseURL: base,
    locale: "en-US",
    permissions: ["clipboard-read", "clipboard-write"],
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto("/docs");
  async function verify(pathname) {
    await page.waitForFunction(() => window.agent?.snapshot().some((control) => control.label === "Copy for LLM"));
    const markdown = await (await context.request.get(`${pathname}.md`)).text();
    assert.ok(markdown.includes(`Source: https://booki.dev${pathname}\n`));
    assert.ok(!markdown.includes("Copy for LLM"));
    await page.getByRole("button", { name: "Copy for LLM" }).click();
    await page.getByText("Markdown copied", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), markdown);
    return markdown;
  }
  await verify("/docs");
  await page.getByRole("link", { name: "Try your first agent action" }).click();
  assert.match(await verify("/docs/first-action"), /```[\s\S]+?```/);

  const more = page.getByLabel("More page actions", { exact: true });
  await more.focus();
  await page.keyboard.press("Enter");
  const raw = page.getByRole("link", { name: "View as Markdown" });
  await page.keyboard.press("Tab");
  assert.equal(await raw.evaluate((el) => el === document.activeElement), true);
  assert.equal(await raw.getAttribute("href"), "/docs/first-action.md");
  const chat = await page.getByRole("link", { name: "Ask ChatGPT about this page" }).getAttribute("href");
  assert.match(new URL(chat).searchParams.get("q"), /https:\/\/booki\.dev\/docs\/first-action\.md/);
  await page.keyboard.press("Escape");
  assert.equal(await more.evaluate((el) => el === document.activeElement), true);
  assert.equal(await raw.isVisible(), false);

  await page.route("**/docs/first-action.md", (route) =>
    route.fulfill({ contentType: "text/html", body: "<html>Fallback</html>" }),
  );
  await page.getByRole("button", { name: "Copy for LLM" }).click();
  await page.getByText("Couldn’t copy.", { exact: false }).waitFor();
  assert.ok((await page.evaluate(() => navigator.clipboard.readText())).startsWith("# Your first agent action"));
  await page.unroute("**/docs/first-action.md");
  await page.getByRole("button", { name: "Norsk (NO)" }).click();
  await page.getByRole("button", { name: "Kopier for LLM" }).click();
  await page.getByText("Engelsk Markdown kopiert", { exact: true }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  console.log(
    "Verified full-page clipboard, client navigation, keyboard disclosure, failure recovery and Norwegian mobile UI.",
  );
} finally {
  await browser.close();
}
