import type { OpenItem } from "@booki/core/aging";
import { mount } from "@ui-sdk/core/testing";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBookiAgent } from "./booki-agent.js";
import { AgingChart, agingChart } from "./aging-chart.js";
import { BarChart, barChart } from "./bar-chart.js";
import { CashflowWaterfall, cashflowWaterfall } from "./cashflow-waterfall.js";
import {
  barPath,
  labelEvery,
  linePath,
  niceTicks,
  percentChange,
  rangePeriods,
  rankWithOther,
  sharePercent,
  spreadLabels,
  summarize,
  waterfall,
} from "./chart-math.js";
import { KpiStat } from "./kpi-stat.js";
import { BookiLocaleProvider } from "./locale.js";
import { TrendChart, trendChart, type TrendSeries } from "./trend-chart.js";

afterEach(() => cleanup());

type Result = { ok: boolean; error?: { message: string } } & Record<string, any>;

function setup(component: string, ref: string, ui: ReactElement, country: "US" | "NO" = "US") {
  const agent = createBookiAgent({ agentId: "test" });
  const view = render(<BookiLocaleProvider defaultCountry={country}>{ui}</BookiLocaleProvider>);
  const entry = () => agent.snapshot().find((c) => c.component === component) as unknown as Record<string, any>;
  const act = (action: string, args: unknown[] = []) =>
    agent.act({ steps: [{ ref, action, args }] }) as Promise<Result>;
  const button = (name: string) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent === name || b.getAttribute("aria-label") === name,
    )!;
  const alert = () => document.querySelector('[role="alert"]')?.textContent ?? "";
  return { entry, act, button, alert, view };
}

describe("chart-math", () => {
  it("counts ranges back from the latest month", () => {
    expect(rangePeriods("6m", "2025-01", "2026-06")).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
    expect(rangePeriods("12m", "2025-01", "2026-06")[0]).toBe("2025-07");
    expect(rangePeriods("ytd", "2025-01", "2026-02")).toEqual(["2026-01", "2026-02"]);
    expect(rangePeriods("all", "2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    // Never before the data starts.
    expect(rangePeriods("12m", "2026-04", "2026-06")).toEqual(["2026-04", "2026-05", "2026-06"]);
  });

  it("measures change and share, and says nothing for a zero base", () => {
    expect(percentChange(130, 100)).toBe(30);
    expect(percentChange(-50, -100)).toBe(50);
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(5, null)).toBeNull();
    expect(sharePercent(1, 3)).toBe(33.3);
    expect(sharePercent(1, 0)).toBeNull();
  });

  it("summarises a series with the earliest of tied extremes", () => {
    const summary = summarize([
      { period: "2026-02", valueMinor: 5 },
      { period: "2026-01", valueMinor: 5 },
      { period: "2026-03", valueMinor: 9 },
    ]);
    expect(summary).toMatchObject({
      latest: { period: "2026-03", valueMinor: 9 },
      previous: { period: "2026-02", valueMinor: 5 },
      changeMinor: 4,
      changePct: 80,
      direction: "up",
      min: { period: "2026-01", valueMinor: 5 },
      max: { period: "2026-03", valueMinor: 9 },
      totalMinor: 19,
    });
    expect(summarize([{ period: "2026-03", valueMinor: 9 }], { period: "2026-02", valueMinor: 10 }).changeMinor).toBe(
      -1,
    );
    expect(summarize([]).latest).toBeNull();
  });

  it("makes tidy ticks that include zero", () => {
    expect(niceTicks(0, 950_00)).toMatchObject({ min: 0, max: 1000_00, step: 250_00 });
    expect(niceTicks(-120, 380).ticks).toEqual([-200, 0, 200, 400]);
    expect(niceTicks(0, 0).ticks.length).toBeGreaterThan(1);
  });

  it("folds the tail into Other and walks a waterfall", () => {
    const ranked = rankWithOther(
      [
        { id: "a", label: "A", valueMinor: 1 },
        { id: "b", label: "B", valueMinor: 3 },
        { id: "c", label: "C", valueMinor: 2 },
      ],
      1,
    );
    expect(ranked.rows.map((row) => [row.id, row.valueMinor, row.count])).toEqual([
      ["b", 3, 1],
      ["other", 3, 2],
    ]);
    expect(ranked.rows[1]!.sharePct).toBe(50);
    const flow = waterfall(
      100,
      [
        { id: "in", label: "In", amountMinor: 50 },
        { id: "out", label: "Out", amountMinor: -70 },
      ],
      80,
    );
    expect(flow).toMatchObject({
      inflowMinor: 50,
      outflowMinor: -70,
      netMinor: -20,
      computedClosingMinor: 80,
      reconciles: true,
      differenceMinor: 0,
    });
    expect(flow.steps[1]).toMatchObject({ startMinor: 150, endMinor: 80, direction: "out" });
  });

  it("draws paths and spaces labels", () => {
    expect(linePath([{ x: 0, y: 1 }, null, { x: 2, y: 3 }, { x: 4, y: 5 }])).toBe("M0.0 1.0M2.0 3.0L4.0 5.0");
    expect(barPath(0, 0, 0, 10)).toBe("");
    expect(barPath(10, 0, -20, 10)).toMatch(/^M10 0H-6/);
    expect(spreadLabels([50, 52, 100], 14, 0, 200)).toEqual([50, 64, 100]);
    expect(labelEvery(24, 300, 50)).toBe(4);
  });
});

/** Revenue for 18 months; costs for the last six. */
const revenue: TrendSeries = {
  id: "revenue",
  name: "Revenue",
  points: [
    ...Array.from({ length: 12 }, (_, i) => ({ period: `2025-${String(i + 1).padStart(2, "0")}`, valueMinor: 80_00 })),
    ...[100, 120, 90, 150, 130, 160].map((value, i) => ({ period: `2026-0${i + 1}`, valueMinor: value * 100 })),
  ],
};
const costs: TrendSeries = {
  id: "costs",
  name: "Costs",
  points: [50, 50, 60, 55, 70, 65].map((value, i) => ({ period: `2026-0${i + 1}`, valueMinor: value * 100 })),
};

describe("TrendChart", () => {
  it("reads latest, change, extremes and total per series; sets the range and drills", async () => {
    const onDrill = vi.fn();
    const { entry, act } = setup(
      "trend-chart",
      "Results",
      <TrendChart title="Results" series={[revenue, costs]} defaultRange="6m" onDrill={onDrill} />,
    );
    expect(entry().actions).toEqual(["setRange", "drill"]);
    expect(entry()).toMatchObject({
      range: "6m",
      from: "2026-01",
      to: "2026-06",
      periodCount: 6,
      currency: "USD",
      drill: null,
      drilled: null,
      issues: [],
    });
    expect(entry().series[0]).toMatchObject({
      id: "revenue",
      latest: { period: "2026-06", valueMinor: 160_00 },
      previous: { period: "2026-05", valueMinor: 130_00 },
      changeMinor: 30_00,
      changePct: 23.1,
      direction: "up",
      min: { period: "2026-03", valueMinor: 90_00 },
      max: { period: "2026-06", valueMinor: 160_00 },
      totalMinor: 750_00,
      pointCount: 6,
      truncated: false,
    });
    expect(entry().series[0].points[0]).toEqual(["2026-01", 100_00]);
    expect(entry().series[1]).toMatchObject({
      changeMinor: -5_00,
      changePct: -7.1,
      direction: "down",
      totalMinor: 350_00,
    });

    expect((await act("drill", ["2026-03"])).ok).toBe(true);
    expect(entry().drilled).toEqual({
      period: "2026-03",
      values: [
        { id: "revenue", name: "Revenue", valueMinor: 90_00 },
        { id: "costs", name: "Costs", valueMinor: 60_00 },
      ],
    });
    expect(onDrill).toHaveBeenCalledWith("2026-03", expect.objectContaining({ reason: "drill" }));

    expect((await act("drill", ["2025-03"])).error?.message).toMatch(
      /No month 2025-03 in the range 6m \(2026-01 to 2026-06\)\. It is in the data: setRange\("all"\) first/,
    );
    expect((await act("drill", ["2024-01"])).error?.message).toMatch(/The data runs from 2025-01 to 2026-06/);
    expect((await act("drill", ["March"])).error?.message).toMatch(
      /A month is written YYYY-MM, such as 2026-03; got "March"/,
    );
    expect((await act("setRange", ["2y"])).error?.message).toBe(
      `The range must be one of 6m, 12m, ytd, all; got "2y".`,
    );

    expect((await act("setRange", ["12m"])).ok).toBe(true);
    // The 2025 months tie at 80.00; the earliest is the minimum.
    expect(entry().series[0]).toMatchObject({
      min: { period: "2025-07", valueMinor: 80_00 },
      totalMinor: 1230_00,
      pointCount: 12,
    });
    // Costs start in January: their first point in range has nothing before it.
    expect(entry().series[1].pointCount).toBe(6);

    expect((await act("setRange", ["all"])).ok).toBe(true);
    expect(entry().periodCount).toBe(18);
    expect((await act("drill", ["2025-03"])).ok).toBe(true);
    expect((await act("setRange", ["ytd"])).ok).toBe(true);
    // The drilled month left the range.
    expect(entry()).toMatchObject({ from: "2026-01", drill: null, drilled: null });
    expect((await act("drill", [null])).ok).toBe(true);
    // Read-only: there is nothing to edit.
    for (const action of ["setSeries", "drillByPerson", "setRangeByPerson"]) {
      expect((await act(action, ["2026-01"])).ok).toBe(false);
    }
  });

  it("caps the points an agent reads and reports bad points", () => {
    const bad: TrendSeries = {
      id: "bad",
      name: "Bad",
      points: [
        { period: "2026-13", valueMinor: 1 },
        { period: "2026-01", valueMinor: 1.5 },
        { period: "2026-02", valueMinor: 3 },
      ],
    };
    const { entry } = setup(
      "trend-chart",
      "Trend",
      <TrendChart series={[revenue, bad, { ...bad }]} defaultRange="all" snapshotPoints={4} />,
    );
    expect(entry().series[0]).toMatchObject({ pointCount: 18, truncated: true });
    expect(entry().series[0].points).toEqual([
      ["2026-03", 90_00],
      ["2026-04", 150_00],
      ["2026-05", 130_00],
      ["2026-06", 160_00],
    ]);
    expect(entry().series).toHaveLength(2);
    expect(entry().issues).toEqual([
      `Series "bad" has a period "2026-13" not written YYYY-MM; it is left out.`,
      `Series "bad" at 2026-01 has a value that is not whole minor units; it is left out.`,
      `Series "bad" is given twice; the second is left out.`,
    ]);
  });

  it("draws an accessible chart: summary, legend, end labels, table and a tooltip", () => {
    const { entry, button } = setup(
      "trend-chart",
      "Results",
      <TrendChart title="Results" series={[revenue, costs]} defaultRange="6m" />,
    );
    const svg = document.querySelector('[data-slot="trend-chart-svg"]')!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.querySelector("desc")?.textContent).toMatch(
      /Revenue: latest \$160\.00 in Jun 2026, up \$30\.00 \(23\.1%\) from May 2026\. highest \$160\.00 in Jun 2026, lowest \$90\.00 in Mar 2026\./,
    );
    expect(document.querySelectorAll('[data-slot="trend-chart-legend"] li')).toHaveLength(2);
    expect(document.querySelectorAll('[data-slot="trend-chart-line"]')).toHaveLength(2);
    expect([...document.querySelectorAll('[data-slot="trend-chart-end"] text')].map((t) => t.textContent)).toEqual([
      "Revenue",
      "Costs",
    ]);
    expect(document.querySelectorAll('[data-slot="trend-chart-table"] tbody tr')).toHaveLength(6);
    // One tab stop among the months; arrows move it.
    const points = [...document.querySelectorAll<HTMLButtonElement>('[data-slot="trend-chart-point"]')];
    expect(points.filter((point) => point.tabIndex === 0)).toHaveLength(1);
    fireEvent.mouseEnter(points[2]!);
    expect(document.querySelector('[data-slot="trend-chart-tooltip"]')?.textContent).toMatch(
      /Mar 2026.*Revenue\$90\.00.*Costs\$60\.00/,
    );
    fireEvent.click(button("Mar 2026: Revenue $90.00, Costs $60.00"));
    expect(entry().drill).toBe("2026-03");
    fireEvent.click(button("Last 12 months"));
    expect(entry().range).toBe("12m");
    expect(button("Last 12 months").getAttribute("aria-pressed")).toBe("true");
  });

  it("follows a controlled range and speaks Norwegian", () => {
    const { entry, view } = setup("trend-chart", "Utvikling", <TrendChart series={[revenue]} range="6m" />, "NO");
    expect(document.querySelector('[data-slot="trend-chart"]')?.getAttribute("aria-label")).toBe("Utvikling");
    expect(entry().currency).toBe("NOK");
    view.rerender(
      <BookiLocaleProvider defaultCountry="NO">
        <TrendChart series={[revenue]} range="all" />
      </BookiLocaleProvider>,
    );
    expect(entry()).toMatchObject({ range: "all", periodCount: 18 });
    // A single series needs no legend.
    expect(document.querySelector('[data-slot="trend-chart-legend"]')).toBeNull();
    expect(document.querySelector('[data-slot="trend-chart-table"] summary')?.textContent).toBe("Vis som tabell");
  });

  it("reports the click as the source of a drill (ui-sdk mount)", async () => {
    const view = mount(
      trendChart,
      { series: [revenue, costs], defaultRange: "6m" },
      `<root><range value="all">All</range><point value="2026-03">Mar</point></root>`,
    );
    try {
      await view.click(view.part("point", "2026-03")!);
      expect(view.state.drilled).toMatchObject({ period: "2026-03" });
      expect(view.changes.at(-1)).toMatchObject({ key: "drill", reason: "drill", source: "mouse" });
      await view.click(view.part("range", "all")!);
      expect(view.changes.at(-1)).toMatchObject({ key: "range", reason: "set-range", source: "mouse" });
      expect(view.state.periodCount).toBe(18);
    } finally {
      view.unmount();
    }
  });
});

const costItems = [
  { id: "rent", label: "Rent", valueMinor: 500_00 },
  { id: "salaries", label: "Salaries", valueMinor: 2000_00 },
  { id: "travel", label: "Travel", valueMinor: 150_00 },
  { id: "software", label: "Software", valueMinor: 300_00 },
  { id: "office", label: "Office", valueMinor: 50_00 },
];

describe("BarChart", () => {
  it("sorts by value with shares, folds the rest into Other and drills", async () => {
    const onDrill = vi.fn();
    const { entry, act } = setup(
      "bar-chart",
      "Costs",
      <BarChart title="Costs" items={costItems} defaultLimit={3} onDrill={onDrill} />,
    );
    expect(entry().actions).toEqual(["setLimit", "drill"]);
    expect(entry()).toMatchObject({ totalMinor: 3000_00, count: 5, limit: 3, otherCount: 2, drill: null, issues: [] });
    expect(entry().rows).toEqual([
      { id: "salaries", label: "Salaries", valueMinor: 2000_00, sharePct: 66.7, count: 1 },
      { id: "rent", label: "Rent", valueMinor: 500_00, sharePct: 16.7, count: 1 },
      { id: "software", label: "Software", valueMinor: 300_00, sharePct: 10, count: 1 },
      { id: "other", label: "Other", valueMinor: 200_00, sharePct: 6.7, count: 2 },
    ]);

    expect((await act("drill", ["travel"])).error?.message).toBe(
      `Category "travel" is folded into "Other"; setLimit(null) first.`,
    );
    expect((await act("drill", ["other"])).error?.message).toMatch(
      /"Other" folds 2 categories together; setLimit\(null\) to show them/,
    );
    expect((await act("drill", ["fuel"])).error?.message).toBe(
      `No category "fuel". Categories: salaries, rent, software.`,
    );
    expect((await act("setLimit", [0])).error?.message).toMatch(
      /The limit must be a whole number, 1 or above, or null/,
    );
    expect((await act("setLimit", [2.5])).ok).toBe(false);

    expect((await act("setLimit", [null])).ok).toBe(true);
    expect(entry()).toMatchObject({ limit: null, otherCount: 0 });
    expect(entry().rows.map((row: any) => row.id)).toEqual(["salaries", "rent", "software", "travel", "office"]);
    expect((await act("drill", ["travel"])).ok).toBe(true);
    expect(entry().drilled).toMatchObject({ id: "travel", valueMinor: 150_00, sharePct: 5 });
    expect(onDrill).toHaveBeenCalledWith("travel", expect.objectContaining({ reason: "drill" }));
    // Folding travel away clears the drill.
    expect((await act("setLimit", [2])).ok).toBe(true);
    expect(entry()).toMatchObject({ drill: null, drilled: null, otherCount: 3 });
  });

  it("lets a person show every bar and fold them back, and draws a table", () => {
    const { entry, button } = setup("bar-chart", "By category", <BarChart items={costItems} defaultLimit={3} />);
    expect(document.querySelector('[data-slot="bar-chart-svg"] desc')?.textContent).toMatch(
      /^Total \$3,000\.00, 5 categories\. Salaries \$2,000\.00 \(66\.7%\)/,
    );
    fireEvent.click(button("Show all 5"));
    expect(entry().limit).toBeNull();
    expect(document.querySelectorAll('[data-slot="bar-chart-fill"]')).toHaveLength(5);
    fireEvent.click(button("Show fewer"));
    expect(entry().limit).toBe(3);
    expect(document.querySelectorAll('[data-slot="bar-chart-table"] tbody tr')).toHaveLength(4);
    fireEvent.click(button("Other: $200.00, 6.7% of the total"));
    expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/"Other" folds 2 categories/);
    fireEvent.click(button("Rent: $500.00, 16.7% of the total"));
    expect(entry().drill).toBe("rent");
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it("draws negative amounts from a zero baseline and leaves out bad items", () => {
    const { entry } = setup(
      "bar-chart",
      "By category",
      <BarChart
        items={[
          ...costItems,
          { id: "refund", label: "Refund", valueMinor: -100_00 },
          { id: "rent", label: "Again", valueMinor: 1 },
          { id: "x", label: "X", valueMinor: 0.5 },
        ]}
      />,
    );
    expect(entry().totalMinor).toBe(2900_00);
    expect(entry().rows.at(-1)).toMatchObject({ id: "refund", sharePct: -3.4 });
    expect(entry().issues).toHaveLength(2);
    expect(document.querySelector('[data-slot="bar-chart-baseline"]')).not.toBeNull();
  });

  it("reports the click as the source of a drill (ui-sdk mount)", async () => {
    const view = mount(
      barChart,
      { items: costItems, defaultLimit: 3 },
      `<root><bar value="rent">Rent</bar><more>More</more></root>`,
    );
    try {
      await view.click(view.part("bar", "rent")!);
      expect(view.changes.at(-1)).toMatchObject({ key: "drill", reason: "drill", source: "mouse" });
      expect(view.state.drilled).toMatchObject({ id: "rent" });
      await view.click(view.part("more")!);
      expect(view.changes.at(-1)).toMatchObject({ key: "limit", reason: "set-limit", source: "mouse" });
      expect(view.state.limit).toBeNull();
    } finally {
      view.unmount();
    }
  });
});

describe("KpiStat", () => {
  it("reads value, previous, delta, percent and whether it is good news, with no actions", () => {
    const { entry } = setup(
      "kpi-stat",
      "Revenue",
      <KpiStat
        label="Revenue"
        valueMinor={120_00}
        previousMinor={100_00}
        previousLabel="May 2026"
        series={[
          { period: "2026-04", valueMinor: 90_00 },
          { period: "2026-05", valueMinor: 100_00 },
          { period: "2026-06", valueMinor: 120_00 },
        ]}
      />,
    );
    expect(entry().actions).toEqual([]);
    expect(entry()).toMatchObject({
      label: "Revenue",
      currency: "USD",
      valueMinor: 120_00,
      previousMinor: 100_00,
      deltaMinor: 20_00,
      deltaPct: 20,
      direction: "up",
      good: "up",
      favourable: true,
      sparkline: [
        ["2026-04", 90_00],
        ["2026-05", 100_00],
        ["2026-06", 120_00],
      ],
      issues: [],
    });
    expect(document.querySelector('[data-slot="kpi-stat-value"]')?.textContent).toBe("$120.00");
    expect(document.querySelector('[data-slot="kpi-stat-delta"]')?.textContent).toBe("▲Up +$20.00 (+20%) vs May 2026");
    expect(document.querySelector('[data-slot="kpi-stat-delta"]')?.getAttribute("data-favourable")).toBe("true");
    expect(document.querySelector('[data-slot="kpi-stat-spark"]')?.getAttribute("aria-label")).toMatch(
      /^Trend: Apr 2026 \$90\.00/,
    );
  });

  it("knows a rising cost is bad news and a zero base has no percent", () => {
    const { entry } = setup(
      "kpi-stat",
      "Costs",
      <KpiStat label="Costs" valueMinor={50_00} previousMinor={0} good="down" />,
    );
    expect(entry()).toMatchObject({ deltaMinor: 50_00, deltaPct: null, direction: "up", favourable: false });
    cleanup();
    const none = setup("kpi-stat", "Cash", <KpiStat label="Cash" valueMinor={50_00} />, "NO");
    expect(none.entry()).toMatchObject({ deltaMinor: null, direction: null, favourable: null, currency: "NOK" });
    expect(document.querySelector('[data-slot="kpi-stat-delta"]')?.textContent).toBe("Ingen sammenligning");
  });
});

describe("AgingChart", () => {
  const item = (
    id: string,
    partyId: string,
    dueDate: string,
    amountMinor: number,
    kind: OpenItem["kind"] = "receivable",
  ): OpenItem => ({
    id,
    partyId,
    partyName: `Party ${partyId}`,
    documentNumber: `INV-${id}`,
    dueDate,
    amountMinor,
    kind,
  });
  const items: OpenItem[] = [
    item("1", "acme", "2026-05-15", 100_00),
    item("2", "acme", "2026-04-10", 30_00),
    item("3", "birch", "2026-03-30", 300_00),
    item("4", "birch", "2026-01-29", 5_00),
    item("5", "birch", "2026-02-15", -40_00),
    item("6", "tax", "2026-04-01", 900_00, "payable"),
  ];

  it("reads bucket totals, shares and the most overdue, and drills into a bucket", async () => {
    const onDrill = vi.fn();
    const { entry, act } = setup(
      "aging-chart",
      "Receivables by age",
      <AgingChart items={items} defaultAsOf="2026-04-30" onDrill={onDrill} />,
    );
    expect(entry().actions).toEqual(["drill"]);
    expect(entry()).toMatchObject({
      kind: "receivable",
      asOf: "2026-04-30",
      totalMinor: 395_00,
      overdueMinor: 295_00,
      overdueSharePct: 74.7,
      drill: null,
      issues: [],
    });
    expect(entry().buckets.map((b: any) => [b.id, b.amountMinor, b.sharePct, b.partyCount])).toEqual([
      ["not-due", 100_00, 25.3, 1],
      ["1-30", 30_00, 7.6, 1],
      ["31-60", 300_00, 75.9, 1],
      ["61-90", -40_00, -10.1, 1],
      ["over-90", 5_00, 1.3, 1],
    ]);
    expect(entry().topOverdue).toEqual([
      { partyId: "birch", partyName: "Party birch", overdueMinor: 265_00, oldestDays: 91, itemCount: 3 },
      { partyId: "acme", partyName: "Party acme", overdueMinor: 30_00, oldestDays: 20, itemCount: 1 },
    ]);

    expect((await act("drill", ["31-60"])).ok).toBe(true);
    expect(entry().drilled).toEqual({
      bucket: "31-60",
      amountMinor: 300_00,
      parties: [{ partyId: "birch", partyName: "Party birch", amountMinor: 300_00 }],
      total: 1,
      truncated: false,
    });
    expect(onDrill).toHaveBeenCalledWith("31-60", expect.objectContaining({ reason: "drill" }));
    expect((await act("drill", ["90+"])).error?.message).toBe(
      `No bucket "90+". Buckets: not-due, 1-30, 31-60, 61-90, over-90.`,
    );
    expect((await act("drill", [null])).ok).toBe(true);
    expect(entry().drilled).toBeNull();
  });

  it("draws the stack, legend and party rows, and a person drills from the legend", () => {
    const { entry, button } = setup(
      "aging-chart",
      "Receivables by age",
      <AgingChart items={items} defaultAsOf="2026-04-30" />,
    );
    // Credits are not drawn; every other non-zero bucket is a segment of the total bar.
    expect(document.querySelectorAll('[data-slot="aging-chart-total"] rect')).toHaveLength(4);
    expect(document.querySelectorAll('[data-slot="aging-chart-row"]')).toHaveLength(2);
    expect(document.querySelector('[data-slot="aging-chart-svg"] desc')?.textContent).toMatch(
      /^Total \$395\.00; Overdue \$295\.00 \(74\.7%\)\. Not due \$100\.00 \(25\.3%\)/,
    );
    fireEvent.click(button("31–60 days: $300.00, 75.9% of the total"));
    expect(entry().drill).toBe("31-60");
    expect(document.querySelector('[data-slot="aging-chart-parties"]')?.textContent).toBe("Party birch$300.00");
    fireEvent.click(button("Show all buckets"));
    expect(entry().drill).toBeNull();
  });

  it("shows payables in Norwegian and refuses to drill before there is a date", async () => {
    const { entry } = setup(
      "aging-chart",
      "Leverandørgjeld etter alder",
      <AgingChart items={items} kind="payable" defaultAsOf="2026-04-30" />,
      "NO",
    );
    expect(entry()).toMatchObject({ kind: "payable", totalMinor: 900_00, overdueMinor: 900_00 });
    expect(document.querySelector("legend, [data-slot='aging-chart-legend']")?.textContent).toMatch(
      /Ikke forfalt.*1–30 dager.*Over 90 dager/,
    );
    cleanup();
    const view = mount(agingChart, { items }, `<root><bucket value="1-30">1-30</bucket></root>`);
    try {
      expect(() => view.api.drill("1-30")).toThrow(/no as-of date/);
    } finally {
      view.unmount();
    }
  });

  it("reports the click as the source of a drill (ui-sdk mount)", async () => {
    const view = mount(
      agingChart,
      { items, defaultAsOf: "2026-04-30" },
      `<root><bucket value="1-30">1-30</bucket><clear>Clear</clear></root>`,
    );
    try {
      await view.click(view.part("bucket", "1-30")!);
      expect(view.changes.at(-1)).toMatchObject({ key: "drill", reason: "drill", source: "mouse" });
      expect(view.state.drilled).toMatchObject({ bucket: "1-30", amountMinor: 30_00 });
      await view.click(view.part("clear")!);
      expect(view.changes.at(-1)).toMatchObject({ key: "drill", reason: "clear-drill", source: "mouse" });
    } finally {
      view.unmount();
    }
  });
});

describe("CashflowWaterfall", () => {
  const steps = [
    { id: "sales", label: "Sales", amountMinor: 800_00 },
    { id: "salaries", label: "Salaries", amountMinor: -500_00 },
    { id: "rent", label: "Rent", amountMinor: -200_00 },
    { id: "tax", label: "Tax", amountMinor: -50_00 },
  ];

  it("walks opening to closing, says it reconciles and drills into a step", async () => {
    const onDrill = vi.fn();
    const { entry, act } = setup(
      "cashflow-waterfall",
      "Cash flow",
      <CashflowWaterfall openingMinor={1000_00} closingMinor={1050_00} steps={steps} onDrill={onDrill} />,
    );
    expect(entry().actions).toEqual(["drill"]);
    expect(entry()).toMatchObject({
      openingMinor: 1000_00,
      closingMinor: 1050_00,
      closingGiven: true,
      inflowMinor: 800_00,
      outflowMinor: -750_00,
      netMinor: 50_00,
      computedClosingMinor: 1050_00,
      differenceMinor: 0,
      reconciles: true,
    });
    expect(entry().steps.map((s: any) => [s.id, s.startMinor, s.endMinor, s.direction])).toEqual([
      ["sales", 1000_00, 1800_00, "in"],
      ["salaries", 1800_00, 1300_00, "out"],
      ["rent", 1300_00, 1100_00, "out"],
      ["tax", 1100_00, 1050_00, "out"],
    ]);
    expect((await act("drill", ["rent"])).ok).toBe(true);
    expect(entry().drilled).toMatchObject({ id: "rent", amountMinor: -200_00, startMinor: 1300_00, endMinor: 1100_00 });
    expect(onDrill).toHaveBeenCalledWith("rent", expect.objectContaining({ reason: "drill" }));
    expect((await act("drill", ["opening"])).error?.message).toBe(
      `"opening" is a balance, not a step. Steps: sales, salaries, rent, tax.`,
    );
    expect((await act("drill", ["fuel"])).error?.message).toBe(`No step "fuel". Steps: sales, salaries, rent, tax.`);
  });

  it("says when it does not reconcile, and by how much", () => {
    const { entry } = setup(
      "cashflow-waterfall",
      "Cash flow",
      <CashflowWaterfall openingMinor={1000_00} closingMinor={1000_00} steps={steps} />,
    );
    expect(entry()).toMatchObject({ reconciles: false, computedClosingMinor: 1050_00, differenceMinor: -50_00 });
    expect(document.querySelector('[data-slot="cashflow-waterfall-check"]')?.textContent).toBe(
      "Does not reconcile: opening plus the movements is $1,050.00, the closing balance is $1,000.00. Difference -$50.00.",
    );
    expect(document.querySelectorAll('[data-slot="cashflow-waterfall-bar"][data-direction="out"]')).toHaveLength(3);
    expect(document.querySelectorAll('[data-slot="cashflow-waterfall-bar"][data-kind="balance"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-slot="cashflow-waterfall-table"] tbody tr')).toHaveLength(5);
  });

  it("works out the closing balance when none is given, in Norwegian", () => {
    const { entry, button } = setup(
      "cashflow-waterfall",
      "Kontantstrøm",
      <CashflowWaterfall openingMinor={1000_00} steps={steps} />,
      "NO",
    );
    expect(entry()).toMatchObject({ closingGiven: false, closingMinor: 1050_00, reconciles: true, currency: "NOK" });
    expect(document.querySelector('[data-slot="cashflow-waterfall-check"]')?.textContent).toBe(
      "Inngående saldo pluss bevegelsene er lik utgående saldo.",
    );
    const sales = [...document.querySelectorAll<HTMLButtonElement>('[data-slot="cashflow-waterfall-step"]')][0]!;
    fireEvent.click(sales);
    expect(entry().drill).toBe("sales");
    expect(button("x")).toBeUndefined();
  });

  it("reports the click as the source of a drill (ui-sdk mount)", async () => {
    const view = mount(
      cashflowWaterfall,
      { openingMinor: 1000_00, closingMinor: 1050_00, steps },
      `<root><step value="salaries">Salaries</step></root>`,
    );
    try {
      await view.click(view.part("step", "salaries")!);
      expect(view.changes.at(-1)).toMatchObject({ key: "drill", reason: "drill", source: "mouse" });
      expect(view.state.drilled).toMatchObject({ id: "salaries" });
    } finally {
      view.unmount();
    }
  });
});

describe("more series than hues", () => {
  it("folds every series past the fifth into one Other line, and never repeats a hue", async () => {
    const { clean, OTHER_SERIES } = await import("@booki/primitives/trend-chart");
    const { seriesColor } = await import("@booki/primitives/chart-math");
    const series = Array.from({ length: 8 }, (_, i) => ({
      id: `s${i}`,
      name: `S${i}`,
      points: [{ period: "2026-01", valueMinor: (i + 1) * 100 }],
    }));
    const data = clean(series);
    expect(data.series.map((item) => item.id)).toEqual(["s0", "s1", "s2", "s3", "s4", OTHER_SERIES]);
    // s5 + s6 + s7 = 600 + 700 + 800
    expect(data.series[5]!.points).toEqual([{ period: "2026-01", valueMinor: 2100 }]);
    expect(data.issues.join(" ")).toMatch(/3 series are shown together as "Other": s5, s6, s7/);
    const colours = Array.from({ length: 8 }, (_, i) => seriesColor(i));
    expect(new Set(colours.slice(0, 6)).size).toBe(6);
    expect(colours[6]).toBe("var(--bk-series-other)");
  });
});
