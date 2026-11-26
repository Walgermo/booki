/**
 * Head-to-head without a model: each task on each of its pages, driven by a
 * scripted agent that never errs, through the tools a model would get there:
 * the official Playwright MCP server on the replicas, the ui-sdk bridge on
 * Booki. That is the best case for the replicas; a real model adds retries
 * and wrong guesses on top (run `bench --task <id>` for that).
 *
 * Tokens: with ANTHROPIC_API_KEY set, the Messages API's count_tokens endpoint
 * for --model (free, runs no model); without it, characters ÷ 4, labelled
 * "estimate" everywhere. Cost: those tokens at the model's list prices.
 * Time: tool time only (the median of --repeats scripted runs); a model's own
 * latency is not modelled, and end-to-end time needs `bench` with a key.
 *
 *   pnpm --filter agent-benchmark h2h --url http://localhost:5183
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import Anthropic from "@anthropic-ai/sdk";
import { chromium } from "playwright-core";

import { apiCounter, countTranscript, transcriptCost, type CostEstimate, type TranscriptCount } from "./count.js";
import { priceFor } from "./pricing.js";
import { recorder, scriptFor, type Call } from "./scripted.js";
import { openSession, type BrowserTools } from "./session.js";
import { REPO_ROOT, startSite, type Site } from "./site.js";
import { SCREEN_TASKS, SYSTEM_PROMPT, TASKS, WORKFLOW_TASKS, type TaskId } from "./tasks.js";
import type { Verification } from "./verify.js";
import { collectVersions, printVersions } from "./versions.js";

const DEFAULT_MODEL = "claude-opus-5-5";
const DEFAULT_TASKS: TaskId[] = [...SCREEN_TASKS, ...WORKFLOW_TASKS];

/** As before for the voucher pages; neutral names for the rest. */
const LABELS: Record<string, string> = {
  "voucher-raw": "Tripletex DOM snapshot",
  "voucher-grid": "DNB Regnskap DOM snapshot",
  "supplier-invoice-raw": "listbox replica (DOM map)",
  "sales-invoice-raw": "listbox replica (DOM map)",
  "dashboard-raw": "SVG-chart dashboard replica (DOM map)",
  "dashboard-grid": "canvas-chart dashboard replica (DOM map)",
  semantic: "plain semantic HTML",
  "inbox-raw": "listbox-style inbox (built in the mapped patterns)",
  "reconcile-raw": "checkbox reconciliation table (built in the mapped patterns)",
  "close-raw": "plain checklist page (built in the mapped patterns)",
};

type Stat = { median: number; min: number; max: number };
const stat = (values: number[]): Stat => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    median: sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
  };
};

type Side = {
  task: TaskId;
  page: string;
  /** Which product a replica was rebuilt from ("tripletex", "dnb"), "acc", or "semantic". */
  key: string;
  /** How the scripted agent did it: "default", or e.g. "hover" / "screenshot" on a dashboard. */
  strategy: string;
  strategyNote: string | null;
  /** Extra Playwright MCP capabilities the strategy needed (they add tool definitions). */
  caps: string[];
  /** The scripted agent's final answer, for read-only tasks. */
  answer: string | null;
  /** "exact" when the checks can pass on this route, "approximate" when they cannot (screenshots). */
  answerQuality: "exact" | "approximate";
  /** Image input in tool results, by the pixel rule. */
  imageTokens: number;
  label: string;
  tools: string[];
  /** The first repeat's calls, in and out; tokens are counted on these. */
  calls: Call[];
  scriptError: string | null;
  verification: Verification;
  recordedAs: string | null;
  tokens: TranscriptCount;
  costUsd: CostEstimate & { per1000Runs: CostEstimate; per100000Runs: CostEstimate };
  /** Model round trips the loop would need: one per call plus the final answer. */
  modelRequests: number;
  timing: {
    repeats: number;
    /** Repeats that finished; the timing statistics are over these. */
    finishedRepeats: number;
    toolMsTotal: Stat;
    toolMsPerCall: number[][];
    /** Every repeat made the same calls and ended correct. */
    repeatsAgree: boolean;
    perRepeat: { calls: number; ok: boolean; scriptError: string | null }[];
  };
};

const times = (cost: CostEstimate, n: number): CostEstimate => ({
  noCache: cost.noCache * n,
  withCache: cost.withCache * n,
});
const usd = (n: number) => (n >= 100 ? `$${n.toFixed(0)}` : n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`);

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== "--"),
    options: {
      task: { type: "string", default: "all" },
      url: { type: "string" },
      headed: { type: "boolean", default: false },
      "skip-build": { type: "boolean", default: false },
      "browser-tools": { type: "string", default: "mcp" },
      model: { type: "string", default: DEFAULT_MODEL },
      repeats: { type: "string", default: "3" },
    },
  });
  const browserTools = values["browser-tools"] as BrowserTools;
  if (browserTools !== "mcp" && browserTools !== "legacy") {
    throw new Error(`--browser-tools is mcp or legacy. Got "${values["browser-tools"]}".`);
  }
  const taskIds: TaskId[] = values.task === "all" ? DEFAULT_TASKS : [values.task as TaskId];
  for (const id of taskIds) {
    if (!(id in TASKS)) throw new Error(`--task is all or one of ${Object.keys(TASKS).join(", ")}. Got "${id}".`);
  }
  const repeats = Number.parseInt(values.repeats, 10);
  if (!(repeats >= 1)) throw new Error("--repeats takes a whole number of 1 or more.");
  const model = values.model;
  const prices = priceFor(model)!;
  if (!prices) throw new Error(`No list price for "${model}" in src/pricing.ts.`);
  // The key is never printed; it only selects how tokens are counted.
  const counter = process.env.ANTHROPIC_API_KEY ? apiCounter(new Anthropic(), model, SYSTEM_PROMPT) : null;
  const estimate = counter === null;
  const est = estimate ? " (estimate)" : "";

  let site: Site | undefined;
  const origin = values.url ?? (site = await startSite({ build: !values["skip-build"] })).url;
  const browser = await chromium.launch({ channel: "chrome", headless: !values.headed });
  let mcpServer: string | null = null;
  try {
    const sides: Side[] = [];
    for (const taskId of taskIds) {
      const task = TASKS[taskId];
      for (const page of task.pages)
        for (const strategy of page.strategies ?? [{ id: "default" }]) {
          if (strategy.caps?.length && browserTools !== "mcp") continue;
          let first: {
            calls: Call[];
            scriptError: string | null;
            verification: Verification;
            tools: Anthropic.Tool[];
            answer: string | null;
            finished: boolean;
          } | null = null;
          const totals: number[] = [];
          const perCall: number[][] = [];
          let agree = true;
          const perRepeat: { calls: number; ok: boolean; scriptError: string | null }[] = [];
          for (let repeat = 0; repeat < repeats; repeat += 1) {
            const session = await openSession({
              kind: page.tools === "bridge" ? "bridge" : browserTools,
              url: new URL(page.path, origin).href,
              ready: page.ready,
              browser,
              headed: values.headed,
              caps: strategy.caps,
            });
            try {
              if (session.server) mcpServer = session.server;
              const rec = recorder(session);
              let scriptError: string | null = null;
              let answer: string | null = null;
              try {
                answer = (await scriptFor(page.id, strategy.id)!(session, rec)) ?? null;
              } catch (error) {
                scriptError = error instanceof Error ? error.message : String(error);
              }
              const verification = await page.verify(session, { answer: answer ?? "" });
              const finished = !scriptError && (strategy.approximate || verification.ok);
              perRepeat.push({ calls: rec.calls.length, ok: verification.ok, scriptError });
              perCall.push(rec.calls.map((call) => Math.round(call.ms)));
              // Timing and tokens come from repeats that finished; a repeat that
              // stopped (a flaky load, a stale ref) is kept in perRepeat and flagged.
              if (finished) totals.push(rec.calls.reduce((sum, call) => sum + call.ms, 0));
              else agree = false;
              if (!first || (!first.finished && finished)) {
                first = { calls: rec.calls, scriptError, verification, tools: session.tools, answer, finished };
              } else if (finished && rec.calls.length !== first.calls.length) agree = false;
            } finally {
              await session.close();
            }
          }
          const { calls, scriptError, verification, tools, answer } = first!;
          if (!strategy.approximate && !verification.ok) agree = false;
          const observed = verification.observed as { postedBy?: string; createdBy?: string };
          const recordedAs =
            page.tools === "bridge"
              ? (observed.postedBy ?? observed.createdBy ?? null)
              : verification.posted
                ? "the signed-in user"
                : null;
          const tokens = await countTranscript({
            counter,
            model,
            system: SYSTEM_PROMPT,
            task: task.text,
            tools,
            calls,
          });
          const cost = transcriptCost(tokens, prices);
          const via =
            page.tools === "bridge" ? "bridge" : browserTools === "mcp" ? "Playwright MCP" : "legacy browser tools";
          sides.push({
            task: taskId,
            page: page.id,
            key:
              page.key ??
              (page.tools === "bridge"
                ? "acc"
                : page.id === "semantic"
                  ? "semantic"
                  : page.id.endsWith("-grid")
                    ? "dnb"
                    : "tripletex"),
            strategy: strategy.id,
            strategyNote: strategy.note ?? null,
            caps: strategy.caps ?? [],
            answer,
            answerQuality: strategy.approximate ? "approximate" : "exact",
            imageTokens: tokens.imageTokens,
            label:
              (page.tools === "bridge" ? "Booki + bridge" : `${LABELS[page.id] ?? page.id} + ${via}`) +
              (strategy.id === "default"
                ? ""
                : ` (${strategy.id}${strategy.caps?.length ? `, --caps ${strategy.caps.join(",")}` : ""})`),
            tools: tools.map((tool) => tool.name),
            calls,
            scriptError,
            verification,
            recordedAs,
            tokens,
            costUsd: { ...cost, per1000Runs: times(cost, 1_000), per100000Runs: times(cost, 100_000) },
            modelRequests: tokens.requests,
            timing: {
              repeats,
              finishedRepeats: totals.length,
              toolMsTotal: stat(totals.length ? totals : [Number.NaN]),
              toolMsPerCall: perCall,
              repeatsAgree: agree,
              perRepeat,
            },
          });
        }
    }

    console.log(
      estimate
        ? "\nTokens counted as characters ÷ 4: every token and cost number below is an ESTIMATE. Set ANTHROPIC_API_KEY to count with count_tokens."
        : `\nTokens counted with the Messages API count_tokens endpoint for ${model}.`,
    );
    console.log(
      `Cost at ${model} list prices: $${prices.input}/MTok input, $${prices.output}/MTok output, ` +
        `$${prices.cacheWrite}/MTok 5-minute cache write, $${prices.cacheRead}/MTok cache read.\n` +
        "Output is the tool_use arguments only: a lower bound (a real model also writes reasoning and text).\n" +
        "Screenshots are input like any tool result: image tokens by (width × height) / 750 after the model's resize limits without a key, by count_tokens with one; a screenshot gives bar heights, not exact values.\n" +
        `Time is tool time only, median of ${repeats} scripted run(s); model latency is not included (run bench with a key for end-to-end time).`,
    );
    for (const taskId of taskIds) {
      const rows = sides.filter((side) => side.task === taskId);
      console.log(`\nTask ${taskId}: ${TASKS[taskId].text}`);
      console.table(
        rows.map((side) => ({
          page: side.label,
          tools: side.tools.length,
          calls: side.calls.length,
          requests: side.modelRequests,
          [`tool defs${est}`]: side.tokens.toolDefinitions,
          [`transcript${est}`]: side.tokens.transcript,
          [`cumulative input${est}`]: side.tokens.cumulativeInput,
          [`output, lower bound${est}`]: side.tokens.outputTokens,
          [`cost no cache${est}`]: usd(side.costUsd.noCache),
          [`cost with cache${est}`]: usd(side.costUsd.withCache),
          [`per 100k runs, cached${est}`]: usd(side.costUsd.per100000Runs.withCache),
          "tool ms (median)": Math.round(side.timing.toolMsTotal.median),
          [`images${est}`]: side.imageTokens,
          correct: side.answerQuality === "approximate" ? "approximate" : side.verification.ok ? "yes" : "no",
          "posted/created": side.task === "dashboard" ? "read only" : side.verification.posted ? "yes" : "no",
        })),
      );
      const acc = rows.find((side) => side.key === "acc");
      for (const side of rows) {
        if (!acc || side === acc) continue;
        console.log(
          `${side.label} vs Booki${est}: cumulative input ${(side.tokens.cumulativeInput / acc.tokens.cumulativeInput).toFixed(1)}×, ` +
            `cost no cache ${(side.costUsd.noCache / acc.costUsd.noCache).toFixed(1)}×, ` +
            `cost with cache ${(side.costUsd.withCache / acc.costUsd.withCache).toFixed(1)}×, ` +
            `requests ${side.modelRequests} vs ${acc.modelRequests}, ` +
            `tool time ${(side.timing.toolMsTotal.median / acc.timing.toolMsTotal.median).toFixed(1)}×.`,
        );
      }
      for (const side of rows) {
        const failed = Object.entries(side.verification.checks)
          .filter(([, ok]) => !ok)
          .map(([name]) => name);
        console.log(
          `${side.label}: ${side.task === "dashboard" ? `answer ${side.answerQuality === "approximate" ? "approximate (cannot be verified exactly)" : side.verification.ok ? "exact and right" : "WRONG"}` : side.verification.posted ? `done, recorded as ${side.recordedAs}` : side.verification.ok ? "left for a person, as the page requires" : "not done"}` +
            `${failed.length ? `; wrong: ${failed.join(", ")}` : ""}` +
            `${side.scriptError ? `; script stopped: ${side.scriptError.split("\n")[0]}` : ""}` +
            `${side.timing.repeatsAgree ? "" : `; ${side.timing.finishedRepeats}/${side.timing.repeats} repeats finished alike, see perRepeat: ${JSON.stringify(side.timing.perRepeat).slice(0, 300)}`}.`,
        );
      }
    }
    const versions = collectVersions(browser, { headed: values.headed, mcpServer, origin });
    console.log(`\n${printVersions(versions)}`);

    const dir = path.join(REPO_ROOT, "benchmarks/agent/results");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `h2h-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    writeFileSync(
      file,
      `${JSON.stringify(
        {
          kind: "h2h",
          timestamp: new Date().toISOString(),
          tokenCount: { method: sides[0]?.tokens.method, model: estimate ? null : model, estimate },
          prices: {
            model,
            usdPerMillionTokens: prices,
            cacheModel: "per request: earlier prefix = cache read, appended part = 5-minute cache write",
          },
          timing: { repeats, what: "tool time only, measured around each tool call; no model latency" },
          browserTools,
          origin,
          versions,
          system: SYSTEM_PROMPT,
          tasks: Object.fromEntries(taskIds.map((id) => [id, TASKS[id].text])),
          sides,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`Every call, in and out: ${path.relative(REPO_ROOT, file)}`);
    return sides.every(
      (side) =>
        (side.answerQuality === "approximate" || side.verification.ok) &&
        !side.scriptError &&
        side.timing.finishedRepeats > 0,
    )
      ? 0
      : 1;
  } finally {
    await browser.close();
    await site?.stop();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
