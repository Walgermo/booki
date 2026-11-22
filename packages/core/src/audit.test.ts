import { describe, expect, it } from "vitest";
import {
  assertReadyForSignOff,
  drawSample,
  materiality,
  setConclusion,
  setItemEvidence,
  setItemNote,
  setItemResult,
  setItemTickMark,
  signOffWorkpaper,
  startWorkpaper,
  summarizeSample,
  withdrawSignOff,
  workpaperIssues,
  type PopulationItem,
  type TickMark,
  type Workpaper,
} from "./audit.js";

const AT = "2026-02-10T09:00:00Z";

// 200 items with awkward amounts, one of them a credit and one very large.
const population: PopulationItem[] = Array.from({ length: 200 }, (_, i) => ({
  id: `inv-${String(i + 1).padStart(3, "0")}`,
  amountMinor: i === 7 ? -45_000_00 : i === 150 ? 900_000_00 : ((i * 7919) % 9973) * 100 + 137,
}));
const ids = (sample: { items: PopulationItem[] }) => sample.items.map((item) => item.id);

describe("materiality", () => {
  it("takes performance and trivial as shares of overall", () => {
    expect(materiality({ benchmarkMinor: 50_000_000_00, overallBp: 100, performanceBp: 7500, trivialBp: 500 })).toEqual(
      {
        benchmarkMinor: 50_000_000_00,
        overallMinor: 500_000_00,
        performanceMinor: 375_000_00,
        trivialMinor: 25_000_00,
      },
    );
  });
  it("rounds half away from zero on whole minor units", () => {
    // 1% of 12345 is 123.45 → 123; 75% of 123 is 92.25 → 92; 50% of 123 is 61.5 → 62.
    expect(materiality({ benchmarkMinor: 12_345, overallBp: 100, performanceBp: 7500, trivialBp: 5000 })).toMatchObject(
      {
        overallMinor: 123,
        performanceMinor: 92,
        trivialMinor: 62,
      },
    );
  });
  it("refuses nonsense", () => {
    const base = { benchmarkMinor: 1_000_00, overallBp: 100, performanceBp: 7500, trivialBp: 500 };
    expect(() => materiality({ ...base, performanceBp: 10_001 })).toThrow(
      /cannot be more than 10000 basis points \(100%\) of overall/,
    );
    expect(() => materiality({ ...base, trivialBp: 8000 })).toThrow(/cannot be above performance materiality/);
    expect(() => materiality({ ...base, benchmarkMinor: 10.5 })).toThrow(/whole number/);
    expect(() => materiality({ ...base, overallBp: 0 })).toThrow(/at least 1/);
  });
});

describe("drawSample", () => {
  it("draws the same sample from the same seed, whatever order the population is in", () => {
    for (const method of ["monetary-unit", "random"] as const) {
      const a = drawSample(population, { method, size: 25, seed: "ISA-530/2026/receivables" });
      const b = drawSample([...population].reverse(), { method, size: 25, seed: "ISA-530/2026/receivables" });
      expect(b).toEqual(a);
    }
  });
  it("draws a different sample from a different seed", () => {
    const random = (seed: string) => ids(drawSample(population, { method: "random", size: 25, seed }));
    expect(random("a")).not.toEqual(random("b"));
    const mus = (seed: string) => drawSample(population, { method: "monetary-unit", size: 25, seed });
    expect(mus("a").startMinor).not.toBe(mus("b").startMinor);
    expect(ids(mus("a"))).not.toEqual(ids(mus("b")));
  });
  it("selects exactly `size` different items at random", () => {
    const sample = drawSample(population, { method: "random", size: 25, seed: "s" });
    expect(new Set(ids(sample)).size).toBe(25);
    expect(drawSample(population, { method: "random", size: 200, seed: "s" }).items).toHaveLength(200);
    expect(() => drawSample(population, { method: "random", size: 201, seed: "s" })).toThrow(/Cannot select 201 items/);
  });
  it("always selects items at or above the monetary-unit interval", () => {
    for (const seed of ["1", "2", "3", "x", "y", "long seed with ø"]) {
      const sample = drawSample(population, { method: "monetary-unit", size: 20, seed });
      const interval = sample.intervalMinor!;
      const large = population.filter((item) => Math.abs(item.amountMinor) >= interval).map((item) => item.id);
      expect(large).toContain("inv-151");
      expect(ids(sample)).toEqual(expect.arrayContaining(large));
      expect(sample.startMinor).toBeGreaterThanOrEqual(1);
      expect(sample.startMinor).toBeLessThanOrEqual(interval);
      expect(sample.items.length).toBeLessThanOrEqual(20);
    }
  });
  it("selects a credit by its absolute amount and records what is needed to re-perform", () => {
    const sample = drawSample(population, { method: "monetary-unit", tolerableMinor: 40_000_00, seed: "k" });
    expect(ids(sample)).toContain("inv-008");
    const abs = population.reduce((sum, item) => sum + Math.abs(item.amountMinor), 0);
    expect(sample).toMatchObject({
      method: "monetary-unit",
      seed: "k",
      intervalMinor: 40_000_00,
      populationCount: 200,
      populationAbsMinor: abs,
      populationTotalMinor: abs - 2 * 45_000_00,
    });
  });
  it("takes everything at or above the threshold with all-above", () => {
    const sample = drawSample(population, { method: "all-above", tolerableMinor: 45_000_00, seed: "k" });
    expect(ids(sample)).toEqual(population.filter((i) => Math.abs(i.amountMinor) >= 45_000_00).map((i) => i.id));
    expect(ids(sample)).toEqual(expect.arrayContaining(["inv-008", "inv-151"]));
  });
  it("refuses bad input with a sentence", () => {
    expect(() => drawSample(population, { method: "random", size: 5, seed: " " })).toThrow(/needs a `seed`/);
    expect(() => drawSample(population, { method: "stratified" as never, seed: "s" })).toThrow(
      /all-above, monetary-unit, random/,
    );
    expect(() => drawSample(population, { method: "monetary-unit", seed: "s" })).toThrow(
      /needs `size`.*or `tolerableMinor`/,
    );
    expect(() => drawSample(population, { method: "all-above", seed: "s" })).toThrow(/needs `tolerableMinor`/);
    expect(() =>
      drawSample(
        [
          { id: "a", amountMinor: 1 },
          { id: "a", amountMinor: 2 },
        ],
        { method: "random", size: 1, seed: "s" },
      ),
    ).toThrow(/"a" appears twice/);
    expect(() => drawSample([{ id: "a", amountMinor: 1.5 }], { method: "random", size: 1, seed: "s" })).toThrow(
      /whole number/,
    );
    expect(() => drawSample([], { method: "random", size: 1, seed: "s" })).toThrow(/empty/);
  });
});

describe("testing and sign-off", () => {
  const legend: TickMark[] = [
    { symbol: "✓", meaning: "Agreed to invoice" },
    { symbol: "B", meaning: "Agreed to bank" },
  ];
  const small: PopulationItem[] = [
    { id: "a", amountMinor: 1_000_00 },
    { id: "b", amountMinor: 2_000_00 },
    { id: "c", amountMinor: 3_000_00 },
    { id: "d", amountMinor: 4_000_00 },
  ];
  const start = () => startWorkpaper(drawSample(small, { method: "all-above", tolerableMinor: 2_000_00, seed: "s" }));
  const tested = (): Workpaper => {
    let wp = start();
    wp = setItemResult(wp, "b", "ok", undefined, "agent");
    wp = setItemResult(wp, "c", "exception", 100_00, "agent");
    wp = setItemResult(wp, "d", "ok", undefined, "kari");
    return setItemNote(wp, "c", "Invoice dated after year end.", "kari");
  };

  it("records who did what and validates each field", () => {
    let wp = start();
    expect(wp.items.map((i) => [i.id, i.result])).toEqual([
      ["b", "untested"],
      ["c", "untested"],
      ["d", "untested"],
    ]);
    wp = setItemResult(wp, "b", "exception", -50_00, "agent");
    expect(wp.items[0]).toMatchObject({ result: "exception", misstatementMinor: -50_00, by: "agent" });
    wp = setItemResult(wp, "b", "ok", undefined, "kari");
    expect(wp.items[0]).toMatchObject({ result: "ok", by: "kari" });
    expect(wp.items[0]).not.toHaveProperty("misstatementMinor");
    wp = setItemTickMark(wp, "b", "✓", legend, "agent");
    wp = setItemEvidence(wp, "b", "att-17", "agent");
    expect(wp.items[0]).toMatchObject({ tickMark: "✓", evidenceId: "att-17", by: "agent" });
    expect(() => setItemTickMark(wp, "b", "?", legend, "agent")).toThrow(
      /not in the tick-mark legend.*✓ \(Agreed to invoice\), B/,
    );
    expect(() => setItemResult(wp, "zz", "ok", undefined, "agent")).toThrow(/No sample item "zz". Items: b, c, d/);
    expect(() => setItemResult(wp, "b", "fine" as never, undefined, "agent")).toThrow(/untested, ok, exception/);
    expect(() => setItemResult(wp, "b", "ok", 5, "agent")).toThrow(/goes with the result "exception"/);
    expect(() => setItemResult(wp, "b", "exception", 0.5, "agent")).toThrow(/whole number/);
  });

  it("summarizes known and projected misstatement against tolerable", () => {
    const summary = summarizeSample(tested(), 150_00);
    // Known 100.00 on 9,000.00 sampled of a 10,000.00 population → 111.11.
    expect(summary).toMatchObject({
      selected: 3,
      tested: 3,
      untested: 0,
      exceptions: 1,
      byAgent: 1,
      knownMisstatementMinor: 100_00,
      sampledAbsMinor: 9_000_00,
      populationAbsMinor: 10_000_00,
      projectedMisstatementMinor: 111_11,
      tolerableMinor: 150_00,
      exceedsTolerable: false,
    });
    expect(summarizeSample(tested(), 111_10).exceedsTolerable).toBe(true);
    // Half away from zero, both ways: 1 × 3 / 2 = 1.5 → 2 and −1.5 → −2.
    const two = (misstatement: number) =>
      setItemResult(
        startWorkpaper(
          drawSample(
            [
              { id: "x", amountMinor: 2 },
              { id: "y", amountMinor: 1 },
            ],
            { method: "all-above", tolerableMinor: 2, seed: "s" },
          ),
        ),
        "x",
        "exception",
        misstatement,
        "kari",
      );
    expect(summarizeSample(two(1)).projectedMisstatementMinor).toBe(2);
    expect(summarizeSample(two(-1)).projectedMisstatementMinor).toBe(-2);
    // The sample's own tolerable amount is used when none is passed.
    expect(summarizeSample(two(1))).toMatchObject({ tolerableMinor: 2, exceedsTolerable: false });
  });

  it("cannot be signed while an item is untested or an exception has no note", () => {
    let wp = start();
    expect(() => signOffWorkpaper(wp, "preparer", "kari", AT)).toThrow(/3 item\(s\) are untested: b, c, d/);
    wp = setItemResult(wp, "b", "ok", undefined, "agent");
    wp = setItemResult(wp, "c", "exception", 100_00, "agent");
    wp = setItemResult(wp, "d", "ok", undefined, "agent");
    expect(workpaperIssues(wp)).toEqual([`Item "c" is an exception without a note. Say what was found.`]);
    expect(() => assertReadyForSignOff(wp)).toThrow(/exception without a note/);
    expect(() => assertReadyForSignOff({ items: [] })).toThrow(/No sample has been drawn/);
    expect(() => assertReadyForSignOff(tested())).not.toThrow();
  });

  it("needs a preparer, then a different reviewer", () => {
    expect(() => signOffWorkpaper(tested(), "reviewer", "ola", AT)).toThrow(/preparer signs first/);
    const prepared = signOffWorkpaper(tested(), "preparer", "kari", AT);
    expect(prepared.preparer).toEqual({ by: "kari", at: AT });
    expect(() => signOffWorkpaper(prepared, "preparer", "ola", AT)).toThrow(/already signed by preparer "kari"/);
    expect(() => signOffWorkpaper(prepared, "reviewer", "kari", AT)).toThrow(/cannot also review it/);
    expect(signOffWorkpaper(prepared, "reviewer", "ola", AT).reviewer?.by).toBe("ola");
    expect(() => signOffWorkpaper(tested(), "preparer", " ", AT)).toThrow(/id of the person/);
  });

  it("fixes the items after the preparer signs, until that preparer withdraws", () => {
    const prepared = signOffWorkpaper(tested(), "preparer", "kari", AT);
    expect(() => setItemResult(prepared, "b", "exception", 1, "agent")).toThrow(/signed by preparer "kari"/);
    expect(() => setItemNote(prepared, "b", "x", "ola")).toThrow(/cannot be changed/);
    expect(() => setConclusion(prepared, "x")).toThrow(/cannot be changed/);
    expect(() => startWorkpaper(prepared.sample!, prepared)).toThrow(/cannot be changed/);
    expect(() => withdrawSignOff(prepared, "ola")).toThrow(/Only "kari"/);
    const open = withdrawSignOff(prepared, "kari");
    expect(open.preparer).toBeUndefined();
    expect(setItemResult(open, "b", "exception", 1, "kari").items[0]!.result).toBe("exception");
    expect(() => withdrawSignOff(open, "kari")).toThrow(/no sign-off to withdraw/);
  });

  it("does not let the preparer withdraw after review", () => {
    const reviewed = signOffWorkpaper(signOffWorkpaper(tested(), "preparer", "kari", AT), "reviewer", "ola", AT);
    expect(() => withdrawSignOff(reviewed, "kari")).toThrow(/reviewed by "ola"/);
    expect(() => setItemNote(reviewed, "b", "x", "kari")).toThrow(/reviewer must withdraw/);
    const back = withdrawSignOff(reviewed, "ola");
    expect(back.reviewer).toBeUndefined();
    expect(back.preparer?.by).toBe("kari");
  });
});
