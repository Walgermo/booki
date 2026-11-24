import type { Deal, PipelineStage, StageStay } from "@booki/core/pipeline";
import type { RecurringAgreement } from "@booki/core/recurring";
import { mount } from "@ui-sdk/core/testing";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createBookiAgent } from "./booki-agent.js";
import { ForecastChart, forecastChart } from "./forecast-chart.js";
import { FunnelChart, funnelChart } from "./funnel-chart.js";
import { BookiLocaleProvider } from "./locale.js";
import { RecurringRevenue, recurringRevenue } from "./recurring-revenue.js";
import { StageDurationChart, stageDuration } from "./stage-duration.js";

afterEach(() => cleanup());

type Result = { ok: boolean; error?: { message: string } };

function setup(component: string, ref: string, ui: ReactElement, country: "US" | "NO" = "US") {
  const agent = createBookiAgent({ agentId: "test" });
  render(<BookiLocaleProvider defaultCountry={country}>{ui}</BookiLocaleProvider>);
  const entry = () => agent.snapshot().find((c) => c.component === component) as unknown as Record<string, any>;
  const act = (action: string, args: unknown[] = []) =>
    agent.act({ steps: [{ ref, action, args }] }) as Promise<Result>;
  const button = (name: RegExp) =>
    [...document.querySelectorAll("button")].find((b) =>
      name.test(b.getAttribute("aria-label") ?? b.textContent ?? ""),
    )!;
  return { entry, act, button };
}

const stages: PipelineStage[] = [
  { id: "lead", name: "Lead", probability: 10 },
  { id: "quote", name: "Quote sent", probability: 50 },
  { id: "won", name: "Won", probability: 100, outcome: "won" },
  { id: "lost", name: "Lost", probability: 0, outcome: "lost" },
];

describe("FunnelChart", () => {
  const steps = [
    { id: "lead", label: "Lead", count: 200 },
    { id: "quote", label: "Quote", count: 60 },
    { id: "won", label: "Won", count: 18 },
  ];

  it("gives the agent each step's conversion and lets it drill, refusing an unknown step", async () => {
    const { entry, act } = setup("funnel-chart", "Conversion", <FunnelChart steps={steps} />);
    expect(entry().actions).toEqual(["drill"]);
    expect(entry().steps.map((s: { overallConversionPct: number }) => s.overallConversionPct)).toEqual([100, 30, 9]);
    expect(entry().biggestDropId).toBe("quote");
    expect((await act("drill", ["won"])).ok).toBe(true);
    expect(entry().drilled.id).toBe("won");
    expect((await act("drill", ["meeting"])).error?.message).toMatch(/Steps: lead, quote, won/);
  });

  it("drills on a person's click and reads in Norwegian", async () => {
    const { entry, button } = setup("funnel-chart", "Konvertering", <FunnelChart steps={steps} />, "NO");
    fireEvent.click(button(/^Quote:/));
    expect(entry().drilled.id).toBe("quote");
    expect(document.body.textContent).toMatch(/Største frafall: Quote/);
  });

  it("works framework-free", () => {
    const view = mount(funnelChart, { steps } as never, "<root></root>");
    (view.api as unknown as { drill: (id: string) => boolean }).drill("lead");
    expect((view.state as { drilled: { id: string } }).drilled.id).toBe("lead");
  });
});

describe("ForecastChart", () => {
  const deal = (over: Partial<Deal>): Deal => ({
    id: "D",
    name: "Deal",
    stageId: "quote",
    valueMinor: 100_000_00,
    currency: "USD",
    valueStatus: "known",
    valueSource: "Quote",
    ...over,
  });
  const deals = [
    deal({ id: "D1", expectedClose: "2026-11-20" }),
    deal({ id: "D2", expectedClose: "2026-12-05", valueStatus: "estimate", valueMinor: 40_000_00 }),
    deal({ id: "D3", stageId: "won", closedAt: "2026-11-02T10:00:00Z", valueMinor: 30_000_00 }),
    deal({ id: "D4" }),
    deal({ id: "D5", valueStatus: "unknown", valueSource: undefined, expectedClose: "2026-11-20" }),
  ];
  const ui = <ForecastChart deals={deals} stages={stages} from="2026-11-01" to="2026-12-31" today="2026-11-24" />;

  it("gives the agent each period and lets it regroup and drill", async () => {
    const { entry, act } = setup("forecast-chart", "Forecast", ui);
    expect(entry().actions).toEqual(["setGrouping", "drill"]);
    expect(entry().periods.map((p: { period: string; weightedMinor: number }) => [p.period, p.weightedMinor])).toEqual([
      ["2026-11", 50_000_00],
      ["2026-12", 20_000_00],
    ]);
    expect(entry().totals.wonMinor).toBe(30_000_00);
    expect(entry().undated).toEqual(["D4"]);
    expect(entry().unverified).toEqual(["D5"]);
    expect((await act("drill", ["2026-12"])).ok).toBe(true);
    expect((await act("setGrouping", ["quarter"])).ok).toBe(true);
    expect(entry().periods.map((p: { period: string }) => p.period)).toEqual(["2026-Q4"]);
    expect(entry().drill).toBeNull();
    expect((await act("setGrouping", ["week"])).error?.message).toMatch(/Groupings: month, quarter/);
    expect((await act("drill", ["2026-11"])).error?.message).toMatch(/Periods: 2026-Q4/);
  });

  it("regroups on a person's click and says what is left out", async () => {
    const { entry, button } = setup("forecast-chart", "Forecast", ui);
    expect(document.body.textContent).toMatch(/1 open deal has no expected close date/);
    expect(document.body.textContent).toMatch(/1 open deal is left out: no amount, or one without a source/);
    fireEvent.click(button(/^Quarter$/));
    await waitFor(() => expect(entry().grouping).toBe("quarter"));
  });

  it("works framework-free", () => {
    const view = mount(
      forecastChart,
      { deals, stages, from: "2026-11-01", to: "2026-11-30", today: "2026-11-24", currency: "USD" } as never,
      "<root></root>",
    );
    expect((view.state as { periods: unknown[] }).periods).toHaveLength(1);
  });
});

describe("RecurringRevenue", () => {
  const agreements: RecurringAgreement[] = [
    { id: "A1", customerId: "c1", mrrMinor: 10_000_00, currency: "USD", start: "2026-01-01" },
    { id: "A2", customerId: "c2", mrrMinor: 5_000_00, currency: "USD", start: "2026-01-01", end: "2026-04-30" },
    { id: "A3", customerId: "c3", mrrMinor: 3_000_00, currency: "USD", start: "2026-05-01" },
  ];
  const ui = <RecurringRevenue agreements={agreements} from="2026-03-31" to="2026-06-30" />;

  it("bridges MRR exactly, switches to ARR and drills into a movement", async () => {
    const { entry, act } = setup("recurring-revenue", "Recurring revenue", ui);
    expect(entry().actions).toEqual(["setView", "drill"]);
    expect([entry().openingMinor, entry().closingMinor, entry().reconciles]).toEqual([15_000_00, 13_000_00, true]);
    expect(entry().movements.map((m: { id: string; amountMinor: number }) => [m.id, m.amountMinor])).toEqual([
      ["new", 3_000_00],
      ["expansion", 0],
      ["contraction", 0],
      ["churn", -5_000_00],
    ]);
    expect((await act("setView", ["arr"])).ok).toBe(true);
    expect(entry().closingMinor).toBe(156_000_00);
    expect(entry().roundingMinor).toBe(0);
    expect((await act("drill", ["churn"])).ok).toBe(true);
    expect(entry().drilled.customers).toEqual(["c2"]);
    expect((await act("drill", ["upsell"])).error?.message).toMatch(/Movements: new, expansion, contraction, churn/);
    expect((await act("setView", ["weekly"])).error?.message).toMatch(/mrr or arr/);
  });

  it("names the customers behind a movement a person drills into, in Norwegian", () => {
    const { button } = setup(
      "recurring-revenue",
      "Løpende inntekter",
      <RecurringRevenue agreements={agreements} from="2026-03-31" to="2026-06-30" nameOf={(id) => `Kunde ${id}`} />,
      "NO",
    );
    fireEvent.click(button(/^Nye:/));
    expect(document.body.textContent).toMatch(/Nye: Kunde c3/);
  });

  it("works framework-free", () => {
    const view = mount(
      recurringRevenue,
      { agreements, from: "2026-03-31", to: "2026-06-30" } as never,
      "<root></root>",
    );
    expect((view.state as { netMinor: number }).netMinor).toBe(-2_000_00);
  });
});

describe("StageDurationChart", () => {
  const stays: StageStay[] = [
    { dealId: "D1", stageId: "lead", enteredAt: "2026-10-01", leftAt: "2026-10-05" },
    { dealId: "D2", stageId: "quote", enteredAt: "2026-10-01" },
  ];
  const ui = <StageDurationChart stays={stays} stages={stages} targets={{ quote: 30 }} today="2026-11-24" />;

  it("gives the agent each stage's days and who is over target, and lets it drill", async () => {
    const { entry, act } = setup("stage-duration", "Time in stage", ui);
    expect(entry().actions).toEqual(["drill"]);
    expect(entry().overTarget).toEqual(["D2"]);
    expect(entry().slowestId).toBe("quote");
    expect((await act("drill", ["quote"])).ok).toBe(true);
    expect((await act("drill", ["won"])).error?.message).toMatch(/Stages: lead, quote/);
  });

  it("lists the deals over target when a person drills in", () => {
    const { button } = setup(
      "stage-duration",
      "Time in stage",
      <StageDurationChart
        stays={stays}
        stages={stages}
        targets={{ quote: 30 }}
        today="2026-11-24"
        nameOf={(id) => `Deal ${id}`}
      />,
    );
    fireEvent.click(button(/^Quote sent:/));
    expect(document.body.textContent).toMatch(/Over target: Deal D2/);
  });

  it("works framework-free", () => {
    const view = mount(stageDuration, { stays, stages, today: "2026-11-24" } as never, "<root></root>");
    expect((view.state as { rows: unknown[] }).rows).toHaveLength(2);
  });
});
