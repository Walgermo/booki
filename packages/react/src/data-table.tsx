import { formatMoney, minorDigitsFor, money } from "@booki/core/money";
import {
  MAX_PAGE_SIZE,
  tableView,
  toCsv,
  type ColumnKind,
  type SortDirection,
  type TableColumn,
  type TableQuery,
} from "@booki/core/table";
import { createParts } from "@ui-sdk/react/primitive";
import type { ReactNode } from "react";
import { useBookiLocaleOptional } from "./locale.js";
import { useSay } from "./say.js";
import { type AnyRow, type DataTableColumn as ColumnOf, idOf, dataTable } from "@booki/primitives/data-table";

/** A column: the shared definition from `@booki/core/table`, plus how a person sees the cell. */
export type DataTableColumn<Row> = ColumnOf<Row, ReactNode>;

const parts = createParts(dataTable, {
  root: "div",
  search: "input",
  column: "input",
  sort: "button",
  select: "input",
  selectpage: "input",
  prev: "button",
  next: "button",
  pagesize: "select",
});

const DataTableRoot = parts.Root;
const DataTableSearch = parts.Search;
const DataTableColumnToggle = parts.Column;
const DataTableSort = parts.Sort;
const DataTableSelect = parts.Select;
const DataTableSelectPage = parts.Selectpage;
const DataTablePrev = parts.Prev;
const DataTableNext = parts.Next;
const DataTablePageSize = parts.Pagesize;

const COPY = {
  EN: {
    search: "Search",
    columns: "Columns",
    exportCsv: "Download CSV",
    empty: "No rows.",
    noMatch: "No rows match.",
    loading: "Loading…",
    total: "Total",
    selectRow: "Select row",
    selectPage: "Select all on this page",
    prev: "Previous page",
    next: "Next page",
    rowsPerPage: "Rows per page",
    range: (from: number, to: number, of: number) => `${from}–${to} of ${of}`,
    selected: (n: number) => `${n} selected`,
  },
  NO: {
    search: "Søk",
    columns: "Kolonner",
    exportCsv: "Last ned CSV",
    empty: "Ingen rader.",
    noMatch: "Ingen rader passer.",
    loading: "Laster …",
    total: "Sum",
    selectRow: "Velg rad",
    selectPage: "Velg alle på siden",
    prev: "Forrige side",
    next: "Neste side",
    rowsPerPage: "Rader per side",
    range: (from: number, to: number, of: number) => `${from}–${to} av ${of}`,
    selected: (n: number) => `${n} valgt`,
  },
};

export type DataTableProps<Row extends AnyRow> = {
  rows: Row[];
  columns: DataTableColumn<Row>[];
  rowKey?: keyof Row & string;
  query?: TableQuery;
  defaultQuery?: Partial<TableQuery>;
  onQueryChange?: (query: TableQuery, details?: { reason: string; source?: string }) => void;
  selected?: string[];
  defaultSelected?: string[];
  onSelectedChange?: (selected: string[], details?: { reason: string; source?: string }) => void;
  /** Show row checkboxes. Off by default. */
  selectable?: boolean;
  loading?: boolean;
  loadError?: string;
  pageSize?: number;
  pageSizes?: number[];
  snapshotRows?: number;
  /** Currency for money columns; defaults to the locale profile's. */
  currency?: string;
  /** Shown when there are no rows at all (not when a search matches none). */
  empty?: ReactNode;
  /** Extra controls at the end of the toolbar. */
  toolbar?: ReactNode;
  /** Hide the CSV button. */
  noExport?: boolean;
  /** Hide the search box. */
  noSearch?: boolean;
  /** Filename for the CSV, without extension. */
  exportName?: string;
  className?: string;
  "aria-label": string;
};

/**
 * Composed table: toolbar (search, columns, CSV), the table with sortable
 * headers, totals, and pages. Every part is a ui-sdk part with a stable
 * `data-slot`, so it can be styled or replaced; columns carry their own `cell`.
 */
function DataTable<Row extends AnyRow>({
  rows,
  columns,
  rowKey = "id",
  query,
  defaultQuery,
  onQueryChange,
  selected,
  defaultSelected,
  onSelectedChange,
  selectable = false,
  loading,
  loadError,
  pageSize,
  pageSizes = [10, 25, 50, 100],
  snapshotRows,
  currency,
  empty,
  toolbar,
  noExport = false,
  noSearch = false,
  exportName = "table",
  className,
  "aria-label": ariaLabel,
}: DataTableProps<Row>) {
  const { country, profile } = useBookiLocaleOptional();
  const copy = COPY[country === "NO" ? "NO" : "EN"];
  const say = useSay();
  const unit = currency ?? profile.currency;
  const asAny = columns as unknown as DataTableColumn<AnyRow>[];

  const format = (kind: ColumnKind | undefined, value: unknown) => {
    if (value === null || value === undefined || value === "") return "";
    if (kind === "money") return formatMoney(money(Number(value), unit), { locale: profile.locale });
    if (kind === "number") return new Intl.NumberFormat(profile.locale).format(Number(value));
    if (kind === "date" && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      return new Intl.DateTimeFormat(profile.locale, { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
    }
    return String(value);
  };

  return (
    <DataTableRoot
      rows={rows as unknown as AnyRow[]}
      columns={asAny}
      rowKey={rowKey}
      query={query}
      defaultQuery={defaultQuery}
      onQueryChange={onQueryChange}
      selected={selected}
      defaultSelected={defaultSelected}
      onSelectedChange={onSelectedChange}
      loading={loading}
      loadError={loadError}
      pageSize={pageSize}
      snapshotRows={snapshotRows}
      className={className}
      aria-label={ariaLabel}
    >
      {(state: {
        query: TableQuery;
        view: { total: number; matching: number; page: number; pageCount: number };
        totals: Record<string, number>;
        selected: string[];
        loading: boolean;
        loadError: string;
        refusal: string;
        pageRows: AnyRow[];
        visibleColumns: string[];
      }) => {
        const visible = state.visibleColumns
          .map((id) => asAny.find((column) => column.id === id))
          .filter((column): column is DataTableColumn<AnyRow> => Boolean(column));
        const hasTotals = visible.some((column) => column.id in state.totals);
        const from = state.view.matching === 0 ? 0 : (state.view.page - 1) * state.query.pageSize + 1;
        const to = Math.min(state.view.matching, state.view.page * state.query.pageSize);
        const download = () => {
          // Every matching row, not just the page, in the visible columns.
          const everything = tableView(rows as unknown as AnyRow[], asAny, {
            ...state.query,
            page: 1,
            pageSize: MAX_PAGE_SIZE,
          });
          const all = tableView(rows as unknown as AnyRow[], asAny, {
            ...state.query,
            page: 1,
            pageSize: Math.min(MAX_PAGE_SIZE, Math.max(1, everything.matching)),
          });
          const digits = minorDigitsFor(unit);
          const csv = toCsv(all.rows, all.columns, {
            delimiter: country === "NO" ? ";" : ",",
            // Major units in the currency's own decimals, as downloadCsv writes them.
            money: (minor) => (minor / 10 ** digits).toFixed(digits),
          });
          const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
          const link = document.createElement("a");
          link.href = url;
          link.download = `${exportName}.csv`;
          link.click();
          URL.revokeObjectURL(url);
        };
        return (
          <>
            <div data-slot="data-table-toolbar">
              {noSearch ? null : (
                <label data-slot="data-table-search-label">
                  <span data-slot="visually-hidden">{copy.search}</span>
                  <DataTableSearch placeholder={copy.search} aria-label={copy.search} />
                </label>
              )}
              <details data-slot="data-table-columns">
                <summary>{copy.columns}</summary>
                <div data-slot="data-table-columns-list">
                  {asAny.map((column) => (
                    <label key={column.id}>
                      <DataTableColumnToggle value={column.id} /> {column.header}
                    </label>
                  ))}
                </div>
              </details>
              {state.selected.length > 0 ? (
                <span data-slot="data-table-selected">{copy.selected(state.selected.length)}</span>
              ) : null}
              <span data-slot="data-table-spacer" />
              {toolbar}
              {noExport ? null : (
                <button type="button" data-slot="data-table-export" onClick={download}>
                  {copy.exportCsv}
                </button>
              )}
            </div>

            <div data-slot="data-table-scroll">
              <table data-slot="data-table-table">
                <thead>
                  <tr>
                    {selectable ? (
                      <th data-slot="data-table-check">
                        <DataTableSelectPage aria-label={copy.selectPage} />
                      </th>
                    ) : null}
                    {visible.map((column) => {
                      const sorted = state.query.sort?.column === column.id ? state.query.sort.direction : undefined;
                      return (
                        <th
                          key={column.id}
                          scope="col"
                          data-kind={column.kind ?? "text"}
                          aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                        >
                          {column.sortable === false ? (
                            column.header
                          ) : (
                            <DataTableSort value={column.id}>
                              {column.header}
                              <span aria-hidden data-slot="data-table-sort-mark">
                                {sorted === "asc" ? "▲" : sorted === "desc" ? "▼" : "↕"}
                              </span>
                            </DataTableSort>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {state.loading && state.pageRows.length === 0 ? (
                    <tr data-slot="data-table-state">
                      <td colSpan={visible.length + (selectable ? 1 : 0)}>{copy.loading}</td>
                    </tr>
                  ) : state.loadError ? (
                    <tr data-slot="data-table-state" data-error="">
                      <td colSpan={visible.length + (selectable ? 1 : 0)}>
                        <span role="alert">{state.loadError}</span>
                      </td>
                    </tr>
                  ) : state.pageRows.length === 0 ? (
                    <tr data-slot="data-table-state">
                      <td colSpan={visible.length + (selectable ? 1 : 0)}>
                        {state.view.total === 0 ? (empty ?? copy.empty) : copy.noMatch}
                      </td>
                    </tr>
                  ) : (
                    state.pageRows.map((row) => {
                      const id = idOf(row, rowKey);
                      return (
                        <tr
                          key={id}
                          data-slot="data-table-row"
                          aria-selected={selectable ? state.selected.includes(id) : undefined}
                        >
                          {selectable ? (
                            <td data-slot="data-table-check">
                              <DataTableSelect value={id} aria-label={`${copy.selectRow} ${id}`} />
                            </td>
                          ) : null}
                          {visible.map((column) => (
                            <td key={column.id} data-kind={column.kind ?? "text"}>
                              {column.cell ? column.cell(row) : format(column.kind, column.value(row))}
                            </td>
                          ))}
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {hasTotals && state.view.matching > 0 ? (
                  <tfoot>
                    <tr data-slot="data-table-totals">
                      {selectable ? <td /> : null}
                      {visible.map((column, index) => (
                        <td key={column.id} data-kind={column.kind ?? "text"}>
                          {column.id in state.totals
                            ? format(column.kind, state.totals[column.id])
                            : index === 0
                              ? copy.total
                              : ""}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>

            {state.refusal ? (
              <p data-slot="data-table-error" role="alert">
                {say(state.refusal)}
              </p>
            ) : null}

            <div data-slot="data-table-pagination">
              <span data-slot="data-table-range" aria-live="polite">
                {copy.range(from, to, state.view.matching)}
              </span>
              <label data-slot="data-table-page-size">
                {copy.rowsPerPage}
                <DataTablePageSize>
                  {[...new Set([...pageSizes, state.query.pageSize])]
                    .sort((a, b) => a - b)
                    .map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                </DataTablePageSize>
              </label>
              <DataTablePrev aria-label={copy.prev}>←</DataTablePrev>
              <span data-slot="data-table-page">
                {state.view.page} / {state.view.pageCount}
              </span>
              <DataTableNext aria-label={copy.next}>→</DataTableNext>
            </div>
          </>
        );
      }}
    </DataTableRoot>
  );
}

export {
  dataTable,
  DataTable,
  DataTableRoot,
  DataTableSearch,
  DataTableColumnToggle,
  DataTableSort,
  DataTableSelect,
  DataTableSelectPage,
  DataTablePrev,
  DataTableNext,
  DataTablePageSize,
};
export type { TableQuery, TableColumn, SortDirection, ColumnKind };
