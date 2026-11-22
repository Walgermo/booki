import { describe, expect, it } from "vitest";
import { localize } from "./messages.js";
import { defaultQuery, matchingRows, tableView, toCsv, type TableColumn } from "./table.js";

type Row = { id: string; name: string; due: string; amount: number | null };
const rows: Row[] = [
  { id: "a", name: "Brattli AS", due: "2026-11-02", amount: 125_000 },
  { id: "b", name: "Havblikk Hotell", due: "2026-10-15", amount: 9_900 },
  { id: "c", name: "Ærlig Øl", due: "2026-12-01", amount: null },
  { id: "d", name: "brattli eiendom", due: "2026-10-15", amount: 50_000 },
];
const columns: TableColumn<Row>[] = [
  { id: "name", header: "Name", value: (r) => r.name },
  { id: "due", header: "Due", kind: "date", value: (r) => r.due },
  { id: "amount", header: "Amount", kind: "money", value: (r) => r.amount },
  { id: "id", header: "Id", value: (r) => r.id, hidden: true, sortable: false },
];

describe("tableView", () => {
  it("starts with hidden columns hidden and every row on one page", () => {
    const view = tableView(rows, columns, defaultQuery(columns));
    expect(view.columns.map((c) => c.id)).toEqual(["name", "due", "amount"]);
    expect(view.matching).toBe(4);
    expect(view.totals).toEqual({ amount: 184_900 });
  });

  it("sorts by kind, keeps ties in order and puts empty values last both ways", () => {
    const q = defaultQuery(columns);
    const asc = tableView(rows, columns, { ...q, sort: { column: "amount", direction: "asc" } });
    expect(asc.rows.map((r) => r.id)).toEqual(["b", "d", "a", "c"]);
    const desc = tableView(rows, columns, { ...q, sort: { column: "amount", direction: "desc" } });
    expect(desc.rows.map((r) => r.id)).toEqual(["a", "d", "b", "c"]);
    const byDate = tableView(rows, columns, { ...q, sort: { column: "due", direction: "asc" } });
    expect(byDate.rows.map((r) => r.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("searches case- and accent-insensitively and filters per column; totals follow the filter", () => {
    const q = defaultQuery(columns);
    expect(tableView(rows, columns, { ...q, search: "BRATTLI" }).rows.map((r) => r.id)).toEqual(["a", "d"]);
    expect(tableView(rows, columns, { ...q, search: "aerlig" }).matching).toBe(0);
    expect(tableView(rows, columns, { ...q, search: "ærlig" }).matching).toBe(1);
    const filtered = tableView(rows, columns, { ...q, filters: { due: "2026-10" } });
    expect(filtered.rows.map((r) => r.id)).toEqual(["b", "d"]);
    expect(filtered.totals.amount).toBe(59_900);
  });

  it("pages, and clamps a page past the end to the last page", () => {
    const q = { ...defaultQuery(columns), pageSize: 3 };
    expect(tableView(rows, columns, q).pageCount).toBe(2);
    const last = tableView(rows, columns, { ...q, page: 9 });
    expect(last.page).toBe(2);
    expect(last.rows).toHaveLength(1);
  });

  it("refuses unknown columns, unsortable columns and bad page sizes, in both languages", () => {
    const q = defaultQuery(columns);
    expect(() => tableView(rows, columns, { ...q, sort: { column: "nope", direction: "asc" } })).toThrow(
      /No column "nope". Columns: name, due, amount, id/,
    );
    expect(() => tableView(rows, columns, { ...q, sort: { column: "id", direction: "asc" } })).toThrow(
      /cannot be sorted/,
    );
    try {
      tableView(rows, columns, { ...q, pageSize: 0 });
    } catch (error) {
      expect(localize(error, "nb")).toMatch(/sidestørrelse/);
    }
  });
});

describe("matchingRows", () => {
  it("is every match in order, past any page size, and checks the query like tableView", () => {
    const q = {
      ...defaultQuery(columns, 1),
      search: "brattli",
      sort: { column: "amount", direction: "desc" as const },
    };
    expect(matchingRows(rows, columns, q).map((r) => r.id)).toEqual(["a", "d"]);
    expect(tableView(rows, columns, q).rows.map((r) => r.id)).toEqual(["a"]);
    expect(() => matchingRows(rows, columns, { ...q, sort: { column: "nope", direction: "asc" } })).toThrow(
      /No column "nope"/,
    );
  });
});

describe("toCsv", () => {
  it("quotes what needs quoting and formats money", () => {
    const csv = toCsv([{ id: "x", name: 'Say "hi", AS', due: "2026-01-01", amount: 12_345 }], columns.slice(0, 3), {
      delimiter: ";",
    });
    expect(csv).toBe('Name;Due;Amount\r\n"Say ""hi"", AS";2026-01-01;123.45');
  });
});
