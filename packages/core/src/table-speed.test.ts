import { describe, expect, it } from "vitest";
import { collator, dateTimeFormat, numberFormat } from "./intl.js";
import { defaultQuery, tableView, type TableColumn } from "./table.js";

/** The search fold before it was made fast, to check the fast one gives the same. */
const slowFold = (value: string) => value.toLocaleLowerCase("nb-NO").normalize("NFKD").replace(/[̀-ͯ]/g, "");

describe("the faster table gives the same view", () => {
  const words = [
    "Ærø",
    "aero",
    "Café",
    "CAFE",
    "Øl",
    "ol",
    "Straße",
    "strasse",
    "İstanbul",
    "a10",
    "a9",
    "",
    "ﬁne",
    "Å",
  ];
  type Row = { id: string; name: string };
  const rows: Row[] = words.flatMap((name, i) => [
    { id: `${i}a`, name },
    { id: `${i}b`, name: name.toUpperCase() },
  ]);
  const columns: TableColumn<Row>[] = [{ id: "name", header: "Name", value: (row) => row.name }];

  it("searches as the full fold did, for ASCII and other text", () => {
    for (const needle of [...words, "e", "Ø", "STR", "ﬁ"]) {
      const view = tableView(rows, columns, { ...defaultQuery(columns, 500), search: needle });
      const expected = rows.filter((row) => slowFold(row.name).includes(slowFold(needle.trim())));
      expect(
        view.rows.map((row) => row.id),
        needle,
      ).toEqual(expected.map((row) => row.id));
    }
  });

  it("sorts as localeCompare with the same options did", () => {
    for (const direction of ["asc", "desc"] as const) {
      const view = tableView(rows, columns, { ...defaultQuery(columns, 500), sort: { column: "name", direction } });
      const sign = direction === "asc" ? 1 : -1;
      const expected = rows
        .map((row, index) => ({ row, index }))
        .sort((a, b) => {
          const emptyA = a.row.name === "";
          const emptyB = b.row.name === "";
          if (emptyA !== emptyB) return emptyA ? 1 : -1;
          return (
            sign * a.row.name.localeCompare(b.row.name, "nb-NO", { numeric: true, sensitivity: "base" }) ||
            a.index - b.index
          );
        });
      expect(view.rows.map((row) => row.id)).toEqual(expected.map((item) => item.row.id));
    }
  });

  it("shares one formatter per locale and options, and formats as a new one does", () => {
    expect(numberFormat("nb-NO", { style: "currency", currency: "NOK" })).toBe(
      numberFormat("nb-NO", { style: "currency", currency: "NOK" }),
    );
    expect(numberFormat("nb-NO", { style: "currency", currency: "NOK" }).format(1234.5)).toBe(
      new Intl.NumberFormat("nb-NO", { style: "currency", currency: "NOK" }).format(1234.5),
    );
    expect(dateTimeFormat("en-US", { timeZone: "UTC" }).format(0)).toBe(
      new Intl.DateTimeFormat("en-US", { timeZone: "UTC" }).format(0),
    );
    expect(collator("nb-NO").compare("a", "b")).toBe(new Intl.Collator("nb-NO").compare("a", "b"));
    expect(() => numberFormat("not a locale!")).toThrow(RangeError);
  });
});
