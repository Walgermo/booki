/**
 * One run's record and the medians per page, shared by `bench` (screens and
 * bridge) and `api-bench` (the bookkeeping API), so both sides are summed and
 * printed the same way.
 */
import type { LoopResult } from "./loop.js";
import type { Prices } from "./pricing.js";
import type { TaskId } from "./tasks.js";
import type { Verification } from "./verify.js";

/** What happened to the irreversible step (pay / post). */
export type StepOutcome = "done" | "refused" | "not_attempted";

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

export type Stat = { median: number; min: number; max: number } | null;

export function stat(values: number[]): Stat {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  return { median, min: sorted[0]!, max: sorted[sorted.length - 1]! };
}

export function table(rows: string[][]): string {
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

export type PageSummary = {
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

export function summarise(pages: string[], records: RunRecord[]): PageSummary[] {
  return pages.map((id) => {
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

export function report(taskId: string, records: RunRecord[], summary: PageSummary[]): string {
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
    `${table([header, ...runRows])}\n\nMedian (min–max) per page, task "${taskId}":\n` +
    table([summaryHeader, ...summaryRows])
  );
}

export function parsePrices(text: string): Prices {
  const parts = text.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0)) {
    throw new Error(`--prices takes four numbers: input,output,cache write,cache read. Got "${text}".`);
  }
  const [input, output, cacheWrite, cacheRead] = parts as [number, number, number, number];
  return { input, output, cacheWrite, cacheRead };
}
