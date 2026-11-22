import { mount } from "@ui-sdk/core/testing";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createBookiAgent } from "./booki-agent.js";
import { DataTable, dataTable, type DataTableColumn } from "./data-table.js";
import { BookiLocaleProvider } from "./locale.js";

afterEach(() => cleanup());

type Invoice = { id: string; customer: string; due: string; amountMinor: number };
const invoices: Invoice[] = Array.from({ length: 30 }, (_, i) => ({
  id: `INV-${String(i + 1).padStart(3, "0")}`,
  customer: ["Brattli AS", "Havblikk Hotell", "Nordlys Eiendom"][i % 3]!,
  due: `2026-${String((i % 9) + 1).padStart(2, "0")}-15`,
  amountMinor: (i + 1) * 10_000,
}));
const columns: DataTableColumn<Invoice>[] = [
  { id: "id", header: "Invoice", value: (r) => r.id },
  { id: "customer", header: "Customer", value: (r) => r.customer },
  { id: "due", header: "Due", kind: "date", value: (r) => r.due },
  { id: "amount", header: "Amount", kind: "money", value: (r) => r.amountMinor },
];

type Result = { ok: boolean; error?: { message: string } };

function setup(props: Partial<Parameters<typeof DataTable<Invoice>>[0]> = {}, country: "US" | "NO" = "US") {
  const agent = createBookiAgent({ agentId: "test" });
  render(
    <BookiLocaleProvider defaultCountry={country}>
      <DataTable rows={invoices} columns={columns} pageSize={10} selectable aria-label="Invoices" {...props} />
    </BookiLocaleProvider>,
  );
  const entry = () => agent.snapshot().find((c) => c.component === "data-table") as unknown as Record<string, any>;
  const act = (action: string, args: unknown[] = []) =>
    agent.act({ steps: [{ ref: "Invoices", action, args }] }) as Promise<Result>;
  const bodyIds = () =>
    [...document.querySelectorAll('[data-slot="data-table-row"] td:nth-child(2)')].map((td) => td.textContent);
  return { entry, act, bodyIds };
}

describe("DataTable", () => {
  it("gives the agent the page, the counts, totals over every match, and its actions", () => {
    const { entry } = setup();
    const e = entry();
    expect(e.actions).toEqual([
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
    ]);
    expect(e.view).toEqual({ total: 30, matching: 30, page: 1, pageCount: 3 });
    expect(e.rows).toHaveLength(10);
    expect(e.rows[0]).toEqual({ id: "INV-001", customer: "Brattli AS", due: "2026-01-15", amount: 10_000 });
    expect(e.totals).toEqual({ amount: 4_650_000 });
    expect(e.columns.map((c: { id: string }) => c.id)).toEqual(["id", "customer", "due", "amount"]);
  });

  it("lets an agent sort, search, filter, page and pick columns, and the screen follows", async () => {
    const { entry, act, bodyIds } = setup();
    expect((await act("setSort", ["amount", "desc"])).ok).toBe(true);
    expect(entry().rows[0].id).toBe("INV-030");
    expect(document.querySelector('th[aria-sort="descending"]')?.textContent).toMatch(/Amount/);

    expect((await act("setSearch", ["havblikk"])).ok).toBe(true);
    expect(entry().view.matching).toBe(10);
    expect(entry().totals.amount).toBe([2, 5, 8, 11, 14, 17, 20, 23, 26, 29].reduce((n, i) => n + i * 10_000, 0));

    expect((await act("setFilter", ["due", "2026-02"])).ok).toBe(true);
    expect(entry().rows.map((r: { id: string }) => r.id)).toEqual(["INV-029", "INV-020", "INV-011", "INV-002"]);

    expect((await act("clearFilters")).ok).toBe(true);
    expect((await act("setPage", [3])).ok).toBe(true);
    expect(entry().view.page).toBe(3);
    expect((await act("hideColumns", [["customer"]])).ok).toBe(true);
    expect(entry().rows[0]).not.toHaveProperty("customer");
    expect(bodyIds()[0]).not.toMatch(/Brattli|Havblikk|Nordlys/);
  });

  it("refuses unknown columns and pages with a sentence that names what exists", async () => {
    const { act } = setup();
    expect((await act("setSort", ["total"])).error?.message).toMatch(
      /No column "total". Columns: id, customer, due, amount/,
    );
    expect((await act("setPage", [9])).error?.message).toMatch(/Page 9 does not exist. There are 3 pages/);
    expect((await act("selectRows", [["INV-999"]])).error?.message).toMatch(/No row "INV-999"/);
  });

  it("lets a person sort by the header (asc, desc, off), page, and select rows", () => {
    const { entry } = setup();
    const sort = () =>
      document.querySelector<HTMLButtonElement>(
        '[data-slot="data-table-sort"][data-key="amount"], th:nth-child(5) button',
      )!;
    fireEvent.click(sort());
    expect(entry().query.sort).toEqual({ column: "amount", direction: "asc" });
    fireEvent.click(sort());
    expect(entry().query.sort).toEqual({ column: "amount", direction: "desc" });
    fireEvent.click(sort());
    expect(entry().query.sort).toBeNull();

    fireEvent.click(document.querySelector('[data-slot="data-table-next"]')!);
    expect(entry().view.page).toBe(2);
    fireEvent.click(document.querySelector('[data-slot="data-table-selectpage"]')!);
    expect(entry().selected).toHaveLength(10);
  });

  it("shows empty, no-match, loading and error states, and the person's language", () => {
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <DataTable rows={[] as Invoice[]} columns={columns} aria-label="Tom" />
        <DataTable rows={invoices} columns={columns} loading aria-label="Laster" />
        <DataTable rows={[] as Invoice[]} columns={columns} loadError="Kunne ikke hente fakturaer." aria-label="Feil" />
      </BookiLocaleProvider>,
    );
    const states = [...document.querySelectorAll('[data-slot="data-table-state"]')].map((el) => el.textContent);
    expect(states).toEqual(["Ingen rader.", "Kunne ikke hente fakturaer."]);
    expect(document.querySelector('[aria-label="Laster"]')?.getAttribute("aria-busy")).toBe("true");
  });

  it("reports a person's click as the source (ui-sdk mount)", async () => {
    const view = mount(
      dataTable,
      { rows: invoices as unknown as Record<string, unknown>[], columns: columns as never, pageSize: 10 },
      `<root><sort value="amount">Amount</sort><next>Next</next></root>`,
    );
    try {
      await view.click(view.part("sort", "amount")!);
      expect(view.changes.at(-1)).toMatchObject({ key: "query", reason: "set-sort", source: "mouse" });
      await view.click(view.part("next")!);
      expect(view.state.view.page).toBe(2);
    } finally {
      view.unmount();
    }
  });
});
