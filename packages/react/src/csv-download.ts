import { toCsv, type TableColumn } from "@booki/core/table";

/**
 * Hand a person a CSV of the rows they see: every match, not just the page.
 * `;` for Norway, so it opens cleanly in Norwegian Excel; a BOM so Excel reads
 * UTF-8. The columns decide what is in it, so a secret never is.
 */
export function downloadCsv<Row>(name: string, rows: Row[], columns: TableColumn<Row>[], country: string, digits = 2) {
  const csv = toCsv(rows, columns, {
    delimiter: country === "NO" ? ";" : ",",
    // Major units in the currency's own decimals, with a dot: what a spreadsheet reads as a number.
    money: (minor) => (minor / 10 ** digits).toFixed(digits),
  });
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** The arrow beside a sortable header. */
export const sortMark = (direction: "asc" | "desc" | undefined) =>
  direction === "asc" ? "▲" : direction === "desc" ? "▼" : "↕";

/** `aria-sort` for a header cell. */
export function ariaSort(sort: { column: string; direction: "asc" | "desc" } | null, columnId: string) {
  if (sort?.column !== columnId) return undefined;
  return sort.direction === "asc" ? ("ascending" as const) : ("descending" as const);
}
