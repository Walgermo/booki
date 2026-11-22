import {
  approveBatch,
  assertReleasable,
  batchIssues,
  batchTotalMinor,
  currentApprovals,
  releaseBatch,
  setBatchItems,
  type PaymentBatch as Batch,
  type PaymentItem,
} from "@booki/core/payment-batch";
import { BookiError } from "@booki/core/msg";
import { normalizeQuery, tableView, type TableColumn, type TableQuery } from "@booki/core/table";
import { createChange, definePrimitive } from "@ui-sdk/core";
import { refuseDenied } from "./access.js";
import { freshQuery, queryMethods, queryOptionKinds, type QueryOptions, type TablePaging } from "./table-query.js";
import { QUERY_FORMAT, commitSecret } from "./fields.js";

export type Options = QueryOptions & {
  batch?: Batch;
  defaultBatch?: Batch;
  /** Id of the person at the keyboard. */
  actor?: string;
  /** A person's methods their role does not allow, each with the reason. Set by `BookiAccessProvider`. */
  denied?: Record<string, string>;
  /** How many different people must approve. Defaults to 2. */
  requiredApprovals?: number;
  /** Payments a person sees per page. Defaults to 100. */
  pageSize?: number;
  onBatchChange?: (batch: Batch, details: { reason: string; source?: string; cancel?: () => void }) => void;
};

export const EMPTY: Batch = {
  id: "",
  status: "draft",
  debitAccount: "",
  valueDate: "",
  currency: "",
  preparedBy: "",
  items: [],
  approvals: [],
};

/** What an agent sees of a payment: everything but the account number. */
export type PaymentSummary = Omit<PaymentItem, "creditorAccount">;

export const DEFAULT_PAGE_SIZE = 100;

/**
 * The payment list's columns: what sort, search, filters, totals and CSV read.
 * The account number is not one of them, so no search, sort or filter can
 * reach it; the composed batch adds a masked account column to its CSV only.
 */
export const paymentColumns: TableColumn<PaymentItem>[] = [
  { id: "creditorName", header: "Creditor", value: (item) => item.creditorName },
  // A KID or payment reference is secret like the account: not searchable or filterable, so a
  // search can't test it digit by digit. The person's table and CSV still show it.
  { id: "reference", header: "Reference", filterable: false, value: (item) => item.reference ?? "" },
  { id: "amountMinor", header: "Amount", kind: "money", filterable: false, value: (item) => item.amountMinor },
];

export const wholeAbove = (value: number | undefined, fallback: number) =>
  Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : fallback;

/** The list's page, counts and totals (over every match) for a query. One that does not fit shows the list fresh. */
export function deriveList(batch: Batch, query: TableQuery) {
  let fitted = query;
  try {
    normalizeQuery(paymentColumns, query);
  } catch {
    fitted = freshQuery(paymentColumns, query.pageSize);
  }
  const shown = tableView(batch.items, paymentColumns, fitted);
  return {
    // The page as plain records, without account numbers: what the agent reads of the list.
    rows: shown.rows.map((item) => {
      const record: Record<string, unknown> = { id: item.id };
      for (const column of paymentColumns) record[column.id] = column.value(item) ?? null;
      if (record.reference) record.reference = "[redacted]";
      return record;
    }),
    view: { total: shown.total, matching: shown.matching, page: shown.page, pageCount: shown.pageCount } as TablePaging,
    totals: shown.totals,
    // For the composed batch's own render; not part of the agent's snapshot.
    pageIds: shown.rows.map((item) => item.id),
  };
}

export function derive(batch: Batch, required: number) {
  const issues = batchIssues(batch);
  const approvals = currentApprovals(batch).map((approval) => approval.approverId);
  return {
    payments: batch.items.map(
      ({ creditorAccount: _secret, ...rest }): PaymentSummary =>
        rest.reference ? { ...rest, reference: "[redacted]" } : rest,
    ),
    totalMinor: batchTotalMinor(batch),
    issues,
    approvals,
    status: batch.status,
    releasable: batch.status === "draft" && issues.length === 0 && approvals.length >= required,
  };
}

/**
 * A batch of outgoing payments that needs two people. An agent reads the
 * payments without their account numbers, sees duplicates in `issues`, may
 * remove a payment (which drops every approval) and ask `assertReleasable`.
 * Approving and releasing are a person's buttons, not agent actions: the
 * preparer cannot approve, and an approval only counts for the batch as it was.
 * The payment list sorts, searches, filters (by creditor, say) and pages like
 * a DataTable; `query`, `view`, the page as `rows` and `totals` over every
 * match are in the snapshot, never an account number. `payments` and
 * `totalMinor` still cover the whole batch.
 */
export const paymentBatch = definePrimitive({
  name: "payment-batch",
  options: {
    batch: "value",
    defaultBatch: "value",
    actor: "value",
    denied: "value",
    requiredApprovals: "number",
    onBatchChange: "callback",
    pageSize: "number",
    ...queryOptionKinds,
  },
  // `batch` itself is left out: it carries account numbers.
  controlled: [
    "payments",
    "totalMinor",
    "issues",
    "approvals",
    "status",
    "releasable",
    "query",
    "view",
    "rows",
    "totals",
    "queryFormat",
  ],
  state: (options: Options) => {
    const batch = options.batch ?? options.defaultBatch ?? EMPTY;
    const query =
      options.query ??
      freshQuery(paymentColumns, wholeAbove(options.pageSize, DEFAULT_PAGE_SIZE), options.defaultQuery);
    return {
      batch,
      refusal: "",
      queryFormat: QUERY_FORMAT,
      query,
      ...derive(batch, options.requiredApprovals ?? 2),
      ...deriveList(batch, query),
    };
  },
  sync: (options: Options) => ({
    ...(options.batch === undefined
      ? {}
      : { batch: options.batch, ...derive(options.batch, options.requiredApprovals ?? 2) }),
    ...(options.query === undefined ? {} : { query: options.query }),
  }),
  api: (context) => {
    const change = createChange(context);
    const required = () => context.options().requiredApprovals ?? 2;
    context.onOptions((options) => {
      const state = context.store.get();
      const query = options.query ?? state.query;
      context.store.set({ query, ...deriveList(options.batch ?? state.batch, query) });
    });
    const commit = (next: Batch, reason: string, event?: Event) => {
      // The bridge hears the batch without account numbers; the owner hears all of it.
      const shown = {
        ...next,
        debitAccount: next.debitAccount ? "[redacted]" : "",
        items: next.items.map(({ creditorAccount: _secret, ...rest }) =>
          rest.reference ? { ...rest, reference: "[redacted]" } : rest,
        ),
      };
      const ok = commitSecret(context as never, change as never, "batch", next, shown, { reason, event });
      if (ok && context.options().batch === undefined) {
        context.store.set({ refusal: "", ...derive(next, required()), ...deriveList(next, context.store.get().query) });
      } else if (ok) context.store.set({ refusal: "" });
      return ok;
    };
    const table = queryMethods({
      columns: () => paymentColumns as TableColumn<never>[],
      query: () => context.store.get().query,
      pageCount: () => context.store.get().view.pageCount,
      apply: (next, reason, event) => {
        // Throws on a bad query, before anything changes.
        normalizeQuery(paymentColumns, next);
        const ok = change("query", next, { reason, event });
        if (ok) context.store.set(deriveList(context.store.get().batch, context.store.get().query));
        return ok;
      },
      refuse: (message) => {
        if (context.store.get().refusal !== message) context.store.set({ refusal: message });
      },
    });
    const shown = <T>(run: () => T): T => {
      try {
        return run();
      } catch (error) {
        context.store.set({ refusal: (error as Error).message });
        throw error;
      }
    };
    function remove(id: string, event?: Event) {
      const batch = context.store.get().batch;
      if (!batch.items.some((item) => item.id === String(id))) {
        throw new BookiError("batch.no-payment", {
          id: String(id),
          ids: batch.items.map((item) => item.id).join(", ") || "none",
        });
      }
      return commit(
        setBatchItems(
          batch,
          batch.items.filter((item) => item.id !== String(id)),
        ),
        "remove-payment",
        event,
      );
    }
    return {
      ...table,
      /** Agent or person: take a payment out. Every approval is dropped. */
      removePayment: (id: string) => remove(id),
      removeByPerson: (id: string, event?: Event) => shown(() => remove(id, event)),
      /** Person only. */
      approve: (event?: Event) =>
        shown(() => {
          refuseDenied(context.options(), "approve");
          return commit(
            approveBatch(context.store.get().batch, String(context.options().actor ?? ""), new Date().toISOString()),
            "approve-batch",
            event,
          );
        }),
      /** Person only. */
      release: (event?: Event) =>
        shown(() => {
          refuseDenied(context.options(), "release");
          return commit(releaseBatch(context.store.get().batch, required()), "release-batch", event);
        }),
      /** Agent: throws until enough people have approved this exact batch. */
      assertReleasable: () => {
        assertReleasable(context.store.get().batch, required());
        return { releasable: true };
      },
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({ "data-status": state.status }),
      state: (state) => ({
        batch: state.batch,
        refusal: state.refusal,
        issues: state.issues,
        approvals: state.approvals,
        releasable: state.releasable,
        totalMinor: state.totalMinor,
        query: state.query,
        view: state.view,
        totals: state.totals,
        pageIds: state.pageIds,
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
    remove: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button", "data-variant": "secondary" }),
      press: ({ api, key }, event) => {
        try {
          api.removeByPerson(String(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    approve: slot({
      attrs: () => ({ type: "button" }),
      press: ({ api }, event) => {
        try {
          api.approve(event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    release: slot({
      attrs: () => ({ type: "button" }),
      press: ({ api }, event) => {
        try {
          api.release(event);
        } catch {
          /* shown in the control */
        }
      },
    }),
  }),
  agent: {
    actions: [
      "removePayment",
      "assertReleasable",
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
