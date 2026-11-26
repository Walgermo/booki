import {
  ACCOUNT_CHANGE_FIELDS,
  STANDARD_ACCOUNT,
  accountIssues,
  applyChanges,
  chartOrder,
  chartSchemeFor,
  checkChange,
  checkClass,
  classOf,
  classRange,
  editAccount,
  rowOfNumber,
  mergeChanges,
  proposalIssues,
  type AccountChange,
  type AccountIssue,
  type AccountType,
  type ChartAccount,
  type ChartScheme,
  type ProposedChange,
} from "@booki-aui/core/chart-of-accounts";
import { BookiError } from "@booki-aui/core/msg";
import { matchingRows, normalizeQuery, tableView, type TableColumn, type TableQuery } from "@booki-aui/core/table";
import { createChange, definePrimitive } from "@ui-sdk/core";
import { refuseDenied } from "./access.js";
import { QUERY_FORMAT, buttonKey, checkFields, recordOf, textOf } from "./fields.js";
import { personOnly } from "./person-only.js";
import { freshQuery, queryMethods, queryOptionKinds, type QueryOptions, type TablePaging } from "./table-query.js";

export { buttonKey } from "./fields.js";

export type Details = { reason: string; source?: string; cancel?: () => void };

/** A VAT code an account may carry, when the app gives a closed list. */
export type ChartTaxCode = { code: string; label?: string };
/** A standard account (Norway: SAF-T) an account may map to, when the app gives the list. */
export type StandardAccount = { number: string; name?: string };

export type Options = QueryOptions & {
  accounts?: ChartAccount[];
  defaultAccounts?: ChartAccount[];
  onAccountsChange?: (accounts: ChartAccount[], details: Details) => void;
  /** The changes an agent proposed and a person has yet to commit. */
  proposal?: ProposedChange[] | null;
  defaultProposal?: ProposedChange[] | null;
  onProposalChange?: (proposal: ProposedChange[] | null, details: Details) => void;
  /** Picks the classes and rules: NS 4102 for "NO", the common ranges for "US", by type elsewhere. */
  country?: string;
  /** Classes and rules of your own, in place of the country's. */
  scheme?: ChartScheme;
  /** When given, a VAT code must be one of these. */
  taxCodes?: ChartTaxCode[];
  /** When given, a standard account must be one of these. */
  standardAccounts?: StandardAccount[];
  /** Person's methods their role does not allow, with the reason. Filled by `BookiAccessProvider`. */
  denied?: Record<string, string>;
  /** Most rows an agent's snapshot carries. Defaults to 50. */
  snapshotRows?: number;
  /** Rows a person sees per page. Defaults to 100. */
  pageSize?: number;
};

/** How to propose, shown in the snapshot before the first try. */
export const PROPOSE_FORMAT =
  'propose({ number: "6420", name: "Software", type: "expense", standardAccount: "6420" }) or a list; number names the account';

const PROPOSE_EXAMPLE = '{ "number": "6420", "name": "Software", "type": "expense" }';

/** The filters the control applies itself, exactly: a class id, and "active" or "inactive". */
export const CLASS_FILTER = "class";
export const STATUS_FILTER = "status";

export const DEFAULT_SNAPSHOT_ROWS = 50;
export const DEFAULT_PAGE_SIZE = 100;

/** The fields a person edits in a row. Number and type change only through a proposal. */
export const EDITABLE = ["name", "vatCode", "standardAccount"] as const;
export type EditableField = (typeof EDITABLE)[number];

/**
 * One account as the agent and the list read it: `class` is the class it is
 * grouped under, `row` its place in the chart. A duplicated number is two
 * rows, so a person's edit or status press names the row, not the number.
 */
export type ChartRow = Omit<ChartAccount, "class"> & { class: string | null; row: number };

/** A class with how many accounts it holds. */
export type ChartClassSummary = {
  id: string;
  name: string;
  range: string;
  types: readonly AccountType[];
  count: number;
};

/** The columns of the chart: the same for the screen, the agent's query and the CSV. */
export const chartColumns: TableColumn<ChartAccount>[] = [
  { id: "number", header: "Number", value: (account) => account.number },
  { id: "name", header: "Name", value: (account) => account.name },
  { id: "type", header: "Type", filterable: false, value: (account) => account.type },
  { id: "vatCode", header: "VAT code", filterable: false, value: (account) => account.vatCode ?? "" },
  {
    id: "standardAccount",
    header: "Standard account",
    filterable: false,
    value: (account) => account.standardAccount ?? "",
  },
  {
    id: "active",
    header: "Status",
    filterable: false,
    value: (account) => (account.active ? "active" : "inactive"),
  },
];

const wholeAbove = (value: number | undefined, fallback: number) =>
  Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : fallback;

export const schemeOf = (options: Options) => options.scheme ?? chartSchemeFor(options.country);

/** "active", "inactive", or the refusal. */
export function checkStatus(value: unknown): string {
  const text = String(value ?? "").trim();
  if (text !== "active" && text !== "inactive") throw new BookiError("chart.bad-status", { value: text });
  return text;
}

const withoutExtras = (query: TableQuery): TableQuery => {
  const { [CLASS_FILTER]: _class, [STATUS_FILTER]: _status, ...filters } = query.filters;
  return { ...query, filters };
};

/** The query, if it fits the columns and the scheme. One left over from another chart does not. */
function fits(scheme: ChartScheme, query: TableQuery | undefined): TableQuery | undefined {
  if (!query) return undefined;
  try {
    normalizeQuery(chartColumns, withoutExtras(query));
    const cls = query.filters[CLASS_FILTER];
    if (cls) checkClass(scheme, cls);
    const status = query.filters[STATUS_FILTER];
    if (status) checkStatus(status);
    return query;
  } catch {
    return undefined;
  }
}

/** Every account the query matches, in chart order (or the query's sort), before paging: what a CSV holds. */
export function matchingAccounts(scheme: ChartScheme, accounts: readonly ChartAccount[], query: TableQuery) {
  const fitted = fits(scheme, query) ?? freshQuery(chartColumns, query.pageSize);
  const cls = fitted.filters[CLASS_FILTER];
  const status = fitted.filters[STATUS_FILTER];
  const kept = chartOrder(scheme, accounts).filter(
    (account) =>
      (!cls || classOf(scheme, account)?.id === cls) && (!status || (status === "active") === Boolean(account.active)),
  );
  return { kept, query: withoutExtras(fitted) };
}

export const rowOf = (scheme: ChartScheme, account: ChartAccount, row: number): ChartRow => ({
  ...account,
  class: classOf(scheme, account)?.id ?? null,
  row,
});

/** Each account's place in the chart, by identity: filters and sorts keep the objects. */
const placesOf = (accounts: readonly ChartAccount[]) => new Map(accounts.map((account, index) => [account, index]));

/** Everything derived from the accounts, the query and the proposal. */
export function derive(
  options: Options,
  accounts: ChartAccount[],
  query: TableQuery,
  proposal: ProposedChange[] | null,
) {
  const scheme = schemeOf(options);
  const cap = wholeAbove(options.snapshotRows, DEFAULT_SNAPSHOT_ROWS);
  const { kept, query: plain } = matchingAccounts(scheme, accounts, query);
  const shown = tableView(kept, chartColumns, plain);
  const issues = accountIssues(scheme, accounts);
  const pending = proposal ?? [];
  const proposed = pending.length ? proposalIssues(scheme, accounts, pending) : [];
  const counts = new Map<string, number>();
  for (const account of accounts) {
    const id = classOf(scheme, account)?.id;
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const places = placesOf(accounts);
  const page = shown.rows.map((account) => rowOf(scheme, account, places.get(account) ?? -1));
  return {
    scheme: { id: scheme.id, requiresStandard: scheme.requiresStandard, digits: scheme.digits },
    classes: scheme.classes.map(
      (cls): ChartClassSummary => ({
        id: cls.id,
        name: cls.names.en,
        range: classRange(cls),
        types: cls.types,
        count: counts.get(cls.id) ?? 0,
      }),
    ),
    rows: page.slice(0, cap),
    total: accounts.length,
    // The snapshot holds fewer rows than match: page on, narrow the query, or find(text).
    truncated: Math.min(page.length, cap) < shown.matching,
    view: { total: kept.length, matching: shown.matching, page: shown.page, pageCount: shown.pageCount } as TablePaging,
    issues: issues.slice(0, cap),
    issueCount: issues.length,
    proposalIssues: proposed,
    // Errors stop a person from committing; warnings (a missing SAF-T mapping) do not.
    proposalBlocked: proposed.some((issue) => issue.level === "error"),
    // For the composed control's own render; not in the agent's snapshot.
    pageRows: page,
    allIssues: issues,
  };
}

/**
 * The chart of accounts: every account under its class (NS 4102 classes 1–8
 * in Norway, the common ranges in the US), with search, a class and a status
 * filter, sort, pages and CSV like a DataTable, and what is wrong with each
 * account (a duplicate number, a number outside its class, a type its class
 * does not hold, a missing SAF-T mapping on Norway).
 *
 * An agent may `find`, `filterClass`, set an account's VAT code
 * (`setVatCode`) and SAF-T standard account (`mapStandard`), and `propose`
 * new accounts and edits, which wait on screen. Committing a proposal and
 * activating or deactivating an account are a person's buttons. Number and
 * type are fixed once an account has postings (`locked`).
 */
export const chartOfAccounts = definePrimitive({
  name: "chart-of-accounts",
  options: {
    accounts: "value",
    defaultAccounts: "value",
    onAccountsChange: "callback",
    proposal: "value",
    defaultProposal: "value",
    onProposalChange: "callback",
    country: "string",
    scheme: "value",
    taxCodes: "value",
    standardAccounts: "value",
    denied: "value",
    snapshotRows: "number",
    pageSize: "number",
    ...queryOptionKinds,
  },
  controlled: [
    "scheme",
    "classes",
    "rows",
    "total",
    "truncated",
    "issues",
    "issueCount",
    "proposal",
    "proposalIssues",
    "proposalBlocked",
    "query",
    "view",
    "queryFormat",
    "proposeFormat",
  ],
  state: (options: Options) => {
    const accounts = options.accounts ?? options.defaultAccounts ?? [];
    const proposal = options.proposal ?? options.defaultProposal ?? null;
    const query =
      options.query ?? freshQuery(chartColumns, wholeAbove(options.pageSize, DEFAULT_PAGE_SIZE), options.defaultQuery);
    return {
      accounts,
      proposal,
      query,
      refusal: "",
      drafts: {} as Record<string, string>,
      collapsed: [] as string[],
      queryFormat: QUERY_FORMAT,
      proposeFormat: PROPOSE_FORMAT,
      ...derive(options, accounts, query, proposal),
    };
  },
  sync: (options: Options) => ({
    ...(options.accounts === undefined ? {} : { accounts: options.accounts }),
    ...(options.proposal === undefined ? {} : { proposal: options.proposal }),
    ...(options.query === undefined ? {} : { query: options.query }),
  }),
  api: (context) => {
    const change = createChange(context);
    const refresh = () => {
      const options = context.options();
      const state = context.store.get();
      context.store.set(
        derive(
          options,
          options.accounts ?? state.accounts,
          options.query ?? state.query,
          options.proposal === undefined ? state.proposal : options.proposal,
        ),
      );
    };
    context.onOptions(() => refresh());

    const shown = <T>(run: () => T): T => {
      try {
        const out = run();
        if (context.store.get().refusal !== "") context.store.set({ refusal: "" });
        return out;
      } catch (error) {
        context.store.set({ refusal: (error as Error).message });
        throw error;
      }
    };
    /** A person's button their role does not allow is refused before it runs. */
    const gated = <T>(method: string, run: () => T): T =>
      shown(() => {
        refuseDenied(context.options(), method);
        return run();
      });
    const scheme = () => schemeOf(context.options());
    const accounts = () => context.store.get().accounts;

    const commitAccounts = (next: ChartAccount[], reason: string, event?: Event) => {
      const ok = change("accounts", next, { reason, event });
      if (ok) refresh();
      return ok;
    };
    const setProposalValue = (next: ProposedChange[] | null, reason: string, event?: Event) => {
      const ok = change("proposal", next && next.length ? next : null, { reason, event });
      if (ok) refresh();
      return ok;
    };

    function vatCodeOf(raw: unknown, action: string): string {
      const code = textOf(raw, action).trim();
      const list = context.options().taxCodes ?? [];
      if (code !== "" && list.length > 0 && !list.some((item) => item.code === code)) {
        throw new BookiError("chart.unknown-vat-code", { code, codes: list.map((item) => item.code).join(", ") });
      }
      return code;
    }
    function standardOf(raw: unknown, action: string): string {
      const value = textOf(raw, action).trim();
      if (value === "") return value;
      if (!STANDARD_ACCOUNT.test(value)) throw new BookiError("chart.standard-format", { value });
      const list = context.options().standardAccounts ?? [];
      if (list.length > 0 && !list.some((item) => item.number === value)) {
        const shared = (other: string) => (other.startsWith(value.slice(0, 2)) ? 0 : 1);
        const closest = [...list]
          .sort((a, b) => shared(a.number) - shared(b.number))
          .slice(0, 30)
          .map((item) => item.number);
        throw new BookiError("chart.unknown-standard", { value, values: closest.join(", ") });
      }
      return value;
    }

    /** A person's row: its place in the chart. */
    const rowAt = (raw: unknown) => {
      const at = Number(raw);
      const account = accounts()[at];
      if (!Number.isInteger(at) || !account) {
        throw new BookiError("chart.no-row", { row: String(raw), rows: accounts().length });
      }
      return at;
    };
    function setVatCodeAt(at: number, code: unknown, event?: Event) {
      const account = accounts()[at]!;
      const value = vatCodeOf(code, "setVatCode");
      if ((account.vatCode ?? "") === value) return false;
      return commitAccounts(editAccount(accounts(), at, { vatCode: value }), "set-vat-code", event);
    }
    function mapStandardAt(at: number, standard: unknown, event?: Event) {
      const account = accounts()[at]!;
      const value = standardOf(standard, "mapStandard");
      if ((account.standardAccount ?? "") === value) return false;
      return commitAccounts(editAccount(accounts(), at, { standardAccount: value }), "map-standard", event);
    }
    function renameAt(at: number, name: unknown, event?: Event) {
      const account = accounts()[at]!;
      const value = textOf(name, "rename").trim();
      if (value === "") throw new BookiError("chart.name-empty", { number: account.number });
      if (account.name === value) return false;
      return commitAccounts(editAccount(accounts(), at, { name: value }), "rename-account", event);
    }

    /** Check changes one by one against the chart and what is already proposed. */
    function checked(input: unknown, action: string, base: ProposedChange[]): ProposedChange[] {
      const items = Array.isArray(input) ? input : [input];
      if (items.length === 0) throw new BookiError("chart.nothing-proposed", { example: PROPOSE_EXAMPLE });
      let pending = base;
      const out: ProposedChange[] = [];
      for (const raw of items) {
        // A proposal read back from history or staging carries the `kind` it was checked with: worked out again here.
        const item =
          raw !== null && typeof raw === "object" && !Array.isArray(raw) && "kind" in raw
            ? (({ kind: _kind, ...rest }) => rest)(raw as Record<string, unknown>)
            : raw;
        const fields = checkFields(action, item, ACCOUNT_CHANGE_FIELDS, PROPOSE_EXAMPLE);
        if (fields.vatCode !== undefined) vatCodeOf(fields.vatCode, action);
        if (fields.standardAccount !== undefined) standardOf(fields.standardAccount, action);
        const next = checkChange(scheme(), accounts(), fields as AccountChange, pending);
        out.push(next);
        pending = mergeChanges(pending, [next]);
      }
      return out;
    }

    function applyQuery(next: TableQuery, reason: string, event?: Event) {
      normalizeQuery(chartColumns, withoutExtras(next));
      const ok = change("query", next, { reason, event });
      if (ok) refresh();
      return ok;
    }

    const table = queryMethods({
      columns: () => chartColumns as TableColumn<never>[],
      extraFilters: {
        [CLASS_FILTER]: (text) => checkClass(scheme(), text).id,
        [STATUS_FILTER]: (text) => checkStatus(text),
      },
      query: () => context.store.get().query,
      pageCount: () => context.store.get().view.pageCount,
      apply: (next, reason, event) => applyQuery(next, reason, event),
      refuse: (message) => {
        if (context.store.get().refusal !== message) context.store.set({ refusal: message });
      },
    });

    /** The draft key of one cell: "<row>#name". */
    const cellOf = (key: string) => {
      const at = key.lastIndexOf("#");
      return { row: key.slice(0, at), field: key.slice(at + 1) as EditableField };
    };
    function editCell(key: string, text: string, event?: Event) {
      const { row, field } = cellOf(key);
      const at = rowAt(row);
      if (field === "name") return renameAt(at, text, event);
      if (field === "vatCode") return setVatCodeAt(at, text, event);
      if (field === "standardAccount") return mapStandardAt(at, text, event);
      return false;
    }

    return {
      /**
       * Agent: search the chart by number or name ("" clears it). Returns how
       * many match and the first ten, so one call answers "is there an account for…".
       */
      find: (text: string) => {
        const search = textOf(text, "find");
        table.setSearch(search);
        const state = context.store.get();
        const query = { ...(context.options().query ?? state.query), search, page: 1 };
        const { kept, query: plain } = matchingAccounts(scheme(), accounts(), query);
        // Every match, before paging: no page size of its own, so a chart of any size is searched.
        const matches = matchingRows(kept, chartColumns, plain);
        const places = placesOf(accounts());
        return {
          matching: matches.length,
          accounts: matches.slice(0, 10).map((account) => rowOf(scheme(), account, places.get(account) ?? -1)),
        };
      },
      /** Agent: show one class only, by its id (`classes` in the snapshot). "" shows every class. */
      filterClass: (classId: string) => table.setFilter(CLASS_FILTER, textOf(classId, "filterClass")),
      /**
       * Agent: propose new accounts or edits, one object or a list. They wait on
       * screen for a person to commit; nothing in the chart changes yet.
       * Returns how many accounts the proposal touches and what is wrong with them.
       */
      propose: (changes: AccountChange | AccountChange[]) => {
        const before = context.store.get().proposal ?? [];
        const next = mergeChanges(before, checked(changes, "propose", before));
        const ok = setProposalValue(next, "propose");
        const issues = proposalIssues(scheme(), accounts(), next).map((issue) => issue.message);
        return ok ? { proposed: next.length, issues } : false;
      },
      /** Agent: replace the whole proposal (null clears it). What staging and undo call. */
      setProposal: (changes: AccountChange[] | null) => {
        const next =
          changes === null || (Array.isArray(changes) && changes.length === 0)
            ? null
            : checked(changes, "setProposal", []);
        return setProposalValue(next, "set-proposal");
      },
      /** Agent: the account's default VAT code. "" clears it. */
      setVatCode: (number: string, code: string) =>
        setVatCodeAt(rowOfNumber(accounts(), textOf(number, "setVatCode")), code),
      /** Agent: the SAF-T standard account an account maps to, 2 or 4 digits. "" clears it. */
      mapStandard: (number: string, standardAccount: string) =>
        mapStandardAt(rowOfNumber(accounts(), textOf(number, "mapStandard")), standardAccount),

      // Everything below is for a person. It is not in `agent.actions`, so the
      // bridge refuses a step that names it.
      filterClassByPerson: (classId: string, event?: Event) =>
        shown(() => table.filterByPerson(CLASS_FILTER, classId, event)),
      statusByPerson: (status: string, event?: Event) =>
        shown(() => table.filterByPerson(STATUS_FILTER, status, event)),
      /** Person: the order of the list, "<column>:asc", "<column>:desc", or "" for chart order. */
      orderByPerson: (value: string, event?: Event) =>
        shown(() => {
          const text = String(value ?? "");
          if (text === "") return applyQuery({ ...context.store.get().query, sort: null }, "clear-sort", event);
          const [column = "", direction = "asc"] = text.split(":");
          if (direction !== "asc" && direction !== "desc") {
            throw new BookiError("table.bad-direction", { direction });
          }
          return applyQuery({ ...context.store.get().query, sort: { column, direction }, page: 1 }, "set-sort", event);
        }),
      /** Person only. Puts the proposal into the chart. Refused while it has errors. */
      commit: (event?: Event) =>
        gated("commit", () => {
          const { proposal } = context.store.get();
          if (!proposal || proposal.length === 0) throw new BookiError("chart.no-proposal");
          // The chart may have changed since it was proposed: check it again, in order.
          checked(proposal, "commit", []);
          const errors = proposalIssues(scheme(), accounts(), proposal).filter((issue) => issue.level === "error");
          if (errors.length > 0) {
            throw new BookiError("chart.proposal-blocked", { issues: errors.map((issue) => issue.message) });
          }
          const ok = commitAccounts(applyChanges(accounts(), proposal), "commit-plan", event);
          if (ok) setProposalValue(null, "commit-plan", event);
          return ok;
        }),
      /** Person only. Drops the proposal. */
      discard: (event?: Event) => shown(() => setProposalValue(null, "discard-proposal", event)),
      /** Person only. Activate an inactive account or deactivate an active one. */
      toggleActive: (row: number | string, event?: Event) =>
        gated("toggleActive", () => {
          const at = rowAt(row);
          const account = accounts()[at]!;
          return commitAccounts(
            editAccount(accounts(), at, { active: !account.active }),
            account.active ? "deactivate-account" : "activate-account",
            event,
          );
        }),
      /** Person: collapse or open a class's heading. A view of the person's own, not reported. */
      toggleClass: (classId: string) => {
        const { collapsed } = context.store.get();
        const id = String(classId);
        context.store.set({
          collapsed: collapsed.includes(id) ? collapsed.filter((item) => item !== id) : [...collapsed, id],
        });
      },
      /** Hold what a person types in a cell, "<row>#name". */
      setDraft: (key: string, text: string) => {
        context.store.set({ drafts: { ...context.store.get().drafts, [key]: String(text ?? "") } });
      },
      /** Commit a typed cell. A refused value is shown and the cell keeps the text to fix. */
      commitCell: (key: string, event?: Event) => {
        const { drafts } = context.store.get();
        if (!(key in drafts)) return false;
        const text = drafts[key] ?? "";
        const ok = shown(() => editCell(key, text, event));
        const { [key]: _done, ...rest } = context.store.get().drafts;
        context.store.set({ drafts: rest });
        return ok;
      },
      /** A person picked a VAT code from the list. */
      pickVatCode: (row: number | string, code: string, event?: Event) =>
        shown(() => setVatCodeAt(rowAt(row), code, event)),
      // Sort, search, filter and pages, like every list control (`@booki-aui/core/table`).
      ...table,
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({ "data-proposal": state.proposal ? "" : undefined }),
      state: (state) => ({
        accounts: state.accounts,
        proposal: state.proposal,
        proposalIssues: state.proposalIssues,
        proposalBlocked: state.proposalBlocked,
        query: state.query,
        view: state.view,
        classes: state.classes,
        scheme: state.scheme,
        pageRows: state.pageRows,
        allIssues: state.allIssues,
        collapsed: state.collapsed,
        drafts: state.drafts,
        refusal: state.refusal,
        total: state.total,
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
    // The class to show: "" for every class, or a class id. (A part named "group" would name the whole control.)
    classes: slot({
      attrs: (state) => ({ value: state.query.filters[CLASS_FILTER] ?? "" }),
      on: {
        input: (event, { api }) => {
          try {
            api.filterClassByPerson((event.target as HTMLSelectElement).value, event);
          } catch {
            /* shown in the control */
          }
        },
      },
    }),
    // The order of the list: "<column>:asc", "<column>:desc", or "" for chart order. The card
    // layout has no header row, so its sort is this select.
    order: slot({
      attrs: (state) => ({ value: state.query.sort ? `${state.query.sort.column}:${state.query.sort.direction}` : "" }),
      on: {
        input: (event, { api }) => {
          try {
            api.orderByPerson((event.target as HTMLSelectElement).value, event);
          } catch {
            /* shown in the control */
          }
        },
      },
    }),
    // Active, inactive, or "" for both.
    status: slot({
      attrs: (state) => ({ value: state.query.filters[STATUS_FILTER] ?? "" }),
      on: {
        input: (event, { api }) => {
          try {
            api.statusByPerson((event.target as HTMLSelectElement).value, event);
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
    // A class heading that folds its accounts away. `value` is the class id.
    heading: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        type: "button",
        "aria-expanded": state.collapsed.includes(String(part.key)) ? "false" : "true",
      }),
      press: ({ api, key }) => api.toggleClass(String(key)),
    }),
    // A cell a person edits: `value` is "<row>#name", "<row>#vatCode" or "<row>#standardAccount".
    cell: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => {
        const key = String(part.key);
        const at = key.lastIndexOf("#");
        const field = key.slice(at + 1) as EditableField;
        const account = state.accounts[Number(key.slice(0, at))];
        return {
          type: "text",
          autoComplete: "off",
          spellCheck: field === "name" ? undefined : "false",
          value: key in state.drafts ? (state.drafts[key] ?? "") : String(account?.[field] ?? ""),
        };
      },
      on: {
        input: (event, { api, key }) => {
          api.setDraft(String(key), (event.target as HTMLInputElement).value);
        },
        blur: (event, { api, key }) => {
          try {
            api.commitCell(String(key), event);
          } catch {
            /* shown in the control */
          }
        },
        keydown: (event, { api, key }) => {
          if ((event as KeyboardEvent).key !== "Enter") return;
          event.preventDefault();
          try {
            api.commitCell(String(key), event);
          } catch {
            /* shown in the control */
          }
        },
      },
    }),
    // A VAT code picked from the app's list. `value` is the row.
    vat: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        value: state.accounts[Number(part.key)]?.vatCode ?? "",
      }),
      on: {
        input: (event, { api, key }) => {
          try {
            api.pickVatCode(String(key), (event.target as HTMLSelectElement).value, event);
          } catch {
            /* shown in the control */
          }
        },
      },
    }),
    // Activate or deactivate one account: a person's decision. `value` is its `buttonKey`, "<row>#active".
    active: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => {
        const account = state.accounts[Number(recordOf(part.key))];
        return {
          type: "button",
          "data-variant": "secondary",
          "aria-pressed": account?.active ? "true" : "false",
          "data-agent-confirm": personOnly("Activating or deactivating an account needs a person"),
        };
      },
      press: ({ api, key }, event) => {
        try {
          api.toggleActive(recordOf(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    // The component's own decision: `data-person-only` names it when an agent presses it.
    commit: slot({
      attrs: (state) => ({
        type: "button",
        disabled: state.proposalBlocked ? "" : undefined,
        "data-person-only": personOnly("Committing a change to the chart of accounts needs a person"),
      }),
      press: ({ api }, event) => {
        try {
          api.commit(event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    discard: slot({
      attrs: () => ({ type: "button", "data-variant": "secondary" }),
      press: ({ api }, event) => {
        try {
          api.discard(event);
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
  }),
  agent: {
    actions: [
      "find",
      "filterClass",
      "propose",
      "setProposal",
      "setVatCode",
      "mapStandard",
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

/** The key of one row's activate button, "3#active": a row is its place in the chart. */
export const activeKey = (row: number) => buttonKey(String(row), "active");
/** The key of one editable cell, "3#name". */
export const cellKey = (row: number, field: EditableField) => `${row}#${field}`;

export type { AccountChange, AccountIssue, AccountType, ChartAccount, ChartScheme, ProposedChange };
