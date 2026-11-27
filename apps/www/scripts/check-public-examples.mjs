import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../benchmarks/agent/package.json", import.meta.url));
const { chromium } = require("playwright-core");
const origin = process.argv[2] ?? "http://localhost:5173";
const browser = await chromium.launch({ channel: "chrome" });

try {
  for (const [route, locale, width] of [
    ["/docs/examples", "nb-NO", 390],
    ["/docs/examples", "en-US", 1280],
  ]) {
    const page = await browser.newPage({ locale, viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin);
    await page.waitForFunction(() => window.agent?.snapshot().length);
    assert.equal(await page.locator("#public-browser").count(), 0);
    await page.goto(new URL(route + "#public-browser", origin).href);
    const section = page.locator("#public-browser");
    const select = (name) => section.getByRole("button", { name, exact: true }).click();
    const run = section.getByRole("button", { name: /^(Run comparison|Run again|Kjør sammenligning|Kjør på nytt)$/ });
    const verified = section
      .getByRole("status")
      .filter({ hasText: /Begge nådde samme resultat|Both reached the same result/ });
    await select("Nav");
    await run.click();
    await select("Posten");
    assert.equal(await section.locator("iframe").count(), 0);

    const modelHref = await section.locator('a[download="public-browser-models.json"]').getAttribute("href");
    const models = await (await page.request.get(new URL(modelHref, page.url()).href)).json();
    assert.equal(models.model, "gpt-6.2-sol");
    for (const [name, id] of [
      ["Nav", "nav"],
      ["Posten", "posten"],
      ["Brønnøysundregistrene", "brreg"],
    ]) {
      await select(name);
      const measured = models.pairs.find((pair) => pair.id === id);
      const calls = section
        .getByRole("row")
        .filter({ has: page.getByRole("rowheader", { name: /^(Tool calls|Verktøykall)$/ }) });
      assert.deepEqual(
        await calls.getByRole("cell").allTextContents(),
        ["booki", "browser"].map((side) => String(measured.arms.find((arm) => arm.side === side).toolCalls)),
      );
      const session = section.locator("details").filter({
        has: page.locator("summary", {
          hasText: /Token usage for both Codex sessions|Tokenbruk i de to Codex-øktene/,
        }),
      });
      await session.locator("summary").click();
      const ordered = ["booki", "browser"].map((side) => measured.arms.find((arm) => arm.side === side).usage);
      const numbers = new Intl.NumberFormat(locale);
      for (const [label, values] of [
        [/^(Total input tokens|Inputtokens totalt)$/, ordered.map((usage) => usage.input_tokens)],
        [/^(Cached input|Bufret input)$/, ordered.map((usage) => usage.cached_input_tokens)],
        [/^(Uncached input|Ubufret input)$/, ordered.map((usage) => usage.input_tokens - usage.cached_input_tokens)],
      ]) {
        const row = session.getByRole("row").filter({ has: page.getByRole("rowheader", { name: label }) });
        assert.deepEqual(
          await row.getByRole("cell").allTextContents(),
          values.map((value) => numbers.format(value)),
        );
      }
      await session.locator("summary").click();
      await run.click();
      await verified.waitFor();
      assert.equal(await section.locator("iframe").count(), 2);
      assert.ok(
        await section
          .locator("iframe")
          .evaluateAll((frames) =>
            frames.every((frame) => new URL(frame.contentDocument.URL).searchParams.get("view") === "guidance"),
          ),
      );
      if (name === "Nav") {
        await run.click();
        await verified.waitFor();
      }
    }
    await section.locator("summary").first().click();
    const href = await section.locator('a[download="public-browser-pairs.json"]').getAttribute("href");
    const receipt = await (await page.request.get(new URL(href, page.url()).href)).json();
    assert.equal(receipt.pairs.length, 3);
    for (const pair of receipt.pairs) {
      assert.ok(pair.parity.every((scene) => scene.controlsMatch && scene.textMatches));
      const coverage = pair.arms.find((arm) => arm.side === "booki").coverage;
      assert.ok(coverage.every((scene) => scene.missingText.length === 0 && scene.missingControls.length === 0));
      for (const arm of pair.arms)
        assert.equal(arm.verification.checks.filter((check) => check.name.startsWith("answer.") && check.ok).length, 2);
    }
    const calls = section.locator("summary").filter({ hasText: /^1\. / }).first();
    await calls.click();
    await section.locator("details[open] pre").first().waitFor();
    assert.ok(receipt.pairs.every(({ arms }) => arms.length === 2 && arms.every((arm) => arm.verification.ok)));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    "Verified three paired routes, replay, switching during a run and downloadable receipts in both languages, and homepage exclusion.",
  );
} finally {
  await browser.close();
}
