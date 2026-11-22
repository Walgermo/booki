import { BookiError } from "./msg.js";
import { minorDigitsFor } from "./money.js";

/** Rates are whole numbers of millionths, so 11.2345 NOK per EUR is 11_234_500. */
export const RATE_SCALE = 1_000_000;

export type ExchangeRate = {
  /** ISO date the rate applies from, YYYY-MM-DD. */
  date: string;
  from: string;
  to: string;
  /** Units of `to` for one unit of `from`, times `RATE_SCALE`. Whole number. */
  rateScaled: number;
};

function checkRate(rateScaled: number): void {
  if (!Number.isSafeInteger(rateScaled) || rateScaled <= 0) {
    throw new BookiError("fx.rate-format", { value: String(rateScaled) });
  }
}

function divRound(numerator: bigint, denominator: bigint): number {
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const rounded = (abs * 2n + denominator) / (denominator * 2n);
  const result = negative ? -rounded : rounded;
  // A converted amount past the safe range cannot be held exactly in minor units.
  if (result > BigInt(Number.MAX_SAFE_INTEGER) || result < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new BookiError("money.not-safe-integer", { value: String(result) });
  }
  return Number(result);
}

/**
 * Convert an amount in minor units to another currency, rounding half away
 * from zero. Currencies with different numbers of decimals (JPY has none, KWD
 * has three) are handled: 100.00 USD at 150 JPY is 15000 yen, not 1500000.
 */
export function convertMinor(amountMinor: number, from: string, to: string, rateScaled: number): number {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new BookiError("fx.amount-format", { value: String(amountMinor) });
  }
  checkRate(rateScaled);
  const shift = minorDigitsFor(to) - minorDigitsFor(from);
  let numerator = BigInt(amountMinor) * BigInt(rateScaled);
  let denominator = BigInt(RATE_SCALE);
  if (shift > 0) numerator *= 10n ** BigInt(shift);
  if (shift < 0) denominator *= 10n ** BigInt(-shift);
  return divRound(numerator, denominator);
}

/**
 * The rate to use on a date: the latest one on or before it. A rate quoted
 * the other way round is inverted. Throws when there is none, naming the pair
 * and the date.
 */
export function findRate(rates: ExchangeRate[], from: string, to: string, date: string): ExchangeRate {
  const a = from.toUpperCase();
  const b = to.toUpperCase();
  if (a === b) return { date, from: a, to: b, rateScaled: RATE_SCALE };
  const usable = rates
    .filter((rate) => rate.date <= date)
    .filter(
      (rate) =>
        (rate.from.toUpperCase() === a && rate.to.toUpperCase() === b) ||
        (rate.from.toUpperCase() === b && rate.to.toUpperCase() === a),
    )
    .sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
  const found = usable[0];
  if (!found) {
    throw new BookiError("fx.no-rate", { from: String(a), to: String(b), date: String(date) });
  }
  checkRate(found.rateScaled);
  if (found.from.toUpperCase() === a) return { ...found, from: a, to: b };
  return {
    date: found.date,
    from: a,
    to: b,
    rateScaled: divRound(BigInt(RATE_SCALE) * BigInt(RATE_SCALE), BigInt(found.rateScaled)),
  };
}

/** An amount booked in a foreign currency, with the rate it was booked at. */
export type ForeignAmount = {
  currency: string;
  /** Amount in the foreign currency's minor units. */
  amountMinor: number;
  rateScaled: number;
};

/** Throws unless `baseMinor` is exactly what the foreign amount converts to at its rate. */
export function assertForeignAmount(foreign: ForeignAmount, baseCurrency: string, baseMinor: number): void {
  const expected = convertMinor(foreign.amountMinor, foreign.currency, baseCurrency, foreign.rateScaled);
  if (Math.abs(expected) !== Math.abs(baseMinor)) {
    throw new BookiError("fx.amount-mismatch", {
      amount: String(foreign.amountMinor),
      currency: String(foreign.currency),
      rate: foreign.rateScaled / RATE_SCALE,
      expected,
      base: String(baseCurrency),
      actual: String(baseMinor),
    });
  }
}

/** An open item in a foreign currency: a receivable is positive, a payable negative. */
export type OpenForeignItem = {
  id: string;
  currency: string;
  /** Remaining amount in the foreign currency's minor units. */
  amountMinor: number;
  /** What it is carried at in the base currency today. */
  bookedBaseMinor: number;
};

export type Revaluation = {
  date: string;
  baseCurrency: string;
  items: {
    id: string;
    currency: string;
    rateScaled: number;
    revaluedBaseMinor: number;
    /** Positive is an unrealised gain, negative a loss. */
    differenceMinor: number;
  }[];
  /** Net unrealised gain (positive) or loss (negative) in base minor units. */
  totalDifferenceMinor: number;
};

/**
 * Revalue open foreign-currency items at the rate on a date. Returns the
 * difference per item and in total; it posts nothing. Throws when a currency
 * has no rate.
 */
export function revalue(
  items: OpenForeignItem[],
  rates: ExchangeRate[],
  baseCurrency: string,
  date: string,
): Revaluation {
  const out = items.map((item) => {
    const rate = findRate(rates, item.currency, baseCurrency, date);
    const revaluedBaseMinor = convertMinor(item.amountMinor, item.currency, baseCurrency, rate.rateScaled);
    return {
      id: item.id,
      currency: item.currency.toUpperCase(),
      rateScaled: rate.rateScaled,
      revaluedBaseMinor,
      differenceMinor: revaluedBaseMinor - item.bookedBaseMinor,
    };
  });
  return {
    date,
    baseCurrency: baseCurrency.toUpperCase(),
    items: out,
    totalDifferenceMinor: out.reduce((sum, item) => sum + item.differenceMinor, 0),
  };
}
