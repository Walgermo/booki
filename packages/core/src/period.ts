import { msg } from "./msg.js";

export type PeriodGranularity = "year" | "month" | "vat-term";

export type AccountingPeriod = {
  /** Storage form: `2025`, `2025-03`, or `2025-T2`. */
  code: string;
  granularity: PeriodGranularity;
  year: number;
  /** 1–12 when granularity is month. */
  month?: number;
  /** 1–6 when granularity is vat-term (Norwegian MVA terminer). */
  term?: number;
};

const MONTH_NAMES_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MONTH_NAMES_NB = [
  "januar",
  "februar",
  "mars",
  "april",
  "mai",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "desember",
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function yearPeriod(year: number): AccountingPeriod {
  return { code: String(year), granularity: "year", year };
}

export function monthPeriod(year: number, month: number): AccountingPeriod {
  if (month < 1 || month > 12) {
    throw new RangeError(msg("period.invalid-month", { month: String(month) }));
  }
  return {
    code: `${year}-${pad2(month)}`,
    granularity: "month",
    year,
    month,
  };
}

export function vatTermPeriod(year: number, term: number): AccountingPeriod {
  if (term < 1 || term > 6) {
    throw new RangeError(msg("period.invalid-vat-term", { term: String(term) }));
  }
  return {
    code: `${year}-T${term}`,
    granularity: "vat-term",
    year,
    term,
  };
}

const PERIOD_CODE = /^(\d{4})(?:-(0[1-9]|1[0-2]|T[1-6]))?$/;

export function parsePeriodCode(code: string): AccountingPeriod | null {
  const match = PERIOD_CODE.exec(code.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const part = match[2];
  if (part === undefined) return yearPeriod(year);
  if (part.startsWith("T")) {
    return vatTermPeriod(year, Number(part.slice(1)));
  }
  return monthPeriod(year, Number(part));
}

export function isValidPeriodCode(code: string): boolean {
  return parsePeriodCode(code) !== null;
}

export function formatPeriod(period: AccountingPeriod | string, locale = "en-US"): string {
  const value = typeof period === "string" ? parsePeriodCode(period) : period;
  if (!value) return typeof period === "string" ? period : period.code;
  const nb = locale.toLowerCase().startsWith("nb");
  const months = nb ? MONTH_NAMES_NB : MONTH_NAMES_EN;
  switch (value.granularity) {
    case "year":
      return String(value.year);
    case "month":
      return `${months[(value.month ?? 1) - 1]} ${value.year}`;
    case "vat-term":
      return nb ? `MVA-termin ${value.term} ${value.year}` : `VAT term ${value.term} ${value.year}`;
    default: {
      const _exhaustive: never = value.granularity;
      return _exhaustive;
    }
  }
}

export function periodBounds(period: AccountingPeriod | string): { from: string; to: string } | null {
  const value = typeof period === "string" ? parsePeriodCode(period) : period;
  if (!value) return null;
  switch (value.granularity) {
    case "year":
      return {
        from: `${value.year}-01-01`,
        to: `${value.year}-12-31`,
      };
    case "month": {
      const month = value.month ?? 1;
      const last = new Date(Date.UTC(value.year, month, 0)).getUTCDate();
      return {
        from: `${value.year}-${pad2(month)}-01`,
        to: `${value.year}-${pad2(month)}-${pad2(last)}`,
      };
    }
    case "vat-term": {
      const term = value.term ?? 1;
      const startMonth = (term - 1) * 2 + 1;
      const endMonth = startMonth + 1;
      const last = new Date(Date.UTC(value.year, endMonth, 0)).getUTCDate();
      return {
        from: `${value.year}-${pad2(startMonth)}-01`,
        to: `${value.year}-${pad2(endMonth)}-${pad2(last)}`,
      };
    }
    default: {
      const _exhaustive: never = value.granularity;
      return _exhaustive;
    }
  }
}

/** Closed item list for a year — months or VAT terms. */
export function periodItemsForYear(
  year: number,
  granularity: Exclude<PeriodGranularity, "year">,
  locale = "en-US",
): { value: string; label: string }[] {
  if (granularity === "month") {
    return Array.from({ length: 12 }, (_, i) => {
      const period = monthPeriod(year, i + 1);
      return { value: period.code, label: formatPeriod(period, locale) };
    });
  }
  return Array.from({ length: 6 }, (_, i) => {
    const period = vatTermPeriod(year, i + 1);
    return { value: period.code, label: formatPeriod(period, locale) };
  });
}
