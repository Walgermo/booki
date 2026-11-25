// Run against a running docs site with Node and Chrome installed.
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../benchmarks/agent/package.json", import.meta.url));
const { chromium } = require("playwright-core");
const browser = await chromium.launch({ channel: "chrome" });
const base = process.argv[2] ?? "http://localhost:5173";

try {
  const page = await browser.newPage({ locale: "nb-NO", viewport: { width: 1440, height: 900 } });
  // Capture the same tool definitions that the site registers with WebMCP.
  await page.addInitScript(() => {
    window.checkTools = new Map();
    Object.defineProperty(document, "modelContext", {
      value: { registerTool: (tool) => window.checkTools.set(tool.name, tool) },
    });
  });
  await page.goto(new URL("/docs/amount-field", base).href);

  async function checkAmount(label, currency, previousRef) {
    await page.getByRole("textbox", { name: label, exact: true }).waitFor();
    await page.waitForFunction(
      (label) => window.agent?.snapshot().some((entry) => entry.label === label && !entry.offPage),
      label,
    );
    const discovery = await page.evaluate(async () => {
      const input = { kind: "amount-field" };
      return [
        window.agent.snapshot(),
        await window.agent.query(input),
        await window.checkTools.get("snapshot").execute({}),
        await window.checkTools.get("query").execute(input),
      ];
    });
    const methods = ["snapshot", "query", "WebMCP snapshot", "WebMCP query"];
    for (const [index, result] of discovery.entries()) {
      assert.ok(
        result.every((entry) => !entry.offPage),
        methods[index],
      );
      const fields = result.filter((entry) => entry.component === "amount-field");
      assert.equal(fields.length, 1, methods[index]);
      assert.equal(fields[0].label, label);
      assert.equal(fields[0].currency, currency);
      assert.ok(fields[0].actions.includes("setMinor"));
    }
    const field = discovery[0].find((entry) => entry.component === "amount-field");
    const actions = await page.evaluate(
      async ({ ref, previousRef }) => {
        const agent = window.agent;
        const stale =
          previousRef && (await agent.act({ steps: [{ ref: previousRef, action: "setMinor", args: [777] }] }));
        const live = await agent.act({
          steps: [
            { ref, action: "setMinor", args: [12345] },
            { ref, action: "expect", args: [12345] },
          ],
        });
        return { stale, live };
      },
      { ref: field.ref, previousRef },
    );
    if (previousRef) {
      assert.notEqual(field.ref, previousRef);
      assert.equal(actions.stale.ok, false);
      assert.match(actions.stale.error.message, /No component/);
    }
    assert.equal(actions.live.ok, true, actions.live.error?.message);
    return field.ref;
  }

  const nok = await checkAmount("Beløp (NOK)", "NOK");
  await page.getByRole("button", { name: "Norsk (EN)", exact: true }).click();
  const usd = await checkAmount("Amount (USD)", "USD", nok);
  await page.getByRole("button", { name: "Norsk (NO)", exact: true }).click();
  await checkAmount("Beløp (NOK)", "NOK", usd);

  await page.locator('nav:visible a[href="/docs/financial-date-field"]').click();
  await page.waitForURL("**/docs/financial-date-field");
  const result = await page.evaluate(async () => ({
    snapshot: window.agent.snapshot(),
    dates: await window.agent.query({ kind: "financial-date" }),
    old: await window.agent.query({ kind: "amount-field" }),
  }));
  assert.ok(result.snapshot.every((entry) => !entry.offPage && entry.component !== "amount-field"));
  assert.ok(result.dates.length >= 2);
  assert.deepEqual(result.old, []);
  console.log("Agent discovery passed both country switches, WebMCP, live actions, and navigation.");
} finally {
  await browser.close();
}
