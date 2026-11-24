import { msg } from "./msg.js";

/**
 * A conversion funnel: how many records reached each step, in order. A step
 * counts every record that ever reached it, not only those still there, so
 * the counts never rise from one step to the next; one that does is reported,
 * never hidden.
 */
export type FunnelStepInput = {
  id: string;
  label: string;
  /** Records that reached this step. */
  count: number;
  /** Their value in minor units, when the product sums one. */
  valueMinor?: number;
};

export type FunnelStep = FunnelStepInput & {
  /** Share of the previous step that reached this one, in percent with one decimal; null for the first. */
  stepConversionPct: number | null;
  /** Share of the first step that reached this one, in percent with one decimal. */
  overallConversionPct: number | null;
  /** Records lost between the previous step and this one. */
  dropOff: number;
};

export type Funnel = {
  steps: FunnelStep[];
  /** The step that loses the largest share of the step before it, or null. */
  biggestDropId: string | null;
  issues: string[];
};

const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

/** Conversion between each step and from the first, and where the most is lost. */
export function funnel(input: readonly FunnelStepInput[]): Funnel {
  const issues: string[] = [];
  const seen = new Set<string>();
  const kept = input.filter((step) => {
    const id = String(step?.id ?? "");
    if (id === "" || seen.has(id)) {
      issues.push(msg(id === "" ? "funnel.issue.no-id" : "funnel.issue.twice", { id }));
      return false;
    }
    if (!Number.isSafeInteger(step.count) || step.count < 0) {
      issues.push(msg("funnel.issue.count", { id, value: String(step.count) }));
      return false;
    }
    seen.add(id);
    return true;
  });
  const first = kept[0]?.count ?? 0;
  let biggest: { id: string; lost: number } | null = null;
  const steps = kept.map((step, index): FunnelStep => {
    const before = index === 0 ? null : kept[index - 1]!;
    if (before && step.count > before.count) {
      issues.push(msg("funnel.issue.rises", { id: step.id, before: before.id }));
    }
    const dropOff = before ? Math.max(0, before.count - step.count) : 0;
    const share = before ? pct(dropOff, before.count) : null;
    if (share !== null && share > 0 && (biggest === null || share > biggest.lost))
      biggest = { id: step.id, lost: share };
    return {
      id: String(step.id),
      label: String(step.label ?? step.id),
      count: step.count,
      ...(Number.isSafeInteger(step.valueMinor) ? { valueMinor: step.valueMinor } : {}),
      stepConversionPct: before ? pct(step.count, before.count) : null,
      overallConversionPct: pct(step.count, first),
      dropOff,
    };
  });
  return { steps, biggestDropId: (biggest as { id: string } | null)?.id ?? null, issues };
}

/**
 * Counts per step from each record's stage history: a record counts at every
 * step up to the furthest one it reached, so skipping a stage still counts
 * as passing it. `order` is the steps' ids, first to last.
 */
export function reachedCounts(histories: readonly (readonly string[])[], order: readonly string[]): number[] {
  const counts = order.map(() => 0);
  for (const history of histories) {
    const furthest = Math.max(-1, ...history.map((id) => order.indexOf(id)));
    for (let index = 0; index <= furthest; index += 1) counts[index]! += 1;
  }
  return counts;
}
