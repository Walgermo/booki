/**
 * The pure parts of bench-export: a per-run median and how fresh real-model
 * results join the ones bench.json already publishes.
 */

/** The median of numbers, the same rule as the benchmark's own summary. */
export function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Tokens per run for one page: the median of each run's total, from the run
 * records the result file keeps. Summing each category's median could mix runs.
 * A file without records falls back to that sum.
 */
export function medianTotalTokens(run, page) {
  const records = (run.runs ?? []).filter((r) => r.page === page.page && r.ended !== "api_error" && r.usage);
  const totals = records.map(
    (r) =>
      r.usage.input_tokens +
      r.usage.cache_creation_input_tokens +
      r.usage.cache_read_input_tokens +
      r.usage.output_tokens,
  );
  if (totals.length > 0) return median(totals);
  return (
    page.inputTokens.median + page.cacheWriteTokens.median + page.cacheReadTokens.median + page.outputTokens.median
  );
}

const runId = (run) => `${run.task}|${run.model}|${run.side ?? "screens"}`;
const sideRunId = (side) => `${side.task}|${side.model}|${side.key === "api" ? "api" : "screens"}`;

/**
 * Fresh runs replace the published ones for the same task, model and side;
 * every other published run, and its rows, stays. The results folder is not
 * checked in, so a rerun of one model on one task must not drop the rest.
 * A replaced run takes the place of the one it replaces, so a partial export
 * does not reorder the models; runs that are new go at the end.
 */
export function mergeReal(published, fresh) {
  const join = (old, rows, id) => {
    const byId = new Map();
    for (const row of rows) byId.set(id(row), [...(byId.get(id(row)) ?? []), row]);
    const out = [];
    for (const row of old) {
      const key = id(row);
      if (!byId.has(key)) out.push(row);
      else if (byId.get(key).length > 0) {
        out.push(...byId.get(key));
        byId.set(key, []);
      }
    }
    for (const left of byId.values()) out.push(...left);
    return out;
  };
  return {
    runs: join(published?.runs ?? [], fresh.runs, runId),
    sides: join(published?.sides ?? [], fresh.sides, sideRunId),
  };
}
