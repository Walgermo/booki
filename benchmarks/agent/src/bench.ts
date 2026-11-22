import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import Anthropic from "@anthropic-ai/sdk";
import { chromium, type Browser } from "playwright-core";

import { apiCounter, countToolDefinitions } from "./count.js";
import { dryRun } from "./dry-run.js";
import { FatalApiError, runLoop, type Effort, type LoopResult } from "./loop.js";
import { costUsd, priceFor, type Prices } from "./pricing.js";
import { openSession, type BrowserTools, type Session, type SessionKind } from "./session.js";
import { startSite, type Site } from "./site.js";
import { SYSTEM_PROMPT, TASKS, type PageSpec, type TaskId, type TaskSpec } from "./tasks.js";
import { stoppedForPerson } from "./tools.js";
import type { Verification } from "./verify.js";
import { collectVersions, printVersions } from "./versions.js";

const DEFAULT_MODEL = "claude-opus-5-5";
const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

const HELP = `One bookkeeping task, done by a Claude model on each of its pages.

  pnpm --filter agent-benchmark bench [options]

  --task <id>          invoice | voucher | supplier-invoice | sales-invoice | dashboard | inbox | reconcile | close
                       (default invoice; --dry-run without it runs all)
  --model <id>         Model to run (default ${DEFAULT_MODEL})
  --runs <n>           Runs per page; medians and min/max are reported (default 3)
  --effort <level>     ${EFFORTS.join(" | ")} | none (default medium; "none" omits the parameter)
  --max-steps <n>      Cap on model requests per run (default: the task's own, 30 for a single screen,
                       40–90 for a workflow)
  --browser-tools <t>  mcp (default): the official Playwright MCP server
                       legacy: the old in-process imitation, only if the server cannot run
  --url <origin>       Use a site that is already running instead of starting one
  --skip-build         Don't run pnpm build:packages before starting the site
  --prices <a,b,c,d>   USD per million tokens: input,output,cache write,cache read
  --headed             Show the browser
  --dry-run            No model and no key: drive every page with a scripted agent, then the checks
  --help

The API key is read from ANTHROPIC_API_KEY.`;

/** What happened to the irreversible step (pay / post). */
type StepOutcome = "done" | "refused" | "not_attempted";

export type RunRecord = {
  task: TaskId;
  page: string;
  run: number;
  success: boolean;
  /** The pay / post step happened. */
  posted: boolean;
  step: StepOutcome;
  verification: Verification | null;
  verificationError?: string;
  costUsd: number | null;
  /** Calls to tools that run arbitrary code in the page (browser_evaluate, browser_run_code_unsafe). */
  codeToolCalls: number;
} & LoopResult;

const CODE_TOOLS = new Set(["browser_evaluate", "browser_run_code_unsafe"]);

const wasRefused = (loop: LoopResult) =>
  loop.toolCalls.some((call) => call.name === "act" && stoppedForPerson(call.output));

type Stat = { median: number; min: number; max: number } | null;

function stat(values: number[]): Stat {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  return { median, min: sorted[0]!, max: sorted[sorted.length - 1]! };
}

function table(rows: string[][]): string {
  const widths = rows[0]!.map((_, column) => Math.max(...rows.map((row) => row[column]!.length)));
  return rows
    .map((row, index) => {
      const line = row.map((cell, column) => cell.padEnd(widths[column]!)).join("  ");
      return index === 0 ? `${line}\n${widths.map((w) => "-".repeat(w)).join("  ")}` : line;
    })
    .join("\n");
}

const money = (value: number | null) => (value === null ? "n/a" : `$${value.toFixed(4)}`);
const show = (s: Stat, format: (n: number) => string = (n) => String(Math.round(n))) =>
  s === null ? "n/a" : s.min === s.max ? format(s.median) : `${format(s.median)} (${format(s.min)}–${format(s.max)})`;

type PageSummary = {
  page: string;
  runs: number;
  succeeded: number;
  /** Runs that ended in api_error: left out of the statistics below. */
  apiErrors: number;
  requests: Stat;
  toolCalls: Stat;
  inputTokens: Stat;
  cacheWriteTokens: Stat;
  cacheReadTokens: Stat;
  outputTokens: Stat;
  wallMs: Stat;
  costUsd: Stat;
};

function summarise(task: TaskSpec, records: RunRecord[]): PageSummary[] {
  return task.pages.map(({ id }) => {
    const all = records.filter((r) => r.page === id);
    // Failed runs count: a wrong end state is a result, not noise. Only runs
    // the API never completed are left out.
    const runs = all.filter((r) => r.ended !== "api_error");
    const of = (pick: (r: RunRecord) => number) => stat(runs.map(pick));
    const costs = runs.map((r) => r.costUsd).filter((c): c is number => c !== null);
    return {
      page: id,
      runs: all.length,
      succeeded: all.filter((r) => r.success).length,
      apiErrors: all.length - runs.length,
      requests: of((r) => r.requests),
      toolCalls: of((r) => r.toolCalls.length),
      inputTokens: of((r) => r.usage.input_tokens),
      cacheWriteTokens: of((r) => r.usage.cache_creation_input_tokens),
      cacheReadTokens: of((r) => r.usage.cache_read_input_tokens),
      outputTokens: of((r) => r.usage.output_tokens),
      wallMs: of((r) => r.wallMs),
      costUsd: costs.length === runs.length ? stat(costs) : null,
    };
  });
}

function report(task: TaskSpec, records: RunRecord[], summary: PageSummary[]): string {
  const header = [
    "page",
    "run",
    "result",
    "pay/post",
    "ended",
    "requests",
    "tool calls",
    "input",
    "cache write",
    "cache read",
    "output",
    "wall s",
    "cost",
  ];
  const runRows = records.map((r) => [
    r.page,
    String(r.run),
    r.success ? "ok" : "FAILED",
    r.step,
    r.ended,
    String(r.requests),
    String(r.toolCalls.length),
    String(r.usage.input_tokens),
    String(r.usage.cache_creation_input_tokens),
    String(r.usage.cache_read_input_tokens),
    String(r.usage.output_tokens),
    (r.wallMs / 1000).toFixed(1),
    money(r.costUsd),
  ]);
  const summaryHeader = [
    "page",
    "ok",
    "requests",
    "tool calls",
    "input",
    "cache write",
    "cache read",
    "output",
    "wall s",
    "cost",
  ];
  const summaryRows = summary.map((s) => [
    s.page,
    `${s.succeeded}/${s.runs}${s.apiErrors ? ` (${s.apiErrors} api_error)` : ""}`,
    show(s.requests),
    show(s.toolCalls),
    show(s.inputTokens),
    show(s.cacheWriteTokens),
    show(s.cacheReadTokens),
    show(s.outputTokens),
    show(s.wallMs, (n) => (n / 1000).toFixed(1)),
    show(s.costUsd, (n) => `$${n.toFixed(4)}`),
  ]);
  return (
    `${table([header, ...runRows])}\n\nMedian (min–max) per page, task "${task.id}":\n` +
    table([summaryHeader, ...summaryRows])
  );
}

function parsePrices(text: string): Prices {
  const parts = text.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0)) {
    throw new Error(`--prices takes four numbers: input,output,cache write,cache read. Got "${text}".`);
  }
  const [input, output, cacheWrite, cacheRead] = parts as [number, number, number, number];
  return { input, output, cacheWrite, cacheRead };
}

const kindOf = (page: PageSpec, browserTools: BrowserTools): SessionKind =>
  page.tools === "bridge" ? "bridge" : browserTools;

/** The values of the first tax-code-select a bridge `query` returned. */
function taxItems(queryOutput: string): string[] {
  const found = JSON.parse(queryOutput) as unknown;
  if (!Array.isArray(found)) return [];
  const items = (found[0] as { items?: { value: string }[] } | undefined)?.items ?? [];
  return items.map((item) => item.value);
}

/**
 * Before any tokens are spent: does every page load, and does an untouched
 * page fail its checks (so a pass means the model did the work)? For the
 * invoice, do both pages offer the 8.875% code the task names?
 */
async function preflight(task: TaskSpec, open: (page: PageSpec) => Promise<Session>) {
  for (const page of task.pages) {
    const session = await open(page);
    try {
      const untouched = await page.verify(session, { answer: "" });
      if (untouched.ok) throw new Error(`${page.path} passes its checks before any tool call.`);
      if (task.id === "invoice") {
        const codes =
          page.id === "semantic"
            ? await session.evaluate<string[]>(
                `[...document.querySelectorAll('select[name="tax"] option')].map((o) => o.value)`,
              )
            : taxItems((await session.run("query", { kind: "tax-code-select" })).content);
        if (!codes.includes("TAX8875")) {
          throw new Error(
            `${page.path} has no TAX8875 tax option (it has ${codes.join(", ") || "nothing"}). ` +
              `The task is a US invoice; the Booki page needs <BookiLocaleProvider country="US">.`,
          );
        }
      }
    } finally {
      await session.close();
    }
  }
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    // pnpm may pass a bare "--" through.
    args: process.argv.slice(2).filter((arg) => arg !== "--"),
    options: {
      task: { type: "string" },
      model: { type: "string", default: DEFAULT_MODEL },
      runs: { type: "string", default: "3" },
      effort: { type: "string", default: "medium" },
      "max-steps": { type: "string" },
      "browser-tools": { type: "string", default: "mcp" },
      url: { type: "string" },
      "skip-build": { type: "boolean", default: false },
      prices: { type: "string" },
      headed: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(HELP);
    return 0;
  }

  const isDryRun = values["dry-run"];
  if (values.task !== undefined && !(values.task in TASKS)) {
    throw new Error(`--task is one of ${Object.keys(TASKS).join(", ")}. Got "${values.task}".`);
  }
  const taskIds: TaskId[] = values.task
    ? [values.task as TaskId]
    : isDryRun
      ? (Object.keys(TASKS) as TaskId[])
      : ["invoice"];
  const browserTools = values["browser-tools"] as BrowserTools;
  if (browserTools !== "mcp" && browserTools !== "legacy") {
    throw new Error(`--browser-tools is mcp or legacy. Got "${values["browser-tools"]}".`);
  }
  const model = values.model;
  const runs = Number.parseInt(values.runs, 10);
  const stepsFor = (task: TaskSpec) =>
    values["max-steps"] ? Number.parseInt(values["max-steps"], 10) : (task.maxSteps ?? 30);
  const maxSteps = stepsFor(TASKS[taskIds[0]!]);
  if (!(runs >= 1) || !(maxSteps >= 1)) {
    throw new Error("--runs and --max-steps take a whole number of 1 or more.");
  }
  if (values.effort !== "none" && !EFFORTS.includes(values.effort as Effort)) {
    throw new Error(`--effort is one of ${EFFORTS.join(", ")} or none. Got "${values.effort}".`);
  }
  const effort = values.effort === "none" ? null : (values.effort as Effort);
  const prices = values.prices ? parsePrices(values.prices) : (priceFor(model) ?? null);

  // Checked before anything is built or started. The key is never printed.
  if (!isDryRun && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      "ANTHROPIC_API_KEY is not set. Run it as:\n" +
        "  ANTHROPIC_API_KEY=… pnpm --filter agent-benchmark bench --task voucher\n" +
        "or pass --dry-run to check the browser and tool plumbing without a model.",
    );
    return 1;
  }

  let site: Site | null = null;
  let browser: Browser | null = null;
  const stop = async () => {
    await browser?.close().catch(() => {});
    await site?.stop();
  };
  process.once("SIGINT", () => void stop().finally(() => process.exit(130)));
  process.once("SIGTERM", () => void stop().finally(() => process.exit(143)));

  try {
    const origin = values.url ?? (site = await startSite({ build: !values["skip-build"] })).url;
    // The harness's own Chrome: bridge pages, legacy tools, and the Chrome version.
    browser = await chromium.launch({ channel: "chrome", headless: !values.headed });
    const harnessBrowser = browser;
    const open = (page: PageSpec, caps?: string[]) =>
      openSession({
        caps,
        kind: kindOf(page, browserTools),
        url: new URL(page.path, origin).href,
        ready: page.ready,
        browser: harnessBrowser,
        headed: values.headed,
      });

    if (isDryRun) {
      return (await dryRun({ tasks: taskIds.map((id) => TASKS[id]), open, browserTools })) ? 0 : 1;
    }

    const task = TASKS[taskIds[0]!];
    await preflight(task, open);

    const client = new Anthropic();
    const counter = apiCounter(client, model, SYSTEM_PROMPT);
    if (!prices) {
      console.log(`No list price known for "${model}": cost is reported as n/a. Pass --prices to set one.`);
    }

    const records: RunRecord[] = [];
    const pageInfo = new Map<
      string,
      { tools: Anthropic.Tool[]; toolDefinitionTokens: number | null; server?: string }
    >();
    let mcpServer: string | null = null;
    console.log(
      `Task ${task.id}, model ${model}, effort ${effort ?? "(not sent)"}, ${runs} run(s) per page, ` +
        `browser tools ${browserTools}, at ${origin}\n`,
    );

    // Pages alternate within each round, so drift in API speed spreads over all of them.
    for (let run = 1; run <= runs; run += 1) {
      for (const page of task.pages) {
        const session = await open(page);
        try {
          if (!pageInfo.has(page.id)) {
            const toolDefinitionTokens = await countToolDefinitions(counter, task.text, session.tools).catch(
              () => null,
            );
            pageInfo.set(page.id, { tools: session.tools, toolDefinitionTokens, server: session.server });
          }
          if (session.server) mcpServer = session.server;
          const loop = await runLoop({
            client,
            model,
            effort,
            maxSteps,
            system: SYSTEM_PROMPT,
            task: task.text,
            session,
          });
          let verification: Verification | null = null;
          let verificationError: string | undefined;
          try {
            verification = await page.verify(session, { answer: loop.finalText });
          } catch (error) {
            verificationError = error instanceof Error ? error.message : String(error);
          }
          const posted = verification?.posted ?? false;
          const step: StepOutcome = posted ? "done" : wasRefused(loop) ? "refused" : "not_attempted";
          const record: RunRecord = {
            task: task.id,
            page: page.id,
            run,
            // The model has to have finished on its own, in the right state.
            success: loop.ended === "end_turn" && verification?.ok === true,
            posted,
            step,
            verification,
            ...(verificationError ? { verificationError } : {}),
            costUsd: costUsd(loop.usage, prices),
            codeToolCalls: loop.toolCalls.filter((call) => CODE_TOOLS.has(call.name)).length,
            ...loop,
          };
          records.push(record);
          const failed = verification
            ? Object.entries(verification.checks)
                .filter(([, ok]) => !ok)
                .map(([name]) => name)
            : [`page could not be read: ${verificationError}`];
          console.log(
            `${page.label}, run ${run}: ${record.success ? "ok" : "FAILED"}` +
              ` (ended ${loop.ended}${loop.error ? `: ${loop.error}` : ""}` +
              `${failed.length ? `; wrong: ${failed.join(", ")}` : ""}; pay/post ${step}` +
              `${record.codeToolCalls ? `; ${record.codeToolCalls} code-tool call(s)` : ""})`,
          );
        } finally {
          await session.close();
        }
      }
    }

    const summary = summarise(task, records);
    const versions = collectVersions(browser, { headed: values.headed, mcpServer });
    console.log(`\n${report(task, records, summary)}\n`);
    console.log(
      'Tokens are summed from the API\'s usage over every request of a run. "input" is uncached input.\n' +
        "Statistics include failed runs; only runs that ended in api_error are left out.",
    );
    console.log("Tool-definition tokens per request (count_tokens):");
    for (const page of task.pages) {
      const info = pageInfo.get(page.id);
      console.log(`  ${page.id}: ${info?.tools.length ?? "?"} tools, ${info?.toolDefinitionTokens ?? "n/a"} tokens`);
    }
    console.log(printVersions(versions));

    const here = path.dirname(fileURLToPath(import.meta.url));
    const directory = path.resolve(here, "../results");
    mkdirSync(directory, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = path.join(directory, `bench-${task.id}-${timestamp}.json`);
    writeFileSync(
      file,
      `${JSON.stringify(
        {
          kind: "bench",
          timestamp: new Date().toISOString(),
          task: task.id,
          model,
          servedModels: [...new Set(records.flatMap((r) => r.servedModels))],
          effort,
          runsPerPage: runs,
          maxSteps,
          browserTools,
          origin,
          promptCaching: "top-level cache_control, ephemeral (5 minutes)",
          pricesUsdPerMillionTokens: prices,
          versions,
          system: SYSTEM_PROMPT,
          taskText: task.text,
          pages: task.pages.map((page) => ({
            id: page.id,
            path: page.path,
            label: page.label,
            tools:
              page.tools === "bridge"
                ? "ui-sdk bridge"
                : browserTools === "mcp"
                  ? "Playwright MCP"
                  : "legacy browser tools",
            toolDefinitionTokens: pageInfo.get(page.id)?.toolDefinitionTokens ?? null,
            toolDefinitions: pageInfo.get(page.id)?.tools ?? [],
          })),
          summary,
          runs: records,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`Raw numbers and full transcripts: ${path.relative(process.cwd(), file)}`);
    return 0;
  } finally {
    await stop();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof FatalApiError ? `Stopped: ${error.message}` : error);
    process.exit(1);
  },
);
