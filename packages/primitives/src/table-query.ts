import { BookiError } from "@booki/core/msg";
import { MAX_PAGE_SIZE, defaultQuery, type SortDirection, type TableColumn, type TableQuery } from "@booki/core/table";

/**
 * The table behaviour Booki's list controls share with `DataTable`: one
 * `query` (sort, search, filters, page, page size) checked against the columns
 * of the list on screen, the agent's actions that change it, and a person's
 * versions of them that take the DOM event. Each control keeps its own rows,
 * totals and drill-downs; this only moves the query.
 */

export type QueryDetails = { reason: string; source?: string; cancel?: () => void };

/** Options every list control with a query takes. */
export type QueryOptions = {
  /** The query of the list on screen, when the app owns it. */
  query?: TableQuery;
  defaultQuery?: Partial<TableQuery>;
  onQueryChange?: (query: TableQuery, details: QueryDetails) => void;
};

export const queryOptionKinds = { query: "value", defaultQuery: "value", onQueryChange: "callback" } as const;

/** Counts of the list on screen: rows before search and filters, after them, and the pages. */
export type TablePaging = { total: number; matching: number; page: number; pageCount: number };

/** A fresh query for a list: no sort, search or filters, page 1. */
export function freshQuery<Row>(
  columns: TableColumn<Row>[],
  pageSize: number,
  defaults?: Partial<TableQuery>,
): TableQuery {
  const base = defaultQuery(columns, pageSize);
  return { ...base, ...defaults, filters: { ...defaults?.filters } };
}

export function columnOf<Row>(columns: TableColumn<Row>[], id: unknown): TableColumn<Row> {
  const found = columns.find((column) => column.id === String(id));
  if (!found) {
    throw new BookiError("table.unknown-column", { column: String(id), columns: columns.map((c) => c.id).join(", ") });
  }
  return found;
}

export type QueryHost = {
  /** Columns of the list on screen. */
  columns: () => TableColumn<never>[];
  /** Filter ids the control handles itself (such as an aging bucket), with the check of a value. */
  extraFilters?: Record<string, (text: string) => string>;
  query: () => TableQuery;
  pageCount: () => number;
  /** Check the next query against the rows (throws when it is wrong), report it, and show it. */
  apply: (next: TableQuery, reason: string, event?: Event) => boolean;
  /** Show a person why their input was refused, or clear it. */
  refuse: (message: string) => void;
};

/** The agent's table actions and a person's versions, for one list control. */
export function queryMethods(host: QueryHost) {
  const column = (id: unknown) => {
    if (host.extraFilters && Object.hasOwn(host.extraFilters, String(id))) return { id: String(id), sortable: false };
    return columnOf(host.columns() as TableColumn<unknown>[], id);
  };
  const patch = (change: Partial<TableQuery>, reason: string, event?: Event) =>
    host.apply({ ...host.query(), ...change }, reason, event);
  const shown = <T>(run: () => T): T => {
    try {
      const out = run();
      host.refuse("");
      return out;
    } catch (error) {
      host.refuse((error as Error).message);
      throw error;
    }
  };
  const sort = (columnId: unknown, direction: SortDirection, event?: Event) => {
    const found = column(columnId);
    if (direction !== "asc" && direction !== "desc")
      throw new BookiError("table.bad-direction", { direction: String(direction) });
    if (found.sortable === false) throw new BookiError("table.not-sortable", { column: found.id });
    return patch({ sort: { column: found.id, direction }, page: 1 }, "set-sort", event);
  };
  const filter = (columnId: unknown, text: unknown, event?: Event) => {
    const id = column(columnId).id;
    const { [id]: _drop, ...rest } = host.query().filters;
    let value = String(text ?? "");
    const check = host.extraFilters?.[id];
    if (check && value !== "") value = check(value);
    return patch({ filters: value === "" ? rest : { ...rest, [id]: value }, page: 1 }, "set-filter", event);
  };
  const page = (to: unknown, event?: Event) => {
    const pages = host.pageCount();
    if (!Number.isInteger(to) || (to as number) < 1 || (to as number) > pages) {
      throw new BookiError("table.bad-page", { page: String(to), pages });
    }
    return patch({ page: to as number }, "set-page", event);
  };
  const size = (value: unknown, event?: Event) => {
    if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > MAX_PAGE_SIZE) {
      throw new BookiError("table.bad-page-size", { size: String(value), max: MAX_PAGE_SIZE });
    }
    return patch({ pageSize: value as number, page: 1 }, "set-page-size", event);
  };

  return {
    /** Agent: sort the list on screen by a column. Direction defaults to "asc". */
    setSort: (columnId: string, direction: SortDirection = "asc") => sort(columnId, direction),
    clearSort: () => patch({ sort: null }, "clear-sort"),
    /** Agent: free-text search over the list's text columns. "" clears it. */
    setSearch: (text: string) => patch({ search: String(text ?? ""), page: 1 }, "set-search"),
    /** Agent: filter one column by text. "" clears that filter. */
    setFilter: (columnId: string, text: string) => filter(columnId, text),
    clearFilters: () => patch({ filters: {}, search: "", page: 1 }, "clear-filters"),
    /** Agent: go to a page, 1-based. */
    setPage: (to: number) => page(to),
    setPageSize: (value: number) => size(value),

    // A person's versions take the DOM event, so the change reports its real source.
    sortByPerson: (columnId: string, event?: Event) =>
      shown(() => {
        const current = host.query().sort;
        // asc → desc → off, like DataTable.
        if (current?.column === columnId && current.direction === "desc")
          return patch({ sort: null }, "clear-sort", event);
        return sort(columnId, current?.column === columnId ? "desc" : "asc", event);
      }),
    searchByPerson: (text: string, event?: Event) =>
      shown(() => patch({ search: String(text ?? ""), page: 1 }, "set-search", event)),
    filterByPerson: (columnId: string, text: string, event?: Event) => shown(() => filter(columnId, text, event)),
    pageByPerson: (to: number, event?: Event) =>
      shown(() => patch({ page: Math.min(Math.max(1, Math.trunc(to) || 1), host.pageCount()) }, "set-page", event)),
  };
}
