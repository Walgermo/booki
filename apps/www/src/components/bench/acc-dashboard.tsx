import { AgingChart, BarChart, KpiStat, TrendChart } from "@booki-aui/react";

import { COSTS, REVENUE, series } from "@/components/erp-dashboard";
import { RECEIVABLES } from "@/lib/demo-data";

import { AGING_LIMITS, AS_OF, PAYROLL } from "./dashboard-data";

/**
 * The same dashboard widgets from Booki chart controls, with the same
 * figures as the two replicas. An agent reads every value, period and bucket
 * from the bridge snapshot; nothing here can be changed by an agent.
 */
export function BookiDashboard() {
  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <h1 className="mt-0 text-xl font-semibold">Oversikt</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "1rem" }}>
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
      </div>
      <TrendChart
        title="Inntekter og kostnader"
        aria-label="Inntekter og kostnader"
        series={[
          { id: "revenue", name: "Inntekter", points: series(REVENUE) },
          { id: "costs", name: "Kostnader", points: series(COSTS) },
        ]}
      />
      <AgingChart
        title="Kundefordringer etter alder"
        aria-label="Kundefordringer"
        items={RECEIVABLES}
        limits={AGING_LIMITS}
        defaultAsOf={AS_OF}
      />
      <BarChart
        title="Lønn denne måneden"
        aria-label="Lønn"
        items={[
          { id: "salary", label: "Lønn", valueMinor: PAYROLL.salaryMinor },
          { id: "employer-tax", label: "Arbeidsgiveravgift", valueMinor: PAYROLL.employerTaxMinor },
          { id: "withholding", label: "Skatt", valueMinor: PAYROLL.withholdingMinor },
        ]}
      />
    </div>
  );
}
