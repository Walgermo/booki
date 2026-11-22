import { ageItems } from "@booki/core/aging";

import { COSTS, MONTHS, REVENUE } from "@/components/erp-dashboard";
import { RECEIVABLES } from "@/lib/demo-data";

/**
 * One truth for the three dashboard pages: the overview's twelve months
 * (2025-11..2026-10) and the receivables aged on 2026-10-31 into not due,
 * 1-30 and over 30 days. Invented figures, in øre.
 */
export const AS_OF = "2026-10-31";
export const AGING_LIMITS = [0, 30];

export const MONTHLY = MONTHS.map((period, index) => ({
  period,
  year: Number(period.slice(0, 4)),
  month: Number(period.slice(5, 7)),
  revenueMinor: REVENUE[index]!,
  costsMinor: COSTS[index]!,
}));

const aged = ageItems(RECEIVABLES, AS_OF, AGING_LIMITS);
export const AGING = {
  notDueMinor: aged.totalsMinor[0]!,
  days1to30Minor: aged.totalsMinor[1]!,
  over30Minor: aged.totalsMinor[2]!,
  totalMinor: aged.grandTotalMinor,
};

/** Payroll this month; the split is drawn but its numbers are not in the replica's DOM. */
export const PAYROLL = {
  employees: 4,
  salaryMinor: 12_740_000,
  employerTaxMinor: 2_566_200,
  withholdingMinor: 5_460_000,
};

export const MONTH_TICKS = ["jan", "febr", "mars", "april", "mai", "juni", "juli", "aug", "sept", "okt", "nov", "des"];

/** The months of one calendar year, with null where the data has no figure. */
export function yearMonths(year: number) {
  return MONTH_TICKS.map((tick, index) => {
    const found = MONTHLY.find((m) => m.year === year && m.month === index + 1);
    return { tick, month: index + 1, revenueMinor: found?.revenueMinor ?? null, costsMinor: found?.costsMinor ?? null };
  });
}

export const nok = (minor: number) =>
  (minor / 100).toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
