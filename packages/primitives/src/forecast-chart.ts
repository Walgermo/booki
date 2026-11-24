import { localToday } from "@booki/core/financial-date";
import { BookiError } from "@booki/core/msg";
import {
  FORECAST_GROUPINGS,
  forecastByPeriod,
  type Deal,
  type ForecastGrouping,
  type ForecastPeriod,
  type PipelineStage,
} from "@booki/core/pipeline";
import { createChange, definePrimitive } from "@ui-sdk/core";
import { createDrill, shownIn } from "./drill.js";

export type Details = { reason: string; source?: string; cancel?: () => void };
export type { ForecastGrouping, ForecastPeriod };

export type Options = {
  deals?: Deal[];
  stages?: PipelineStage[];
  currency?: string;
  /** First day of the range, YYYY-MM-DD. */
  from?: string;
  /** Last day of the range, YYYY-MM-DD. */
  to?: string;
  /** Today as YYYY-MM-DD, for overdue deals. Defaults to the date now. */
  today?: string;
  grouping?: ForecastGrouping;
  defaultGrouping?: ForecastGrouping;
  onGroupingChange?: (grouping: ForecastGrouping, details: Details) => void;
  drill?: string | null;
  defaultDrill?: string | null;
  onDrillChange?: (period: string | null, details: Details) => void;
};

const EMPTY = {
  periods: [] as ForecastPeriod[],
  undated: [] as string[],
  overdue: [] as string[],
  otherCurrency: [] as string[],
  unverified: [] as string[],
};

export function derive(options: Options, grouping: ForecastGrouping, drill: string | null) {
  const today = options.today ?? localToday();
  const currency = options.currency ?? "NOK";
  const view =
    options.from && options.to
      ? forecastByPeriod(options.deals ?? [], options.stages ?? [], {
          currency,
          grouping,
          from: options.from,
          to: options.to,
          today,
        })
      : { ...EMPTY };
  const total = (key: keyof Omit<ForecastPeriod, "period">) => view.periods.reduce((sum, row) => sum + row[key], 0);
  return {
    currency,
    grouping,
    from: options.from ?? "",
    to: options.to ?? "",
    periods: view.periods,
    totals: {
      wonMinor: total("wonMinor"),
      committedMinor: total("committedMinor"),
      bestCaseMinor: total("bestCaseMinor"),
      weightedMinor: total("weightedMinor"),
      count: total("count"),
    },
    undated: view.undated,
    overdue: view.overdue,
    otherCurrency: view.otherCurrency,
    unverified: view.unverified,
    drilled: drill === null ? null : (view.periods.find((row) => row.period === drill) ?? null),
  };
}

/**
 * Won and expected revenue per month or quarter: what was won, what is
 * committed (open deals with a known value), the best case (estimates) and
 * the weighted forecast. Lost deals and values without a source are left
 * out; deals with no expected close date are listed as `undated`. An agent
 * may `setGrouping` and `drill` into a period.
 */
export const forecastChart = definePrimitive({
  name: "forecast-chart",
  options: {
    deals: "value",
    stages: "value",
    currency: "string",
    from: "string",
    to: "string",
    today: "string",
    grouping: "string",
    defaultGrouping: "string",
    onGroupingChange: "callback",
    drill: "value",
    defaultDrill: "value",
    onDrillChange: "callback",
  },
  controlled: [
    "currency",
    "grouping",
    "from",
    "to",
    "periods",
    "totals",
    "undated",
    "overdue",
    "otherCurrency",
    "unverified",
    "drill",
    "drilled",
  ],
  state: (options: Options) => {
    const grouping = options.grouping ?? options.defaultGrouping ?? "month";
    const drill = options.drill ?? options.defaultDrill ?? null;
    return { drill, refusal: "", ...derive(options, grouping, drill) };
  },
  sync: (options: Options) => ({
    ...(options.grouping === undefined ? {} : { grouping: options.grouping }),
    ...(options.drill === undefined ? {} : { drill: options.drill }),
  }),
  api: (context) => {
    const change = createChange(context);
    const refresh = () => {
      const { grouping, drill } = context.store.get();
      context.store.set({ refusal: "", ...derive(context.options(), grouping, drill) });
    };
    context.onOptions((options) => {
      const grouping = options.grouping ?? context.store.get().grouping;
      const drill = options.drill === undefined ? context.store.get().drill : options.drill;
      context.store.set(derive(options, grouping, drill));
    });
    const drill = createDrill(
      context as never,
      () => context.store.get().periods.map((row) => row.period),
      "pipeline.no-period",
      refresh,
    );
    const setGrouping = (value: unknown, event?: Event) => {
      if (!FORECAST_GROUPINGS.includes(value as ForecastGrouping)) {
        throw new BookiError("pipeline.grouping", { value: String(value), groupings: FORECAST_GROUPINGS.join(", ") });
      }
      const ok = change("grouping", value as ForecastGrouping, { reason: "set-grouping", event });
      if (ok) {
        // A month's id is not a quarter's: the drill goes with the old grouping.
        change("drill", null, { reason: "clear-drill", event });
        refresh();
      }
      return ok;
    };
    return {
      /** Agent: month or quarter. */
      setGrouping: (grouping: ForecastGrouping) => setGrouping(grouping),
      /** Agent: drill into one period by its id (2026-11 or 2026-Q4); null clears it. */
      drill: (period: string | null) => drill(period),
      setGroupingByPerson: (grouping: ForecastGrouping, event?: Event) =>
        shownIn(context as never, () => setGrouping(grouping, event)),
      drillByPerson: (period: string | null, event?: Event) => shownIn(context as never, () => drill(period, event)),
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({ "data-grouping": state.grouping, "data-drilled": state.drilled ? "" : undefined }),
      state: (state) => ({
        grouping: state.grouping,
        drill: state.drilled ? state.drill : null,
        refusal: state.refusal,
      }),
    }),
    // `value` is the grouping this button picks.
    grouping: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({ type: "button", "aria-pressed": state.grouping === part.key ? "true" : "false" }),
      press: ({ api, key }, event) => {
        try {
          api.setGroupingByPerson(String(key) as ForecastGrouping, event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    // One per period. `value` is the period id.
    period: slot<{ value: string }>({
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
  agent: { actions: ["setGrouping", "drill"] },
});
