import {
  DEFAULT_AGING_LIMITS,
  ageItems,
  agingBuckets,
  overdueParties,
  type AgingBucket,
  type OpenItem,
  type OpenItemKind,
  type OverdueParty,
} from "@booki/core/aging";
import { BookiError } from "@booki/core/msg";
import { createChange, definePrimitive } from "@ui-sdk/core";
import { DEFAULT_SNAPSHOT_POINTS, sharePercent, wholeAbove } from "./chart-math.js";

export type Details = { reason: string; source?: string; cancel?: () => void };

/** A bucket's total and its share of everything open. */
/** `partyCount` is how many parties have something in the bucket. */
export type AgingBucketTotal = AgingBucket & { amountMinor: number; sharePct: number | null; partyCount: number };

/** The bucket drilled into, with its parties largest first. */
export type AgingChartDrilled = {
  bucket: string;
  amountMinor: number;
  parties: { partyId: string; partyName: string; amountMinor: number }[];
  total: number;
  truncated: boolean;
};

export type Options = {
  items?: OpenItem[];
  kind?: OpenItemKind;
  /** The date the ages are counted to, YYYY-MM-DD. */
  asOf?: string;
  defaultAsOf?: string;
  /** Day limits of the buckets. Defaults to `[0, 30, 60, 90]`. */
  limits?: number[];
  /** The bucket drilled into, by id (`31-60`), or null. */
  drill?: string | null;
  defaultDrill?: string | null;
  onDrillChange?: (bucket: string | null, details: Details) => void;
  /** Parties in the top overdue list and drawn as rows. Defaults to 5. */
  topParties?: number;
  /** Most parties a drilled bucket lists in the snapshot. Defaults to 36. */
  snapshotRows?: number;
};

export const DEFAULT_TOP = 5;

export function report(options: Options, asOf: string) {
  const kind = options.kind ?? "receivable";
  const limits = options.limits ?? (DEFAULT_AGING_LIMITS as number[]);
  try {
    const columns = agingBuckets(limits);
    if (asOf === "") return { kind, columns, aged: null, issue: "" };
    return { kind, columns, aged: ageItems(options.items ?? [], asOf, limits, kind), issue: "" };
  } catch (error) {
    return { kind, columns: [] as AgingBucket[], aged: null, issue: (error as Error).message };
  }
}

export function derive(options: Options, asOf: string, drill: string | null) {
  const top = wholeAbove(options.topParties, DEFAULT_TOP);
  const cap = wholeAbove(options.snapshotRows, DEFAULT_SNAPSHOT_POINTS);
  const { kind, columns, aged, issue } = report(options, asOf);
  const totalMinor = aged?.grandTotalMinor ?? 0;
  const counts = columns.map(() => 0);
  if (aged) {
    // Parties per bucket: a party counts where its amount is not zero.
    for (const row of aged.rows)
      row.amountsMinor.forEach((amount, index) => {
        if (amount !== 0) counts[index]! += 1;
      });
  }
  const buckets: AgingBucketTotal[] = columns.map((bucket, index) => {
    const amountMinor = aged?.totalsMinor[index] ?? 0;
    return { ...bucket, amountMinor, sharePct: sharePercent(amountMinor, totalMinor), partyCount: counts[index]! };
  });
  const overdueMinor = buckets.slice(1).reduce((sum, bucket) => sum + bucket.amountMinor, 0);
  let topOverdue: OverdueParty[] = [];
  if (aged) {
    try {
      topOverdue = overdueParties(options.items ?? [], asOf, 1, kind).slice(0, top);
    } catch {
      topOverdue = [];
    }
  }
  let drilled: AgingChartDrilled | null = null;
  const at = drill === null ? -1 : columns.findIndex((bucket) => bucket.id === drill);
  if (aged && at >= 0) {
    const parties = aged.rows
      .filter((row) => row.amountsMinor[at] !== 0)
      .map((row) => ({ partyId: row.partyId, partyName: row.partyName, amountMinor: row.amountsMinor[at]! }))
      .sort((a, b) => b.amountMinor - a.amountMinor || a.partyName.localeCompare(b.partyName, "en"));
    drilled = {
      bucket: drill!,
      amountMinor: buckets[at]!.amountMinor,
      parties: parties.slice(0, cap),
      total: parties.length,
      truncated: parties.length > cap,
    };
  }
  return {
    kind,
    buckets,
    totalMinor,
    overdueMinor,
    overdueSharePct: sharePercent(overdueMinor, totalMinor),
    topOverdue,
    drilled,
    issues: issue ? [issue] : [],
  };
}

/**
 * Receivables or payables as stacked age buckets. The snapshot holds each
 * bucket's total and share, the overdue total and share, and the parties
 * most overdue. An agent may `drill` into a bucket to read who is in it.
 * Nothing here changes an open item.
 */
export const agingChart = definePrimitive({
  name: "aging-chart",
  options: {
    items: "value",
    kind: "string",
    asOf: "string",
    defaultAsOf: "string",
    limits: "value",
    drill: "value",
    defaultDrill: "value",
    onDrillChange: "callback",
    topParties: "number",
    snapshotRows: "number",
  },
  controlled: [
    "kind",
    "asOf",
    "buckets",
    "totalMinor",
    "overdueMinor",
    "overdueSharePct",
    "topOverdue",
    "drill",
    "drilled",
    "issues",
  ],
  state: (options: Options) => {
    const asOf = options.asOf ?? options.defaultAsOf ?? "";
    const drill = options.drill ?? options.defaultDrill ?? null;
    return { asOf, drill, refusal: "", ...derive(options, asOf, drill) };
  },
  sync: (options: Options) => ({
    ...(options.asOf === undefined ? {} : { asOf: options.asOf }),
    ...(options.drill === undefined ? {} : { drill: options.drill }),
  }),
  api: (context) => {
    const change = createChange(context);

    context.onOptions((options) => {
      const state = context.store.get();
      const asOf = options.asOf === undefined ? state.asOf : options.asOf;
      const drill = options.drill === undefined ? state.drill : options.drill;
      context.store.set(derive(options, asOf, drill));
    });

    const refresh = () => {
      const { asOf, drill } = context.store.get();
      context.store.set({ refusal: "", ...derive(context.options(), asOf, drill) });
    };
    const shown = <T>(run: () => T): T => {
      try {
        return run();
      } catch (error) {
        context.store.set({ refusal: (error as Error).message });
        throw error;
      }
    };

    function drill(value: unknown, event?: Event) {
      if (value === null || value === undefined || value === "") {
        const ok = change("drill", null, { reason: "clear-drill", event });
        if (ok) refresh();
        return ok;
      }
      const id = String(value);
      const { buckets, asOf, issues } = context.store.get();
      if (asOf === "") throw new Error("The chart has no as-of date, so nothing is aged yet.");
      if (issues.length > 0) throw new Error(issues[0]!);
      if (!buckets.some((bucket) => bucket.id === id)) {
        throw new BookiError("aging.no-bucket", { bucket: id, buckets: buckets.map((bucket) => bucket.id).join(", ") });
      }
      const ok = change("drill", id, { reason: "drill", event });
      if (ok) refresh();
      return ok;
    }

    return {
      /** Agent: drill into one age bucket by id (`not-due`, `1-30`, `over-90`); null clears it. */
      drill: (bucket: string | null) => drill(bucket),
      drillByPerson: (bucket: string | null, event?: Event) => shown(() => drill(bucket, event)),
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({ "data-kind": state.kind, "data-drilled": state.drilled ? "" : undefined }),
      state: (state) => ({
        kind: state.kind,
        asOf: state.asOf,
        drill: state.drilled ? state.drill : null,
        refusal: state.refusal,
      }),
    }),
    // One per bucket, in the legend. `value` is the bucket id and becomes the part's key.
    bucket: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        type: "button",
        "aria-pressed": state.drilled?.bucket === part.key ? "true" : "false",
      }),
      press: ({ api, key }, event) => {
        try {
          api.drillByPerson(String(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    clear: slot({
      attrs: () => ({ type: "button", "data-variant": "secondary" }),
      press: ({ api }, event) => {
        try {
          api.drillByPerson(null, event);
        } catch {
          /* shown in the control */
        }
      },
    }),
  }),
  agent: { actions: ["drill"] },
});
