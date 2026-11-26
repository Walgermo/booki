import { describe, expect, it } from "vitest";
import { localize } from "./messages.js";
import {
  assertStages,
  closeDeal,
  dealIssues,
  findDeal,
  forecast,
  moveDeal,
  pipelineSummary,
  reopenDeal,
  setDealValue,
  setExpectedClose,
  type Deal,
  type PipelineStage,
} from "./pipeline.js";
import { guardCloseDeal } from "./server.js";

const stages: PipelineStage[] = [
  { id: "lead", name: "Lead", probability: 10 },
  { id: "quote", name: "Quote sent", probability: 50 },
  { id: "won", name: "Won", probability: 100, outcome: "won" },
  { id: "lost", name: "Lost", probability: 0, outcome: "lost" },
];

const deal = (over: Partial<Deal> = {}): Deal => ({
  id: "D-1",
  name: "Licence 2027",
  stageId: "lead",
  valueMinor: 120_000_00,
  currency: "NOK",
  valueStatus: "known",
  valueSource: "Quote 114",
  ...over,
});
const AT = "2026-11-24T10:00:00Z";

describe("pipeline rules", () => {
  it("moves an open deal between open stages, and refuses a closing stage", () => {
    expect(moveDeal(deal(), stages, "quote", AT)).toMatchObject({ stageId: "quote", stageChangedAt: AT });
    expect(() => moveDeal(deal(), stages, "won", AT)).toThrow(/marks it won\. That is a person's decision/);
    expect(() => moveDeal(deal(), stages, "nope", AT)).toThrow(/Stages: lead, quote, won, lost/);
    expect(() => moveDeal(deal({ stageId: "won" }), stages, "lead", AT)).toThrow(/is won\. A person reopens it/);
    const same = deal();
    expect(moveDeal(same, stages, "lead", AT)).toBe(same);
  });

  it("closes and reopens for a person; lost needs a reason", () => {
    const won = closeDeal(deal(), stages, "won", "kari", AT);
    expect(won).toMatchObject({ stageId: "won", closedBy: "kari", closedAt: AT });
    expect(() => closeDeal(deal(), stages, "lost", "kari", AT)).toThrow(/needs a reason/);
    expect(closeDeal(deal(), stages, "lost", "kari", AT, "Chose a competitor").lostReason).toBe("Chose a competitor");
    expect(() => closeDeal(won, stages, "lost", "kari", AT, "x")).toThrow(/is won/);
    expect(() => closeDeal(deal(), stages, "won", " ", AT)).toThrow(/needs the id/);
    const reopened = reopenDeal(won, stages, "quote", "kari", AT);
    expect(reopened.stageId).toBe("quote");
    expect(reopened.closedBy).toBeUndefined();
    expect(() => reopenDeal(deal(), stages, "quote", "kari", AT)).toThrow(/is open/);
  });

  it("needs a source for a known or estimated value, and forgets it when the amount changes", () => {
    expect(() => setDealValue(deal({ valueSource: undefined }), { valueStatus: "known" })).toThrow(/needs both/);
    const changed = setDealValue(deal(), { valueMinor: 99_000_00 });
    expect(changed).toMatchObject({ valueMinor: 99_000_00, valueStatus: "unknown" });
    expect(changed.valueSource).toBeUndefined();
    const restated = setDealValue(deal(), {
      valueMinor: 99_000_00,
      valueStatus: "estimate",
      valueSource: "Call 3 Nov",
    });
    expect(restated).toMatchObject({ valueStatus: "estimate", valueSource: "Call 3 Nov" });
    expect(setDealValue(deal(), { currency: "EUR" }).valueStatus).toBe("unknown");
    // A new figure with a status but no source does not inherit the old figure's evidence.
    expect(() => setDealValue(deal(), { valueMinor: 200_000_00, valueStatus: "known" })).toThrow(/needs both/);
    expect(setDealValue(deal(), { valueMinor: 200_000_00, valueStatus: "unknown" }).valueSource).toBeUndefined();
    // A status-only change keeps the source.
    expect(setDealValue(deal(), { valueStatus: "estimate" }).valueSource).toBe(deal().valueSource);
    expect(() => setDealValue(deal(), { valueMinor: 12.5 })).toThrow(/minor units/);
    expect(() => setDealValue(deal(), { valueMinor: -1 })).toThrow(/non-negative/);
    expect(() => setDealValue(deal(), { currency: "kr" })).toThrow(/three-letter/);
    expect(() => setDealValue(deal(), { probability: 3 } as never)).toThrow(
      /no value field "probability"\. Fields: valueMinor, currency, valueStatus, valueSource/,
    );
    expect(setDealValue(deal(), { valueMinor: null }).valueMinor).toBeNull();
    expect(setDealValue(deal(), { valueMinor: 0, valueStatus: "known", valueSource: "Free pilot" }).valueMinor).toBe(0);
  });

  it("sums per stage and currency, leaves unverified amounts out, and weights the forecast exactly", () => {
    const deals = [
      deal(),
      deal({ id: "D-2", stageId: "quote", valueMinor: 333, valueStatus: "estimate", valueSource: "Guess" }),
      deal({ id: "D-3", stageId: "quote", valueMinor: 500_00, valueStatus: "unknown", valueSource: undefined }),
      deal({ id: "D-4", stageId: "quote", valueMinor: null, valueStatus: "unknown", valueSource: undefined }),
      deal({ id: "D-5", stageId: "quote", currency: "EUR", valueMinor: 10_000_00 }),
      deal({ id: "D-6", stageId: "won", valueMinor: 50_000_00 }),
    ];
    const quote = pipelineSummary(deals, stages)[1]!;
    expect(quote.count).toBe(4);
    expect(quote.totals).toEqual([
      { currency: "EUR", knownMinor: 10_000_00, estimateMinor: 0, weightedMinor: 5_000_00, unverified: 0, missing: 0 },
      { currency: "NOK", knownMinor: 0, estimateMinor: 333, weightedMinor: 167, unverified: 1, missing: 1 },
    ]);
    // 120 000 × 10 % + 3.33 × 50 % (1.665 rounds to 1.67); won deals are not forecast.
    expect(forecast(deals, stages).find((t) => t.currency === "NOK")?.weightedMinor).toBe(12_000_00 + 167);
  });

  it("warns, never refuses, about a deal a person should look at", () => {
    const issues = dealIssues(
      deal({ valueStatus: "unknown", expectedClose: "2026-11-01", stageChangedAt: "2026-09-01T08:00:00Z" }),
      stages,
      "2026-11-24",
    );
    expect(issues.join(" ")).toMatch(/nobody vouched for/);
    expect(issues.join(" ")).toMatch(/expected to close 2026-11-01/);
    expect(issues.join(" ")).toMatch(/not changed stage in 84 days/);
    expect(dealIssues(deal({ stageId: "won", valueMinor: null }), stages, "2026-11-24")).toEqual([]);
  });

  it("checks stages, dates and ids, and reads in Norwegian", () => {
    expect(() => assertStages([{ id: "a", name: "A", probability: 12.5 }])).toThrow(/whole percent/);
    expect(() => assertStages([stages[0]!, stages[0]!])).toThrow(/twice/);
    expect(setExpectedClose(deal(), "2026-12-15").expectedClose).toBe("2026-12-15");
    expect(setExpectedClose(deal({ expectedClose: "2026-12-15" }), "").expectedClose).toBeUndefined();
    expect(() => setExpectedClose(deal(), "15.12.2026")).toThrow(/YYYY-MM-DD/);
    expect(() => findDeal([deal()], "D-9")).toThrow(/Deals: D-1/);
    try {
      moveDeal(deal(), stages, "won", AT);
    } catch (error) {
      expect(localize(error as Error, "nb")).toMatch(/markerer den som vunnet\. Det er en persons beslutning/);
    }
  });
});

describe("guardCloseDeal", () => {
  const roles = [{ id: "sales", name: "Sales", permissions: ["deal.close"] }];
  it("refuses an agent whatever its roles, and records the person", () => {
    const agent = guardCloseDeal(
      { actor: { id: "assistant", kind: "agent", roles: ["sales"] }, roles },
      { deal: deal(), stages, outcome: "won", at: AT },
    );
    expect(agent).toMatchObject({ ok: false, status: 403 });
    const person = guardCloseDeal(
      { actor: { id: "kari", kind: "person", roles: ["sales"] }, roles },
      { deal: deal(), stages, outcome: "won", at: AT },
    );
    expect(person).toMatchObject({ ok: true, actor: "kari", value: { closedBy: "kari", stageId: "won" } });
    const noReason = guardCloseDeal(
      { actor: { id: "kari", kind: "person", roles: ["sales"] }, roles },
      { deal: deal(), stages, outcome: "lost", at: AT },
    );
    expect(noReason).toMatchObject({ ok: false, status: 422 });
  });
});
