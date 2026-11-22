import { describe, expect, it } from "vitest";
import {
  acceptException,
  addExpenseLine,
  approveClaim,
  assertSubmittable,
  claimIssues,
  claimTotalMinor,
  lineAmountMinor,
  openExceptions,
  policyExceptions,
  rejectClaim,
  removeExpenseLine,
  setExpenseLine,
  submitClaim,
  type ExpenseClaim,
  type ExpensePolicy,
} from "./expense.js";

const AT = "2026-02-02T09:00:00Z";
const TODAY = "2026-02-02";
const policy: ExpensePolicy = {
  categories: { travel: { receiptRequired: true }, meals: { receiptRequired: true, maxMinor: 500_00 }, parking: {} },
  mileageRateMinorPerKm: 350,
  perDiemRates: { domestic: 800_00, abroad: 1200_00 },
};
const empty: ExpenseClaim = {
  id: "c1",
  claimantId: "nina",
  status: "draft",
  currency: "NOK",
  periodStart: "2026-01-01",
  periodEnd: "2026-01-31",
  lines: [],
  acceptedExceptions: [],
};
const add = (claim: ExpenseClaim, input: Parameters<typeof addExpenseLine>[1]) => addExpenseLine(claim, input, policy);

describe("expense claim", () => {
  it("prices mileage and per diem from the policy, in whole minor units", () => {
    expect(
      lineAmountMinor(
        { id: "l1", kind: "mileage", date: "2026-01-05", description: "", distanceMeters: 12_500 },
        policy,
      ),
    ).toBe(4375);
    // 333 m × 350 / 1000 = 116.55 → 117
    expect(
      lineAmountMinor({ id: "l1", kind: "mileage", date: "2026-01-05", description: "", distanceMeters: 333 }, policy),
    ).toBe(117);
    expect(
      lineAmountMinor(
        { id: "l1", kind: "per-diem", date: "2026-01-05", description: "", days: 3, rate: "abroad" },
        policy,
      ),
    ).toBe(3600_00);
  });

  it("refuses a typed amount on a computed line and anything the policy cannot price", () => {
    expect(() =>
      add(empty, {
        kind: "mileage",
        date: "2026-01-05",
        description: "",
        distanceMeters: 1000,
        amountMinor: 99,
      } as never),
    ).toThrow(/computed from the policy and cannot be set/);
    expect(() => add(empty, { kind: "mileage", date: "2026-01-05", description: "", distanceMeters: 12.5 })).toThrow(
      /whole number of metres/,
    );
    expect(() => add(empty, { kind: "per-diem", date: "2026-01-05", description: "", days: 2, rate: "moon" })).toThrow(
      /Rates: domestic, abroad/,
    );
    expect(() =>
      add(empty, { kind: "per-diem", date: "2026-01-05", description: "", days: 0.5, rate: "domestic" }),
    ).toThrow(/whole number above zero/);
    expect(() =>
      add(empty, { kind: "expense", date: "2026-01-05", category: "gifts", description: "", amountMinor: 100 }),
    ).toThrow(/Categories: travel, meals, parking/);
    expect(() =>
      add(empty, { kind: "expense", date: "2026-01-05", category: "travel", description: "", amountMinor: 10.5 }),
    ).toThrow(/whole number of minor units/);
    expect(() =>
      add(empty, { kind: "expense", date: "05.01.2026", category: "travel", description: "", amountMinor: 100 }),
    ).toThrow(/YYYY-MM-DD/);
    expect(() =>
      addExpenseLine(
        empty,
        { kind: "mileage", date: "2026-01-05", description: "", distanceMeters: 1000 },
        { categories: {} },
      ),
    ).toThrow(/no mileage rate/);
  });

  it("adds, changes and removes lines and totals them", () => {
    let claim = add(empty, {
      kind: "expense",
      date: "2026-01-05",
      category: "travel",
      description: "Train",
      amountMinor: 450_00,
      receiptId: "f1",
    });
    claim = add(claim, { kind: "mileage", date: "2026-01-06", description: "Client", distanceMeters: 20_000 });
    claim = add(claim, { kind: "per-diem", date: "2026-01-06", description: "Oslo", days: 1, rate: "domestic" });
    expect(claim.lines.map((line) => line.id)).toEqual(["l1", "l2", "l3"]);
    expect(claimTotalMinor(claim, policy)).toBe(450_00 + 70_00 + 800_00);
    claim = setExpenseLine(claim, "l2", { distanceMeters: 10_000 }, policy);
    expect(claimTotalMinor(claim, policy)).toBe(450_00 + 35_00 + 800_00);
    expect(() => setExpenseLine(claim, "l2", { kind: "expense" }, policy)).toThrow(/cannot become a expense line/);
    expect(() => setExpenseLine(claim, "l2", { amountMinor: 1 }, policy)).toThrow(/computed from the policy/);
    expect(() => setExpenseLine(claim, "l9", {}, policy)).toThrow(/No line "l9" on claim "c1". Lines: l1, l2, l3/);
    claim = removeExpenseLine(claim, "l3");
    expect(claim.lines).toHaveLength(2);
    expect(
      add(claim, { kind: "per-diem", date: "2026-01-07", description: "", days: 1, rate: "domestic" }).lines.at(-1)?.id,
    ).toBe("l3");
  });

  it("finds each kind of policy exception", () => {
    let claim = add(empty, {
      kind: "expense",
      date: "2026-01-05",
      category: "meals",
      description: "Dinner",
      amountMinor: 650_00,
    });
    claim = add(claim, {
      kind: "expense",
      date: "2025-12-30",
      category: "parking",
      description: "",
      amountMinor: 50_00,
    });
    claim = add(claim, { kind: "mileage", date: "2026-02-10", description: "", distanceMeters: 1000 });
    expect(policyExceptions(claim, policy, TODAY).map((e) => `${e.lineId} ${e.rule}`)).toEqual([
      "l1 missing-receipt",
      "l1 over-limit",
      "l2 outside-period",
      "l3 outside-period",
      "l3 future-date",
    ]);
    expect(policyExceptions(claim, policy, TODAY)[1]?.message).toMatch(/65000 is above the meals limit of 50000/);
    const withReceipt = setExpenseLine(claim, "l1", { receiptId: "f1", amountMinor: 500_00 }, policy);
    expect(policyExceptions(withReceipt, policy, TODAY).filter((e) => e.lineId === "l1")).toEqual([]);
    // An empty receipt id clears it.
    expect(setExpenseLine(withReceipt, "l1", { receiptId: "" }, policy).lines[0]).not.toHaveProperty("receiptId");
  });

  it("lets someone else accept an exception with a reason, never the claimant", () => {
    const claim = add(empty, {
      kind: "expense",
      date: "2026-01-05",
      category: "meals",
      description: "Dinner",
      amountMinor: 650_00,
      receiptId: "f1",
    });
    const accept = (actor: string, reason: string, rule = "over-limit") =>
      acceptException(claim, "l1", rule as never, actor, reason, AT, policy, TODAY);
    expect(() => accept("nina", "ok")).toThrow(/"nina" is the claimant and cannot accept/);
    expect(() => accept("", "ok")).toThrow(/Pass `actor`/);
    expect(() => accept("per", " ")).toThrow(/needs a reason/);
    expect(() => accept("per", "ok", "missing-receipt")).toThrow(
      /no open missing-receipt exception. Open: l1 over-limit/,
    );
    expect(() => accept("per", "ok", "too-ugly")).toThrow(
      /Rules: missing-receipt, over-limit, outside-period, future-date/,
    );
    const accepted = accept("per", "Client dinner, eight people");
    expect(accepted.acceptedExceptions).toEqual([
      { lineId: "l1", rule: "over-limit", acceptedBy: "per", reason: "Client dinner, eight people", at: AT },
    ]);
    expect(openExceptions(accepted, policy, TODAY)).toEqual([]);
    expect(() => acceptException(accepted, "l1", "over-limit", "per", "again", AT, policy, TODAY)).toThrow(
      /no open over-limit/,
    );
    // Changing the line drops the acceptance.
    expect(setExpenseLine(accepted, "l1", { amountMinor: 700_00 }, policy).acceptedExceptions).toEqual([]);
  });

  it("goes draft → submitted → approved, with the claimant kept out of approval", () => {
    expect(() => assertSubmittable(empty, policy)).toThrow(/has no lines/);
    expect(claimIssues({ ...empty, periodEnd: "2025-01-01" }, policy)[0]).toMatch(/claim period/);
    const draft = add(empty, {
      kind: "expense",
      date: "2026-01-05",
      category: "meals",
      description: "Dinner",
      amountMinor: 650_00,
      receiptId: "f1",
    });
    expect(() => submitClaim(draft, "", AT, policy)).toThrow(/Pass `actor`/);
    const submitted = submitClaim(draft, "nina", AT, policy);
    expect(submitted).toMatchObject({ status: "submitted", submittedAt: AT });
    expect(() => add(submitted, { kind: "mileage", date: "2026-01-06", description: "", distanceMeters: 1 })).toThrow(
      /is submitted and cannot be edited/,
    );
    expect(() => removeExpenseLine(submitted, "l1")).toThrow(/cannot be edited/);
    expect(() => approveClaim(submitted, "nina", AT, policy, TODAY)).toThrow(/cannot approve their own claim/);
    expect(() => approveClaim(submitted, "per", AT, policy, TODAY)).toThrow(
      /1 policy exception\(s\) nobody has accepted/,
    );
    const accepted = acceptException(submitted, "l1", "over-limit", "per", "Approved by CFO", AT, policy, TODAY);
    const approved = approveClaim(accepted, "per", AT, policy, TODAY);
    expect(approved).toMatchObject({ status: "approved", decidedBy: "per" });
    expect(() => approveClaim(draft, "per", AT, policy, TODAY)).toThrow(/Only a submitted claim can be approved/);
    expect(() => acceptException(approved, "l1", "over-limit", "per", "x", AT, policy, TODAY)).toThrow(
      /can no longer be accepted/,
    );
  });

  it("rejects a submitted claim with a reason", () => {
    const submitted = submitClaim(
      add(empty, { kind: "expense", date: "2026-01-05", category: "parking", description: "", amountMinor: 50_00 }),
      "nina",
      AT,
      policy,
    );
    expect(() => rejectClaim(submitted, "per", "", AT)).toThrow(/needs a reason/);
    expect(() => rejectClaim(submitted, "nina", "no", AT)).toThrow(/cannot reject their own claim/);
    expect(rejectClaim(submitted, "per", "Private trip", AT)).toMatchObject({
      status: "rejected",
      rejectionReason: "Private trip",
    });
  });
});
