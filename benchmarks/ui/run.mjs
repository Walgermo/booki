// Render and interaction timings for Booki's heavy controls, in Chrome.
//
//   node benchmarks/ui/run.mjs [--runs 7] [--json out.json]
//
// Bundles page.tsx with esbuild (production React), opens it in Chrome through
// playwright-core, and reports the median of each measurement in milliseconds.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const here = fileURLToPath(new URL(".", import.meta.url));
const args = process.argv.slice(2);
const runs = Number(args[args.indexOf("--runs") + 1]) || 7;
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : undefined;

const out = mkdtempSync(join(tmpdir(), "booki-ui-bench-"));
await build({
  entryPoints: [join(here, "page.tsx")],
  bundle: true,
  minify: true,
  format: "iife",
  outfile: join(out, "page.js"),
  define: { "process.env.NODE_ENV": '"production"' },
  jsx: "automatic",
  logLevel: "warning",
  logOverride: { "ignored-bare-import": "silent" },
});
writeFileSync(
  join(out, "index.html"),
  `<!doctype html><meta charset="utf-8"><div id="app"></div><script src="page.js"></script>`,
);

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (error) => console.error("page error:", error.message));
await page.goto(`file://${join(out, "index.html")}`);
await page.waitForFunction(() => document.title === "ready");

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** Each case: mount the control, then time the steps on the fresh mount. */
const CASES = [
  {
    name: "DataTable, 5 000 rows",
    scenario: ["data-table", 5000],
    steps: [
      ["person types in search", (b) => b.type("Husleie")],
      ["person sorts a column", (b) => b.sort(4)],
      ["agent setSearch", (b) => b.act("Invoices", "setSearch", ["Strøm"])],
      ["parent re-renders, one row changed", (b) => b.rerender(1)],
    ],
  },
  {
    name: "LedgerTable, 5 000 entries",
    scenario: ["ledger-table", 5000],
    steps: [
      ["agent setSearch", (b) => b.act("Ledger", "setSearch", ["Reise"])],
      ["agent setSort", (b) => b.act("Ledger", "setSort", ["date", "desc"])],
      ["parent re-renders, one entry changed", (b) => b.rerender(1)],
    ],
  },
  {
    name: "VoucherComposer, 200 lines",
    scenario: ["voucher-composer", 200],
    steps: [["agent setDebit", (b) => b.act("Voucher", "setDebit", ["l-0", 12345])]],
  },
  {
    name: "BankReconciliation, 1 000 + 1 000 lines",
    scenario: ["bank-reconciliation", 1000],
    steps: [["agent suggestMatch", (b) => b.act("Bank", "suggestMatch", ["b-1", "p-1"])]],
  },
  {
    name: "TrendChart, 3 series × 120 months",
    scenario: ["trend-chart", 120],
    steps: [["agent setRange", (b) => b.act("Trend", "setRange", ["12m"])]],
  },
];

const results = [];
for (const item of CASES) {
  const timings = { mount: [], snapshot: [] };
  for (const [label] of item.steps) timings[label] = [];
  for (let run = 0; run < runs; run++) {
    timings.mount.push(await page.evaluate(([name, n]) => window.bench.mount(name, n), item.scenario));
    timings.snapshot.push(await page.evaluate(() => window.bench.snapshot()));
    for (const [label, step] of item.steps) {
      timings[label].push(await page.evaluate(`(${step.toString()})(window.bench)`));
    }
  }
  const row = { control: item.name, ...Object.fromEntries(Object.entries(timings).map(([k, v]) => [k, median(v)])) };
  results.push(row);
  console.log(`\n${item.name}`);
  for (const [key, value] of Object.entries(row))
    if (key !== "control") console.log(`  ${key.padEnd(40)} ${value.toFixed(1)} ms`);
}

await browser.close();
rmSync(out, { recursive: true, force: true });
if (jsonOut) writeFileSync(jsonOut, `${JSON.stringify(results, null, 2)}\n`);
