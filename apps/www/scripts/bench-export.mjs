#!/usr/bin/env node
/**
 * Copies the figures the site shows out of the newest head-to-head result
 * (benchmarks/agent/results/h2h-*.json) into src/data/bench.json, so every
 * number on the landing page comes from a run anyone can repeat, not from a
 * hand-typed copy.
 *
 *   pnpm --filter agent-benchmark h2h --task all
 *   node apps/www/scripts/bench-export.mjs [path/to/h2h.json]
 *
 * `--api` replaces only the API side (results/api-*.json, from
 * `proof --side api`) in the bench.json there is, and leaves every other
 * figure as it is.
 *
 *   node apps/www/scripts/bench-export.mjs --api
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const results = path.resolve(here, "../../../benchmarks/agent/results");
const out = path.resolve(here, "../src/data/bench.json");

/** Which product a page was rebuilt from, as the site names it. */
const SCREEN = {
  "voucher-raw": { key: "tripletex", name: "Tripletex · DOM snapshot" },
  "voucher-grid": { key: "dnb", name: "DNB Regnskap · DOM snapshot" },
  "supplier-invoice-raw": { key: "tripletex", name: "Tripletex · DOM map" },
  "sales-invoice-raw": { key: "tripletex", name: "Tripletex · DOM map" },
  "dashboard-raw": { key: "tripletex", name: "Tripletex · DOM map" },
  "dashboard-grid": { key: "dnb", name: "DNB Regnskap · DOM map" },
};

const screenOf = (page) =>
  SCREEN[page] ??
  (page.endsWith("-acc")
    ? { key: "acc", name: "Booki" }
    : page.endsWith("-api")
      ? { key: "api", name: "API" }
      : { key: page, name: page });

/**
 * Real-model runs (`pnpm proof` / `bench`, and `proof --side api`): per task,
 * model and side, the newest run with at least three runs per page. Medians;
 * success counts as checked.
 */
function realFrom(pattern) {
  const real = new Map();
  for (const file of readdirSync(results)
    .filter((f) => pattern.test(f))
    .sort()) {
    const run = JSON.parse(readFileSync(path.join(results, file), "utf8"));
    if (!run.summary || (run.runsPerPage ?? 0) < 3) continue;
    real.set(`${run.task}|${run.model}|${run.side ?? "screens"}`, { file, run });
  }
  const sides = [...real.values()].flatMap(({ run }) =>
    run.summary.map((page) => {
      const screen = screenOf(page.page);
      return {
        task: run.task,
        model: run.model,
        key: screen.key,
        name: screen.name,
        runs: page.runs,
        succeeded: page.succeeded,
        toolCalls: page.toolCalls.median,
        requests: page.requests.median,
        tokens:
          page.inputTokens.median +
          page.cacheWriteTokens.median +
          page.cacheReadTokens.median +
          page.outputTokens.median,
        costUsd: page.costUsd?.median ?? null,
        wallMs: Math.round(page.wallMs.median),
      };
    }),
  );
  const runs = [...real.values()].map(({ file, run }) => ({
    file: path.relative(repo, path.join(results, file)),
    task: run.task,
    model: run.model,
    timestamp: run.timestamp,
    runsPerPage: run.runsPerPage,
    effort: run.effort,
    prices: run.pricesUsdPerMillionTokens,
    ...(run.side ? { side: run.side } : {}),
  }));
  return { runs, sides };
}

const write = (data, what) => {
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Wrote ${path.relative(process.cwd(), out)}: ${what}.`);
};

if (process.argv[2] === "--api") {
  const data = JSON.parse(readFileSync(out, "utf8"));
  const api = realFrom(/^api-.*\.json$/);
  data.real = {
    runs: [...data.real.runs.filter((run) => run.side !== "api"), ...api.runs],
    sides: [...data.real.sides.filter((side) => side.key !== "api"), ...api.sides],
  };
  write(data, `${api.sides.length} API sides from ${api.runs.length} files, nothing else changed`);
  process.exit(0);
}

/** Per task, the newest run that has it; a path on the command line is used alone. */
const files = process.argv[2]
  ? [process.argv[2]]
  : readdirSync(results)
      .filter((file) => /^h2h-.*\.json$/.test(file))
      .sort()
      .map((file) => path.join(results, file));
const runs = files.map((file) => ({ file, run: JSON.parse(readFileSync(file, "utf8")) }));
const newestFor = new Map();
for (const entry of runs) for (const task of Object.keys(entry.run.tasks)) newestFor.set(task, entry);
const run = runs.at(-1).run;

const sides = [...newestFor]
  .flatMap(([task, { run: from }]) => from.sides.filter((side) => side.task === task))
  .map((side) => {
    const screen =
      SCREEN[side.page] ??
      (side.page.endsWith("-acc") ? { key: "acc", name: "Booki" } : { key: side.page, name: side.label });
    let sum = 0;
    return {
      task: side.task,
      key: screen.key,
      name: screen.name,
      ok: side.verification.ok,
      calls: side.calls.length,
      /** The tools called, in order, without their payloads: browser_ is dropped, so "snapshot", "click", "act". */
      tools: side.calls.map((call) => String(call.tool).replace(/^browser_/, "")),
      requests: side.modelRequests,
      /** Input billed so far after each model request (the transcript is re-sent every time). */
      billedInput: side.tokens.inputPerRequest.map((n) => (sum += n)),
      transcript: side.tokens.transcript,
      toolDefinitions: side.tokens.toolDefinitions,
      output: side.tokens.outputTokens,
      costUsd: { noCache: side.costUsd.noCache, withCache: side.costUsd.withCache },
      toolMs: Math.round(side.timing.toolMsTotal.median),
      repeats: side.timing.repeats,
      /** How the snapshot side read the screen: "hover" for exact answers, "screenshot" for a picture. */
      strategy: side.strategy ?? "default",
      /** "exact" when the answer was checked; "approximate" for a screenshot read. */
      answer: side.answerQuality ?? (side.verification.ok ? "exact" : "wrong"),
      imageTokens: side.imageTokens ?? 0,
      repeatsAgree: side.timing.repeatsAgree,
    };
  });

const real = realFrom(/^(bench|api)-.*\.json$/);

const data = {
  sources: [...new Set([...newestFor.values()].map(({ file }) => path.relative(repo, file)))],
  timestamp: run.timestamp,
  tokens: run.tokenCount.method,
  prices: run.prices,
  timing: run.timing,
  versions: {
    playwrightMcp: run.versions.playwrightMcp,
    uiSdkReact: run.versions.uiSdkReact,
    chrome: run.versions.chrome,
    commit: run.versions.git.commit.slice(0, 7),
  },
  tasks: Object.fromEntries([...newestFor].map(([task, { run: from }]) => [task, from.tasks[task]])),
  sides,
  real,
};

write(data, `from ${data.sources.join(", ")}: ${sides.length} sides`);
