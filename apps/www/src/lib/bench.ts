/**
 * The head-to-head figures the site shows, read from src/data/bench.json.
 * That file is written by scripts/bench-export.mjs from the benchmark's own
 * result files, so a number here is never typed by hand.
 */
import data from "@/data/bench.json";
import type { Lang } from "@/lib/lang";

export type BenchTask = "voucher" | "supplier-invoice" | "sales-invoice" | "dashboard";
export type BenchSide = (typeof data.sides)[number];

export const BENCH = data;

type Text = { en: string; nb: string };

export const TASKS: { id: BenchTask; label: Text; short: Text; plural: Text }[] = [
  {
    id: "dashboard",
    label: { en: "Read a dashboard", nb: "Les et dashbord" },
    short: { en: "Dashboard", nb: "Dashbord" },
    plural: { en: "dashboard reads", nb: "dashbordavlesninger" },
  },
  {
    id: "supplier-invoice",
    label: { en: "Book a supplier invoice", nb: "Bokfør en leverandørfaktura" },
    short: { en: "Supplier invoice", nb: "Leverandørfaktura" },
    plural: { en: "supplier invoices", nb: "leverandørfakturaer" },
  },
  {
    id: "voucher",
    label: { en: "Post a voucher", nb: "Bokfør et bilag" },
    short: { en: "Voucher", nb: "Bilag" },
    plural: { en: "vouchers", nb: "bilag" },
  },
  {
    id: "sales-invoice",
    label: { en: "Create a sales invoice", nb: "Lag en utgående faktura" },
    short: { en: "Sales invoice", nb: "Utgående faktura" },
    plural: { en: "sales invoices", nb: "utgående fakturaer" },
  },
];

/** A side's name in the site's language: "DOM snapshot" reads "DOM-øyeblikksbilde" in Norwegian. */
export const sideName = (name: string, lang: Lang = "en") =>
  lang === "nb" ? name.replace("DOM snapshot", "DOM-øyeblikksbilde").replace("DOM map", "DOM-kart") : name;

const ORDER = ["tripletex", "dnb", "acc"];

/** The sides drawn in the race: every side that gave an exact, checked answer. */
export function sidesFor(task: BenchTask): BenchSide[] {
  return data.sides
    .filter((side) => side.task === task && side.strategy !== "screenshot")
    .sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
}

/** The screenshot route, where a task has one: cheaper to read, but only approximate. */
export function screenshotsFor(task: BenchTask): BenchSide[] {
  return data.sides
    .filter((side) => side.task === task && side.strategy === "screenshot")
    .sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
}

export const billed = (side: BenchSide) => side.billedInput.at(-1) ?? 0;

/** The snapshot side we compare against: Tripletex where it ran, else the first one. */
export function versus(task: BenchTask): { raw: BenchSide; acc: BenchSide } {
  const sides = sidesFor(task);
  const acc = sides.find((side) => side.key === "acc")!;
  const raw = sides.find((side) => side.key === "tripletex") ?? sides.find((side) => side.key !== "acc")!;
  return { raw, acc };
}

export const RUNS = 100_000;

/**
 * Number and date helpers for one language: nb-NO grouping and decimals in
 * Norwegian, en-US otherwise. Costs are billed in USD; in Norwegian they are
 * shown in NOK at Norges Bank's rate for the run (USD_NOK), one decimal fewer,
 * since a krone amount is about ten times the dollar amount.
 */
/**
 * USD to NOK for showing costs in Norwegian: Norges Bank's reference rate on
 * the last banking day of the runs (21 Nov 2026 was a Saturday).
 * https://data.norges-bank.no/api/data/EXR/B.USD.NOK.SP
 */
export const USD_NOK = { rate: 9.7525, date: "20.11.2026" };

export function formatters(lang: Lang = "en") {
  const locale = lang === "nb" ? "nb-NO" : "en-US";
  return {
    usd: (n: number, digits = 0) =>
      lang === "nb"
        ? (n * USD_NOK.rate).toLocaleString(locale, {
            style: "currency",
            currency: "NOK",
            maximumFractionDigits: Math.max(0, digits - 1),
            minimumFractionDigits: Math.max(0, digits - 1),
          })
        : n.toLocaleString(locale, {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: digits,
            minimumFractionDigits: digits,
          }),
    int: (n: number) => Math.round(n).toLocaleString(locale),
    /** Seconds from one second up, milliseconds below, so 0.97 s and 7 ms never both read as "1 s → 0 s". */
    seconds: (ms: number) =>
      // A no-break space keeps the number with its unit when a figure wraps.
      ms >= 1000
        ? `${(ms / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })}\u00a0s`
        : `${Math.round(ms)}\u00a0ms`,
    calls: (n: number) => (lang === "nb" ? `${n} kall` : `${n} ${n === 1 ? "call" : "calls"}`),
    /** "21 Nov 2026" or "21. nov. 2026", from the run's own timestamp. */
    runDate: new Date(data.timestamp).toLocaleDateString(lang === "nb" ? "nb-NO" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      // The build renders this date too: one time zone, so the browser's first render matches the HTML.
      timeZone: "UTC",
    }),
  };
}

const EN = formatters("en");
export const usd = EN.usd;
export const int = EN.int;
export const seconds = EN.seconds;
export const calls = EN.calls;
/** "21 Nov 2026", from the run's own timestamp. */
export const runDate = EN.runDate;

const price = data.prices.usdPerMillionTokens;
const MODEL = data.prices.model
  .replace("claude-", "")
  .replace(/-(\d)-(\d)$/, " $1.$2")
  .replace(/^opus/, "Opus");
const decimal = (n: number) => String(n).replace(".", ",");
export const priceLine = (lang: Lang = "en") =>
  lang === "nb"
    ? `${MODEL} · $${decimal(price.input)} inn · $${decimal(price.output)} ut · $${decimal(price.cacheRead)} lest fra cache, per million tokens. Kronebeløp er regnet om med Norges Banks kurs ${decimal(USD_NOK.rate)} (${USD_NOK.date})`
    : `${MODEL} · $${price.input} in · $${price.output} out · $${price.cacheRead} cache read, per million tokens`;
export const PRICE_LINE = priceLine("en");

/**
 * Cost per run, the conservative way: a snapshot side's long transcript with
 * prompt caching, Booki's without, since its transcript is likely below the
 * model's smallest cacheable prefix.
 */
export const fairCost = (side: BenchSide) => (side.key === "acc" ? side.costUsd.noCache : side.costUsd.withCache);

/** One screen's real-model result for a task (`pnpm proof`): medians over its runs. */
export type RealSide = {
  task: string;
  model: string;
  key: string;
  name: string;
  runs: number;
  succeeded: number;
  toolCalls: number;
  requests: number;
  tokens: number;
  costUsd: number | null;
  wallMs: number;
};

/**
 * Tasks whose real-model results are withdrawn: a control's format hint gave
 * their answer away (the voucher's account, amount and VAT code; the sales
 * invoice's first line). They are shown again once remeasured with hints that
 * no task's answer is in (packages/primitives/src/no-task-answers.test.ts).
 */
export const WITHDRAWN: readonly string[] = ["voucher", "sales-invoice"];

/**
 * The screen sides only. The API side (key "api", `proof --side api`) is in
 * bench.json beside them but is not a screen: it is left out of every figure
 * that compares Booki with the rebuilt screens. Its result is in the FAQ and
 * benchmarks/agent/README.md.
 */
const REAL: RealSide[] = (((data as { real?: { sides: RealSide[] } }).real?.sides ?? []) as RealSide[]).filter(
  (side) => !WITHDRAWN.includes(side.task) && side.key !== "api",
);

/** Every real-model result still counted, for a task. */
export const realOf = (task: string): RealSide[] => REAL.filter((side) => side.task === task);

/** The real-model result for a task, model (by prefix, e.g. "anthropic/") and screen, if it was run. */
export function realFor(task: BenchTask, model: string, key: string): RealSide | undefined {
  return REAL.find((side) => side.task === task && side.model.startsWith(model) && side.key === key);
}

type RealRun = { task: string; model: string; prices?: { input: number } | null; side?: string };
const REAL_RUNS: RealRun[] = (((data as { real?: { runs: RealRun[] } }).real?.runs ?? []) as RealRun[]).filter(
  (run) => run.side !== "api",
);

/** The cheapest model run on a task, by list price for input, other than the one the main figures use. */
export function cheapModel(task: BenchTask, except = "anthropic/claude-opus"): string | undefined {
  return REAL_RUNS.filter((run) => run.task === task && !run.model.startsWith(except) && run.prices).sort(
    (a, b) => a.prices!.input - b.prices!.input,
  )[0]?.model;
}

/** "anthropic/claude-opus-5.5" → "Claude Opus 5.5"; "deepseek/deepseek-v4.1-flash-1017" → "DeepSeek V4.1 Flash". */
export function modelName(id: string): string {
  const name = id.split("/").pop() ?? id;
  const claude = /^claude-(opus|sonnet|haiku)-([\d.]+)/.exec(name);
  if (claude) return `Claude ${claude[1]![0]!.toUpperCase()}${claude[1]!.slice(1)} ${claude[2]}`;
  const deepseek = /^deepseek-v([\d.]+)-flash/.exec(name);
  if (deepseek) return `DeepSeek V${deepseek[1]} Flash`;
  return name;
}

/** How many times cheaper a model's input is than Opus 5.5's, from the run's list prices. */
export function cheaperThanOpus(task: BenchTask, model: string): number | undefined {
  const price = (id: string) => REAL_RUNS.find((run) => run.task === task && run.model.startsWith(id))?.prices?.input;
  const opus = price("anthropic/claude-opus");
  const other = price(model);
  return opus && other ? Math.round(opus / other) : undefined;
}

/** Every screen's real-model result for a task and model. */
export function realSides(task: BenchTask, model: string): RealSide[] {
  return REAL.filter((side) => side.task === task && side.model === model);
}

const SCREEN_TASKS: BenchTask[] = ["voucher", "supplier-invoice", "sales-invoice", "dashboard"];
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/**
 * The landing page's figures, from the real runs still counted: right on Booki
 * against right on the rebuilt screens, and for cost and time the median of
 * one ratio per pair (the same model on the same task, a rebuilt screen
 * against Booki) with the lowest and highest, so the spread shows.
 */
export function proofKpis() {
  const sides = REAL.filter((side) => SCREEN_TASKS.includes(side.task as BenchTask));
  const acc = sides.filter((side) => side.key === "acc");
  const raw = sides.filter((side) => side.key !== "acc");
  const pairs = acc.flatMap((a) =>
    sides
      .filter((r) => (r.key === "tripletex" || r.key === "dnb") && r.task === a.task && r.model === a.model)
      .map((r) => [a, r] as const),
  );
  const spread = (ratios: number[]) => ({
    median: median(ratios),
    low: Math.min(...ratios),
    high: Math.max(...ratios),
  });
  const costRatios = pairs.filter(([a, r]) => a.costUsd && r.costUsd).map(([a, r]) => r.costUsd! / a.costUsd!);
  const sum = (list: RealSide[], pick: (side: RealSide) => number) => list.reduce((n, side) => n + pick(side), 0);
  // Before and after are each side's median per run, for the bars. The factors
  // (cheaper, faster) are the median of each pair's ratio: another summary, so
  // the proof strip names both rather than letting one stand for the other.
  const cost = {
    before: median(pairs.map(([, r]) => r.costUsd ?? 0)),
    after: median(pairs.map(([a]) => a.costUsd ?? 0)),
  };
  const wallMs = { before: median(pairs.map(([, r]) => r.wallMs)), after: median(pairs.map(([a]) => a.wallMs)) };
  // Tool calls and tokens per run, the same medians: what the agent had to do and read.
  const calls = { before: median(pairs.map(([, r]) => r.toolCalls)), after: median(pairs.map(([a]) => a.toolCalls)) };
  const tokens = { before: median(pairs.map(([, r]) => r.tokens)), after: median(pairs.map(([a]) => a.tokens)) };
  return {
    right: {
      booki: sum(acc, (s) => s.succeeded),
      bookiRuns: sum(acc, (s) => s.runs),
      rebuilt: sum(raw, (s) => s.succeeded),
      rebuiltRuns: sum(raw, (s) => s.runs),
    },
    models: new Set(acc.map((side) => side.model)).size,
    cost,
    wallMs,
    calls,
    tokens,
    pairs: pairs.length,
    tasks: new Set(acc.map((side) => side.task)).size,
    cheaper: spread(costRatios),
    faster: spread(pairs.map(([a, r]) => r.wallMs / a.wallMs)),
  };
}
