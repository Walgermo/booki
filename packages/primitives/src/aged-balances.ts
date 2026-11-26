import { sumMinorUnits } from "@booki-aui/core/money";
import {
  DEFAULT_AGING_LIMITS,
  ageItems,
  agingBuckets,
  overdueParties,
  partyItems,
  type AgedItem,
  type AgingBucket,
  type AgingRow,
  type OpenItem,
  type OpenItemKind,
  type OverdueParty,
} from "@booki-aui/core/aging";
import { BookiError, isBookiError } from "@booki-aui/core/msg";
import { matchingRows, normalizeQuery, tableView, type TableColumn, type TableQuery } from "@booki-aui/core/table";
import { createChange, definePrimitive } from "@ui-sdk/core";
import { freshQuery, queryMethods, queryOptionKinds, type QueryOptions, type TablePaging } from "./table-query.js";
import { QUERY_FORMAT } from "./fields.js";

export type Details = { reason: string; source?: string; cancel?: () => void };

export type Options = QueryOptions & {
  items?: OpenItem[];
  /** Which side to age. Defaults to receivables. */
  kind?: OpenItemKind;
  /** The date the ages are counted to, YYYY-MM-DD. */
  asOf?: string;
  defaultAsOf?: string;
  onAsOfChange?: (asOf: string, details: Details) => void;
  /** The party drilled into, or null for the table. */
  partyId?: string | null;
  defaultPartyId?: string | null;
  onPartyIdChange?: (partyId: string | null, details: Details) => void;
  /** Day limits of the columns. Defaults to `[0, 30, 60, 90]`. */
  limits?: number[];
  /** Most rows an agent's snapshot carries. Defaults to 50. */
  snapshotRows?: number;
  /** Rows a person sees per page. Defaults to 100. */
  pageSize?: number;
};

/** The totals row: one amount per bucket and the grand total. */
export type AgingTotals = { amountsMinor: number[]; totalMinor: number };

/** The party an agent or person drilled into, with its first items. */
export type AgedParty = {
  partyId: string;
  partyName: string;
  totalMinor: number;
  items: AgedItem[];
  itemCount: number;
  truncated: boolean;
  /** Sum of the items the query matches; the party's total when nothing is filtered. */
  matchingMinor: number;
};

export const DEFAULT_SNAPSHOT_ROWS = 50;
export const DEFAULT_PAGE_SIZE = 100;

/** The filter that keeps the parties (or items) with an amount in one age column. Its value is a bucket id. */
export const BUCKET_FILTER = "bucket";

/** The aging table's columns: the party, one per bucket, and the total. */
export function partyColumns(buckets: AgingBucket[]): TableColumn<AgingRow>[] {
  return [
    { id: "partyName", header: "Party", value: (row) => row.partyName },
    ...buckets.map(
      (bucket, index): TableColumn<AgingRow> => ({
        id: bucket.id,
        header: bucket.id,
        kind: "money",
        filterable: false,
        value: (row) => row.amountsMinor[index] ?? 0,
      }),
    ),
    { id: "totalMinor", header: "Total", kind: "money", filterable: false, value: (row) => row.totalMinor },
  ];
}

/** One party's open items. */
export const itemColumns: TableColumn<AgedItem>[] = [
  { id: "documentNumber", header: "Document", value: (item) => item.documentNumber },
  { id: "dueDate", header: "Due date", kind: "date", value: (item) => item.dueDate },
  {
    id: "daysOverdue",
    header: "Days overdue",
    kind: "number",
    filterable: false,
    total: false,
    value: (item) => Math.max(0, item.daysOverdue),
  },
  { id: "bucket", header: "Age", sortable: false, value: (item) => item.bucket },
  { id: "amountMinor", header: "Amount", kind: "money", filterable: false, value: (item) => item.amountMinor },
];

/** A bucket id, or the reason it is none. */
export function checkBucket(buckets: AgingBucket[], value: unknown): string {
  const id = String(value ?? "").trim();
  if (!buckets.some((bucket) => bucket.id === id)) {
    throw new BookiError("aging.no-bucket", { bucket: id, buckets: buckets.map((bucket) => bucket.id).join(", ") });
  }
  return id;
}

/** The query without the bucket filter, which the control applies itself, exactly. */
const withoutBucket = (query: TableQuery): TableQuery => {
  const { [BUCKET_FILTER]: _bucket, ...filters } = query.filters;
  return { ...query, filters };
};

/** The query, if it fits these columns and buckets. One left over from other limits does not. */
function fits<Row>(
  columns: TableColumn<Row>[],
  buckets: AgingBucket[],
  query: TableQuery | undefined,
): TableQuery | undefined {
  if (!query) return undefined;
  try {
    normalizeQuery(columns, withoutBucket(query));
    const bucket = query.filters[BUCKET_FILTER];
    if (bucket !== undefined && bucket !== "") checkBucket(buckets, bucket);
    return query;
  } catch {
    return undefined;
  }
}

/** Rows a query shows. The bucket filter keeps rows with an amount in that column. */
function view<Row>(
  rows: Row[],
  columns: TableColumn<Row>[],
  query: TableQuery,
  inBucket: (row: Row, bucket: string) => boolean,
) {
  const bucket = query.filters[BUCKET_FILTER];
  const kept = bucket ? rows.filter((row) => inBucket(row, bucket)) : rows;
  const shown = tableView(kept, columns, withoutBucket(query), { requireHiddenTotals: true });
  return { ...shown, total: rows.length };
}

export const wholeAbove = (value: number | undefined, fallback: number) =>
  Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : fallback;

/** Every party the query matches, sorted, before paging: what a CSV of the aging table holds. */
export function matchingParties(rows: AgingRow[], buckets: AgingBucket[], query: TableQuery): AgingRow[] {
  const columns = partyColumns(buckets);
  const fitted = fits(columns, buckets, query) ?? freshQuery(columns, query.pageSize);
  const at = buckets.findIndex((bucket) => bucket.id === fitted.filters[BUCKET_FILTER]);
  const kept = at < 0 ? rows : rows.filter((row) => (row.amountsMinor[at] ?? 0) !== 0);
  return matchingRows(kept, columns, withoutBucket(fitted));
}

/** Every item of a party the query matches, sorted, before paging. */
export function matchingItems(items: AgedItem[], buckets: AgingBucket[], query: TableQuery): AgedItem[] {
  const fitted = fits(itemColumns, buckets, query) ?? freshQuery(itemColumns, query.pageSize);
  const bucket = fitted.filters[BUCKET_FILTER];
  const kept = bucket ? items.filter((item) => item.bucket === bucket) : items;
  return matchingRows(kept, itemColumns, withoutBucket(fitted));
}

const paging = (shown: { total: number; matching: number; page: number; pageCount: number }): TablePaging => ({
  total: shown.total,
  matching: shown.matching,
  page: shown.page,
  pageCount: shown.pageCount,
});

/**
 * Everything derived from the items, the date and the queries. `query` is the
 * query of the list on screen; in a party, `tableQuery` is the one of the
 * aging table it was opened from.
 */
export function derive(
  options: Options,
  asOf: string,
  partyId: string | null,
  query?: TableQuery,
  tableQuery?: TableQuery | null,
) {
  const kind = options.kind ?? "receivable";
  const limits = options.limits ?? DEFAULT_AGING_LIMITS;
  const cap = wholeAbove(options.snapshotRows, DEFAULT_SNAPSHOT_ROWS);
  const size = wholeAbove(options.pageSize, DEFAULT_PAGE_SIZE);
  const items = options.items ?? [];
  // Without a date there is nothing to age yet.
  const report = asOf === "" ? null : ageItems(items, asOf, limits, kind);
  const buckets = report?.buckets ?? agingBuckets(limits);
  const all = report?.rows ?? [];
  const columns = partyColumns(buckets);
  const index = (bucket: string) => buckets.findIndex((item) => item.id === bucket);

  const ownQuery = partyId === null ? query : (tableQuery ?? undefined);
  const table = view(
    all,
    columns,
    fits(columns, buckets, ownQuery) ?? freshQuery(columns, ownQuery?.pageSize ?? size),
    (row, bucket) => (row.amountsMinor[index(bucket)] ?? 0) !== 0,
  );
  const rows = table.rows.slice(0, cap);

  let party: AgedParty | null = null;
  let current = paging(table);
  let pageRows: unknown[] = table.rows;
  if (report && partyId !== null) {
    const own = partyItems(items, asOf, partyId, { buckets: limits, kind });
    const row = all.find((item) => item.partyId === partyId);
    const shown = view(
      own,
      itemColumns,
      fits(itemColumns, buckets, query) ?? freshQuery(itemColumns, query?.pageSize ?? size),
      (item, bucket) => item.bucket === bucket,
    );
    const first = shown.rows.slice(0, cap);
    party = {
      partyId,
      partyName: row?.partyName ?? own[0]?.partyName ?? partyId,
      totalMinor: row?.totalMinor ?? 0,
      items: first,
      itemCount: own.length,
      truncated: first.length < shown.matching,
      matchingMinor: shown.totals.amountMinor ?? 0,
    };
    current = paging(shown);
    pageRows = shown.rows;
  } else if (!report) {
    pageRows = [];
  }
  return {
    kind,
    buckets,
    rows,
    total: all.length,
    // The snapshot holds fewer rows than match: page on, or narrow the query.
    truncated: rows.length < table.matching,
    // Over every party the aging table's query matches, not just the page.
    totals: {
      amountsMinor: buckets.map((bucket) => table.totals[bucket.id] ?? 0),
      totalMinor: table.totals.totalMinor ?? 0,
    } as AgingTotals,
    party,
    view: current,
    // For the composed control's own render; not part of the agent's snapshot.
    pageRows,
  };
}

/** Supplied records or controlled props can arrive before their owner can correct an unsafe total. */
function display(
  options: Options,
  asOf: string,
  partyId: string | null,
  query: TableQuery,
  tableQuery: TableQuery | null,
) {
  try {
    return { ...derive(options, asOf, partyId, query, tableQuery), issues: [] as string[] };
  } catch (error) {
    if (!isBookiError(error) || error.code !== "money.not-safe-integer") throw error;
    return { ...derive({ ...options, items: [] }, "", null), issues: [error.message] };
  }
}

/**
 * Receivables or payables by age. The snapshot holds `kind`, `asOf`, the
 * `buckets`, the page of `rows` (one per party, capped, with `total` and
 * `truncated`), the `totals` row over every matching party, the `party`
 * drilled into, and the `query` and `view` (counts and pages) of the list on
 * screen. An agent may `setAsOf`, `openParty`, `back`, sort, search, filter
 * (`setFilter("bucket", "61-90")` keeps the parties or items with an amount
 * in that column) and page like a DataTable, and ask `overdue(minDays)`, which
 * returns who is that late and by how much. Nothing here changes an open item.
 */
export const agedBalances = definePrimitive({
  name: "aged-balances",
  options: {
    items: "value",
    kind: "string",
    asOf: "string",
    defaultAsOf: "string",
    onAsOfChange: "callback",
    partyId: "value",
    defaultPartyId: "value",
    onPartyIdChange: "callback",
    limits: "value",
    snapshotRows: "number",
    pageSize: "number",
    ...queryOptionKinds,
  },
  // The open items themselves are left out: `rows` and `party.items` are capped.
  controlled: [
    "kind",
    "asOf",
    "buckets",
    "rows",
    "total",
    "truncated",
    "totals",
    "issues",
    "partyId",
    "party",
    "query",
    "view",
    "queryFormat",
  ],
  state: (options: Options) => {
    const asOf = options.asOf ?? options.defaultAsOf ?? "";
    const partyId = options.partyId ?? options.defaultPartyId ?? null;
    const size = wholeAbove(options.pageSize, DEFAULT_PAGE_SIZE);
    const query =
      options.query ??
      freshQuery<never>(
        (partyId === null
          ? partyColumns(agingBuckets(options.limits ?? DEFAULT_AGING_LIMITS))
          : itemColumns) as TableColumn<never>[],
        size,
        options.defaultQuery,
      );
    return {
      asOf,
      partyId,
      query,
      tableQuery: null as TableQuery | null,
      refusal: "",
      queryFormat: QUERY_FORMAT,
      ...display(options, asOf, partyId, query, null),
    };
  },
  sync: (options: Options) => ({
    ...(options.asOf === undefined ? {} : { asOf: options.asOf }),
    ...(options.partyId === undefined ? {} : { partyId: options.partyId }),
    ...(options.query === undefined ? {} : { query: options.query }),
  }),
  api: (context) => {
    const change = createChange(context);
    /**
     * A drill-down moves to another list, so its query starts again (or
     * returns as it was left). That follows from the move and is no change of
     * its own, unless the app owns the query: then it hears of it.
     */
    const reset = (query: TableQuery, reason: string, event?: Event) => {
      if (context.options().query === undefined) context.store.set({ query });
      else change("query", query, { reason, event });
    };

    // New items, another side or a controlled key: keep the derived keys current.
    context.onOptions((options) => {
      const state = context.store.get();
      const asOf = options.asOf === undefined ? state.asOf : options.asOf;
      const partyId = options.partyId === undefined ? state.partyId : options.partyId;
      const query = options.query ?? state.query;
      context.store.set({ query, ...display(options, asOf, partyId, query, state.tableQuery) });
    });

    const refresh = () => {
      const { asOf, partyId, query, tableQuery } = context.store.get();
      context.store.set({ refusal: "", ...display(context.options(), asOf, partyId, query, tableQuery) });
    };
    const shown = <T>(run: () => T): T => {
      try {
        return run();
      } catch (error) {
        context.store.set({ refusal: (error as Error).message });
        throw error;
      }
    };
    // Focus follows a person in and out of a party: to Back, then to the party's button.
    let focusNext: string | null = null;
    const size = () => context.store.get().query.pageSize;
    const columns = () =>
      context.store.get().partyId === null
        ? (partyColumns(context.store.get().buckets) as TableColumn<never>[])
        : (itemColumns as TableColumn<never>[]);

    function setAsOf(date: unknown, event?: Event) {
      const asOf = String(date ?? "").trim();
      // Throws for anything but a real YYYY-MM-DD date.
      const { partyId, query, tableQuery } = context.store.get();
      derive(context.options(), asOf === "" ? "not a date" : asOf, partyId, query, tableQuery);
      const ok = change("asOf", asOf, { reason: "set-as-of", event });
      if (ok) refresh();
      return ok;
    }
    function openParty(partyId: unknown, event?: Event) {
      const id = String(partyId ?? "");
      const { asOf } = context.store.get();
      if (asOf === "") throw new Error("Set the as-of date first: setAsOf with a date written YYYY-MM-DD.");
      // Throws with the list of parties when there is no such party.
      derive(context.options(), asOf, id);
      const before = context.store.get();
      const ok = change("partyId", id, { reason: "open-party", event });
      if (ok) {
        // The aging table's query waits for Back; the party's items start unsorted and unfiltered.
        if (before.partyId === null) context.store.set({ tableQuery: before.query });
        reset(freshQuery(itemColumns, size()), "open-party", event);
        refresh();
      }
      return ok;
    }
    function back(event?: Event) {
      const { tableQuery, buckets } = context.store.get();
      const ok = change("partyId", null, { reason: "back", event });
      if (ok) {
        reset(tableQuery ?? freshQuery(partyColumns(buckets), size()), "back", event);
        context.store.set({ tableQuery: null });
        refresh();
      }
      return ok;
    }
    const table = queryMethods({
      columns,
      extraFilters: { [BUCKET_FILTER]: (text) => checkBucket(context.store.get().buckets, text) },
      query: () => context.store.get().query,
      pageCount: () => context.store.get().view.pageCount,
      apply: (next, reason, event) => {
        // Throws on a bad query, before anything changes.
        normalizeQuery(columns(), withoutBucket(next));
        const { asOf, partyId, tableQuery } = context.store.get();
        const derived = derive(context.options(), asOf, partyId, next, tableQuery);
        const ok = change("query", next, { reason, event });
        if (ok && context.options().query === undefined) context.store.set({ ...derived, refusal: "", issues: [] });
        return ok;
      },
      refuse: (message) => {
        if (context.store.get().refusal !== message) context.store.set({ refusal: message });
      },
    });

    return {
      ...table,
      /** Agent: age the items as of this date, YYYY-MM-DD. */
      setAsOf: (date: string) => setAsOf(date),
      setAsOfByPerson: (date: string, event?: Event) => shown(() => setAsOf(date, event)),
      /** Agent: drill into one party's open items. */
      openParty: (partyId: string) => openParty(partyId),
      openPartyByPerson: (partyId: string, event?: Event) =>
        shown(() => {
          const ok = openParty(partyId, event);
          if (ok) focusNext = "back";
          return ok;
        }),
      /** Agent: return to the table. */
      back: () => back(),
      backByPerson: (event?: Event) =>
        shown(() => {
          const left = context.store.get().partyId;
          const ok = back(event);
          if (ok && left !== null) focusNext = `party|${left}`;
          return ok;
        }),
      claimFocus: (el: HTMLElement, name: string) => {
        if (focusNext !== name) return;
        focusNext = null;
        el.focus();
      },
      /**
       * Agent: the parties with something overdue by at least `minDays` days
       * on the as-of date, largest first, capped like the snapshot. Changes nothing.
       */
      overdue: (
        minDays = 1,
      ): {
        kind: OpenItemKind;
        asOf: string;
        minDays: number;
        overdueMinor: number;
        parties: OverdueParty[];
        total: number;
        truncated: boolean;
      } => {
        const { asOf } = context.store.get();
        if (asOf === "") throw new Error("Set the as-of date first: setAsOf with a date written YYYY-MM-DD.");
        const options = context.options();
        const kind = options.kind ?? "receivable";
        const cap = wholeAbove(options.snapshotRows, DEFAULT_SNAPSHOT_ROWS);
        const parties = overdueParties(options.items ?? [], asOf, Number(minDays), kind);
        return {
          kind,
          asOf,
          minDays: Number(minDays),
          overdueMinor: sumMinorUnits(parties, (party) => party.overdueMinor),
          parties: parties.slice(0, cap),
          total: parties.length,
          truncated: parties.length > cap,
        };
      },
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({ "data-kind": state.kind, "data-view": state.partyId === null ? "table" : "party" }),
      state: (state) => ({
        kind: state.kind,
        asOf: state.asOf,
        partyId: state.partyId,
        refusal: state.refusal,
        issues: state.issues,
        query: state.query,
        view: state.view,
        totals: state.totals,
        party: state.party,
        buckets: state.buckets,
        pageRows: state.pageRows,
      }),
    }),
    search: slot({
      attrs: (state) => ({ type: "search", value: state.query.search, autoComplete: "off" }),
      on: {
        input: (event, { api }) => {
          try {
            api.searchByPerson((event.target as HTMLInputElement).value, event);
          } catch {
            /* shown in the control */
          }
        },
      },
    }),
    // The age column to show, as a select: "" for every age, or a bucket id.
    bucket: slot({
      attrs: (state) => ({ value: state.query.filters[BUCKET_FILTER] ?? "" }),
      on: {
        input: (event, { api }) => {
          try {
            api.filterByPerson(BUCKET_FILTER, (event.target as HTMLSelectElement).value, event);
          } catch {
            /* shown in the control */
          }
        },
      },
    }),
    // The sort button in a header cell. `value` is the column id.
    sort: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        type: "button",
        "data-sorted": state.query.sort?.column === part.key ? state.query.sort.direction : undefined,
      }),
      press: ({ api, key }, event) => {
        try {
          api.sortByPerson(String(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    prev: slot({
      attrs: (state) => ({
        type: "button",
        "data-variant": "secondary",
        disabled: state.view.page <= 1 ? "" : undefined,
      }),
      press: ({ api, store }, event) => {
        try {
          api.pageByPerson(store.get().view.page - 1, event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    next: slot({
      attrs: (state) => ({
        type: "button",
        "data-variant": "secondary",
        disabled: state.view.page >= state.view.pageCount ? "" : undefined,
      }),
      press: ({ api, store }, event) => {
        try {
          api.pageByPerson(store.get().view.page + 1, event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    // The as-of date. Named `date` so its data-slot is `aged-balances-date`.
    date: slot({
      attrs: (state) => ({ type: "date", value: state.asOf }),
      on: {
        // "input" is the adapter's name for React's onChange. A cleared field is not a date: keep the last one.
        input: (event, { api }) => {
          const value = (event.target as HTMLInputElement).value;
          if (value === "") return;
          try {
            api.setAsOfByPerson(value, event);
          } catch {
            /* shown in the control */
          }
        },
      },
    }),
    // One per party. `value` is the party id and becomes the part's key.
    party: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button" }),
      press: ({ api, key }, event) => {
        try {
          api.openPartyByPerson(String(key), event);
        } catch {
          /* shown in the control */
        }
      },
      bind: (el, part) => part.api.claimFocus(el, `party|${String(part.key)}`),
    }),
    back: slot({
      attrs: () => ({ type: "button", "data-variant": "secondary" }),
      press: ({ api }, event) => {
        try {
          api.backByPerson(event);
        } catch {
          /* shown in the control */
        }
      },
      bind: (el, part) => part.api.claimFocus(el, "back"),
    }),
  }),
  agent: {
    actions: [
      "setAsOf",
      "openParty",
      "back",
      "overdue",
      "setSort",
      "clearSort",
      "setSearch",
      "setFilter",
      "clearFilters",
      "setPage",
      "setPageSize",
    ],
  },
});
