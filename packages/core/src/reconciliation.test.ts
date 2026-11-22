import { describe, expect, it } from "vitest";
import {
  assertReconciled,
  suggestMatches,
  summarize,
  unmatched,
  validateMatch,
  type BankLine,
  type OpenPost,
  type ReconciliationMatch,
} from "./reconciliation.js";

const bank: BankLine[] = [
  { id: "b1", date: "2026-10-01", description: "Nordlys AS", amountMinor: 125_000, reference: "10012342" },
  { id: "b2", date: "2026-10-02", description: "Samlebetaling", amountMinor: 300_000 },
  { id: "b3", date: "2026-10-03", description: "Husleie", amountMinor: -150_000 },
  { id: "b4", date: "2026-10-04", description: "Ukjent", amountMinor: 50_000 },
  { id: "b5", date: "2026-10-05", description: "Ukjent 2", amountMinor: 50_000 },
];
const posts: OpenPost[] = [
  { id: "p1", date: "2026-09-20", description: "Faktura 1001", amountMinor: 125_000, reference: "10012342" },
  { id: "p2", date: "2026-09-21", description: "Faktura 1002", amountMinor: 100_000 },
  { id: "p3", date: "2026-09-22", description: "Faktura 1003", amountMinor: 200_000 },
  { id: "p4", date: "2026-09-25", description: "Leverandør husleie", amountMinor: -150_000 },
  { id: "p5", date: "2026-09-26", description: "Faktura 1004", amountMinor: 50_000 },
];
const match = (over: Partial<ReconciliationMatch>): ReconciliationMatch => ({
  id: "m1",
  bankLineIds: ["b1"],
  postIds: ["p1"],
  status: "suggested",
  source: "agent",
  ...over,
});

describe("validateMatch", () => {
  it("accepts one to one and one to many when the sides sum the same", () => {
    expect(validateMatch(bank, posts, [], "b1", "p1")).toEqual({
      bankLineIds: ["b1"],
      postIds: ["p1"],
      amountMinor: 125_000,
    });
    expect(validateMatch(bank, posts, [], ["b2"], ["p2", "p3"]).amountMinor).toBe(300_000);
    expect(validateMatch(bank, posts, [], "b3", "p4").amountMinor).toBe(-150_000);
  });

  it("refuses sides that do not sum the same, naming the difference", () => {
    expect(() => validateMatch(bank, posts, [], "b2", "p2")).toThrow(
      /differ by 200000 minor units \(bank 300000, ledger 100000\)/,
    );
  });

  it("refuses unknown ids, listing what is unmatched", () => {
    expect(() => validateMatch(bank, posts, [], "b9", "p1")).toThrow(/No bank line "b9".*b1, b2, b3, b4, b5/);
    expect(() => validateMatch(bank, posts, [], "b1", "p9")).toThrow(/No open post "p9"/);
  });

  it("refuses a line or post that is already in a live match", () => {
    const taken = [match({})];
    expect(() => validateMatch(bank, posts, taken, "b1", "p1")).toThrow(/Bank line "b1" is already in a match/);
    expect(validateMatch(bank, posts, [match({ status: "rejected" })], "b1", "p1").amountMinor).toBe(125_000);
  });

  it("refuses empty and repeated ids", () => {
    expect(() => validateMatch(bank, posts, [], [], "p1")).toThrow(/at least one bank line id/);
    expect(() => validateMatch(bank, posts, [], ["b1", "b1"], "p1")).toThrow(/appears twice/);
  });
});

describe("summarize and assertReconciled", () => {
  it("counts approved, suggested and unmatched bank lines", () => {
    const matches = [match({ status: "approved" }), match({ id: "m2", bankLineIds: ["b2"], postIds: ["p2", "p3"] })];
    expect(summarize(bank, matches)).toEqual({
      bankLineCount: 5,
      matchedCount: 1,
      suggestedCount: 1,
      unmatchedCount: 3,
      outstandingMinor: 250_000,
      reconciled: false,
    });
    expect(unmatched(bank, posts, matches).bankLines.map((l) => l.id)).toEqual(["b3", "b4", "b5"]);
    expect(() => assertReconciled(bank, matches)).toThrow(/3 bank line\(s\) unmatched, 1 waiting for approval/);
  });

  it("is reconciled only when every bank line is approved", () => {
    const one = [bank[0]!];
    expect(summarize(one, [match({})]).reconciled).toBe(false);
    expect(assertReconciled(one, [match({ status: "approved" })]).reconciled).toBe(true);
    expect(summarize([], []).reconciled).toBe(false);
  });
});

describe("suggestMatches", () => {
  it("suggests by shared reference or a unique amount, and leaves ambiguity alone", () => {
    const suggestions = suggestMatches(bank, posts);
    expect(suggestions.map((s) => [s.bankLineIds, s.postIds])).toEqual([
      [["b1"], ["p1"]],
      [["b3"], ["p4"]],
    ]);
    expect(suggestions.every((s) => s.status === "suggested" && s.source === "rule")).toBe(true);
  });

  it("skips what is already matched", () => {
    expect(suggestMatches(bank, posts, [match({ status: "approved" })]).map((s) => s.bankLineIds[0])).toEqual(["b3"]);
  });
});
