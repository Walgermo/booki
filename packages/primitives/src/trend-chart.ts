import { createChange, definePrimitive } from "@ui-sdk/core";
import { BookiError } from "@booki-aui/core/msg";
import {
  CHART_RANGES,
  DEFAULT_SNAPSHOT_POINTS,
  isChartRange,
  isPeriod,
  monthIndex,
  rangePeriods,
  summarize,
  wholeAbove,
  type ChartRange,
  type Direction,
  type PeriodValue,
  SERIES_HUES,
} from "./chart-math.js";

export type Details = { reason: string; source?: string; cancel?: () => void };

/** One line of the chart: a value per month, in minor units. */
export type TrendSeries = { id: string; name: string; points: PeriodValue[] };

/** What an agent reads about one series in the range. */
export type TrendSeriesSnapshot = {
  id: string;
  name: string;
  latest: PeriodValue | null;
  previous: PeriodValue | null;
  changeMinor: number | null;
  changePct: number | null;
  direction: Direction | null;
  min: PeriodValue | null;
  max: PeriodValue | null;
  totalMinor: number;
  /** The points in the range as `[period, valueMinor]`, the latest ones when capped. */
  points: [string, number][];
  pointCount: number;
  truncated: boolean;
};

/** The month drilled into, with each series' value there. */
export type TrendDrilled = { period: string; values: { id: string; name: string; valueMinor: number | null }[] };

export type Options = {
  series?: TrendSeries[];
  currency?: string;
  range?: ChartRange;
  defaultRange?: ChartRange;
  onRangeChange?: (range: ChartRange, details: Details) => void;
  /** The month drilled into, YYYY-MM, or null. */
  drill?: string | null;
  defaultDrill?: string | null;
  onDrillChange?: (period: string | null, details: Details) => void;
  /** Most points per series an agent's snapshot carries. Defaults to 36. */
  snapshotPoints?: number;
};

/** The id of the series that holds every series past the fifth. */
export const OTHER_SERIES = "__other";

export type Clean = { series: TrendSeries[]; issues: string[]; earliest: string | null; latest: string | null };

/** Drops points an agent could not trust and says why. */
export function clean(input: TrendSeries[] | undefined): Clean {
  const issues: string[] = [];
  const ids = new Set<string>();
  let earliest: number | null = null;
  let latest: number | null = null;
  const series = (input ?? []).flatMap((item) => {
    const id = String(item?.id ?? "");
    if (id === "" || ids.has(id)) {
      issues.push(
        id === "" ? "A series has no id and is left out." : `Series "${id}" is given twice; the second is left out.`,
      );
      return [];
    }
    ids.add(id);
    const seen = new Set<string>();
    const points = (item.points ?? []).filter((point) => {
      if (!isPeriod(point?.period)) {
        issues.push(`Series "${id}" has a period "${String(point?.period)}" not written YYYY-MM; it is left out.`);
        return false;
      }
      if (!Number.isSafeInteger(point.valueMinor)) {
        issues.push(`Series "${id}" at ${point.period} has a value that is not whole minor units; it is left out.`);
        return false;
      }
      if (seen.has(point.period)) {
        issues.push(`Series "${id}" has ${point.period} twice; the second is left out.`);
        return false;
      }
      seen.add(point.period);
      const index = monthIndex(point.period);
      earliest = earliest === null ? index : Math.min(earliest, index);
      latest = latest === null ? index : Math.max(latest, index);
      return true;
    });
    return [{ id, name: String(item.name ?? id), points }];
  });
  // Six hues at most: past six, the fifth onward fold into one "Other" line,
  // summed per period, so no two lines share a colour.
  if (series.length > SERIES_HUES) {
    const kept = series.slice(0, SERIES_HUES - 1);
    const folded = series.slice(SERIES_HUES - 1);
    const sums = new Map<string, number>();
    for (const item of folded)
      for (const point of item.points) sums.set(point.period, (sums.get(point.period) ?? 0) + point.valueMinor);
    issues.push(`${folded.length} series are shown together as "Other": ${folded.map((item) => item.id).join(", ")}.`);
    series.splice(0, series.length, ...kept, {
      id: OTHER_SERIES,
      name: "Other",
      points: [...sums].map(([period, valueMinor]) => ({ period, valueMinor })),
    });
  }
  const toPeriod = (index: number | null) =>
    index === null
      ? null
      : `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
  return { series, issues, earliest: toPeriod(earliest), latest: toPeriod(latest) };
}

export function derive(options: Options, range: ChartRange, drill: string | null) {
  const cap = wholeAbove(options.snapshotPoints, DEFAULT_SNAPSHOT_POINTS);
  const data = clean(options.series);
  const periods = data.earliest && data.latest ? rangePeriods(range, data.earliest, data.latest) : [];
  const inRange = new Set(periods);
  const series: TrendSeriesSnapshot[] = data.series.map((item) => {
    const sorted = [...item.points].sort((a, b) => monthIndex(a.period) - monthIndex(b.period));
    const visible = sorted.filter((point) => inRange.has(point.period));
    const firstIndex = sorted.findIndex((point) => inRange.has(point.period));
    const before = firstIndex > 0 ? sorted[firstIndex - 1]! : null;
    const summary = summarize(visible, before);
    const shown = visible.slice(-cap);
    return {
      id: item.id,
      name: item.name,
      latest: summary.latest,
      previous: summary.previous,
      changeMinor: summary.changeMinor,
      changePct: summary.changePct,
      direction: summary.direction,
      min: summary.min,
      max: summary.max,
      totalMinor: summary.totalMinor,
      points: shown.map((point): [string, number] => [point.period, point.valueMinor]),
      pointCount: visible.length,
      truncated: visible.length > shown.length,
    };
  });
  const drilled: TrendDrilled | null =
    drill !== null && inRange.has(drill)
      ? {
          period: drill,
          values: data.series.map((item) => ({
            id: item.id,
            name: item.name,
            valueMinor: item.points.find((point) => point.period === drill)?.valueMinor ?? null,
          })),
        }
      : null;
  return {
    currency: options.currency ?? "",
    from: periods[0] ?? null,
    to: periods.at(-1) ?? null,
    periodCount: periods.length,
    series,
    drilled,
    issues: data.issues,
  };
}

/** The range the chart opens on when none is given. */
export const DEFAULT_RANGE: ChartRange = "12m";

/**
 * Series over months. The snapshot holds the `range` with its `from` and
 * `to`, and per series the latest and previous values, the change and change
 * in percent, the lowest and highest month, the total in the range and the
 * visible points as `[period, valueMinor]`. An agent may `setRange` and
 * `drill` into a month. Nothing here changes the data.
 */
export const trendChart = definePrimitive({
  name: "trend-chart",
  options: {
    series: "value",
    currency: "string",
    range: "string",
    defaultRange: "string",
    onRangeChange: "callback",
    drill: "value",
    defaultDrill: "value",
    onDrillChange: "callback",
    snapshotPoints: "number",
  },
  controlled: ["range", "from", "to", "periodCount", "currency", "series", "drill", "drilled", "issues"],
  state: (options: Options) => {
    const asked = options.range ?? options.defaultRange;
    const range: ChartRange = isChartRange(asked) ? asked : DEFAULT_RANGE;
    const drill = options.drill ?? options.defaultDrill ?? null;
    return { range, drill, refusal: "", ...derive(options, range, drill) };
  },
  sync: (options: Options) => ({
    ...(isChartRange(options.range) ? { range: options.range } : {}),
    ...(options.drill === undefined ? {} : { drill: options.drill }),
  }),
  api: (context) => {
    const change = createChange(context);

    context.onOptions((options) => {
      const state = context.store.get();
      const range = isChartRange(options.range) ? options.range : state.range;
      const drill = options.drill === undefined ? state.drill : options.drill;
      context.store.set(derive(options, range, drill));
    });

    const refresh = () => {
      const { range, drill } = context.store.get();
      context.store.set({ refusal: "", ...derive(context.options(), range, drill) });
    };
    const shown = <T>(run: () => T): T => {
      try {
        return run();
      } catch (error) {
        context.store.set({ refusal: (error as Error).message });
        throw error;
      }
    };

    function setRange(value: unknown, event?: Event) {
      if (!isChartRange(value)) {
        throw new BookiError("chart.bad-range", { ranges: CHART_RANGES.join(", "), value: String(value) });
      }
      const ok = change("range", value, { reason: "set-range", event });
      if (ok) {
        refresh();
        // A month that left the range is no longer drilled into.
        const { drill, from, to } = context.store.get();
        const inside =
          drill !== null &&
          from !== null &&
          to !== null &&
          monthIndex(drill) >= monthIndex(from) &&
          monthIndex(drill) <= monthIndex(to);
        if (drill !== null && !inside && change("drill", null, { reason: "set-range", event })) refresh();
      }
      return ok;
    }

    function drill(value: unknown, event?: Event) {
      if (value === null || value === undefined || value === "") {
        const ok = change("drill", null, { reason: "clear-drill", event });
        if (ok) refresh();
        return ok;
      }
      const period = String(value).trim();
      if (!isPeriod(period)) throw new BookiError("chart.month-format", { value: period });
      const state = context.store.get();
      if (state.from === null || state.to === null) throw new Error("The chart has no points to drill into.");
      const inRange = monthIndex(period) >= monthIndex(state.from) && monthIndex(period) <= monthIndex(state.to);
      if (!inRange) {
        const data = clean(context.options().series);
        const known =
          data.earliest !== null &&
          monthIndex(period) >= monthIndex(data.earliest) &&
          monthIndex(period) <= monthIndex(data.latest!);
        const where = { period, range: state.range, from: state.from, to: state.to };
        throw known
          ? new BookiError("chart.month-outside-in-data", where)
          : new BookiError("chart.month-outside-data", {
              ...where,
              earliest: String(data.earliest),
              latest: String(data.latest),
            });
      }
      const ok = change("drill", period, { reason: "drill", event });
      if (ok) refresh();
      return ok;
    }

    return {
      /** Agent: show the last 6 or 12 months, the year to date or all of it. */
      setRange: (range: ChartRange) => setRange(range),
      setRangeByPerson: (range: ChartRange, event?: Event) => shown(() => setRange(range, event)),
      /** Agent: drill into one month (YYYY-MM) in the range; null clears it. */
      drill: (period: string | null) => drill(period),
      drillByPerson: (period: string | null, event?: Event) => shown(() => drill(period, event)),
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({ "data-range": state.range, "data-drilled": state.drilled ? "" : undefined }),
      state: (state) => ({ range: state.range, drill: state.drilled ? state.drill : null, refusal: state.refusal }),
    }),
    // One per range. `value` is the range and becomes the part's key.
    range: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({ type: "button", "aria-pressed": state.range === part.key ? "true" : "false" }),
      press: ({ api, key }, event) => {
        try {
          api.setRangeByPerson(String(key) as ChartRange, event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    // One per month. `value` is the month and becomes the part's key.
    point: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        type: "button",
        "aria-pressed": state.drilled?.period === part.key ? "true" : "false",
      }),
      press: ({ api, key }, event) => {
        try {
          api.drillByPerson(String(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
  }),
  agent: { actions: ["setRange", "drill"] },
});
