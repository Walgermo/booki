// Run against the demo with Chrome installed, e.g. node apps/www/scripts/check-demo-overview.mjs http://localhost:5173.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const url = new URL("/demo", process.argv[2] ?? "http://localhost:5173");
const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage({ locale: "nb-NO", reducedMotion: "reduce" });
  await page.goto(url.href);
  await page.waitForFunction(() => window.agent?.snapshot().some((entry) => entry.component === "kpi-stat"));
  const cards = page.locator('[data-slot="kpi-stat"]');
  assert.equal(await cards.count(), 3);
  for (const width of [390, 1097, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await cards.evaluateAll((elements) =>
      elements.map((card) => {
        const amount = card.querySelector('[data-slot="kpi-stat-value"]');
        const spark = card.querySelector('[data-slot="kpi-stat-spark"]');
        const text = amount.getBoundingClientRect();
        const line = spark?.getBoundingClientRect();
        return {
          fits: amount.scrollWidth <= amount.clientWidth + 1,
          overlaps:
            !!line &&
            text.left < line.right &&
            line.left < text.right &&
            text.top < line.bottom &&
            line.top < text.bottom,
        };
      }),
    );
    assert(
      geometry.every((stat) => stat.fits && !stat.overlaps),
      `KPI values at ${width}px`,
    );
  }

  await page.getByRole("button", { name: "Les nøkkeltallene" }).click();
  await page.locator("#erp-agent li").filter({ hasText: "Bankbeholdning" }).waitFor();
  // At desktop width both the nav button and voucher editor are named Bilag.
  await page
    .getByRole("navigation", { name: "Skjermbilder" })
    .getByRole("button", { name: "Bilag", exact: true })
    .click();
  await page.getByRole("button", { name: "Kjør på denne siden" }).click();
  await page.locator("#erp-agent li").filter({ hasText: "Kontrollerte bilaget på nytt" }).waitFor();
  const editor = await page.evaluate(() => window.agent.snapshot().find((c) => c.component === "voucher-composer"));
  assert.equal(editor.lines.length, 3);
  assert.equal(editor.postable, true);
} finally {
  await browser.close();
}
