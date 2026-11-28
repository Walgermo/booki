import { collator } from "./intl.js";
import { sumMinorUnits } from "./money.js";
import { BookiError, isBookiError } from "./msg.js";

/**
 * The view logic every Booki table shares: sort, search, filter per column,
 * pages, hidden columns, totals and CSV. Pure functions over plain rows, so a
 * table control, a server or a test can compute the same view.
 */

export type ColumnKind = "text" | "money" | "number" | "date";
export type SortDirection = "asc" | "desc";
export type TableSort = { column: string; direction: SortDirection } | null;

export type TableColumn<Row> = {
  id: string;
  header: string;
  /** How values compare, align and format. Money and number are summed in totals. */
  kind?: ColumnKind;
  /** The value of this cell: minor units for money, YYYY-MM-DD for dates. */
  value: (row: Row) => string | number | null | undefined;
  /** Defaults to true. */
  sortable?: boolean;
  /** Search and column filters read this column. Defaults to true. */
  filterable?: boolean;
  /** Hidden until someone shows it. */
  hidden?: boolean;
  /** Sum this column in the totals. Defaults to true for money. */
  total?: boolean;
};

export type TableQuery = {
  sort: TableSort;
  /** Free text, matched against every visible filterable column. */
  search: string;
  /** Text per column id, matched against that column only. */
  filters: Record<string, string>;
  /** 1-based. */
  page: number;
  pageSize: number;
  /** Ids of hidden columns. */
  hidden: string[];
};

export const MAX_PAGE_SIZE = 500;

export function defaultQuery<Row>(columns: TableColumn<Row>[], pageSize = 25): TableQuery {
  return {
    sort: null,
    search: "",
    filters: {},
    page: 1,
    pageSize,
    hidden: columns.filter((column) => column.hidden).map((column) => column.id),
  };
}

export type TableView<Row> = {
  /** The rows on the current page, in order. */
  rows: Row[];
  /** Rows before search and filters. */
  total: number;
  /** Rows after search and filters, before paging. */
  matching: number;
  page: number;
  pageCount: number;
  /** Sums over every matching row (not just the page), per summed column. A hidden money total outside the safe range is omitted. */
  totals: Record<string, number>;
  /** Visible columns, in order. */
  columns: TableColumn<Row>[];
};

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));

// Search folds case and accents: "CAFÉ" finds "café" and "cafe".
// Plain ASCII folds to its lower case, the same as the full fold gives, and
// other text is folded once and kept, so a search over thousands of rows does
// not normalise every cell again on every keystroke.
// Printable ASCII; anything else (tabs too) takes the full fold, which gives the same.
const ASCII = /^[ -~]*$/;
const folded = new Map<string, string>();
const fold = (value: string): string => {
  if (ASCII.test(value)) return value.toLowerCase();
  let out = folded.get(value);
  if (out === undefined) {
    if (folded.size >= 50_000) folded.clear();
    out = value.toLocaleLowerCase("nb-NO").normalize("NFKD").replace(/[̀-ͯ]/g, "");
    folded.set(value, out);
  }
  return out;
};

// One collator, the same one `localeCompare(b, "nb-NO", { numeric, sensitivity })` makes on every call.
let textOrder: Intl.Collator | undefined;
const order = () => (textOrder ??= collator("nb-NO", { numeric: true, sensitivity: "base" }));

function columnOf<Row>(columns: TableColumn<Row>[], id: string): TableColumn<Row> {
  const found = columns.find((column) => column.id === id);
  if (!found) {
    throw new BookiError("table.unknown-column", { column: String(id), columns: columns.map((c) => c.id).join(", ") });
  }
  return found;
}

function compare(kind: ColumnKind | undefined, a: unknown, b: unknown): number {
  const emptyA = a === null || a === undefined || a === "";
  const emptyB = b === null || b === undefined || b === "";
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1; // empty last, both ways
  if (kind === "money" || kind === "number") return Number(a) - Number(b);
  return order().compare(String(a), String(b));
}

/** Check a query against the columns and clamp what can be clamped. Throws on what cannot. */
export function normalizeQuery<Row>(columns: TableColumn<Row>[], query: TableQuery): TableQuery {
  if (query.sort) {
    const column = columnOf(columns, query.sort.column);
    if (column.sortable === false) throw new BookiError("table.not-sortable", { column: column.id });
    if (query.sort.direction !== "asc" && query.sort.direction !== "desc") {
      throw new BookiError("table.bad-direction", { direction: String(query.sort.direction) });
    }
  }
  for (const id of Object.keys(query.filters)) columnOf(columns, id);
  for (const id of query.hidden) columnOf(columns, id);
  if (!Number.isInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > MAX_PAGE_SIZE) {
    throw new BookiError("table.bad-page-size", { size: String(query.pageSize), max: MAX_PAGE_SIZE });
  }
  return query;
}

/**
 * Every row the query's search and filters match, in its sort order, before
 * paging. What a CSV of "everything I see" or a total over every match reads.
 */
export function matchingRows<Row>(rows: Row[], columns: TableColumn<Row>[], query: TableQuery): Row[] {
  normalizeQuery(columns, query);
  const visible = columns.filter((column) => !query.hidden.includes(column.id));
  const searchable = visible.filter((column) => column.filterable !== false);
  const needle = fold(query.search.trim());
  const filters = Object.entries(query.filters)
    .map(([id, value]) => [columnOf(columns, id), fold(value.trim())] as const)
    .filter(([, value]) => value !== "");

  let out = rows.filter((row) => {
    if (needle && !searchable.some((column) => fold(text(column.value(row))).includes(needle))) return false;
    return filters.every(([column, value]) => fold(text(column.value(row))).includes(value));
  });

  if (query.sort) {
    const column = columnOf(columns, query.sort.column);
    const sign = query.sort.direction === "asc" ? 1 : -1;
    // Stable: equal values keep their original order.
    // Each row's value is read once, not twice per comparison.
    out = out
      .map((row, index) => ({ row, index, value: column.value(row) }))
      .sort((a, b) => {
        const va = a.value;
        const vb = b.value;
        const emptyA = va === null || va === undefined || va === "";
        const emptyB = vb === null || vb === undefined || vb === "";
        if (emptyA !== emptyB) return emptyA ? 1 : -1;
        return sign * compare(column.kind, va, vb) || a.index - b.index;
      })
      .map((item) => item.row);
  }
  return out;
}

/** The rows a query shows, with counts and totals. Pages past the end show the last page. */
export function tableView<Row>(
  rows: Row[],
  columns: TableColumn<Row>[],
  query: TableQuery,
  { requireHiddenTotals = false } = {},
): TableView<Row> {
  const out = matchingRows(rows, columns, query);
  const visible = columns.filter((column) => !query.hidden.includes(column.id));

  const totals: Record<string, number> = {};
  for (const column of columns) {
    const summed = column.total ?? column.kind === "money";
    if (!summed) continue;
    const value = (row: Row) => Number(column.value(row)) || 0;
    try {
      totals[column.id] =
        column.kind === "money" ? sumMinorUnits(out, value) : out.reduce((sum, row) => sum + value(row), 0);
    } catch (error) {
      // Keep representable hidden totals in the public result. A hidden overflow need not block the visible page.
      if (
        requireHiddenTotals ||
        !query.hidden.includes(column.id) ||
        !isBookiError(error) ||
        error.code !== "money.not-safe-integer"
      )
        throw error;
    }
  }

  const pageCount = Math.max(1, Math.ceil(out.length / query.pageSize));
  const page = Math.min(Math.max(1, Math.trunc(query.page) || 1), pageCount);
  const start = (page - 1) * query.pageSize;
  return {
    rows: out.slice(start, start + query.pageSize),
    total: rows.length,
    matching: out.length,
    page,
    pageCount,
    totals,
    columns: visible,
  };
}

/** A page number a table can move to, or the reason it cannot. */
export function assertPage(page: number, pageCount: number): number {
  if (!Number.isInteger(page) || page < 1 || page > pageCount) {
    throw new BookiError("table.bad-page", { page: String(page), pages: pageCount });
  }
  return page;
}

export type CsvOptions = {
  /** "," by default; ";" opens cleanly in Norwegian Excel. */
  delimiter?: "," | ";" | "\t";
  /** Formats a money cell; defaults to major units with a dot ("1234.50"). */
  money?: (minor: number) => string;
  /** Decimals of the currency for the default money format. Default 2; 0 for JPY. */
  digits?: number;
};

/** A text cell a spreadsheet would run as a formula. */
const FORMULA = /^[=+\-@\t\r]/;

/** RFC 4180 CSV of the given rows and columns, header first. */
export function toCsv<Row>(rows: Row[], columns: TableColumn<Row>[], options: CsvOptions = {}): string {
  const delimiter = options.delimiter ?? ",";
  const digits = options.digits ?? 2;
  // Exact: no division in floating point, so large amounts keep their øre.
  const money =
    options.money ??
    ((minor: number) => {
      const abs = String(Math.abs(Math.trunc(minor))).padStart(digits + 1, "0");
      const text = digits ? `${abs.slice(0, -digits)}.${abs.slice(-digits)}` : abs;
      return minor < 0 ? `-${text}` : text;
    });
  const quote = (value: string) =>
    /["\r\n]/.test(value) || value.includes(delimiter) ? `"${value.replace(/"/g, '""')}"` : value;
  // Text that starts like a formula is written as text (a leading '), so opening
  // the file in a spreadsheet never runs it. Numbers and amounts stay numbers.
  const cell = (value: string, text = true) => quote(text && FORMULA.test(value) ? `'${value}` : value);
  const lines = [columns.map((column) => cell(column.header)).join(delimiter)];
  for (const row of rows) {
    lines.push(
      columns
        .map((column) => {
          const value = column.value(row);
          if (value === null || value === undefined) return "";
          if (column.kind === "money") return cell(money(Number(value)), false);
          if (column.kind === "number" && typeof value === "number") return cell(String(value), false);
          return cell(String(value));
        })
        .join(delimiter),
    );
  }
  return lines.join("\r\n");
}
