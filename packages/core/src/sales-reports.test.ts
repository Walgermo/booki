import { describe, expect, it } from "vitest";
import { funnel, reachedCounts } from "./funnel.js";
import { localize } from "./messages.js";
import { forecastByPeriod, periodOf, timeInStage, type Deal, type PipelineStage } from "./pipeline.js";
import { mrrOn, mrrSeries, recurringBridge, recurringIssues, type RecurringAgreement } from "./recurring.js";

const stages: PipelineStage[] = [
  { id: "lead", name: "Lead", probability: 10 },
  { id: "quote", name: "Quote sent", probability: 50 },
  { id: "won", name: "Won", probability: 100, outcome: "won" },
  { id: "lost", name: "Lost", probability: 0, outcome: "lost" },
];

describe("funnel", () => {
  it("gives step and overall conversion and the biggest drop", () => {
    const view = funnel([
      { id: "lead", label: "Lead", count: 200 },
      { id: "meeting", label: "Meeting", count: 80 },
      { id: "quote", label: "Quote", count: 60 },
      { id: "won", label: "Won", count: 18, valueMinor: 900_000_00 },
    ]);
    expect(view.steps.map((s) => [s.stepConversionPct, s.overallConversionPct, s.dropOff])).toEqual([
      [null, 100, 0],
      [40, 40, 120],
      [75, 30, 20],
      [30, 9, 42],
    ]);
    // The largest share lost: 42 of 60 between quote and won (70 %), above 120 of 200 (60 %).
    expect(view.biggestDropId).toBe("won");
    expect(view.steps[3]!.valueMinor).toBe(900_000_00);
    expect(view.issues).toEqual([]);
  });

  it("reports a step that rises and leaves out what it cannot count", () => {
    const view = funnel([
      { id: "a", label: "A", count: 10 },
      { id: "b", label: "B", count: 12 },
      { id: "b", label: "B again", count: 1 },
      { id: "c", label: "C", count: 2.5 },
    ]);
    expect(view.steps).toHaveLength(2);
    expect(view.issues.join(" ")).toMatch(/"b" has more records than "a"/);
    expect(view.issues.join(" ")).toMatch(/given twice/);
    expect(view.issues.join(" ")).toMatch(/not a whole number/);
    expect(localize(view.issues.find((i) => /more records/.test(i))!, "nb")).toMatch(/skal aldri stige/);
  });

  it("finds a biggest drop that rounds to zero percent, and ranks drops exactly", () => {
    const tiny = funnel([
      { id: "lead", label: "Lead", count: 3000 },
      { id: "qualified", label: "Qualified", count: 2999 },
      { id: "won", label: "Won", count: 2999 },
    ]);
    expect(tiny.steps[1]!.stepConversionPct).toBe(100);
    expect(tiny.biggestDropId).toBe("qualified");
    // 1 of 3001 and 1 of 3000 both round to 0.0 %; the second loses the larger share.
    const close = funnel([
      { id: "a", label: "A", count: 3001 },
      { id: "b", label: "B", count: 3000 },
      { id: "c", label: "C", count: 2999 },
    ]);
    expect(close.biggestDropId).toBe("c");
    expect(
      funnel([
        { id: "a", label: "A", count: 5 },
        { id: "b", label: "B", count: 5 },
      ]).biggestDropId,
    ).toBeNull();
  });

  it("counts a record at every step up to the furthest it reached", () => {
    expect(reachedCounts([["lead"], ["lead", "quote"], ["won"], []], ["lead", "quote", "won"])).toEqual([3, 2, 1]);
  });
});

describe("forecastByPeriod", () => {
  const deal = (over: Partial<Deal>): Deal => ({
    id: "D",
    name: "Deal",
    stageId: "quote",
    valueMinor: 100_000_00,
    currency: "NOK",
    valueStatus: "known",
    valueSource: "Quote",
    ...over,
  });
  const deals = [
    deal({ id: "D1", expectedClose: "2026-11-20" }),
    deal({ id: "D2", expectedClose: "2026-12-05", valueStatus: "estimate", valueMinor: 333 }),
    deal({ id: "D3", stageId: "won", closedAt: "2026-11-02T10:00:00Z", valueMinor: 40_000_00 }),
    deal({ id: "D4", stageId: "lost", closedAt: "2026-11-03T10:00:00Z" }),
    deal({ id: "D5" }),
    deal({ id: "D6", currency: "EUR", expectedClose: "2026-11-20" }),
    deal({ id: "D7", valueStatus: "unknown", valueSource: undefined, expectedClose: "2026-11-20" }),
  ];
  const options = {
    currency: "NOK",
    grouping: "month" as const,
    from: "2026-11-01",
    to: "2026-12-31",
    today: "2026-11-24",
  };

  it("puts won deals by close, open deals by expected close, and leaves lost and unverified out", () => {
    const view = forecastByPeriod(deals, stages, options);
    expect(view.periods).toEqual([
      {
        period: "2026-11",
        wonMinor: 40_000_00,
        committedMinor: 100_000_00,
        bestCaseMinor: 0,
        weightedMinor: 50_000_00,
        count: 2,
      },
      { period: "2026-12", wonMinor: 0, committedMinor: 0, bestCaseMinor: 333, weightedMinor: 167, count: 1 },
    ]);
    expect(view.undated).toEqual(["D5"]);
    expect(view.overdue).toEqual(["D1"]);
    expect(view.otherCurrency).toEqual(["D6"]);
    expect(view.unverified).toEqual(["D7"]);
  });

  it("leaves out deals closing outside the range, whatever the grouping", () => {
    const edge = [
      deal({ id: "E1", stageId: "won", closedAt: "2026-10-20T10:00:00Z", valueMinor: 7_00 }),
      deal({ id: "E2", expectedClose: "2027-01-15", valueMinor: 9_00 }),
    ];
    const all = [...deals, ...edge];
    const total = (grouping: "month" | "quarter") =>
      forecastByPeriod(all, stages, { ...options, grouping }).periods.reduce(
        (sum, p) => ({ won: sum.won + p.wonMinor, open: sum.open + p.committedMinor + p.bestCaseMinor }),
        { won: 0, open: 0 },
      );
    expect(total("quarter")).toEqual(total("month"));
    expect(total("quarter")).toEqual({ won: 40_000_00, open: 100_000_00 + 333 });
  });

  it("groups by quarter and checks its arguments", () => {
    expect(forecastByPeriod(deals, stages, { ...options, grouping: "quarter" }).periods.map((p) => p.period)).toEqual([
      "2026-Q4",
    ]);
    expect(periodOf("2026-02-10", "quarter")).toBe("2026-Q1");
    expect(() => forecastByPeriod(deals, stages, { ...options, grouping: "week" as never })).toThrow(
      /Groupings: month, quarter/,
    );
    expect(() => forecastByPeriod(deals, stages, { ...options, to: "2026-10-01" })).toThrow(
      /end comes before the start/,
    );
  });
});

describe("timeInStage", () => {
  it("gives the median and longest stay and who is over target", () => {
    const view = timeInStage(
      [
        { dealId: "D1", stageId: "lead", enteredAt: "2026-10-01", leftAt: "2026-10-05" },
        { dealId: "D2", stageId: "lead", enteredAt: "2026-10-01", leftAt: "2026-10-11" },
        { dealId: "D3", stageId: "lead", enteredAt: "2026-11-20" },
        { dealId: "D4", stageId: "quote", enteredAt: "2026-10-01T09:00:00Z" },
      ],
      stages,
      "2026-11-24",
      { quote: 30 },
    );
    expect(view.map((s) => s.stageId)).toEqual(["lead", "quote"]);
    expect(view[0]).toMatchObject({ count: 3, medianDays: 4, longestDays: 10, current: ["D3"], overTarget: [] });
    expect(view[1]).toMatchObject({ count: 1, medianDays: 54, targetDays: 30, overTarget: ["D4"] });
  });

  it("takes the mean of the two middle stays for an even count", () => {
    const view = timeInStage(
      [
        { dealId: "D1", stageId: "quote", enteredAt: "2026-10-01", leftAt: "2026-10-15" },
        { dealId: "D2", stageId: "quote", enteredAt: "2026-10-01", leftAt: "2026-12-03" },
        { dealId: "D3", stageId: "lead", enteredAt: "2026-10-01", leftAt: "2026-10-15" },
      ],
      stages,
      "2026-12-31",
    );
    // 14 and 63 days: 38.5, to the nearest whole day.
    expect(view.find((s) => s.stageId === "quote")?.medianDays).toBe(39);
    expect(view.find((s) => s.stageId === "lead")?.medianDays).toBe(14);
    expect(timeInStage([], stages, "2026-12-31")[0]?.medianDays).toBeNull();
  });

  it("counts the time that passed for a finished stay with times at both ends", () => {
    const view = timeInStage(
      [
        { dealId: "D1", stageId: "lead", enteredAt: "2026-10-01T23:59:00Z", leftAt: "2026-10-02T00:01:00Z" },
        { dealId: "D2", stageId: "quote", enteredAt: "2026-10-01T09:00:00Z", leftAt: "2026-10-02T09:00:00Z" },
      ],
      stages,
      "2026-12-31",
    );
    expect(view[0]).toMatchObject({ medianDays: 0, longestDays: 0 });
    expect(view[1]).toMatchObject({ medianDays: 1, longestDays: 1 });
  });
});

describe("recurring revenue", () => {
  const agreements: RecurringAgreement[] = [
    { id: "A1", customerId: "c1", mrrMinor: 10_000_00, currency: "NOK", start: "2026-01-01" },
    { id: "A2", customerId: "c1", mrrMinor: 2_000_00, currency: "NOK", start: "2026-06-01" },
    { id: "A3", customerId: "c2", mrrMinor: 5_000_00, currency: "NOK", start: "2026-01-01", end: "2026-04-30" },
    { id: "A4", customerId: "c3", mrrMinor: 3_000_00, currency: "NOK", start: "2026-05-01" },
    { id: "A5", customerId: "c4", mrrMinor: 8_000_00, currency: "NOK", start: "2026-01-01", end: "2026-05-31" },
    { id: "A6", customerId: "c4", mrrMinor: 6_000_00, currency: "NOK", start: "2026-06-01" },
    { id: "A7", customerId: "c5", mrrMinor: 1_000_00, currency: "EUR", start: "2026-01-01" },
  ];

  it("bridges opening to closing through new, expansion, contraction and churn, exactly", () => {
    const bridge = recurringBridge(agreements, "2026-03-31", "2026-06-30", "NOK");
    expect(bridge.mrr).toMatchObject({
      openingMinor: 23_000_00,
      newMinor: 3_000_00,
      expansionMinor: 2_000_00,
      contractionMinor: -2_000_00,
      churnMinor: -5_000_00,
      closingMinor: 21_000_00,
      roundingMinor: 0,
    });
    expect(bridge.arr.closingMinor).toBe(252_000_00);
    expect(bridge.reconciles).toBe(true);
    expect(bridge.customers).toEqual({ new: ["c3"], expansion: ["c1"], contraction: ["c4"], churn: ["c2"] });
    expect(mrrOn(agreements, "2026-06-30", "EUR")).toBe(1_000_00);
    expect(mrrSeries(agreements, "2026-04", "2026-06", "NOK").map((p) => p.valueMinor)).toEqual([
      23_000_00, 21_000_00, 21_000_00,
    ]);
    expect(recurringIssues(agreements, "NOK")[0]).toMatch(/Agreements in EUR are left out/);
  });

  it("sums yearly and quarterly agreements exactly per year, and says what monthly rounding moved", () => {
    const billed: RecurringAgreement[] = [
      { id: "Y1", customerId: "c1", amountMinor: 1_000_00, interval: "year", currency: "NOK", start: "2026-01-01" },
      { id: "Y2", customerId: "c2", amountMinor: 1_000_00, interval: "year", currency: "NOK", start: "2026-05-01" },
      { id: "Q1", customerId: "c3", amountMinor: 3_00, interval: "quarter", currency: "NOK", start: "2026-05-01" },
    ];
    const bridge = recurringBridge(billed, "2026-03-31", "2026-06-30", "NOK");
    expect(bridge.arr).toMatchObject({
      openingMinor: 1_000_00,
      newMinor: 1_012_00,
      closingMinor: 2_012_00,
      roundingMinor: 0,
    });
    // 1 000.00 a year is 83.33 a month; 1 012.00 is 84.33; 2 012.00 is 167.67, one øre more than the parts.
    expect(bridge.mrr).toMatchObject({ openingMinor: 83_33, newMinor: 84_33, closingMinor: 167_67, roundingMinor: 1 });
    expect(() =>
      recurringBridge(
        [{ id: "X", customerId: "c", amountMinor: 1, interval: "week" as never, currency: "NOK", start: "2026-01-01" }],
        "2026-01-01",
        "2026-02-01",
        "NOK",
      ),
    ).toThrow(/Intervals: month, quarter, year/);
    expect(() =>
      recurringBridge(
        [{ id: "X", customerId: "c", amountMinor: 1, mrrMinor: 1, currency: "NOK", start: "2026-01-01" }],
        "2026-01-01",
        "2026-02-01",
        "NOK",
      ),
    ).toThrow(/give one/);
  });

  it("refuses a range that runs backwards and a date that is not one", () => {
    expect(() => recurringBridge(agreements, "2026-06-30", "2026-03-31", "NOK")).toThrow(/end comes before/);
    expect(() => mrrOn(agreements, "30.06.2026", "NOK")).toThrow(/YYYY-MM-DD/);
  });
});
