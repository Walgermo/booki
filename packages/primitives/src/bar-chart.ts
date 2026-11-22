import { createChange, definePrimitive } from "@ui-sdk/core";
import { BookiError } from "@booki/core/msg";
import { rankWithOther, type RankedRow } from "./chart-math.js";

export type Details = { reason: string; source?: string; cancel?: () => void };

/** One bar: a category and its amount in minor units. */
export type BarItem = { id: string; label: string; valueMinor: number };

/** A row an agent reads: the item, or `other` for the rest, with its share of the total. */
export type BarRow = RankedRow;

export type Options = {
  items?: BarItem[];
  currency?: string;
  /** Most bars before the rest fold into "Other". Null shows them all. */
  limit?: number | null;
  defaultLimit?: number | null;
  onLimitChange?: (limit: number | null, details: Details) => void;
  /** The category drilled into, by id, or null. */
  drill?: string | null;
  defaultDrill?: string | null;
  onDrillChange?: (id: string | null, details: Details) => void;
  /** The name of the folded row. Defaults to "Other". */
  otherLabel?: string;
};

export function check(items: BarItem[] | undefined) {
  const issues: string[] = [];
  const ids = new Set<string>();
  const clean = (items ?? []).filter((item) => {
    const id = String(item?.id ?? "");
    if (id === "" || id === "other" || ids.has(id)) {
      issues.push(
        id === ""
          ? "An item has no id and is left out."
          : id === "other"
            ? `The id "other" is kept for the folded row; that item is left out.`
            : `Item "${id}" is given twice; the second is left out.`,
      );
      return false;
    }
    if (!Number.isSafeInteger(item.valueMinor)) {
      issues.push(`Item "${id}" has a value that is not whole minor units; it is left out.`);
      return false;
    }
    ids.add(id);
    return true;
  });
  return {
    items: clean.map((item) => ({
      id: String(item.id),
      label: String(item.label ?? item.id),
      valueMinor: item.valueMinor,
    })),
    issues,
  };
}

export function derive(options: Options, limit: number | null, drill: string | null) {
  const data = check(options.items);
  const ranked = rankWithOther(data.items, limit, options.otherLabel ?? "Other");
  const drilledItem = drill === null ? null : (ranked.rows.find((row) => row.id === drill) ?? null);
  return {
    currency: options.currency ?? "",
    totalMinor: ranked.totalMinor,
    count: data.items.length,
    rows: ranked.rows,
    otherCount: ranked.otherCount,
    drilled: drilledItem,
    issues: data.issues,
  };
}

export const validLimit = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 1;

/**
 * Amounts by category, largest first. The snapshot holds every row with its
 * share of the total, the `limit` and the folded `other` row with its
 * `count`. An agent may `setLimit` and `drill` into a category. Nothing here
 * changes the data.
 */
export const barChart = definePrimitive({
  name: "bar-chart",
  options: {
    items: "value",
    currency: "string",
    limit: "value",
    defaultLimit: "value",
    onLimitChange: "callback",
    drill: "value",
    defaultDrill: "value",
    onDrillChange: "callback",
    otherLabel: "string",
  },
  controlled: ["currency", "totalMinor", "count", "limit", "rows", "otherCount", "drill", "drilled", "issues"],
  state: (options: Options) => {
    const asked = options.limit !== undefined ? options.limit : options.defaultLimit;
    const limit = validLimit(asked) ? asked : null;
    const drill = options.drill ?? options.defaultDrill ?? null;
    // The limit a person folds back to after showing every bar.
    return { limit, lastLimit: limit, drill, refusal: "", ...derive(options, limit, drill) };
  },
  sync: (options: Options) => ({
    ...(options.limit === undefined ? {} : { limit: validLimit(options.limit) ? options.limit : null }),
    ...(options.drill === undefined ? {} : { drill: options.drill }),
  }),
  api: (context) => {
    const change = createChange(context);

    context.onOptions((options) => {
      const state = context.store.get();
      const limit = options.limit === undefined ? state.limit : validLimit(options.limit) ? options.limit : null;
      const drill = options.drill === undefined ? state.drill : options.drill;
      context.store.set(derive(options, limit, drill));
    });

    const refresh = () => {
      const { limit, drill } = context.store.get();
      context.store.set({ refusal: "", ...derive(context.options(), limit, drill) });
    };
    const shown = <T>(run: () => T): T => {
      try {
        return run();
      } catch (error) {
        context.store.set({ refusal: (error as Error).message });
        throw error;
      }
    };

    function setLimit(value: unknown, event?: Event) {
      const limit = value === null || value === undefined ? null : Number(value);
      if (limit !== null && !validLimit(limit)) {
        throw new BookiError("chart.bad-limit", { value: String(value) });
      }
      const before = context.store.get().limit;
      const ok = change("limit", limit, { reason: "set-limit", event });
      if (ok) {
        if (limit === null && before !== null) context.store.set({ lastLimit: before });
        if (limit !== null) context.store.set({ lastLimit: limit });
        refresh();
        // A category folded into "Other" is no longer drilled into.
        const { drill, drilled } = context.store.get();
        if (drill !== null && drilled === null && change("drill", null, { reason: "set-limit", event })) refresh();
      }
      return ok;
    }

    function drill(value: unknown, event?: Event) {
      if (value === null || value === undefined || value === "") {
        const ok = change("drill", null, { reason: "clear-drill", event });
        if (ok) refresh();
        return ok;
      }
      const id = String(value);
      const { rows, otherCount } = context.store.get();
      if (id === "other") {
        throw new BookiError("chart.other-folds", { count: otherCount });
      }
      if (!rows.some((row) => row.id === id)) {
        const all = check(context.options().items).items;
        const folded = all.some((item) => item.id === id);
        const listed = rows.filter((row) => row.id !== "other").map((row) => row.id);
        throw folded
          ? new BookiError("chart.category-folded", { id })
          : new BookiError("chart.no-category", {
              id,
              ids: `${listed.slice(0, 20).join(", ") || "none"}${listed.length > 20 ? `, … (${listed.length})` : ""}`,
            });
      }
      const ok = change("drill", id, { reason: "drill", event });
      if (ok) refresh();
      return ok;
    }

    return {
      /** Agent: show at most this many bars and fold the rest into "Other"; null shows all. */
      setLimit: (limit: number | null) => setLimit(limit),
      setLimitByPerson: (limit: number | null, event?: Event) => shown(() => setLimit(limit, event)),
      /** Agent: drill into one category by id; null clears it. */
      drill: (id: string | null) => drill(id),
      drillByPerson: (id: string | null, event?: Event) => shown(() => drill(id, event)),
      /** Person: show every bar, or fold back to the limit they had. */
      toggleFoldByPerson: (event?: Event) =>
        shown(() => {
          const { otherCount, lastLimit } = context.store.get();
          return setLimit(otherCount > 0 ? null : lastLimit, event);
        }),
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({ "data-drilled": state.drilled ? "" : undefined }),
      state: (state) => ({
        limit: state.limit,
        lastLimit: state.lastLimit,
        drill: state.drilled ? state.drill : null,
        refusal: state.refusal,
      }),
    }),
    // One per row. `value` is the item id and becomes the part's key.
    bar: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({ type: "button", "aria-pressed": state.drilled?.id === part.key ? "true" : "false" }),
      press: ({ api, key }, event) => {
        try {
          api.drillByPerson(String(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    // Shows every bar, or folds them again.
    more: slot({
      attrs: (state) => ({
        type: "button",
        "data-variant": "ghost",
        "aria-expanded": state.otherCount > 0 ? "false" : "true",
      }),
      press: ({ api }, event) => {
        try {
          api.toggleFoldByPerson(event);
        } catch {
          /* shown in the control */
        }
      },
    }),
  }),
  agent: { actions: ["setLimit", "drill"] },
});
