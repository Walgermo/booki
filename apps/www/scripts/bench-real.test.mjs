import assert from "node:assert/strict";
import { test } from "node:test";

import { medianTotalTokens, mergeReal } from "./bench-real.mjs";

const usage = (input, read) => ({
  input_tokens: input,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: read,
  output_tokens: 0,
});

test("tokens are the median of each run's total, not a sum of medians", () => {
  const run = {
    runs: [
      { page: "p", usage: usage(100, 0) },
      { page: "p", usage: usage(40, 80) },
      { page: "p", usage: usage(80, 50) },
      { page: "p", ended: "api_error", usage: usage(9999, 0) },
    ],
  };
  const page = {
    page: "p",
    inputTokens: { median: 80 },
    cacheWriteTokens: { median: 0 },
    cacheReadTokens: { median: 50 },
    outputTokens: { median: 0 },
  };
  // Run totals 100, 120, 130: the median is 120. Summed medians would say 130.
  assert.equal(medianTotalTokens(run, page), 120);
  assert.equal(medianTotalTokens({}, page), 130);
});

test("a partial export keeps the published runs it does not replace", () => {
  const published = {
    runs: [
      { task: "dashboard", model: "a", side: "api" },
      { task: "dashboard", model: "b", side: "api" },
      { task: "dashboard", model: "a" },
    ],
    sides: [
      { task: "dashboard", model: "a", key: "api", tokens: 1 },
      { task: "dashboard", model: "b", key: "api", tokens: 2 },
      { task: "dashboard", model: "a", key: "acc", tokens: 3 },
    ],
  };
  const fresh = {
    runs: [{ task: "dashboard", model: "a", side: "api" }],
    sides: [{ task: "dashboard", model: "a", key: "api", tokens: 9 }],
  };
  const merged = mergeReal(published, fresh);
  assert.equal(merged.runs.length, 3);
  assert.deepEqual(merged.sides.map((side) => `${side.model}|${side.key}|${side.tokens}`).sort(), [
    "a|acc|3",
    "a|api|9",
    "b|api|2",
  ]);
});
