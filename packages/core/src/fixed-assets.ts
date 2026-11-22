import { BookiError, msg } from "./msg.js";
import { parsePeriodCode, periodBounds } from "./period.js";
import type { NewVoucherLine } from "./voucher.js";

/**
 * - `straight-line`: the same amount every month over `usefulLifeMonths`.
 * - `declining-balance`: `rateBp` per year of the carrying amount, one twelfth each month.
 */
export type DepreciationMethod = "straight-line" | "declining-balance";

export const DEPRECIATION_METHODS: readonly DepreciationMethod[] = ["straight-line", "declining-balance"];

export type FixedAsset = {
  id: string;
  name: string;
  /** ISO date. Depreciation starts in this month, with a full month. */
  acquiredOn: string;
  /** What it cost, in minor units. */
  costMinor: number;
  /** What it is expected to be worth at the end. Never depreciated below this. */
  residualMinor: number;
  method: DepreciationMethod;
  /** Required for straight-line. Optional for declining-balance: the last month then takes what is left. */
  usefulLifeMonths?: number;
  /** Required for declining-balance. Yearly rate in basis points: 2000 is 20%. */
  rateBp?: number;
  /** ISO date. The month of disposal and later months are not depreciated. */
  disposedOn?: string;
  disposalProceedsMinor?: number;
};

export type ScheduleEntry = {
  /** Month code, `2026-03`. */
  period: string;
  depreciationMinor: number;
  /** Depreciation up to and including this month. */
  accumulatedMinor: number;
  /** Cost minus accumulated depreciation at the end of this month. */
  carryingMinor: number;
};

/** A declining-balance asset with no useful life is written down to its residual after this many months at the latest. */
export const MAX_SCHEDULE_MONTHS = 1200;

/** Round half away from zero, on exact integer arithmetic. */
function divRound(numerator: bigint, denominator: bigint): number {
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const rounded = (abs * 2n + denominator) / (denominator * 2n);
  return Number(negative ? -rounded : rounded);
}

const pad2 = (n: number) => String(n).padStart(2, "0");

type Day = { year: number; month: number; day: number; index: number; lastOfMonth: boolean };

function parseDay(value: unknown, what: string): Day {
  const match = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  const day = Number(match?.[3]);
  const last = match ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
  if (!match || month < 1 || month > 12 || day < 1 || day > last) {
    throw new BookiError("assets.date-format", { what, value: String(JSON.stringify(value)) });
  }
  return { year, month, day, index: year * 12 + (month - 1), lastOfMonth: day === last };
}

const monthCode = (index: number) => `${Math.floor(index / 12)}-${pad2((index % 12) + 1)}`;

function whole(value: unknown, what: string, assetId: string, min: number, max?: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || (max !== undefined && value > max)) {
    if (max !== undefined)
      throw new BookiError("assets.whole-range", { id: assetId, what, min, max, value: String(value) });
    throw new BookiError("assets.whole-min", { id: assetId, what, min, value: String(value) });
  }
  return value;
}

/** Check one asset and return it. Throws with a sentence that says what to fix. */
export function validateAsset(asset: FixedAsset): FixedAsset {
  const id = typeof asset?.id === "string" ? asset.id.trim() : "";
  if (id === "") throw new BookiError("assets.id-required");
  const acquired = parseDay(asset.acquiredOn, msg("assets.what.asset-acquisition-date", { id }));
  const cost = whole(asset.costMinor, msg("assets.what.cost"), id, 0);
  whole(asset.residualMinor, msg("assets.what.residual"), id, 0, cost);
  if (!DEPRECIATION_METHODS.includes(asset.method)) {
    throw new BookiError("assets.unknown-method", {
      id,
      method: String(JSON.stringify(asset.method)),
      methods: DEPRECIATION_METHODS.join(", "),
    });
  }
  if (asset.method === "straight-line" || asset.usefulLifeMonths !== undefined) {
    whole(asset.usefulLifeMonths, msg("assets.what.useful-life"), id, 1, MAX_SCHEDULE_MONTHS);
  }
  if (asset.method === "declining-balance") {
    whole(asset.rateBp, msg("assets.what.rate"), id, 1, 10_000);
  }
  if (asset.disposedOn !== undefined) {
    const disposed = parseDay(asset.disposedOn, msg("assets.what.asset-disposal-date", { id }));
    if (disposed.index < acquired.index || (disposed.index === acquired.index && disposed.day < acquired.day)) {
      throw new BookiError("assets.disposed-before-acquired", {
        id,
        disposed: asset.disposedOn,
        acquired: asset.acquiredOn,
      });
    }
  }
  if (asset.disposalProceedsMinor !== undefined) {
    whole(asset.disposalProceedsMinor, msg("assets.what.proceeds"), id, 0);
    if (asset.disposedOn === undefined) {
      throw new BookiError("assets.proceeds-without-date", { id });
    }
  }
  return asset;
}

/** Throws when an asset is invalid or an id is repeated. */
export function checkAssets(assets: FixedAsset[]): void {
  if (!Array.isArray(assets)) throw new BookiError("assets.list-shape");
  const ids = new Set<string>();
  for (const asset of assets) {
    validateAsset(asset);
    if (ids.has(asset.id)) throw new BookiError("assets.id-twice", { id: String(asset.id) });
    ids.add(asset.id);
  }
}

/**
 * Depreciation month by month, from the acquisition month. It never goes below
 * the residual value and the months sum exactly to cost minus residual: the
 * last month takes whatever rounding left. A disposed asset stops before the
 * month of disposal.
 */
export function depreciationSchedule(asset: FixedAsset): ScheduleEntry[] {
  validateAsset(asset);
  const first = parseDay(asset.acquiredOn, msg("assets.what.acquisition-date")).index;
  const stop =
    asset.disposedOn === undefined ? Infinity : parseDay(asset.disposedOn, msg("assets.what.disposal-date")).index;
  const depreciable = asset.costMinor - asset.residualMinor;
  const entries: ScheduleEntry[] = [];
  let accumulated = 0;
  const push = (i: number, amount: number) => {
    accumulated += amount;
    entries.push({
      period: monthCode(first + i),
      depreciationMinor: amount,
      accumulatedMinor: accumulated,
      carryingMinor: asset.costMinor - accumulated,
    });
  };

  if (asset.method === "straight-line") {
    const life = asset.usefulLifeMonths!;
    // Each month is the difference between two rounded-down cumulative amounts,
    // so month `life` lands exactly on the depreciable amount.
    const upTo = (months: number) => Number((BigInt(depreciable) * BigInt(months)) / BigInt(life));
    for (let i = 0; i < life && first + i < stop; i++) push(i, upTo(i + 1) - upTo(i));
    return entries;
  }

  const life = asset.usefulLifeMonths ?? MAX_SCHEDULE_MONTHS;
  const rate = BigInt(asset.rateBp!);
  for (let i = 0; accumulated < depreciable && first + i < stop; i++) {
    const remaining = depreciable - accumulated;
    let amount = divRound(BigInt(asset.costMinor - accumulated) * rate, 120_000n);
    // The last month, or a month whose share rounds to nothing, takes the remainder.
    if (amount >= remaining || amount === 0 || i === life - 1) amount = remaining;
    push(i, amount);
  }
  return entries;
}

function monthRange(periodCode: string): { from: number; to: number } {
  const period = typeof periodCode === "string" ? parsePeriodCode(periodCode) : null;
  const bounds = period ? periodBounds(period) : null;
  if (!period || !bounds) {
    throw new BookiError("assets.period-code", { value: String(JSON.stringify(periodCode)) });
  }
  return {
    from: parseDay(bounds.from, msg("assets.what.period-start")).index,
    to: parseDay(bounds.to, msg("assets.what.period-end")).index,
  };
}

/** The month codes a period covers: one for `2026-03`, twelve for `2026`. */
export function periodMonths(periodCode: string): string[] {
  const { from, to } = monthRange(periodCode);
  const months: string[] = [];
  for (let index = from; index <= to; index++) months.push(monthCode(index));
  return months;
}

/** Depreciation of one asset in a period: a month (`2026-03`) or a year (`2026`). */
export function depreciationFor(asset: FixedAsset, periodCode: string): number {
  const months = new Set(periodMonths(periodCode));
  return depreciationSchedule(asset)
    .filter((entry) => months.has(entry.period))
    .reduce((sum, entry) => sum + entry.depreciationMinor, 0);
}

/**
 * Depreciation booked up to a date: every scheduled month that has ended on or
 * before it.
 */
export function accumulatedDepreciation(asset: FixedAsset, date: string): number {
  const day = parseDay(date, msg("aging.what.as-of"));
  const through = day.lastOfMonth ? day.index : day.index - 1;
  const lastCode = monthCode(through);
  let accumulated = 0;
  for (const entry of depreciationSchedule(asset)) {
    if (entry.period > lastCode) break;
    accumulated = entry.accumulatedMinor;
  }
  return accumulated;
}

/**
 * Cost minus accumulated depreciation as of a date. Zero before the asset is
 * acquired and from the day it is disposed of.
 */
export function carryingAmount(asset: FixedAsset, date: string): number {
  validateAsset(asset);
  parseDay(date, msg("aging.what.as-of"));
  if (date < asset.acquiredOn) return 0;
  if (asset.disposedOn !== undefined && date >= asset.disposedOn) return 0;
  return asset.costMinor - accumulatedDepreciation(asset, date);
}

export type Disposal = {
  /** The asset with `disposedOn` and `disposalProceedsMinor` set. */
  asset: FixedAsset;
  /** Carrying amount when it left the books. */
  carryingMinor: number;
  proceedsMinor: number;
  /** Proceeds minus carrying amount: above zero is a gain, below zero a loss. */
  gainLossMinor: number;
};

/**
 * Dispose of an asset: sold, scrapped or lost. Refused before the acquisition
 * date and for an asset that is already disposed of.
 */
export function disposeAsset(asset: FixedAsset, date: string, proceedsMinor: number): Disposal {
  validateAsset(asset);
  if (asset.disposedOn !== undefined) {
    throw new BookiError("assets.already-disposed", { id: String(asset.id), date: asset.disposedOn });
  }
  parseDay(date, msg("assets.what.asset-disposal-date", { id: String(asset.id) }));
  if (date < asset.acquiredOn) {
    throw new BookiError("assets.dispose-before-acquired", {
      id: String(asset.id),
      date: String(date),
      acquired: asset.acquiredOn,
    });
  }
  const proceeds = whole(proceedsMinor, msg("assets.what.proceeds"), asset.id, 0);
  const next: FixedAsset = { ...asset, disposedOn: date, disposalProceedsMinor: proceeds };
  const carryingMinor = asset.costMinor - (depreciationSchedule(next).at(-1)?.accumulatedMinor ?? 0);
  return { asset: next, carryingMinor, proceedsMinor: proceeds, gainLossMinor: proceeds - carryingMinor };
}

export type RunAccount = { number: string; name: string };

export type DepreciationRunOptions = {
  /** The profit-and-loss account debited, e.g. `{ number: "6000", name: "Depreciation" }`. */
  expenseAccount: RunAccount;
  /** The balance-sheet account credited, e.g. `{ number: "1209", name: "Accumulated depreciation" }`. */
  accumulatedAccount: RunAccount;
  /** Period codes already run. A run that covers any of their months is refused. */
  runs?: string[];
};

export type SkipCode = "not-acquired" | "disposed" | "fully-depreciated" | "nothing-to-depreciate";

export type DepreciationRun = {
  period: string;
  /** Two per asset: debit expense, credit accumulated depreciation. */
  lines: NewVoucherLine[];
  /** What each asset is depreciated by. */
  entries: { assetId: string; amountMinor: number }[];
  totalMinor: number;
  skipped: { assetId: string; code: SkipCode; reason: string }[];
};

function account(value: RunAccount | undefined, option: string): RunAccount {
  const number = typeof value?.number === "string" ? value.number.trim() : "";
  if (number === "") {
    throw new BookiError("assets.run-account", { option });
  }
  return { number, name: String(value?.name ?? "") };
}

/**
 * The voucher lines that depreciate every asset for a period. Changes nothing:
 * post the lines, then record the period in `runs`. Refused when the period, or
 * a month of it, has already been run.
 */
export function depreciationRun(
  assets: FixedAsset[],
  periodCode: string,
  options: DepreciationRunOptions,
): DepreciationRun {
  const months = periodMonths(periodCode);
  const expense = account(options?.expenseAccount, "expenseAccount");
  const accumulatedAccount = account(options?.accumulatedAccount, "accumulatedAccount");
  for (const done of options.runs ?? []) {
    const overlap = periodMonths(done).filter((month) => months.includes(month));
    if (overlap.length > 0) {
      if (done === periodCode) throw new BookiError("assets.already-run", { period: String(periodCode) });
      throw new BookiError("assets.run-overlaps", {
        period: String(periodCode),
        done: String(done),
        months: overlap.join(", "),
      });
    }
  }
  checkAssets(assets);
  const first = months[0]!;
  const last = months.at(-1)!;
  const run: DepreciationRun = { period: periodCode, lines: [], entries: [], totalMinor: 0, skipped: [] };
  for (const asset of assets) {
    const amountMinor = depreciationFor(asset, periodCode);
    if (amountMinor > 0) {
      run.entries.push({ assetId: asset.id, amountMinor });
      run.totalMinor += amountMinor;
      run.lines.push(
        {
          id: `dep-${periodCode}-${asset.id}-debit`,
          account: expense.number,
          accountName: expense.name,
          debitMinor: amountMinor,
          creditMinor: 0,
          dims: asset.name,
        },
        {
          id: `dep-${periodCode}-${asset.id}-credit`,
          account: accumulatedAccount.number,
          accountName: accumulatedAccount.name,
          debitMinor: 0,
          creditMinor: amountMinor,
          dims: asset.name,
        },
      );
      continue;
    }
    const acquiredMonth = asset.acquiredOn.slice(0, 7);
    const disposedMonth = asset.disposedOn?.slice(0, 7);
    const skip = (code: SkipCode, reason: string) => run.skipped.push({ assetId: asset.id, code, reason });
    if (acquiredMonth > last) {
      skip(
        "not-acquired",
        msg("assets.skip.not-acquired", { id: asset.id, acquired: asset.acquiredOn, period: periodCode }),
      );
    } else if (disposedMonth !== undefined && disposedMonth <= first) {
      skip("disposed", msg("assets.skip.disposed", { id: asset.id, date: String(asset.disposedOn) }));
    } else if (asset.costMinor === asset.residualMinor) {
      skip("nothing-to-depreciate", msg("assets.skip.residual-equals-cost", { id: asset.id }));
    } else if ((depreciationSchedule(asset).at(-1)?.period ?? "") < first) {
      skip("fully-depreciated", msg("assets.skip.fully-depreciated", { id: asset.id, period: periodCode }));
    } else {
      skip("nothing-to-depreciate", msg("assets.skip.nothing-in-period", { id: asset.id, period: periodCode }));
    }
  }
  return run;
}

/** Throws when the period has been run already or no asset has anything to depreciate in it. */
export function assertRunnable(
  assets: FixedAsset[],
  periodCode: string,
  options: DepreciationRunOptions,
): DepreciationRun {
  const run = depreciationRun(assets, periodCode, options);
  if (run.lines.length === 0) {
    const reasons = run.skipped.map((skip) => skip.reason);
    throw new BookiError("assets.nothing-to-run", {
      period: String(periodCode),
      reasons: reasons.length > 0 ? reasons : [msg("assets.no-assets")],
    });
  }
  return run;
}
