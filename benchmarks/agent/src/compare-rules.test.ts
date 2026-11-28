import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { priceChange } from "../../../apps/www/src/components/bench/compare/price-change.js";
import { taxOnSalary } from "../../../apps/www/src/components/bench/compare/tax-2026.js";

/**
 * The Booki rebuilds in the side-by-side comparison must give the live pages'
 * answers. The tax samples were read from Skatteetaten's calculator
 * (compare/capture-tax.mjs); the price example from SSB's calculator.
 */
const fixture = JSON.parse(readFileSync(new URL("../compare/fixtures/tax-2026.json", import.meta.url), "utf8")) as {
  samples: {
    salary: number;
    estimate: number;
    minstefradrag: number;
    alminneligInntekt: number;
    fellesskatt: { amount: number } | null;
    kommuneOgFylke: { amount: number } | null;
    trinnskatt: { amount: number } | null;
    trygdeavgift: { amount: number } | null;
  }[];
};

test("the tax rebuild matches Skatteetaten's calculator, line by line, for every captured salary", () => {
  assert.ok(fixture.samples.length >= 8);
  for (const sample of fixture.samples) {
    const lines = taxOnSalary(sample.salary);
    assert.deepEqual(
      {
        estimate: lines.estimate,
        minstefradrag: lines.minstefradrag,
        alminneligInntekt: lines.alminneligInntekt,
        fellesskatt: lines.fellesskatt,
        kommuneOgFylke: lines.kommuneOgFylke,
        trinnskatt: lines.trinnskatt,
        trygdeavgift: lines.trygdeavgift,
      },
      {
        estimate: sample.estimate,
        minstefradrag: sample.minstefradrag,
        alminneligInntekt: sample.alminneligInntekt,
        fellesskatt: sample.fellesskatt?.amount ?? 0,
        kommuneOgFylke: sample.kommuneOgFylke?.amount ?? 0,
        trinnskatt: sample.trinnskatt?.amount ?? 0,
        trygdeavgift: sample.trygdeavgift?.amount ?? 0,
      },
      `salary ${sample.salary}`,
    );
  }
});

test("tax never falls as the salary rises, and is never more than the salary", () => {
  let previous = 0;
  for (let salary = 0; salary <= 3_000_000; salary += 1_250) {
    const { estimate } = taxOnSalary(salary);
    assert.ok(estimate >= previous, `estimate fell at ${salary}`);
    assert.ok(estimate <= salary, `estimate above salary at ${salary}`);
    previous = estimate;
  }
});

test("the price rebuild matches SSB's calculator: 10 000 kr, January 2000 to October 2026", () => {
  const result = priceChange(1_000_000, "2000-01", "2026-10");
  assert.equal(result.resultMinor, 1_927_911);
  assert.equal(result.changePct, 92.8);
});

test("a period that is not in the index is refused with the form that works", () => {
  assert.throws(() => priceChange(100, "2031-01", "2026-10"), /YYYY-MM/);
  assert.throws(() => priceChange(100, "januar 2000", "2026-10"), /YYYY/);
  assert.throws(() => priceChange(12.5, "2000", "2025"), /øre/);
});
