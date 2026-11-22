import { describe, expect, it } from "vitest";
import {
  accumulatedDepreciation,
  assertRunnable,
  carryingAmount,
  depreciationFor,
  depreciationRun,
  depreciationSchedule,
  disposeAsset,
  periodMonths,
  validateAsset,
  type FixedAsset,
} from "./fixed-assets.js";
import { createVoucherLine, sumVoucher } from "./voucher.js";

const van: FixedAsset = {
  id: "van",
  name: "Delivery van",
  acquiredOn: "2026-01-15",
  costMinor: 100_000,
  residualMinor: 1,
  method: "straight-line",
  usefulLifeMonths: 36,
};
const press: FixedAsset = {
  id: "press",
  name: "Printing press",
  acquiredOn: "2025-11-03",
  costMinor: 1_234_567_89,
  residualMinor: 10_000_00,
  method: "declining-balance",
  rateBp: 3333,
};
const sum = (asset: FixedAsset) =>
  depreciationSchedule(asset).reduce((total, entry) => total + entry.depreciationMinor, 0);
const accounts = {
  expenseAccount: { number: "6000", name: "Depreciation" },
  accumulatedAccount: { number: "1209", name: "Accumulated depreciation" },
};

describe("depreciationSchedule", () => {
  it("sums a straight-line schedule exactly to cost minus residual", () => {
    const schedule = depreciationSchedule(van);
    expect(schedule).toHaveLength(36);
    expect(schedule[0]).toEqual({
      period: "2026-01",
      depreciationMinor: 2777,
      accumulatedMinor: 2777,
      carryingMinor: 97_223,
    });
    expect(schedule.at(-1)).toMatchObject({ period: "2028-12", accumulatedMinor: 99_999, carryingMinor: 1 });
    expect(sum(van)).toBe(99_999);
    // 99999 / 36 = 2777.75: every month is 2777 or 2778, never a float.
    expect(new Set(schedule.map((e) => e.depreciationMinor))).toEqual(new Set([2777, 2778]));
  });
  it("sums exactly for other awkward numbers", () => {
    for (const [costMinor, residualMinor, usefulLifeMonths] of [
      [1, 0, 36],
      [100, 0, 7],
      [999_999_999_99, 13, 61],
      [50, 50, 12],
    ] as const) {
      const asset = { ...van, costMinor, residualMinor, usefulLifeMonths };
      expect(sum(asset)).toBe(costMinor - residualMinor);
      expect(
        depreciationSchedule(asset).every((e) => e.depreciationMinor >= 0 && e.carryingMinor >= residualMinor),
      ).toBe(true);
    }
  });
  it("sums a declining-balance schedule at 33.33% exactly and never goes below residual", () => {
    const schedule = depreciationSchedule(press);
    // 123,456,789 × 3333 / 120,000 = 3,429,012.31… → 3,429,012
    expect(schedule[0]).toMatchObject({ period: "2025-11", depreciationMinor: 3_429_012 });
    expect(schedule[1]!.depreciationMinor).toBeLessThan(schedule[0]!.depreciationMinor);
    expect(sum(press)).toBe(1_234_567_89 - 10_000_00);
    expect(schedule.at(-1)!.carryingMinor).toBe(10_000_00);
    expect(schedule.every((e) => Number.isSafeInteger(e.depreciationMinor) && e.depreciationMinor > 0)).toBe(true);
    const tiny = { ...press, costMinor: 100_000, residualMinor: 1 };
    expect(sum(tiny)).toBe(99_999);
    const capped = { ...tiny, usefulLifeMonths: 24 };
    expect(depreciationSchedule(capped)).toHaveLength(24);
    expect(sum(capped)).toBe(99_999);
  });
  it("refuses an asset it cannot depreciate", () => {
    expect(() => validateAsset({ ...van, usefulLifeMonths: undefined })).toThrow(/Asset "van": useful life \(months\)/);
    expect(() => validateAsset({ ...press, rateBp: 0 })).toThrow(/yearly rate.*from 1 to 10000/);
    expect(() => validateAsset({ ...van, residualMinor: 100_001 })).toThrow(/residual value/);
    expect(() => validateAsset({ ...van, costMinor: 10.5 })).toThrow(/whole number/);
    expect(() => validateAsset({ ...van, acquiredOn: "2026-02-30" })).toThrow(/real date written YYYY-MM-DD/);
    expect(() => validateAsset({ ...van, method: "units" as never })).toThrow(/straight-line, declining-balance/);
  });
});

describe("periods and dates", () => {
  it("gives the depreciation of a month and of a year", () => {
    expect(depreciationFor(van, "2025-12")).toBe(0);
    expect(depreciationFor(van, "2026-01")).toBe(2777);
    expect(depreciationFor(van, "2026")).toBe(33_333);
    expect(depreciationFor(van, "2026") + depreciationFor(van, "2027") + depreciationFor(van, "2028")).toBe(99_999);
    expect(depreciationFor(van, "2029-01")).toBe(0);
    expect(() => depreciationFor(van, "2026-13")).toThrow(/not a period code/);
    expect(periodMonths("2026")).toHaveLength(12);
  });
  it("gives accumulated depreciation and carrying amount as of a date", () => {
    expect(accumulatedDepreciation(van, "2026-01-30")).toBe(0);
    expect(accumulatedDepreciation(van, "2026-01-31")).toBe(2777);
    expect(accumulatedDepreciation(van, "2026-12-31")).toBe(33_333);
    expect(carryingAmount(van, "2026-12-31")).toBe(66_667);
    expect(carryingAmount(van, "2026-01-14")).toBe(0);
    expect(carryingAmount(van, "2035-01-01")).toBe(1);
  });
});

describe("disposeAsset", () => {
  it("computes a gain and a loss against carrying amount and stops depreciation", () => {
    // Disposed in July 2026: January–June are depreciated, 6 × 2777.75 → 16,666.
    const gain = disposeAsset(van, "2026-07-10", 90_000);
    expect(gain).toMatchObject({ carryingMinor: 83_334, proceedsMinor: 90_000, gainLossMinor: 6_666 });
    expect(gain.asset).toMatchObject({ disposedOn: "2026-07-10", disposalProceedsMinor: 90_000 });
    expect(disposeAsset(van, "2026-07-10", 80_000).gainLossMinor).toBe(-3_334);
    expect(depreciationSchedule(gain.asset).at(-1)!.period).toBe("2026-06");
    expect(depreciationFor(gain.asset, "2026-07")).toBe(0);
    expect(depreciationFor(gain.asset, "2026")).toBe(16_666);
    expect(carryingAmount(gain.asset, "2026-07-09")).toBe(83_334);
    expect(carryingAmount(gain.asset, "2026-07-10")).toBe(0);
  });
  it("refuses a date before acquisition, a second disposal and bad proceeds", () => {
    expect(() => disposeAsset(van, "2026-01-14", 0)).toThrow(
      /cannot be disposed of on 2026-01-14: it was acquired on 2026-01-15/,
    );
    const sold = disposeAsset(van, "2026-01-15", 100_000).asset;
    expect(() => disposeAsset(sold, "2026-08-01", 1)).toThrow(/already disposed of on 2026-01-15/);
    expect(() => disposeAsset(van, "2026-08-01", -1)).toThrow(/disposal proceeds/);
    expect(() => disposeAsset(van, "soon", 1)).toThrow(/YYYY-MM-DD/);
  });
});

describe("depreciationRun", () => {
  const future: FixedAsset = { ...van, id: "lift", name: "Forklift", acquiredOn: "2026-06-01" };
  const sold = disposeAsset({ ...van, id: "old", name: "Old van", acquiredOn: "2025-01-01" }, "2026-02-20", 0).asset;
  const done: FixedAsset = { ...van, id: "pc", name: "Laptop", acquiredOn: "2020-01-01", usefulLifeMonths: 12 };
  const assets = [van, press, future, sold, done];

  it("returns balanced voucher lines per asset and says what it skipped", () => {
    const run = depreciationRun(assets, "2026-03", accounts);
    expect(run.entries).toEqual([
      { assetId: "van", amountMinor: 2778 },
      { assetId: "press", amountMinor: depreciationFor(press, "2026-03") },
    ]);
    expect(run.lines).toHaveLength(4);
    expect(run.lines[0]).toEqual({
      id: "dep-2026-03-van-debit",
      account: "6000",
      accountName: "Depreciation",
      debitMinor: 2778,
      creditMinor: 0,
      dims: "Delivery van",
    });
    expect(run.lines[1]).toMatchObject({ account: "1209", debitMinor: 0, creditMinor: 2778 });
    const balance = sumVoucher(run.lines.map(createVoucherLine));
    expect(balance).toMatchObject({ balanced: true, debitMinor: run.totalMinor });
    expect(run.skipped.map((s) => [s.assetId, s.code])).toEqual([
      ["lift", "not-acquired"],
      ["old", "disposed"],
      ["pc", "fully-depreciated"],
    ]);
    expect(run.skipped[0]!.reason).toMatch(/acquired on 2026-06-01, after 2026-03/);
  });
  it("refuses a period that was already run, and an overlapping one", () => {
    expect(() => depreciationRun(assets, "2026-03", { ...accounts, runs: ["2026-02", "2026-03"] })).toThrow(
      /2026-03 has already been run/,
    );
    expect(() => depreciationRun(assets, "2026", { ...accounts, runs: ["2026-03"] })).toThrow(
      /overlaps the run already made for 2026-03/,
    );
    expect(() => depreciationRun(assets, "2026-04", { ...accounts, runs: ["2026"] })).toThrow(
      /same month cannot be depreciated twice/,
    );
    expect(depreciationRun(assets, "2026-04", { ...accounts, runs: ["2026-03"] }).lines).toHaveLength(4);
  });
  it("needs accounts and something to depreciate", () => {
    expect(() => depreciationRun(assets, "2026-03", { ...accounts, expenseAccount: { number: "", name: "" } })).toThrow(
      /needs `expenseAccount`/,
    );
    expect(() => depreciationRun([van, van], "2026-03", accounts)).toThrow(/"van" appears twice/);
    expect(() => assertRunnable([future], "2026-03", accounts)).toThrow(
      /Nothing to depreciate in 2026-03: Asset "lift"/,
    );
    expect(assertRunnable(assets, "2026-03", accounts).totalMinor).toBeGreaterThan(0);
  });
});
