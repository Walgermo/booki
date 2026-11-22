import { definePrimitive } from "@ui-sdk/core";
import { directionOf, isPeriod, monthIndex, percentChange, type Direction, type PeriodValue } from "./chart-math.js";

/** Which way is good news: up for revenue, down for costs. */
export type KpiGood = "up" | "down";

export type Options = {
  label?: string;
  valueMinor?: number;
  previousMinor?: number | null;
  currency?: string;
  /** What `previous` is: "Feb 2026", "last year". */
  previousLabel?: string;
  /** Defaults to "up". */
  good?: KpiGood;
  /** A short series for the sparkline, oldest first. */
  series?: PeriodValue[];
};

/** Most sparkline points an agent's snapshot carries. */
export const SPARK_POINTS = 24;

export function derive(options: Options) {
  const issues: string[] = [];
  const raw = options.valueMinor;
  const valueMinor = Number.isSafeInteger(raw) ? (raw as number) : null;
  if (valueMinor === null) issues.push(`The value is not whole minor units: "${String(raw)}".`);
  const rawPrevious = options.previousMinor;
  const previousMinor =
    rawPrevious === null || rawPrevious === undefined ? null : Number.isSafeInteger(rawPrevious) ? rawPrevious : null;
  if (rawPrevious !== null && rawPrevious !== undefined && previousMinor === null) {
    issues.push(`The previous value is not whole minor units: "${String(rawPrevious)}".`);
  }
  const deltaMinor = valueMinor !== null && previousMinor !== null ? valueMinor - previousMinor : null;
  const direction: Direction | null = deltaMinor === null ? null : directionOf(deltaMinor);
  const good = options.good === "down" ? "down" : "up";
  const sparkline = (options.series ?? [])
    .filter((point) => isPeriod(point?.period) && Number.isSafeInteger(point.valueMinor))
    .sort((a, b) => monthIndex(a.period) - monthIndex(b.period))
    .slice(-SPARK_POINTS)
    .map((point): [string, number] => [point.period, point.valueMinor]);
  return {
    label: options.label ?? "",
    currency: options.currency ?? "",
    valueMinor,
    previousMinor,
    previousLabel: options.previousLabel ?? null,
    deltaMinor,
    deltaPct: valueMinor !== null ? percentChange(valueMinor, previousMinor) : null,
    direction,
    good,
    /** True when the move is the good way, false when it is the bad way, null when flat or unknown. */
    favourable: direction === null || direction === "flat" ? null : direction === good,
    sparkline,
    issues,
  };
}

/**
 * One figure against a previous period. The snapshot holds the `valueMinor`,
 * `previousMinor`, `deltaMinor`, `deltaPct`, `direction`, whether that is
 * `favourable` and the sparkline as `[period, valueMinor]`. It has no
 * actions: everything is in the snapshot.
 */
export const kpiStat = definePrimitive({
  name: "kpi-stat",
  options: {
    label: "string",
    valueMinor: "number",
    previousMinor: "value",
    currency: "string",
    previousLabel: "string",
    good: "string",
    series: "value",
  },
  controlled: [
    "label",
    "currency",
    "valueMinor",
    "previousMinor",
    "previousLabel",
    "deltaMinor",
    "deltaPct",
    "direction",
    "good",
    "favourable",
    "sparkline",
    "issues",
  ],
  state: (options: Options) => derive(options),
  api: (context) => {
    context.onOptions((options) => context.store.set(derive(options)));
    return {};
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({
        "data-direction": state.direction ?? undefined,
        "data-favourable": state.favourable === null ? undefined : String(state.favourable),
      }),
      state: (state) => ({ direction: state.direction, favourable: state.favourable }),
    }),
  }),
  agent: { actions: [] },
});
