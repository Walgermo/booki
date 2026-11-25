import {
  accountLedger,
  checkRange,
  explainVariance,
  summarizeLedger,
  type AccountLedgerRow,
  type LedgerEntry,
  type TrialBalanceRow,
  type Variance,
} from "@booki-aui/core/ledger";
import { BookiError } from "@booki-aui/core/msg";
import { matchingRows, normalizeQuery, tableView, type TableColumn, type TableQuery } from "@booki-aui/core/table";
import {
  createChange,
  createRovingFocus,
  createTypeahead,
  definePrimitive,
  dispatch,
  isTypeaheadKey,
  labelOf,
} from "@ui-sdk/core";
import { freshQuery, queryMethods, queryOptionKinds, type QueryOptions, type TablePaging } from "./table-query.js";
import { QUERY_FORMAT } from "./fields.js";

export type Details = { reason: string; source?: string; cancel?: () => void };

/** What `onOpenVoucher` reports when an entry is picked. */
export type LedgerVoucherRef = { voucherId: string; voucherNumber: string; entryId: string };

export type LedgerView = "trial-balance" | "account" | "voucher";

/** The document behind a voucher, when the app has one: a scan, a PDF, an e-invoice. */
export type LedgerDocument = { name: string; url?: string; mediaType?: string };

/** What the snapshot says about the open voucher. */
export type LedgerVoucherSummary = {
  voucherId: string;
  voucherNumber: string;
  date: string;
  description: string;
  debitMinor: number;
  creditMinor: number;
  balanced: boolean;
  lines: number;
  document: string | null;
};

export type Options = QueryOptions & {
  entries?: LedgerEntry[];
  /** The account drilled into, or null for the trial balance. */
  account?: string | null;
  defaultAccount?: string | null;
  onAccountChange?: (account: string | null, details: Details) => void;
  /** First date of the range, YYYY-MM-DD, or null for no start. */
  from?: string | null;
  defaultFrom?: string | null;
  onFromChange?: (from: string | null, details: Details) => void;
  to?: string | null;
  defaultTo?: string | null;
  onToChange?: (to: string | null, details: Details) => void;
  /** Rows a person sees per page. Defaults to 100. */
  pageSize?: number;
  /** Most rows an agent's snapshot carries. Defaults to 50. */
  snapshotRows?: number;
  onOpenVoucher?: (voucher: LedgerVoucherRef, details: Details) => void;
  /** The voucher drilled into (its id), or null. */
  voucher?: string | null;
  defaultVoucher?: string | null;
  onVoucherChange?: (voucher: string | null, details: Details) => void;
  /** Documents by voucher id. */
  documents?: Record<string, LedgerDocument>;
  onOpenDocument?: (document: LedgerDocument & { voucherId: string }, details: Details) => void;
};

export const DEFAULT_PAGE_SIZE = 100;
export const DEFAULT_SNAPSHOT_ROWS = 50;

export const wholeAbove = (value: number | undefined, fallback: number) =>
  Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : fallback;

export const range = (from: string | null, to: string | null) => ({ from: from ?? undefined, to: to ?? undefined });

/** The trial balance's columns: what sort, search, filters, totals and CSV read. */
export const trialBalanceColumns: TableColumn<TrialBalanceRow>[] = [
  { id: "account", header: "Account", value: (row) => row.account },
  { id: "accountName", header: "Account name", value: (row) => row.accountName },
  { id: "openingMinor", header: "Opening", kind: "money", filterable: false, value: (row) => row.openingMinor },
  { id: "debitMinor", header: "Debit", kind: "money", filterable: false, value: (row) => row.debitMinor },
  { id: "creditMinor", header: "Credit", kind: "money", filterable: false, value: (row) => row.creditMinor },
  { id: "closingMinor", header: "Closing", kind: "money", filterable: false, value: (row) => row.closingMinor },
];

/** One account's entries. The running balance is the entry's own and is not summed. */
export const accountColumns: TableColumn<AccountLedgerRow>[] = [
  { id: "date", header: "Date", kind: "date", value: (row) => row.date },
  { id: "voucherNumber", header: "Voucher", value: (row) => row.voucherNumber },
  { id: "description", header: "Text", value: (row) => row.description },
  { id: "debitMinor", header: "Debit", kind: "money", filterable: false, value: (row) => row.debitMinor },
  { id: "creditMinor", header: "Credit", kind: "money", filterable: false, value: (row) => row.creditMinor },
  {
    id: "balanceMinor",
    header: "Balance",
    kind: "money",
    filterable: false,
    total: false,
    value: (row) => row.balanceMinor,
  },
];

/** The lines of one voucher. */
export const voucherColumns: TableColumn<LedgerEntry>[] = [
  { id: "account", header: "Account", value: (row) => row.account },
  { id: "accountName", header: "Account name", value: (row) => row.accountName },
  { id: "description", header: "Text", value: (row) => row.description },
  { id: "debitMinor", header: "Debit", kind: "money", filterable: false, value: (row) => row.debitMinor },
  { id: "creditMinor", header: "Credit", kind: "money", filterable: false, value: (row) => row.creditMinor },
];

export const viewOf = (account: string | null, voucher: string | null): LedgerView =>
  voucher !== null ? "voucher" : account === null ? "trial-balance" : "account";

/** The columns of a view. */
export function columnsOf(view: LedgerView): TableColumn<never>[] {
  const columns = view === "voucher" ? voucherColumns : view === "account" ? accountColumns : trialBalanceColumns;
  return columns as TableColumn<never>[];
}

/** Every line of one voucher, in entry order, whatever the range. */
export function voucherLines(entries: LedgerEntry[], voucherId: string) {
  return entries.filter((entry) => entry.voucherId === voucherId);
}

export function voucherSummary(
  entries: LedgerEntry[],
  voucherId: string,
  documents: Record<string, LedgerDocument> | undefined,
): LedgerVoucherSummary | null {
  const lines = voucherLines(entries, voucherId);
  const first = lines[0];
  if (!first) return null;
  const debitMinor = lines.reduce((sum, line) => sum + line.debitMinor, 0);
  const creditMinor = lines.reduce((sum, line) => sum + line.creditMinor, 0);
  return {
    voucherId,
    voucherNumber: first.voucherNumber,
    date: first.date,
    description: first.description,
    debitMinor,
    creditMinor,
    balanced: debitMinor === creditMinor,
    lines: lines.length,
    document: documents?.[voucherId]?.name ?? null,
  };
}

/** The query, if it fits these columns. An owner's query left over from another view does not. */
function fits(columns: TableColumn<never>[], query: TableQuery | undefined): TableQuery | undefined {
  if (!query) return undefined;
  try {
    return normalizeQuery(columns, query);
  } catch {
    return undefined;
  }
}

/** Every row of a view, before the query: accounts, an account's entries, or a voucher's lines. */
export function viewRows(
  entries: LedgerEntry[],
  account: string | null,
  from: string | null,
  to: string | null,
  voucher: string | null,
) {
  const view = viewOf(account, voucher);
  if (view === "voucher") return voucherLines(entries, voucher!) as unknown[];
  if (view === "trial-balance") return summarizeLedger(entries, range(from, to)).rows as unknown[];
  return accountLedger(entries, account!, range(from, to)).rows as unknown[];
}

/**
 * The keys an agent reads: which view, the query and the page of it the
 * snapshot carries (capped), counts, totals over every match, and whether the
 * ledger balances.
 */
export function derive(
  entries: LedgerEntry[],
  account: string | null,
  from: string | null,
  to: string | null,
  cap: number,
  voucher: string | null = null,
  documents?: Record<string, LedgerDocument>,
  query?: TableQuery,
) {
  const summary = summarizeLedger(entries, range(from, to));
  const view = viewOf(account, voucher);
  const columns = columnsOf(view);
  const all = view === "trial-balance" ? summary.rows : viewRows(entries, account, from, to, voucher);
  const shown = tableView(
    all as never[],
    columns,
    fits(columns, query) ?? freshQuery(columns, query?.pageSize ?? DEFAULT_PAGE_SIZE),
  );
  const rows = (shown.rows as unknown[]).slice(0, cap) as (TrialBalanceRow | AccountLedgerRow | LedgerEntry)[];
  return {
    view,
    rows,
    total: all.length,
    // The snapshot holds fewer rows than match: page on, or narrow the query.
    truncated: rows.length < shown.matching,
    balanced: summary.balanced,
    voucherSummary: voucher === null ? null : voucherSummary(entries, voucher, documents),
    table: {
      total: shown.total,
      matching: shown.matching,
      page: shown.page,
      pageCount: shown.pageCount,
    } as TablePaging,
    totals: shown.totals,
    // For the composed ledger's own render; not part of the agent's snapshot.
    pageRows: shown.rows as unknown[],
    page: shown.page,
  };
}

/** A date from a person or an agent: empty means no bound. */
export const bound = (value: unknown): string | null => {
  const text = value === null || value === undefined ? "" : String(value).trim();
  return text === "" ? null : text;
};

/**
 * A read-only general ledger. The snapshot holds the view (`trial-balance`,
 * `account` or `voucher`), the range, the `query` of the view and its page of
 * `rows` (capped, with `total` and `truncated`), `table` with the counts and
 * pages, `totals` over every matching row, and `balanced`. An agent may
 * `setRange`, `openAccount`, `showVoucher`, `back`, sort, search, filter and
 * page the view like a DataTable, and ask `explainVariance`, which returns the
 * vouchers behind a difference between two periods. Nothing here changes the
 * ledger.
 */
export const ledgerTable = definePrimitive({
  name: "ledger-table",
  options: {
    entries: "value",
    account: "value",
    defaultAccount: "value",
    onAccountChange: "callback",
    from: "value",
    defaultFrom: "value",
    onFromChange: "callback",
    to: "value",
    defaultTo: "value",
    onToChange: "callback",
    pageSize: "number",
    snapshotRows: "number",
    ...queryOptionKinds,
    onOpenVoucher: "callback",
    voucher: "value",
    defaultVoucher: "value",
    onVoucherChange: "callback",
    documents: "value",
    onOpenDocument: "callback",
  },
  // `entries` is left out: a ledger is too large for a snapshot. `rows` is capped.
  controlled: [
    "view",
    "account",
    "voucher",
    "voucherSummary",
    "from",
    "to",
    "rows",
    "total",
    "truncated",
    "balanced",
    "query",
    "table",
    "totals",
    "queryFormat",
  ],
  state: (options: Options) => {
    const entries = options.entries ?? [];
    const account = options.account ?? options.defaultAccount ?? null;
    const from = options.from ?? options.defaultFrom ?? null;
    const to = options.to ?? options.defaultTo ?? null;
    const voucher = options.voucher ?? options.defaultVoucher ?? null;
    const pageSize = wholeAbove(options.pageSize, DEFAULT_PAGE_SIZE);
    const query = options.query ?? freshQuery(columnsOf(viewOf(account, voucher)), pageSize, options.defaultQuery);
    return {
      entries,
      account,
      voucher,
      from,
      to,
      query,
      pageSize: query.pageSize,
      focused: null as string | null,
      // The row a person marked with Space. Enter or a press opens a row.
      selected: null as string | null,
      refusal: "",
      queryFormat: QUERY_FORMAT,
      ...derive(
        entries,
        account,
        from,
        to,
        wholeAbove(options.snapshotRows, DEFAULT_SNAPSHOT_ROWS),
        voucher,
        options.documents,
        query,
      ),
    };
  },
  sync: (options: Options) => ({
    ...(options.account === undefined ? {} : { account: options.account }),
    ...(options.voucher === undefined ? {} : { voucher: options.voucher }),
    ...(options.from === undefined ? {} : { from: options.from }),
    ...(options.to === undefined ? {} : { to: options.to }),
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
    const roving = createRovingFocus(context, { slot: "row", key: "focused" });
    const typeahead = createTypeahead();
    const cap = () => wholeAbove(context.options().snapshotRows, DEFAULT_SNAPSHOT_ROWS);
    const entries = () => context.options().entries ?? [];

    // The owner replaced the ledger or a controlled key: keep the derived keys current.
    let seenPageSize = context.options().pageSize;
    context.onOptions((options) => {
      const state = context.store.get();
      const account = options.account === undefined ? state.account : options.account;
      const from = options.from === undefined ? state.from : options.from;
      const to = options.to === undefined ? state.to : options.to;
      const voucher = options.voucher === undefined ? state.voucher : options.voucher;
      let query = options.query ?? state.query;
      if (options.query === undefined && options.pageSize !== seenPageSize) {
        query = { ...query, pageSize: wholeAbove(options.pageSize, DEFAULT_PAGE_SIZE), page: 1 };
      }
      seenPageSize = options.pageSize;
      const next = derive(options.entries ?? [], account, from, to, cap(), voucher, options.documents, query);
      context.store.set({ entries: options.entries ?? [], query, pageSize: query.pageSize, ...next });
    });

    const refresh = () => {
      const { account, from, to, voucher, query } = context.store.get();
      context.store.set({
        refusal: "",
        pageSize: query.pageSize,
        ...derive(entries(), account, from, to, cap(), voucher, context.options().documents, query),
      });
    };
    /** Queries of the views a person or agent drilled down from, so Back returns to them as they were. */
    const saved: Partial<Record<LedgerView, TableQuery>> = {};
    const fresh = (view: LedgerView) => freshQuery(columnsOf(view), context.store.get().query.pageSize);
    /** A voucher by id or by its number, as people and agents name it. */
    const findVoucher = (idOrNumber: unknown) => {
      const key = String(idOrNumber ?? "").trim();
      const entry =
        entries().find((item) => item.voucherId === key) ?? entries().find((item) => item.voucherNumber === key);
      if (!entry) {
        const numbers = [...new Set(entries().map((item) => item.voucherNumber))].slice(0, 12).join(", ");
        throw new BookiError("ledger.no-voucher", { key, numbers: numbers || "none" });
      }
      return entry;
    };
    function showVoucher(idOrNumber: unknown, event?: Event) {
      const entry = findVoucher(idOrNumber);
      const state = context.store.get();
      const leaving = viewOf(state.account, state.voucher);
      const ok = change("voucher", entry.voucherId, { reason: "show-voucher", event });
      if (ok) {
        if (leaving !== "voucher") saved[leaving] = state.query;
        reset(fresh("voucher"), "show-voucher", event);
        refresh();
      }
      return ok;
    }
    // A person who opens an account lands on Back, and Back lands on the account's row.
    let focusBack = false;
    const shown = <T>(run: () => T): T => {
      try {
        return run();
      } catch (error) {
        context.store.set({ refusal: (error as Error).message });
        throw error;
      }
    };

    function setRange(from: unknown, to: unknown, event?: Event) {
      const next = checkRange({ from: bound(from) ?? undefined, to: bound(to) ?? undefined });
      const a = change("from", next.from ?? null, { reason: "set-range", event });
      const b = change("to", next.to ?? null, { reason: "set-range", event });
      if (a || b) refresh();
      return a || b;
    }
    function openAccount(account: unknown, event?: Event) {
      const number = String(account ?? "").trim();
      const { from, to } = context.store.get();
      // Throws with the list of accounts when there is no such account.
      accountLedger(entries(), number, range(from, to));
      const before = context.store.get();
      if (before.voucher !== null) change("voucher", null, { reason: "open-account", event });
      const ok = change("account", number, { reason: "open-account", event });
      if (ok) {
        if (viewOf(before.account, before.voucher) === "trial-balance") saved["trial-balance"] = before.query;
        reset(fresh("account"), "open-account", event);
        refresh();
      }
      return ok;
    }
    function back(event?: Event) {
      if (context.store.get().voucher !== null) {
        // One step at a time: from a voucher back to the account (or the trial balance) it was opened from.
        const ok = change("voucher", null, { reason: "back", event });
        if (ok) {
          const to = viewOf(context.store.get().account, null);
          reset(saved[to] ?? fresh(to), "back", event);
          delete saved[to];
          refresh();
        }
        return ok;
      }
      const { account, from, to } = context.store.get();
      const ok = change("account", null, { reason: "back", event });
      if (!ok) return ok;
      // Return to the trial balance as it was left, on the page that holds the account just left.
      const query = saved["trial-balance"] ?? fresh("trial-balance");
      delete saved["trial-balance"];
      const order =
        account === null
          ? []
          : matchingRows(summarizeLedger(entries(), range(from, to)).rows, trialBalanceColumns, query);
      const index = order.findIndex((row) => row.account === account);
      reset(index < 0 ? query : { ...query, page: Math.floor(index / query.pageSize) + 1 }, "back", event);
      refresh();
      if (event && account !== null && index >= 0) roving.focus(account);
      return ok;
    }
    const table = queryMethods({
      columns: () => columnsOf(context.store.get().view),
      query: () => context.store.get().query,
      pageCount: () => context.store.get().table.pageCount,
      apply: (next, reason, event) => {
        // Throws on a bad query, before anything changes.
        normalizeQuery(columnsOf(context.store.get().view), next);
        const ok = change("query", next, { reason, event });
        if (ok) refresh();
        return ok;
      },
      refuse: (message) => {
        if (context.store.get().refusal !== message) context.store.set({ refusal: message });
      },
    });

    return {
      roving,
      ...table,
      /** Agent: show only this range. Dates are YYYY-MM-DD; null leaves an end open. */
      setRange: (from?: string | null, to?: string | null) => setRange(from, to),
      setRangeByPerson: (from: string | null, to: string | null, event?: Event) =>
        shown(() => setRange(from, to, event)),
      /** Agent: drill into one account's entries. */
      openAccount: (account: string) => openAccount(account),
      openAccountByPerson: (account: string, event?: Event) =>
        shown(() => {
          const ok = openAccount(account, event);
          focusBack = ok;
          return ok;
        }),
      /** The Back button takes focus when a person's press replaced the list it was in. */
      claimFocus: (el: HTMLElement) => {
        if (!focusBack) return;
        focusBack = false;
        el.focus();
      },
      /** Agent: back one step: from a voucher to its account, from an account to the trial balance. */
      back: () => back(),
      /** Agent: open a voucher by id or number and read every line of it, on every account. */
      showVoucher: (idOrNumber: string) => showVoucher(idOrNumber),
      showVoucherByPerson: (idOrNumber: string, event?: Event) => shown(() => showVoucher(idOrNumber, event)),
      /** Person: open the document behind the open voucher. The app shows it. */
      openDocument: (event?: Event) => {
        const voucher = context.store.get().voucher;
        const document = voucher === null ? undefined : context.options().documents?.[voucher];
        if (!voucher || !document) return false;
        return !dispatch(
          context,
          "onOpenDocument",
          { ...document, voucherId: voucher },
          { reason: "open-document", event },
        );
      },
      /** Person: a breadcrumb back to the trial balance or the account. */
      crumbByPerson: (to: string, event?: Event) =>
        shown(() => {
          if (to === "account") return back(event);
          // To the trial balance from a voucher: through the account it was opened from, if any.
          if (context.store.get().voucher !== null) back(event);
          if (context.store.get().account !== null) return back(event);
          refresh();
          return true;
        }),
      backByPerson: (event?: Event) => shown(() => back(event)),
      /**
       * Agent: why an account moved differently in two periods (codes such as
       * `2026-02` and `2026-03`). Returns the vouchers, largest effect first,
       * capped like the snapshot. Changes nothing.
       */
      explainVariance: (
        account: string,
        periodA: string,
        periodB: string,
      ): Variance & { total: number; truncated: boolean } => {
        const result = explainVariance(entries(), account, periodA, periodB);
        return {
          ...result,
          vouchers: result.vouchers.slice(0, cap()),
          total: result.vouchers.length,
          truncated: result.vouchers.length > cap(),
        };
      },
      /** Person: report the voucher behind an entry. The app opens it. */
      openVoucher: (entryId: string, event?: Event) => {
        const entry = entries().find((item) => item.id === String(entryId));
        if (!entry) return false;
        const canceled = dispatch(
          context,
          "onOpenVoucher",
          { voucherId: entry.voucherId, voucherNumber: entry.voucherNumber, entryId: entry.id },
          { reason: "open-voucher", event },
        );
        // The app may show the voucher itself by cancelling; otherwise drill in here.
        if (canceled) return false;
        return showVoucher(entry.voucherId, event);
      },
      keydown(event: KeyboardEvent) {
        const item = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-slot="ledger-table-row"]');
        if (!item) return;
        if (event.key === "Enter") {
          event.preventDefault();
          const key = roving.items().find((candidate) => candidate.el === item)?.key;
          if (key !== undefined) {
            try {
              this.openAccountByPerson(key, event);
            } catch {
              /* shown in the control */
            }
          }
          return;
        }
        if (event.defaultPrevented || roving.keydown(event, item) || !isTypeaheadKey(event)) return;
        const items = roving.items();
        const current = items.findIndex((candidate) => candidate.el === item);
        if (event.key === " ") {
          event.preventDefault();
          // Space marks the row, unless it is part of a name being typed.
          if (!typeahead.active()) {
            const key = items[current]?.key;
            if (key !== undefined) change("selected", key, { reason: "item-press", event });
            return;
          }
        }
        // Typing an account number moves to it.
        const index = typeahead(
          event.key,
          items.map((candidate) => labelOf(candidate.el)),
          current,
        );
        if (index !== -1) roving.focus(items[index]!.key);
      },
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({ "data-view": state.view, "data-balanced": state.balanced ? "true" : "false" }),
      state: (state) => ({
        view: state.view,
        account: state.account,
        voucher: state.voucher,
        voucherSummary: state.voucherSummary,
        from: state.from,
        to: state.to,
        page: state.page,
        pageSize: state.pageSize,
        total: state.total,
        balanced: state.balanced,
        refusal: state.refusal,
        query: state.query,
        table: state.table,
        totals: state.totals,
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
    from: slot({
      attrs: (state) => ({ type: "date", value: state.from ?? "", max: state.to ?? undefined }),
      on: {
        // "input" is the adapter's name for React's onChange.
        input: (event, { api, store }) => {
          try {
            api.setRangeByPerson((event.target as HTMLInputElement).value, store.get().to, event);
          } catch {
            /* shown in the control */
          }
        },
      },
    }),
    to: slot({
      attrs: (state) => ({ type: "date", value: state.to ?? "", min: state.from ?? undefined }),
      on: {
        input: (event, { api, store }) => {
          try {
            api.setRangeByPerson(store.get().from, (event.target as HTMLInputElement).value, event);
          } catch {
            /* shown in the control */
          }
        },
      },
    }),
    // The trial balance is a list with one Tab stop. Arrows, Home and End move; Enter opens.
    list: slot({
      role: "listbox",
      keys: ["ArrowUp", "ArrowDown", "Home", "End", "Enter", " ", "typeahead"],
      on: { keydown: (event, { api }) => api.keydown(event as KeyboardEvent) },
    }),
    // One per account. `value` is the account number and becomes the part's key.
    row: slot<{ value: string }>({
      props: { value: "string" },
      role: "option",
      focus: "roving",
      attrs: (state, part) => ({
        "aria-selected": String(state.selected === part.key),
        tabindex: part.api.roving.tabIndex(state, part),
      }),
      press: ({ api, key }, event) => {
        try {
          api.openAccountByPerson(String(key), event);
        } catch {
          /* shown in the control */
        }
      },
      bind: (el, part) => part.api.roving.bind(el, part),
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
      bind: (el, part) => part.api.claimFocus(el),
    }),
    // One per entry. `value` is the entry id.
    voucher: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button" }),
      press: ({ api, key }, event) => {
        api.openVoucher(String(key), event);
      },
    }),
    // In a voucher, each line's account opens that account. `value` is the account number.
    lineaccount: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button" }),
      press: ({ api, key }, event) => {
        try {
          api.openAccountByPerson(String(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    document: slot({
      attrs: () => ({ type: "button", "data-variant": "secondary" }),
      press: ({ api }, event) => {
        api.openDocument(event);
      },
    }),
    // Breadcrumbs. `value` is "trial-balance" or "account".
    crumb: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button" }),
      press: ({ api, key }, event) => {
        try {
          api.crumbByPerson(String(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    previous: slot({
      attrs: (state) => ({
        type: "button",
        "data-variant": "secondary",
        disabled: state.table.page <= 1 ? "" : undefined,
      }),
      press: ({ api, store }, event) => {
        try {
          api.pageByPerson(store.get().table.page - 1, event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    next: slot({
      attrs: (state) => ({
        type: "button",
        "data-variant": "secondary",
        disabled: state.table.page >= state.table.pageCount ? "" : undefined,
      }),
      press: ({ api, store }, event) => {
        try {
          api.pageByPerson(store.get().table.page + 1, event);
        } catch {
          /* shown in the control */
        }
      },
    }),
  }),
  agent: {
    actions: [
      "setRange",
      "openAccount",
      "back",
      "explainVariance",
      "showVoucher",
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
