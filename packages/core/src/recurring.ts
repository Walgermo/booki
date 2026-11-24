import { BookiError, msg } from "./msg.js";

/**
 * Recurring revenue from customer agreements: recurring revenue on a date,
 * and the bridge from one date to another (new, expansion, contraction,
 * churn) that adds up exactly. Amounts are integer minor units; currencies
 * are never added together.
 *
 * An agreement is billed per month, quarter or year. Everything is summed in
 * whole minor units per year (ARR), where every interval is exact. MRR is
 * ARR / 12, rounded half away from zero; a yearly 1 000.00 is 83.33 a month.
 * When the rounded monthly figures do not add up, the bridge says by how
 * much in `roundingMinor` instead of hiding it in a movement.
 */
export type RecurringInterval = "month" | "quarter" | "year";

export const RECURRING_INTERVALS: readonly RecurringInterval[] = ["month", "quarter", "year"];

const PER_YEAR: Record<RecurringInterval, number> = { month: 12, quarter: 4, year: 1 };

export type RecurringAgreement = {
  id: string;
  customerId: string;
  /** Recurring amount per month, in minor units. Or give `amountMinor` with its `interval`. */
  mrrMinor?: number;
  /** The amount billed each `interval`, in minor units. */
  amountMinor?: number;
  /** How often `amountMinor` is billed. Defaults to month. */
  interval?: RecurringInterval;
  currency: string;
  /** First day it runs, YYYY-MM-DD. */
  start: string;
  /** Last day it runs, YYYY-MM-DD; left out while it runs on. */
  end?: string;
};

export type RecurringMovement = "new" | "expansion" | "contraction" | "churn";

export const RECURRING_MOVEMENTS: readonly RecurringMovement[] = ["new", "expansion", "contraction", "churn"];

export type RecurringFigures = {
  openingMinor: number;
  newMinor: number;
  expansionMinor: number;
  /** A decrease: zero or negative. */
  contractionMinor: number;
  /** A decrease: zero or negative. */
  churnMinor: number;
  closingMinor: number;
  /** What rounding each figure to whole minor units moved: closing less opening and the movements. Zero for ARR. */
  roundingMinor: number;
};

export type RecurringBridge = {
  currency: string;
  from: string;
  to: string;
  /** Per year, exact. */
  arr: RecurringFigures;
  /** Per month: each ARR figure / 12, rounded. */
  mrr: RecurringFigures;
  /** Customer ids behind each movement. */
  customers: Record<RecurringMovement, string[]>;
  /** Opening plus the movements equals closing, per year. Always true; shown so it can be read. */
  reconciles: boolean;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function realDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function checkDate(value: unknown): string {
  const date = String(value ?? "").trim();
  if (!realDate(date)) throw new BookiError("recurring.date-format", { value: date });
  return date;
}

/** A whole number of minor units divided by 12, rounded half away from zero. */
export function monthlyOf(annualMinor: number): number {
  const sign = annualMinor < 0 ? -1 : 1;
  const magnitude = Math.abs(annualMinor);
  const whole = Math.floor(magnitude / 12);
  const rounded = (magnitude % 12) * 2 >= 12 ? whole + 1 : whole;
  return sign * rounded || 0;
}

/** An agreement's recurring revenue per year, in whole minor units. Throws for one it cannot read. */
export function annualMinorOf(agreement: RecurringAgreement): number {
  const id = String(agreement.id);
  if (agreement.mrrMinor !== undefined && agreement.amountMinor !== undefined) {
    throw new BookiError("recurring.two-amounts", { id });
  }
  if (agreement.amountMinor !== undefined) {
    const interval = agreement.interval ?? "month";
    if (!RECURRING_INTERVALS.includes(interval)) {
      throw new BookiError("recurring.interval", {
        id,
        value: String(interval),
        intervals: RECURRING_INTERVALS.join(", "),
      });
    }
    if (!Number.isSafeInteger(agreement.amountMinor) || agreement.amountMinor < 0) {
      throw new BookiError("recurring.amount-minor", { id, value: String(agreement.amountMinor) });
    }
    return agreement.amountMinor * PER_YEAR[interval];
  }
  if (!Number.isSafeInteger(agreement.mrrMinor) || (agreement.mrrMinor as number) < 0) {
    throw new BookiError("recurring.mrr-minor", { id, value: String(agreement.mrrMinor) });
  }
  return (agreement.mrrMinor as number) * 12;
}

/** Throws unless each agreement has whole, non-negative minor units, a known interval and real dates in order. */
export function assertAgreements(agreements: readonly RecurringAgreement[]): void {
  for (const agreement of agreements) {
    annualMinorOf(agreement);
    checkDate(agreement.start);
    if (agreement.end !== undefined && checkDate(agreement.end) < agreement.start) {
      throw new BookiError("recurring.end-before-start", { id: agreement.id });
    }
  }
}

const running = (agreement: RecurringAgreement, date: string) =>
  agreement.start <= date && (agreement.end === undefined || agreement.end >= date);

/** Recurring revenue per year by customer on a date, in one currency. */
export function arrByCustomer(
  agreements: readonly RecurringAgreement[],
  date: string,
  currency: string,
): Map<string, number> {
  const day = checkDate(date);
  const out = new Map<string, number>();
  for (const agreement of agreements) {
    if (agreement.currency !== currency || !running(agreement, day)) continue;
    out.set(agreement.customerId, (out.get(agreement.customerId) ?? 0) + annualMinorOf(agreement));
  }
  return out;
}

/** ARR on a date, in one currency, exact. */
export function arrOn(agreements: readonly RecurringAgreement[], date: string, currency: string): number {
  let total = 0;
  for (const value of arrByCustomer(agreements, date, currency).values()) total += value;
  return total;
}

/** MRR on a date, in one currency: ARR / 12, rounded. */
export function mrrOn(agreements: readonly RecurringAgreement[], date: string, currency: string): number {
  return monthlyOf(arrOn(agreements, date, currency));
}

/** The currencies the agreements are in, sorted. */
export function recurringCurrencies(agreements: readonly RecurringAgreement[]): string[] {
  return [...new Set(agreements.map((agreement) => agreement.currency))].sort();
}

/** From one date to another: each customer's change is new, expansion, contraction or churn. */
export function recurringBridge(
  agreements: readonly RecurringAgreement[],
  from: string,
  to: string,
  currency: string,
): RecurringBridge {
  if (checkDate(to) < checkDate(from)) throw new BookiError("recurring.range-order", { from, to });
  const before = arrByCustomer(agreements, from, currency);
  const after = arrByCustomer(agreements, to, currency);
  const customers: Record<RecurringMovement, string[]> = { new: [], expansion: [], contraction: [], churn: [] };
  const sums: Record<RecurringMovement, number> = { new: 0, expansion: 0, contraction: 0, churn: 0 };
  for (const id of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const was = before.get(id) ?? 0;
    const now = after.get(id) ?? 0;
    const kind: RecurringMovement | null =
      was === 0 && now > 0
        ? "new"
        : was > 0 && now === 0
          ? "churn"
          : now > was
            ? "expansion"
            : now < was
              ? "contraction"
              : null;
    if (!kind) continue;
    customers[kind].push(id);
    sums[kind] += now - was;
  }
  let opening = 0;
  for (const value of before.values()) opening += value;
  let closing = 0;
  for (const value of after.values()) closing += value;
  const arr: RecurringFigures = {
    openingMinor: opening,
    newMinor: sums.new,
    expansionMinor: sums.expansion,
    contractionMinor: sums.contraction,
    churnMinor: sums.churn,
    closingMinor: closing,
    roundingMinor: 0,
  };
  const monthly = {
    openingMinor: monthlyOf(opening),
    newMinor: monthlyOf(sums.new),
    expansionMinor: monthlyOf(sums.expansion),
    contractionMinor: monthlyOf(sums.contraction),
    churnMinor: monthlyOf(sums.churn),
    closingMinor: monthlyOf(closing),
  };
  const mrr: RecurringFigures = {
    ...monthly,
    roundingMinor:
      monthly.closingMinor -
      (monthly.openingMinor +
        monthly.newMinor +
        monthly.expansionMinor +
        monthly.contractionMinor +
        monthly.churnMinor),
  };
  return {
    currency,
    from,
    to,
    arr,
    mrr,
    customers,
    reconciles: opening + sums.new + sums.expansion + sums.contraction + sums.churn === closing,
  };
}

/** Month-end MRR from one month to another (YYYY-MM), in one currency, for a trend chart. */
export function mrrSeries(
  agreements: readonly RecurringAgreement[],
  fromMonth: string,
  toMonth: string,
  currency: string,
): { period: string; valueMinor: number }[] {
  const index = (month: string) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BookiError("chart.month-format", { value: month });
    return Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
  };
  const out: { period: string; valueMinor: number }[] = [];
  for (let n = index(fromMonth); n <= index(toMonth); n += 1) {
    const year = Math.floor(n / 12);
    const month = (n % 12) + 1;
    const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    out.push({ period: `${year}-${String(month).padStart(2, "0")}`, valueMinor: mrrOn(agreements, last, currency) });
  }
  return out;
}

/** What a person should know, as sentences. Warnings, never refusals. */
export function recurringIssues(agreements: readonly RecurringAgreement[], currency: string): string[] {
  const others = recurringCurrencies(agreements).filter((code) => code !== currency);
  return others.length ? [msg("recurring.issue.other-currencies", { currency, others: others.join(", ") })] : [];
}
