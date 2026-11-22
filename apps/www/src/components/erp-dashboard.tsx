import { AgingChart, BarChart, CashflowWaterfall, KpiStat, TrendChart } from "@booki/react";

import { RECEIVABLES } from "@/lib/demo-data";

/** Twelve months of invented figures for the demo company, in øre. */
export const MONTHS = [
  "2025-11",
  "2025-12",
  "2026-01",
  "2026-02",
  "2026-03",
  "2026-04",
  "2026-05",
  "2026-06",
  "2026-07",
  "2026-08",
  "2026-09",
  "2026-10",
];
export const REVENUE = [
  398_200, 512_900, 341_700, 368_400, 402_100, 417_600, 455_300, 471_800, 302_500, 433_900, 452_000, 486_500,
].map((n) => n * 100);
export const COSTS = [
  301_400, 356_200, 288_900, 297_300, 312_800, 318_500, 329_100, 336_700, 284_200, 322_600, 341_900, 318_400,
].map((n) => n * 100);
export const series = (values: number[]) => MONTHS.map((period, i) => ({ period, valueMinor: values[i]! }));

export const COST_BY_ACCOUNT = [
  { id: "5000", label: "5000 Lønn", valueMinor: 18_200_000 },
  { id: "4000", label: "4000 Varekjøp", valueMinor: 7_640_000 },
  { id: "6300", label: "6300 Husleie", valueMinor: 1_500_000 },
  { id: "6800", label: "6800 Kontorrekvisita", valueMinor: 1_240_000 },
  { id: "6810", label: "6810 Datakostnader", valueMinor: 980_000 },
  { id: "7140", label: "7140 Reise", valueMinor: 765_000 },
  { id: "7320", label: "7320 Reklame", valueMinor: 520_000 },
  { id: "7770", label: "7770 Bankgebyr", valueMinor: 60_000 },
  { id: "6860", label: "6860 Kurs", valueMinor: 335_000 },
];

export const CASHFLOW = [
  { id: "customers", label: "Innbetalinger kunder", amountMinor: 51_230_000 },
  { id: "salaries", label: "Lønn", amountMinor: -18_200_000 },
  { id: "suppliers", label: "Leverandører", amountMinor: -16_840_000 },
  { id: "vat", label: "Mva", amountMinor: -5_480_000 },
  { id: "rent", label: "Husleie", amountMinor: -1_500_000 },
  { id: "fees", label: "Bankgebyr", amountMinor: -60_000 },
];
export const OPENING = 109_680_000;
const CLOSING = OPENING + CASHFLOW.reduce((sum, step) => sum + step.amountMinor, 0);

/**
 * The overview's figures, all Booki chart controls on the same bridge as the
 * rest of the demo: an agent reads each number, trend and bucket in the
 * snapshot instead of looking at pixels.
 */
export function ErpDashboard() {
  return (
    <div className="erp-dashboard">
      <div className="erp-dashboard__kpis">
        <KpiStat
          label="Inntekt oktober"
          valueMinor={REVENUE.at(-1)!}
          previousMinor={REVENUE.at(-2)!}
          previousLabel="september"
          good="up"
          series={series(REVENUE)}
        />
        <KpiStat
          label="Kostnader oktober"
          valueMinor={COSTS.at(-1)!}
          previousMinor={COSTS.at(-2)!}
          previousLabel="september"
          good="down"
          series={series(COSTS)}
        />
        <KpiStat
          label="Bankbeholdning"
          valueMinor={CLOSING}
          previousMinor={OPENING}
          previousLabel="1. oktober"
          good="up"
        />
      </div>
      <div className="site-sheet min-w-0">
        <TrendChart
          title="Inntekt og kostnader"
          aria-label="Inntekt og kostnader"
          series={[
            { id: "revenue", name: "Inntekt", points: series(REVENUE) },
            { id: "costs", name: "Kostnader", points: series(COSTS) },
          ]}
        />
      </div>
      <div className="erp-dashboard__pair">
        <div className="site-sheet min-w-0">
          <BarChart
            title="Kostnad per konto, oktober"
            aria-label="Kostnad per konto"
            items={COST_BY_ACCOUNT}
            defaultLimit={6}
          />
        </div>
        <div className="site-sheet min-w-0">
          <AgingChart
            title="Kundefordringer etter alder"
            aria-label="Aldersfordeling"
            items={RECEIVABLES}
            defaultAsOf="2026-10-31"
          />
        </div>
      </div>
      <div className="site-sheet min-w-0">
        <CashflowWaterfall
          title="Kontantstrøm oktober"
          aria-label="Kontantstrøm"
          openingMinor={OPENING}
          steps={CASHFLOW}
        />
      </div>
    </div>
  );
}
