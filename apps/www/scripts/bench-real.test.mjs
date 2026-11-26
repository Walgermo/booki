import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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

test("a partial export keeps the models in their published order", () => {
  const side = (model, key, tokens) => ({ task: "supplier-invoice", model, key, tokens });
  const published = {
    runs: ["anthropic/claude-opus-5.5", "anthropic/claude-sonnet-5.5"].map((model) => ({
      task: "supplier-invoice",
      model,
    })),
    sides: [
      side("anthropic/claude-opus-5.5", "tripletex", 1),
      side("anthropic/claude-opus-5.5", "acc", 2),
      side("anthropic/claude-sonnet-5.5", "tripletex", 3),
      side("anthropic/claude-sonnet-5.5", "acc", 4),
    ],
  };
  const fresh = {
    runs: [{ task: "supplier-invoice", model: "anthropic/claude-opus-5.5" }],
    sides: [side("anthropic/claude-opus-5.5", "tripletex", 9), side("anthropic/claude-opus-5.5", "acc", 8)],
  };
  const merged = mergeReal(published, fresh);
  assert.deepEqual(
    merged.runs.map((run) => run.model),
    ["anthropic/claude-opus-5.5", "anthropic/claude-sonnet-5.5"],
  );
  assert.deepEqual(
    merged.sides.map((s) => `${s.model}|${s.key}|${s.tokens}`),
    [
      "anthropic/claude-opus-5.5|tripletex|9",
      "anthropic/claude-opus-5.5|acc|8",
      "anthropic/claude-sonnet-5.5|tripletex|3",
      "anthropic/claude-sonnet-5.5|acc|4",
    ],
  );
  // A model never published before goes at the end.
  const added = mergeReal(published, {
    runs: [{ task: "supplier-invoice", model: "x/new" }],
    sides: [side("x/new", "acc", 5)],
  });
  assert.equal(added.sides.at(-1).model, "x/new");
});

test("the figures named Opus select Opus by its id, never by provider prefix", () => {
  const src = new URL("../src/", import.meta.url).pathname;
  const files = readdirSync(src, { recursive: true }).filter((f) => /\.tsx?$/.test(f));
  const offenders = files.filter((f) => /realFor\([^)]*"anthropic\/"/.test(readFileSync(join(src, f), "utf8")));
  assert.deepEqual(offenders, []);
  const bench = readFileSync(join(src, "lib/bench.ts"), "utf8");
  const opus = /export const OPUS = "([^"]+)"/.exec(bench)?.[1];
  assert.match(opus ?? "", /^anthropic\/claude-opus-[\d.]+$/);
  // The id the site names must be one bench.json publishes.
  const data = JSON.parse(readFileSync(join(src, "data/bench.json"), "utf8"));
  assert.ok(data.real.sides.some((s) => s.model === opus));
});
