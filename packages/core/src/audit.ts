import { BookiError, msg } from "./msg.js";

/** Round half away from zero, on exact integer arithmetic. */
function divRound(numerator: bigint, denominator: bigint): number {
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const rounded = (abs * 2n + denominator) / (denominator * 2n);
  return Number(negative ? -rounded : rounded);
}

function whole(value: unknown, what: string, min?: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || (min !== undefined && value < min)) {
    if (min !== undefined) throw new BookiError("audit.whole-min", { what, min, value: String(value) });
    throw new BookiError("audit.whole", { what, value: String(value) });
  }
  return value;
}

const abs = (n: number) => (n < 0 ? -n : n);

// ── Materiality ─────────────────────────────────────────────────────────

export type MaterialityInput = {
  /** The benchmark the percentages are taken of: revenue, profit before tax, total assets. Minor units. */
  benchmarkMinor: number;
  /** Overall materiality as a share of the benchmark, in basis points: 100 is 1%. */
  overallBp: number;
  /** Performance materiality as a share of overall materiality, in basis points: 7500 is 75%. */
  performanceBp: number;
  /** The clearly-trivial threshold as a share of overall materiality, in basis points: 500 is 5%. */
  trivialBp: number;
};

export type Materiality = {
  benchmarkMinor: number;
  overallMinor: number;
  performanceMinor: number;
  trivialMinor: number;
};

/**
 * Overall and performance materiality and the clearly-trivial threshold, in
 * minor units. Performance and trivial are shares of overall materiality.
 */
export function materiality(input: MaterialityInput): Materiality {
  const benchmark = whole(input?.benchmarkMinor, msg("audit.what.benchmark"), 1);
  const overallBp = whole(input.overallBp, msg("audit.what.overall"), 1);
  const performanceBp = whole(input.performanceBp, msg("audit.what.performance"), 1);
  const trivialBp = whole(input.trivialBp, msg("audit.what.trivial"), 0);
  if (overallBp > 10_000) {
    throw new BookiError("audit.overall-too-high", { value: overallBp });
  }
  if (performanceBp > 10_000) {
    throw new BookiError("audit.performance-too-high", { value: performanceBp });
  }
  if (trivialBp > performanceBp) {
    throw new BookiError("audit.trivial-too-high", { trivial: trivialBp, performance: performanceBp });
  }
  const overallMinor = divRound(BigInt(benchmark) * BigInt(overallBp), 10_000n);
  return {
    benchmarkMinor: benchmark,
    overallMinor,
    performanceMinor: divRound(BigInt(overallMinor) * BigInt(performanceBp), 10_000n),
    trivialMinor: divRound(BigInt(overallMinor) * BigInt(trivialBp), 10_000n),
  };
}

// ── Sampling ────────────────────────────────────────────────────────────

/** One item an auditor can select: an invoice, a receivable, a journal. */
export type PopulationItem = {
  id: string;
  /** Recorded amount in minor units. May be negative (a credit). */
  amountMinor: number;
  description?: string;
};

/**
 * - `all-above`: every item whose absolute amount is at or above `tolerableMinor`.
 * - `monetary-unit`: a fixed interval through the absolute amounts from a seeded
 *   start, so the chance of selection follows the size of the item.
 * - `random`: `size` items, each equally likely.
 */
export type SampleMethod = "all-above" | "monetary-unit" | "random";

export const SAMPLE_METHODS: readonly SampleMethod[] = ["all-above", "monetary-unit", "random"];

export type SampleOptions = {
  method: SampleMethod;
  /** The threshold for `all-above`; the interval for `monetary-unit` when no `size` is given. */
  tolerableMinor?: number;
  /** How many items (`random`) or selection points (`monetary-unit`). */
  size?: number;
  /** Any text. The same population, options and seed always select the same items. */
  seed: string;
};

/** Everything needed to draw the same sample again. */
export type Sample = {
  method: SampleMethod;
  seed: string;
  size?: number;
  tolerableMinor?: number;
  /** `monetary-unit`: the distance between selection points, in minor units. */
  intervalMinor?: number;
  /** `monetary-unit`: the first selection point, 1…interval, from the seed. */
  startMinor?: number;
  populationCount: number;
  /** The signed sum of the population: ties to the ledger. */
  populationTotalMinor: number;
  /** The sum of absolute amounts: what selection and projection work on. */
  populationAbsMinor: number;
  /** The selected items, in id order. */
  items: PopulationItem[];
};

function hashSeed(seed: string): number {
  // FNV-1a over UTF-16 code units, then an avalanche step.
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** mulberry32: a small seeded generator of 32-bit whole numbers. Never `Math.random`. */
function seeded(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/** A whole number from 0 up to, not including, `n`, from two 32-bit draws. */
function below(next: () => number, n: bigint): bigint {
  return ((BigInt(next()) << 32n) | BigInt(next())) % n;
}

/** Throws when an id is missing or repeated or an amount is not whole minor units. Returns the items in id order. */
export function checkPopulation(population: PopulationItem[]): PopulationItem[] {
  if (!Array.isArray(population)) throw new BookiError("audit.population-shape");
  const ids = new Set<string>();
  for (const item of population) {
    const id = typeof item?.id === "string" ? item.id.trim() : "";
    if (id === "") throw new BookiError("audit.population-id-required");
    if (ids.has(item.id)) throw new BookiError("audit.population-id-twice", { id: String(item.id) });
    ids.add(item.id);
    whole(item.amountMinor, msg("audit.what.population-amount", { id: String(item.id) }));
  }
  return [...population].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function populationTotalMinor(population: PopulationItem[]): number {
  return population.reduce((sum, item) => sum + item.amountMinor, 0);
}

const absTotal = (items: Pick<PopulationItem, "amountMinor">[]) =>
  items.reduce((sum, item) => sum + abs(item.amountMinor), 0);

/**
 * Select items to test. Reproducible: the population is put in id order and
 * every choice comes from `seed`, so the same population, options and seed give
 * the same sample whatever order the items arrive in.
 */
export function drawSample(population: PopulationItem[], options: SampleOptions): Sample {
  const ordered = checkPopulation(population);
  if (typeof options !== "object" || options === null) {
    throw new BookiError("audit.sample-options");
  }
  const { method } = options;
  if (!SAMPLE_METHODS.includes(method)) {
    throw new BookiError("audit.unknown-method", {
      method: String(JSON.stringify(method)),
      methods: SAMPLE_METHODS.join(", "),
    });
  }
  if (typeof options.seed !== "string" || options.seed.trim() === "") {
    throw new BookiError("audit.seed-required");
  }
  if (ordered.length === 0) throw new BookiError("audit.population-empty");
  const seed = options.seed;
  const size = options.size === undefined ? undefined : whole(options.size, msg("audit.what.sample-size"), 1);
  const tolerable =
    options.tolerableMinor === undefined ? undefined : whole(options.tolerableMinor, msg("audit.what.tolerable"), 1);
  const populationAbsMinor = absTotal(ordered);
  const base = {
    method,
    seed,
    populationCount: ordered.length,
    populationTotalMinor: populationTotalMinor(ordered),
    populationAbsMinor,
  };

  if (method === "all-above") {
    if (tolerable === undefined) {
      throw new BookiError("audit.all-above-needs-tolerable");
    }
    return { ...base, tolerableMinor: tolerable, items: ordered.filter((item) => abs(item.amountMinor) >= tolerable) };
  }

  if (method === "random") {
    if (size === undefined) throw new BookiError("audit.random-needs-size");
    if (size > ordered.length) {
      throw new BookiError("audit.random-too-many", { size, count: ordered.length });
    }
    const next = seeded(seed);
    // Partial Fisher–Yates over positions; the picked positions are then put back in id order.
    const positions = ordered.map((_, index) => index);
    for (let i = 0; i < size; i++) {
      const j = i + Number(below(next, BigInt(positions.length - i)));
      const held = positions[i]!;
      positions[i] = positions[j]!;
      positions[j] = held;
    }
    const picked = positions.slice(0, size).sort((a, b) => a - b);
    return {
      ...base,
      size,
      ...(tolerable !== undefined ? { tolerableMinor: tolerable } : {}),
      items: picked.map((index) => ordered[index]!),
    };
  }

  // monetary-unit
  if (populationAbsMinor === 0) {
    throw new BookiError("audit.mus-all-zero");
  }
  if (size === undefined && tolerable === undefined) {
    throw new BookiError("audit.mus-needs-size");
  }
  // With a size, the interval is the population divided by it, rounded up so there are never more points than asked for.
  const interval =
    size !== undefined ? (BigInt(populationAbsMinor) + BigInt(size) - 1n) / BigInt(size) : BigInt(tolerable!);
  const start = below(seeded(seed), interval) + 1n;
  const items: PopulationItem[] = [];
  let before = 0n;
  let point = start;
  for (const item of ordered) {
    const after = before + BigInt(abs(item.amountMinor));
    // Selected when a point falls in (before, after]. An item as large as the interval always holds one.
    if (point <= after) {
      items.push(item);
      while (point <= after) point += interval;
    }
    before = after;
  }
  return {
    ...base,
    ...(size !== undefined ? { size } : {}),
    ...(tolerable !== undefined ? { tolerableMinor: tolerable } : {}),
    intervalMinor: Number(interval),
    startMinor: Number(start),
    items,
  };
}

// ── Testing ─────────────────────────────────────────────────────────────

/** One mark from the legend: "✓ agreed to invoice", "B agreed to bank". */
export type TickMark = { symbol: string; meaning: string };

export type TestResult = "untested" | "ok" | "exception";

export const TEST_RESULTS: readonly TestResult[] = ["untested", "ok", "exception"];

/** A selected item and what testing it showed. */
export type WorkpaperItem = PopulationItem & {
  result: TestResult;
  /** For an exception: the misstatement found, minor units. Positive is an overstatement. */
  misstatementMinor?: number;
  /** A symbol from the tick-mark legend. */
  tickMark?: string;
  /** The id of the attachment that supports the result. */
  evidenceId?: string;
  note?: string;
  /** Who last changed this item: `"agent"`, or a person's id. Agent work is unreviewed until a person changes or signs it. */
  by?: string;
};

export type SignOffRole = "preparer" | "reviewer";

export type SignOff = {
  by: string;
  /** ISO timestamp. */
  at: string;
};

/**
 * An audit test: the sample, the result per item, the conclusion and who signed.
 * Once the preparer has signed, the items and the conclusion are fixed.
 */
export type Workpaper = {
  sample?: Sample;
  items: WorkpaperItem[];
  /** Written by a person, never by an agent. */
  conclusion?: string;
  preparer?: SignOff;
  reviewer?: SignOff;
};

export const EMPTY_WORKPAPER: Workpaper = { items: [] };

/** Start testing a sample: every selected item is untested. Refused once the workpaper is signed. */
export function startWorkpaper(sample: Sample, previous?: Workpaper): Workpaper {
  if (previous) assertUnsigned(previous);
  return {
    sample,
    items: sample.items.map((item) => ({ ...item, result: "untested" })),
    ...(previous?.conclusion ? { conclusion: previous.conclusion } : {}),
  };
}

function assertUnsigned(workpaper: Workpaper): void {
  if (workpaper.reviewer) {
    throw new BookiError("audit.locked-reviewed", { by: String(workpaper.reviewer.by) });
  }
  if (workpaper.preparer) {
    throw new BookiError("audit.locked-prepared", { by: String(workpaper.preparer.by) });
  }
}

function findItem(workpaper: Workpaper, itemId: string): WorkpaperItem {
  const item = workpaper.items.find((entry) => entry.id === itemId);
  if (!item) {
    throw new BookiError("audit.no-item", {
      id: String(itemId),
      items: workpaper.items.map((entry) => entry.id).join(", ") || msg("audit.none-draw-first"),
    });
  }
  return item;
}

function who(by: string): string {
  const actor = String(by ?? "").trim();
  if (actor === "") throw new BookiError("audit.change-actor-required");
  return actor;
}

function replaceItem(workpaper: Workpaper, next: WorkpaperItem): Workpaper {
  return { ...workpaper, items: workpaper.items.map((item) => (item.id === next.id ? next : item)) };
}

/**
 * Record the result of testing one item. A misstatement amount is only taken
 * with `exception`; `untested` clears it.
 */
export function setItemResult(
  workpaper: Workpaper,
  itemId: string,
  result: TestResult,
  misstatementMinor: number | undefined,
  by: string,
): Workpaper {
  assertUnsigned(workpaper);
  const actor = who(by);
  const item = findItem(workpaper, String(itemId));
  if (!TEST_RESULTS.includes(result)) {
    throw new BookiError("audit.unknown-result", {
      result: String(JSON.stringify(result)),
      id: String(item.id),
      results: TEST_RESULTS.join(", "),
    });
  }
  if (misstatementMinor !== undefined && misstatementMinor !== null) {
    whole(misstatementMinor, msg("audit.what.misstatement", { id: String(item.id) }));
    if (result !== "exception" && misstatementMinor !== 0) {
      throw new BookiError("audit.misstatement-needs-exception", { id: String(item.id), result: String(result) });
    }
  }
  const { misstatementMinor: _old, ...rest } = item;
  return replaceItem(workpaper, {
    ...rest,
    result,
    ...(result === "exception" && typeof misstatementMinor === "number" ? { misstatementMinor } : {}),
    by: actor,
  });
}

/** Set or clear (`""`) the tick mark. The symbol must be in the legend. */
export function setItemTickMark(
  workpaper: Workpaper,
  itemId: string,
  symbol: string,
  legend: readonly TickMark[],
  by: string,
): Workpaper {
  assertUnsigned(workpaper);
  const actor = who(by);
  const item = findItem(workpaper, String(itemId));
  const mark = String(symbol ?? "");
  if (mark !== "" && !legend.some((entry) => entry.symbol === mark)) {
    throw new BookiError("audit.unknown-tick-mark", {
      mark,
      marks: legend.map((entry) => `${entry.symbol} (${entry.meaning})`).join(", ") || msg("audit.none-legend-empty"),
    });
  }
  const { tickMark: _old, ...rest } = item;
  return replaceItem(workpaper, { ...rest, ...(mark ? { tickMark: mark } : {}), by: actor });
}

/** Set or clear (`""`) the attachment that supports the result. */
export function setItemEvidence(workpaper: Workpaper, itemId: string, attachmentId: string, by: string): Workpaper {
  assertUnsigned(workpaper);
  const actor = who(by);
  const item = findItem(workpaper, String(itemId));
  const id = String(attachmentId ?? "").trim();
  const { evidenceId: _old, ...rest } = item;
  return replaceItem(workpaper, { ...rest, ...(id ? { evidenceId: id } : {}), by: actor });
}

/** Set or clear (`""`) the note. An exception needs one before anyone can sign. */
export function setItemNote(workpaper: Workpaper, itemId: string, text: string, by: string): Workpaper {
  assertUnsigned(workpaper);
  const actor = who(by);
  const item = findItem(workpaper, String(itemId));
  const note = String(text ?? "").trim();
  const { note: _old, ...rest } = item;
  return replaceItem(workpaper, { ...rest, ...(note ? { note } : {}), by: actor });
}

/** A person writes the conclusion. Refused once the workpaper is signed. */
export function setConclusion(workpaper: Workpaper, text: string): Workpaper {
  assertUnsigned(workpaper);
  const conclusion = String(text ?? "").trim();
  const { conclusion: _old, ...rest } = workpaper;
  return conclusion ? { ...rest, conclusion } : rest;
}

// ── Summary ─────────────────────────────────────────────────────────────

export type SampleSummary = {
  selected: number;
  tested: number;
  untested: number;
  exceptions: number;
  /** Results last set by an agent that no person has changed since. */
  byAgent: number;
  /** The signed sum of the misstatements found. */
  knownMisstatementMinor: number;
  /** The sum of absolute amounts of the selected items. */
  sampledAbsMinor: number;
  populationAbsMinor: number;
  /** Known misstatement ÷ sampled amount × population, rounded half away from zero. */
  projectedMisstatementMinor: number;
  tolerableMinor?: number;
  /** True when the projection is above tolerable misstatement. Absent when no tolerable amount is given. */
  exceedsTolerable?: boolean;
};

export function summarizeSample(workpaper: Workpaper, tolerableMinor?: number): SampleSummary {
  const items = workpaper.items;
  const tolerable =
    tolerableMinor === undefined
      ? workpaper.sample?.tolerableMinor
      : whole(tolerableMinor, msg("audit.what.tolerable"), 0);
  const known = items.reduce((sum, item) => sum + (item.result === "exception" ? (item.misstatementMinor ?? 0) : 0), 0);
  const sampledAbsMinor = absTotal(items);
  const populationAbsMinor = workpaper.sample?.populationAbsMinor ?? sampledAbsMinor;
  const projected =
    sampledAbsMinor === 0 ? 0 : divRound(BigInt(known) * BigInt(populationAbsMinor), BigInt(sampledAbsMinor));
  const untested = items.filter((item) => item.result === "untested").length;
  return {
    selected: items.length,
    tested: items.length - untested,
    untested,
    exceptions: items.filter((item) => item.result === "exception").length,
    byAgent: items.filter((item) => item.by === "agent").length,
    knownMisstatementMinor: known,
    sampledAbsMinor,
    populationAbsMinor,
    projectedMisstatementMinor: projected,
    ...(tolerable !== undefined ? { tolerableMinor: tolerable, exceedsTolerable: abs(projected) > tolerable } : {}),
  };
}

// ── Sign-off ────────────────────────────────────────────────────────────

/** Everything that stops the workpaper from being signed, as sentences. */
export function workpaperIssues(workpaper: Workpaper): string[] {
  const issues: string[] = [];
  if (!workpaper.sample) issues.push(msg("audit.no-sample"));
  else if (workpaper.items.length === 0) issues.push(msg("audit.sample-empty"));
  const untested = workpaper.items.filter((item) => item.result === "untested");
  if (untested.length > 0) {
    issues.push(msg("audit.untested", { count: untested.length, ids: untested.map((item) => item.id).join(", ") }));
  }
  for (const item of workpaper.items) {
    if (item.result === "exception" && !item.note) {
      issues.push(msg("audit.exception-without-note", { id: String(item.id) }));
    }
  }
  return issues;
}

/** Throws while an item is untested or an exception has no note. */
export function assertReadyForSignOff(workpaper: Workpaper): void {
  const issues = workpaperIssues(workpaper);
  if (issues.length > 0) throw new BookiError("audit.not-ready", { issues });
}

/**
 * Sign the workpaper. The preparer signs first; the reviewer must be a
 * different person. Nothing can be signed while the workpaper has issues.
 */
export function signOffWorkpaper(workpaper: Workpaper, role: SignOffRole, by: string, at: string): Workpaper {
  const actor = String(by ?? "").trim();
  if (actor === "") throw new BookiError("audit.signer-required");
  if (role !== "preparer" && role !== "reviewer") {
    throw new BookiError("audit.unknown-role", { role: String(JSON.stringify(role)) });
  }
  assertReadyForSignOff(workpaper);
  if (role === "preparer") {
    if (workpaper.preparer) throw new BookiError("audit.already-prepared", { by: String(workpaper.preparer.by) });
    return { ...workpaper, preparer: { by: actor, at } };
  }
  if (!workpaper.preparer) throw new BookiError("audit.preparer-first");
  if (workpaper.reviewer) throw new BookiError("audit.already-reviewed", { by: String(workpaper.reviewer.by) });
  if (workpaper.preparer.by === actor) {
    throw new BookiError("audit.preparer-cannot-review", { actor });
  }
  return { ...workpaper, reviewer: { by: actor, at } };
}

/**
 * Take back a sign-off. A reviewer withdraws their own review; the preparer
 * withdraws their own sign-off, but not after review.
 */
export function withdrawSignOff(workpaper: Workpaper, by: string): Workpaper {
  const actor = String(by ?? "").trim();
  if (actor === "") throw new BookiError("audit.withdrawer-required");
  if (workpaper.reviewer) {
    if (workpaper.reviewer.by !== actor) {
      throw new BookiError("audit.only-reviewer-withdraws", { by: String(workpaper.reviewer.by) });
    }
    const { reviewer: _reviewer, ...rest } = workpaper;
    return rest;
  }
  if (!workpaper.preparer) throw new BookiError("audit.nothing-to-withdraw");
  if (workpaper.preparer.by !== actor) {
    throw new BookiError("audit.only-preparer-withdraws", { by: String(workpaper.preparer.by) });
  }
  const { preparer: _preparer, ...rest } = workpaper;
  return rest;
}
