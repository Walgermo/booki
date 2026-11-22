import { BookiError } from "@booki/core/msg";
import {
  defaultQuery as baseQuery,
  MAX_PAGE_SIZE,
  tableView,
  type SortDirection,
  type TableColumn,
  type TableQuery,
} from "@booki/core/table";
import { createChange, definePrimitive } from "@ui-sdk/core";
import { QUERY_FORMAT } from "./fields.js";

/** Ids as the agent sends them: a list of strings or numbers, nothing else. */
function idList(ids: unknown): string[] {
  if (ids === undefined || ids === null) return [];
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" && typeof id !== "number")) {
    throw new BookiError("table.ids-not-list", { got: Array.isArray(ids) ? "a list with other values" : typeof ids });
  }
  return ids.map(String);
}

/**
 * A column: the shared definition from `@booki/core/table`, plus how a person
 * sees the cell. `Cell` is what the framework renders (React: `ReactNode`).
 */
export type DataTableColumn<Row, Cell = unknown> = TableColumn<Row> & {
  /** Replace the cell's content. The agent still reads `value`. */
  cell?: (row: Row) => Cell;
};

export type AnyRow = Record<string, unknown>;

export type Options = {
  rows?: AnyRow[];
  columns?: DataTableColumn<AnyRow>[];
  /** The property that identifies a row. Defaults to "id". */
  rowKey?: string;
  query?: TableQuery;
  defaultQuery?: Partial<TableQuery>;
  onQueryChange?: (query: TableQuery, details?: { reason: string; source?: string }) => void;
  selected?: string[];
  defaultSelected?: string[];
  onSelectedChange?: (selected: string[], details?: { reason: string; source?: string }) => void;
  /** Rows load somewhere else; the table shows it and the agent reads it. */
  loading?: boolean;
  /** A message when rows could not be loaded. */
  loadError?: string;
  pageSize?: number;
  /** Most rows the agent's snapshot carries. Defaults to the page size. */
  snapshotRows?: number;
};

export const idOf = (row: AnyRow, key: string) => String(row[key] ?? "");

export function initialQuery(options: Options): TableQuery {
  const columns = options.columns ?? [];
  const base = baseQuery(columns, options.pageSize ?? 25);
  return options.query ?? { ...base, ...options.defaultQuery, filters: { ...options.defaultQuery?.filters } };
}

/** Everything derived from rows, columns and the query: the page, counts, totals and the agent's rows. */
export function derive(options: Options, query: TableQuery) {
  const columns = options.columns ?? [];
  const key = options.rowKey ?? "id";
  const view = tableView(options.rows ?? [], columns, query);
  const cap = Math.max(1, options.snapshotRows ?? query.pageSize);
  return {
    pageRows: view.rows,
    visibleColumns: view.columns.map((column) => column.id),
    view: { total: view.total, matching: view.matching, page: view.page, pageCount: view.pageCount },
    totals: view.totals,
    // What the agent reads: the current page as plain records, capped.
    rows: view.rows.slice(0, cap).map((row) => {
      const record: Record<string, unknown> = { id: idOf(row, key) };
      for (const column of view.columns) record[column.id] = column.value(row) ?? null;
      return record;
    }),
    columns: columns.map((column) => ({
      id: column.id,
      header: column.header,
      kind: column.kind ?? "text",
      // A money column's values are minor units, whatever the app named the column.
      ...(column.kind === "money" ? { unit: "minor" as const } : {}),
      sortable: column.sortable !== false,
      hidden: query.hidden.includes(column.id),
    })),
  };
}

/**
 * A table with the features people expect, for people and agents alike:
 * sort, search, filter per column, pages, hidden columns, row selection,
 * totals, CSV, and empty, loading and error states. Columns are data, so a
 * table grows by adding a column, never by forking the control. The agent's
 * snapshot carries the current page and the counts, never the whole data set.
 */
export const dataTable = definePrimitive({
  name: "data-table",
  options: {
    rows: "value",
    columns: "value",
    rowKey: "string",
    query: "value",
    defaultQuery: "value",
    onQueryChange: "callback",
    selected: "value",
    defaultSelected: "value",
    onSelectedChange: "callback",
    loading: "boolean",
    loadError: "string",
    pageSize: "number",
    snapshotRows: "number",
  },
  controlled: ["query", "view", "columns", "rows", "totals", "selected", "loading", "loadError", "queryFormat"],
  state: (options: Options) => {
    const query = initialQuery(options);
    return {
      query,
      selected: options.selected ?? options.defaultSelected ?? [],
      loading: Boolean(options.loading),
      loadError: options.loadError ?? "",
      refusal: "",
      // Read before the first try: what setSort and setFilter take, and that pages count from 1.
      queryFormat: QUERY_FORMAT,
      ...derive(options, query),
    };
  },
  sync: (options: Options) => ({
    ...(options.query === undefined ? {} : { query: options.query, ...derive(options, options.query) }),
    ...(options.selected === undefined ? {} : { selected: options.selected }),
    loading: Boolean(options.loading),
    loadError: options.loadError ?? "",
  }),
  api: (context) => {
    const change = createChange(context);
    const columns = () => context.options().columns ?? [];
    const key = () => context.options().rowKey ?? "id";

    context.onOptions((options) => {
      context.store.set(derive(options, context.store.get().query));
    });

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

    /** Apply a new query: checked against the columns first, so a bad one changes nothing. */
    const query = (patch: Partial<TableQuery>, reason: string, event?: Event) => {
      const next: TableQuery = { ...context.store.get().query, ...patch };
      const derived = derive(context.options(), next); // throws on a bad query
      const ok = change("query", next, { reason, event });
      // A controlled query is the owner's to accept: sync derives once it comes back.
      if (ok && context.options().query === undefined) context.store.set(derived);
      return ok;
    };
    const column = (id: string) => {
      const found = columns().find((item) => item.id === String(id));
      if (!found) {
        throw new BookiError("table.unknown-column", {
          column: String(id),
          columns: columns()
            .map((c) => c.id)
            .join(", "),
        });
      }
      return found;
    };
    const rowIds = () => new Set((context.options().rows ?? []).map((row) => idOf(row, key())));

    const api = {
      /** Agent: sort by a column. Direction defaults to "asc". */
      setSort: (columnId: string, direction: SortDirection = "asc") => {
        const id = column(columnId).id;
        if (direction !== "asc" && direction !== "desc") {
          throw new BookiError("table.bad-direction", { direction: String(direction) });
        }
        return query({ sort: { column: id, direction }, page: 1 }, "set-sort");
      },
      clearSort: () => query({ sort: null }, "clear-sort"),
      /** Agent: free-text search over the visible columns. "" clears it. */
      setSearch: (text: string) => query({ search: String(text ?? ""), page: 1 }, "set-search"),
      /** Agent: filter one column by text. "" clears that filter. */
      setFilter: (columnId: string, text: string) => {
        const id = column(columnId).id;
        const { [id]: _drop, ...rest } = context.store.get().query.filters;
        const value = String(text ?? "");
        return query({ filters: value === "" ? rest : { ...rest, [id]: value }, page: 1 }, "set-filter");
      },
      clearFilters: () => query({ filters: {}, search: "", page: 1 }, "clear-filters"),
      /** Agent: go to a page, 1-based. */
      setPage: (page: number) => {
        const { pageCount } = context.store.get().view;
        if (!Number.isInteger(page) || page < 1 || page > pageCount) {
          throw new BookiError("table.bad-page", { page: String(page), pages: pageCount });
        }
        return query({ page }, "set-page");
      },
      setPageSize: (size: number) => {
        if (!Number.isInteger(size) || size < 1 || size > MAX_PAGE_SIZE) {
          throw new BookiError("table.bad-page-size", { size: String(size), max: MAX_PAGE_SIZE });
        }
        return query({ pageSize: size, page: 1 }, "set-page-size");
      },
      showColumns: (ids: string[]) => {
        const show = new Set(idList(ids).map((id) => column(id).id));
        return query({ hidden: context.store.get().query.hidden.filter((id) => !show.has(id)) }, "show-columns");
      },
      hideColumns: (ids: string[]) => {
        const hide = idList(ids).map((id) => column(id).id);
        return query({ hidden: [...new Set([...context.store.get().query.hidden, ...hide])] }, "hide-columns");
      },
      /** Agent: select rows by id, replacing the selection. */
      selectRows: (ids: string[], event?: Event) => {
        const known = rowIds();
        const list = idList(ids).map(String);
        const unknown = list.find((id) => !known.has(id));
        if (unknown !== undefined) {
          const page = context.store.get().rows.map((row) => String(row.id));
          throw new BookiError("table.unknown-row-listed", { id: unknown, rows: page.join(", ") || "none" });
        }
        return change("selected", [...new Set(list)], { reason: "select-rows", event });
      },
      clearSelection: (event?: Event) => change("selected", [], { reason: "clear-selection", event }),

      // A person's versions take the DOM event, so the change reports its real source.
      sortByPerson: (columnId: string, event?: Event) =>
        shown(() => {
          const current = context.store.get().query.sort;
          // asc → desc → off, like most tables.
          if (current?.column === columnId && current.direction === "desc") {
            return query({ sort: null }, "clear-sort", event);
          }
          const direction: SortDirection = current?.column === columnId ? "desc" : "asc";
          return query({ sort: { column: column(columnId).id, direction }, page: 1 }, "set-sort", event);
        }),
      searchByPerson: (text: string, event?: Event) =>
        shown(() => query({ search: text, page: 1 }, "set-search", event)),
      pageByPerson: (page: number, event?: Event) =>
        shown(() => {
          const { pageCount } = context.store.get().view;
          return query({ page: Math.min(Math.max(1, page), pageCount) }, "set-page", event);
        }),
      pageSizeByPerson: (size: number, event?: Event) =>
        shown(() => query({ pageSize: size, page: 1 }, "set-page-size", event)),
      toggleColumnByPerson: (columnId: string, event?: Event) =>
        shown(() => {
          const hidden = context.store.get().query.hidden;
          const id = column(columnId).id;
          return query(
            { hidden: hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id] },
            "toggle-column",
            event,
          );
        }),
      toggleRowByPerson: (rowId: string, event?: Event) => {
        const selected = context.store.get().selected;
        const next = selected.includes(rowId) ? selected.filter((id) => id !== rowId) : [...selected, rowId];
        return change("selected", next, { reason: "toggle-row", event });
      },
      /** Selects every row on the page, or clears them when all are selected. */
      togglePageByPerson: (event?: Event) => {
        const { pageRows, selected } = context.store.get();
        const ids = pageRows.map((row) => idOf(row, key()));
        const all = ids.length > 0 && ids.every((id) => selected.includes(id));
        const next = all ? selected.filter((id) => !ids.includes(id)) : [...new Set([...selected, ...ids])];
        return change("selected", next, { reason: "toggle-page", event });
      },
    };
    return api;
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({
        "aria-busy": state.loading ? "true" : undefined,
        "data-loading": state.loading ? "" : undefined,
        "data-empty": state.view.matching === 0 ? "" : undefined,
      }),
      state: (state) => ({
        query: state.query,
        view: state.view,
        columns: state.columns,
        rows: state.rows,
        totals: state.totals,
        selected: state.selected,
        loading: state.loading,
        loadError: state.loadError,
        refusal: state.refusal,
        // For the composed table's own render; not part of the agent's snapshot.
        pageRows: state.pageRows,
        visibleColumns: state.visibleColumns,
      }),
    }),
    search: slot({
      attrs: (state) => ({ type: "search", value: state.query.search, autoComplete: "off" }),
      on: {
        // "input" is the adapter's name for React's onChange.
        input: (event, { api }) => {
          try {
            api.searchByPerson((event.target as HTMLInputElement).value, event);
          } catch {
            /* shown in the control */
          }
        },
      },
    }),
    // One checkbox per column in the column picker. `value` is the column id.
    column: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        type: "checkbox",
        checked: state.query.hidden.includes(String(part.key)) ? undefined : "",
      }),
      on: {
        input: (event, { api, key }) => {
          try {
            api.toggleColumnByPerson(String(key), event);
          } catch {
            /* shown in the control */
          }
        },
      },
    }),
    // The sort button inside a header cell. `value` is the column id.
    sort: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => {
        const sort = state.query.sort;
        return {
          type: "button",
          "data-sorted": sort?.column === part.key ? sort.direction : undefined,
        };
      },
      press: ({ api, key }, event) => {
        try {
          api.sortByPerson(String(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    // One checkbox per row. `value` is the row id.
    select: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        type: "checkbox",
        checked: state.selected.includes(String(part.key)) ? "" : undefined,
      }),
      on: {
        input: (event, { api, key }) => {
          api.toggleRowByPerson(String(key), event);
        },
      },
    }),
    selectpage: slot({
      attrs: (state) => {
        const ids = state.rows.map((row) => String(row.id));
        const all = ids.length > 0 && ids.every((id) => state.selected.includes(id));
        return { type: "checkbox", checked: all ? "" : undefined };
      },
      on: { input: (event, { api }) => api.togglePageByPerson(event) },
    }),
    prev: slot({
      attrs: (state) => ({ type: "button", disabled: state.view.page <= 1 ? "" : undefined }),
      press: ({ api, store }, event) => {
        try {
          api.pageByPerson(store.get().view.page - 1, event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    next: slot({
      attrs: (state) => ({ type: "button", disabled: state.view.page >= state.view.pageCount ? "" : undefined }),
      press: ({ api, store }, event) => {
        try {
          api.pageByPerson(store.get().view.page + 1, event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    pagesize: slot({
      attrs: (state) => ({ value: String(state.query.pageSize) }),
      on: {
        input: (event, { api }) => {
          try {
            api.pageSizeByPerson(Number((event.target as HTMLSelectElement).value), event);
          } catch {
            /* shown */
          }
        },
      },
    }),
  }),
  agent: {
    actions: [
      "setSort",
      "clearSort",
      "setSearch",
      "setFilter",
      "clearFilters",
      "setPage",
      "setPageSize",
      "showColumns",
      "hideColumns",
      "selectRows",
      "clearSelection",
    ],
  },
});
