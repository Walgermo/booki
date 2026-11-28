import kpi from "./kpi.json";

/**
 * What SSB's price calculator works out: an amount moved from one period to
 * another by the consumer price index (tables 14709 by month, 14711 yearly
 * average, 2025 = 100; kpi.json from benchmarks/agent/compare/capture-kpi.mjs).
 * A period is "YYYY" (the year's average) or "YYYY-MM" (a month). The amount is
 * in øre and so is the result, rounded to the øre; the change is in per cent,
 * rounded to one decimal, as the calculator shows it.
 */

const MONTHLY = kpi.monthly as Record<string, number>;
const YEARLY = kpi.yearly as Record<string, number>;

export const LATEST_MONTH = kpi.latestMonth;
export const FIRST_MONTH = Object.keys(MONTHLY).sort()[0]!;
export const FIRST_YEAR = Object.keys(YEARLY).sort()[0]!;
export const LAST_YEAR = Object.keys(YEARLY).sort().at(-1)!;

export const PERIOD_FORMAT = `"YYYY" for a year's average (${FIRST_YEAR}–${LAST_YEAR}) or "YYYY-MM" for a month (${FIRST_MONTH}–${LATEST_MONTH})`;

export function indexFor(period: string): number {
  if (/^\d{4}$/.test(period)) {
    const value = YEARLY[period];
    if (value === undefined) throw new RangeError(`No yearly average for ${period}. Use ${PERIOD_FORMAT}.`);
    return value;
  }
  if (/^\d{4}-\d{2}$/.test(period)) {
    const value = MONTHLY[period];
    if (value === undefined) throw new RangeError(`No index for ${period}. Use ${PERIOD_FORMAT}.`);
    return value;
  }
  throw new RangeError(`"${period}" is not a period. Use ${PERIOD_FORMAT}.`);
}

export type PriceChange = {
  amountMinor: number;
  from: string;
  to: string;
  fromIndex: number;
  toIndex: number;
  resultMinor: number;
  /** Per cent, one decimal. */
  changePct: number;
};

export function priceChange(amountMinor: number, from: string, to: string): PriceChange {
  if (!Number.isInteger(amountMinor) || amountMinor < 0) {
    throw new RangeError(`The amount is øre, a whole number 0 or more (12 500 kr is 1250000); got ${amountMinor}.`);
  }
  const fromIndex = indexFor(from);
  const toIndex = indexFor(to);
  return {
    amountMinor,
    from,
    to,
    fromIndex,
    toIndex,
    resultMinor: Math.round((amountMinor * toIndex) / fromIndex),
    changePct: Math.round((toIndex / fromIndex - 1) * 1000) / 10,
  };
}
