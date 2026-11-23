import type { OpenItem } from "@booki/core/aging";
import type { LedgerEntry } from "@booki/core/ledger";
import type { PaymentBatch as Batch } from "@booki/core/payment-batch";
import type { SupplierInvoice } from "@booki/core/supplier-invoice";
import { mount } from "@ui-sdk/core/testing";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgedBalances, agedBalances } from "./aged-balances.js";
import { createBookiAgent } from "./booki-agent.js";
import { LedgerTable, ledgerTable } from "./ledger-table.js";
import { BookiLocaleProvider } from "./locale.js";
import { PaymentBatch, paymentBatch } from "./payment-batch.js";
import { SupplierInvoiceInbox, supplierInvoiceInbox } from "./supplier-invoice-inbox.js";

/**
 * The four older list controls behave like DataTable: an agent sorts,
 * searches, filters and pages them through the bridge, a person through
 * sortable headers, a search box, pages and a CSV, and totals cover every
 * match. Their own drill-downs, totals and secrets stay as they were.
 */

type Result = { ok: boolean; error?: { message: string } } & Record<string, any>;

let csv: Blob[] = [];
beforeEach(() => {
  csv = [];
  // jsdom has no object URLs and no navigation: catch the file instead.
  URL.createObjectURL = vi.fn((blob: Blob) => {
    csv.push(blob);
    return "blob:csv";
  }) as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup(component: string, ref: string, ui: ReactElement, country: "US" | "NO" = "US") {
  const agent = createBookiAgent({ agentId: "test" });
  const view = render(<BookiLocaleProvider defaultCountry={country}>{ui}</BookiLocaleProvider>);
  const entry = () => agent.snapshot().find((c) => c.component === component) as unknown as Record<string, any>;
  const act = (action: string, args: unknown[] = []) =>
    agent.act({ steps: [{ ref, action, args }] }) as Promise<Result>;
  const button = (name: string) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent === name || b.getAttribute("aria-label") === name,
    )!;
  const alert = () => document.querySelector('[role="alert"]')?.textContent ?? "";
  const lastCsv = async () => {
    const blob = csv.at(-1);
    if (!blob) return "";
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result)));
      reader.readAsText(blob);
    });
  };
  return { agent, entry, act, button, alert, lastCsv, view };
}

const TABLE_ACTIONS = ["setSort", "clearSort", "setSearch", "setFilter", "clearFilters", "setPage", "setPageSize"];

/** Balanced vouchers: each debits one expense account and credits the bank. */
function ledger(vouchers: number, accounts = 3): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  for (let v = 0; v < vouchers; v += 1) {
    const month = String((v % 3) + 1).padStart(2, "0");
    const day = String((v % 27) + 1).padStart(2, "0");
    const amount = (v + 1) * 100;
    const account = String(6000 + (v % accounts) * 10);
    const common = {
      voucherId: `v${v + 1}`,
      voucherNumber: String(1000 + v),
      date: `2026-${month}-${day}`,
      description: `Purchase ${v + 1}`,
    };
    entries.push({
      ...common,
      id: `e${v + 1}d`,
      account,
      accountName: `Cost ${account}`,
      debitMinor: amount,
      creditMinor: 0,
    });
    entries.push({
      ...common,
      id: `e${v + 1}c`,
      account: "1920",
      accountName: "Bank",
      debitMinor: 0,
      creditMinor: amount,
    });
  }
  return entries;
}

describe("LedgerTable as a table", () => {
  it("lets an agent sort, search, filter and page each view, with totals over every match", async () => {
    const { entry, act } = setup("ledger-table", "General ledger", <LedgerTable entries={ledger(6)} pageSize={2} />);
    expect(entry().actions).toEqual(expect.arrayContaining(TABLE_ACTIONS));
    expect(entry()).toMatchObject({
      view: "trial-balance",
      total: 4,
      table: { total: 4, matching: 4, page: 1, pageCount: 2 },
    });
    // Totals cover all four accounts, not the page of two.
    expect(entry().totals).toEqual({ openingMinor: 0, debitMinor: 2100, creditMinor: 2100, closingMinor: 0 });

    expect((await act("setSort", ["closingMinor", "desc"])).ok).toBe(true);
    expect(entry().rows.map((row: any) => row.account)).toEqual(["6020", "6010"]);
    expect((await act("setPage", [2])).ok).toBe(true);
    expect(entry().rows.map((row: any) => row.account)).toEqual(["6000", "1920"]);
    expect(entry().query).toMatchObject({ sort: { column: "closingMinor", direction: "desc" }, page: 2 });
    expect((await act("setPage", [3])).error?.message).toMatch(/Page 3 does not exist. There are 2 pages/);

    expect((await act("setSearch", ["cost"])).ok).toBe(true);
    expect(entry()).toMatchObject({ table: { total: 4, matching: 3, page: 1 }, truncated: true });
    expect(entry().totals).toMatchObject({ debitMinor: 2100, creditMinor: 0 });
    expect((await act("setFilter", ["account", "6010"])).ok).toBe(true);
    expect(entry().rows).toEqual([expect.objectContaining({ account: "6010", debitMinor: 700 })]);
    expect((await act("setSort", ["nope"])).error?.message).toMatch(/No column "nope". Columns: account, accountName/);

    // Drilling in starts the account's entries fresh; Back returns to the trial balance as it was left.
    expect((await act("openAccount", ["6000"])).ok).toBe(true);
    expect(entry()).toMatchObject({
      view: "account",
      query: { sort: null, search: "", filters: {} },
      table: { matching: 2 },
    });
    expect((await act("setSort", ["date", "desc"])).ok).toBe(true);
    expect(entry().rows.map((row: any) => row.date)).toEqual(["2026-01-04", "2026-01-01"]);
    // The running balance stays the entry's own, whatever the order.
    expect(entry().rows.map((row: any) => row.balanceMinor)).toEqual([500, 100]);
    expect((await act("setSearch", ["purchase 4"])).ok).toBe(true);
    expect(entry().totals).toEqual({ debitMinor: 400, creditMinor: 0 });
    expect((await act("back")).ok).toBe(true);
    expect(entry()).toMatchObject({ view: "trial-balance", query: { search: "cost", filters: { account: "6010" } } });
    expect((await act("clearFilters")).ok).toBe(true);
    expect(entry().table.matching).toBe(4);
  });

  it("keeps the snapshot capped and the drill-down intact", async () => {
    const { entry, act } = setup("ledger-table", "General ledger", <LedgerTable entries={ledger(2500, 240)} />);
    expect(entry()).toMatchObject({ total: 241, truncated: true, table: { matching: 241, pageCount: 3 } });
    expect(entry().rows).toHaveLength(50);
    expect((await act("setPage", [3])).ok).toBe(true);
    expect(entry().rows).toHaveLength(41);
    expect(entry().truncated).toBe(true);
    // Back from an account lands on the page of the trial balance that holds it.
    expect((await act("setPage", [1])).ok).toBe(true);
    expect((await act("openAccount", ["8300"])).ok).toBe(true);
    expect((await act("back")).ok).toBe(true);
    expect(entry().table.page).toBe(3);
    expect(entry().rows.some((row: any) => row.account === "8300")).toBe(true);
    expect(entry().entries).toBeUndefined();
  });

  it("gives a person sortable headers, a search, pages and a CSV with ; in Norway", async () => {
    const { entry, lastCsv } = setup("ledger-table", "Hovedbok", <LedgerTable entries={ledger(6)} />, "NO");
    const header = [...document.querySelectorAll('[data-slot="ledger-table-sort"]')].find((b) =>
      b.textContent?.startsWith("Utgående"),
    ) as HTMLButtonElement;
    fireEvent.click(header);
    expect(header.closest('[role="columnheader"]')?.getAttribute("aria-sort")).toBe("ascending");
    expect(entry().query.sort).toEqual({ column: "closingMinor", direction: "asc" });
    fireEvent.click(header);
    expect(header.closest('[role="columnheader"]')?.getAttribute("aria-sort")).toBe("descending");

    fireEvent.change(document.querySelector('[data-slot="ledger-table-search"]')!, { target: { value: "bank" } });
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);
    fireEvent.click([...document.querySelectorAll("button")].find((b) => b.textContent === "Last ned CSV")!);
    const text = await lastCsv();
    expect(text.split("\r\n")).toEqual([
      "Konto;Kontonavn;Inngående;Debet;Kredit;Utgående",
      "1920;Bank;0.00;0.00;21.00;-21.00",
    ]);
  });

  it("reports a person's sort as the click it was (ui-sdk mount)", async () => {
    const view = mount(
      ledgerTable,
      { entries: ledger(6) },
      `<root><sort value="account">Account</sort><next>Next</next></root>`,
    );
    try {
      await view.click(view.part("sort", "account")!);
      expect(view.changes.at(-1)).toMatchObject({ key: "query", reason: "set-sort", source: "mouse" });
      expect(view.state.query.sort).toEqual({ column: "account", direction: "asc" });
      expect(view.state.rows.map((row: any) => row.account)).toEqual(["1920", "6000", "6010", "6020"]);
    } finally {
      view.unmount();
    }
  });
});

describe("AgedBalances as a table", () => {
  const item = (id: string, partyId: string, dueDate: string, amountMinor: number): OpenItem => ({
    id,
    partyId,
    partyName: `Party ${partyId}`,
    documentNumber: `INV-${id}`,
    dueDate,
    amountMinor,
    kind: "receivable",
  });
  const items: OpenItem[] = [
    item("1", "acme", "2026-05-15", 100_00),
    item("2", "acme", "2026-04-10", 30_00),
    item("3", "birch", "2026-03-30", 300_00),
    item("4", "birch", "2026-01-29", 5_00),
    item("5", "birch", "2026-02-15", -40_00),
    item("6", "cedar", "2026-01-01", 70_00),
  ];
  const ui = <AgedBalances items={items} defaultAsOf="2026-04-30" />;

  it("lets an agent filter by age, sort, search and page, with totals over every match", async () => {
    const { entry, act } = setup("aged-balances", "Aged receivables", ui);
    expect(entry().actions).toEqual(expect.arrayContaining(TABLE_ACTIONS));
    expect(entry()).toMatchObject({ total: 3, view: { total: 3, matching: 3, page: 1, pageCount: 1 } });

    expect((await act("setFilter", ["bucket", "over-90"])).ok).toBe(true);
    expect(entry().rows.map((row: any) => row.partyId)).toEqual(["birch", "cedar"]);
    expect(entry().totals).toEqual({ amountsMinor: [0, 0, 300_00, -40_00, 75_00], totalMinor: 335_00 });
    expect((await act("setFilter", ["bucket", "1-3"])).error?.message).toMatch(
      /No bucket "1-3". Buckets: not-due, 1-30, 31-60, 61-90, over-90/,
    );
    expect((await act("setSort", ["totalMinor", "desc"])).ok).toBe(true);
    expect(entry().rows.map((row: any) => row.partyId)).toEqual(["birch", "cedar"]);
    expect((await act("setSearch", ["ced"])).ok).toBe(true);
    expect(entry()).toMatchObject({ view: { total: 3, matching: 1 }, totals: { totalMinor: 70_00 } });
    expect((await act("clearFilters")).ok).toBe(true);
    expect((await act("setPageSize", [2])).ok).toBe(true);
    expect((await act("setPage", [2])).ok).toBe(true);
    expect(entry()).toMatchObject({ view: { page: 2, pageCount: 2 }, truncated: true, totals: { totalMinor: 465_00 } });
    expect(entry().rows.map((row: any) => row.partyId)).toEqual(["cedar"]);

    // In a party, the query is the party's items; the aging table keeps its own for Back.
    expect((await act("openParty", ["birch"])).ok).toBe(true);
    expect(entry()).toMatchObject({ query: { sort: null, filters: {} }, view: { total: 3, matching: 3 } });
    expect((await act("setFilter", ["bucket", "61-90"])).ok).toBe(true);
    expect(entry().party).toMatchObject({ itemCount: 3, totalMinor: 265_00, matchingMinor: -40_00 });
    expect(entry().party.items.map((i: any) => i.id)).toEqual(["5"]);
    expect((await act("setSort", ["amountMinor"])).ok).toBe(true);
    expect((await act("back")).ok).toBe(true);
    expect(entry()).toMatchObject({ partyId: null, query: { sort: { column: "totalMinor" }, pageSize: 2, page: 2 } });
    // `overdue` answers over every item, whatever the list shows.
    expect(JSON.stringify(await act("overdue", [1]))).toMatch(/"total":3,"truncated":false/);
  });

  it("gives a person an age filter, sortable headers and a CSV", async () => {
    const { entry, lastCsv } = setup("aged-balances", "Aged receivables", ui);
    const header = [...document.querySelectorAll('[data-slot="aged-balances-sort"]')].find((b) =>
      b.textContent?.startsWith("Total"),
    ) as HTMLButtonElement;
    fireEvent.click(header);
    fireEvent.click(header);
    expect(header.closest("th")?.getAttribute("aria-sort")).toBe("descending");
    expect([...document.querySelectorAll('[data-slot="aged-balances-party"]')].map((b) => b.textContent)).toEqual([
      "Party birch",
      "Party acme",
      "Party cedar",
    ]);
    fireEvent.change(document.querySelector('[data-slot="aged-balances-bucket"]')!, { target: { value: "1-30" } });
    expect(entry().query.filters).toEqual({ bucket: "1-30" });
    expect(document.querySelectorAll('[data-slot="aged-balances-table"] tbody tr')).toHaveLength(1);
    expect(document.querySelector('[data-slot="aged-balances-table"] tfoot')?.textContent).toContain("$130.00");
    fireEvent.click([...document.querySelectorAll("button")].find((b) => b.textContent === "Download CSV")!);
    expect((await lastCsv()).split("\r\n")).toEqual([
      "Customer,Not due,1–30 days,31–60 days,61–90 days,Over 90 days,Total",
      "Party acme,100.00,30.00,0.00,0.00,0.00,130.00",
    ]);
  });

  it("reports a person's age filter as the input it was (ui-sdk mount)", async () => {
    const view = mount(
      agedBalances,
      { items, defaultAsOf: "2026-04-30" },
      `<root><sort value="partyName">Party</sort></root>`,
    );
    try {
      await view.click(view.part("sort", "partyName")!);
      expect(view.changes.at(-1)).toMatchObject({ key: "query", reason: "set-sort", source: "mouse" });
      await view.click(view.part("sort", "partyName")!);
      expect(view.state.rows.map((row: any) => row.partyId)).toEqual(["cedar", "birch", "acme"]);
    } finally {
      view.unmount();
    }
  });
});

describe("SupplierInvoiceInbox's list as a table", () => {
  const f = <T,>(value: T, confidence = 0.99) => ({ value, confidence });
  const invoice = (
    id: string,
    supplier: string,
    number: string,
    due: string,
    gross: number,
    currency = "USD",
  ): SupplierInvoice => ({
    id,
    status: "new",
    document: { id: `doc-${id}`, fileName: `${id}.pdf`, page: 1 },
    bankAccount: "8601 11 17947",
    fields: {
      supplierName: f(supplier),
      supplierOrgNumber: f("12-3456789"),
      invoiceNumber: f(number),
      invoiceDate: f("2026-01-10"),
      dueDate: f(due),
      netMinor: f(gross),
      taxMinor: f(0),
      grossMinor: f(gross),
      currency: f(currency),
      paymentReference: f(`KID-${id}99887766`),
    },
  });
  const invoices = [
    invoice("s1", "Acme Inc", "INV-100", "2026-02-09", 1000_00),
    invoice("s2", "Birch AS", "B-7", "2026-01-15", 250_00),
    invoice("s3", "Acme Inc", "INV-101", "2026-03-01", 40_00, "EUR"),
  ];

  it("lets an agent sort, search, filter and page, and never reaches a secret", async () => {
    const { agent, entry, act } = setup(
      "supplier-invoice-inbox",
      "Supplier invoices",
      <SupplierInvoiceInbox defaultInvoices={invoices} actor="kari" />,
    );
    expect(entry().actions).toEqual(expect.arrayContaining(TABLE_ACTIONS));
    expect(entry()).toMatchObject({
      view: { total: 3, matching: 3, page: 1, pageCount: 1 },
      totals: { grossMinor: { USD: 1250_00, EUR: 40_00 } },
    });
    expect(entry().rows[0]).toEqual({
      id: "s1",
      supplierName: "Acme Inc",
      invoiceNumber: "INV-100",
      dueDate: "2026-02-09",
      grossMinor: 1000_00,
      currency: "USD",
      status: "new",
    });

    expect((await act("setSort", ["dueDate", "desc"])).ok).toBe(true);
    expect(entry().rows.map((row: any) => row.id)).toEqual(["s3", "s1", "s2"]);
    expect((await act("setSearch", ["acme"])).ok).toBe(true);
    expect(entry()).toMatchObject({ view: { matching: 2 }, totals: { grossMinor: { USD: 1000_00, EUR: 40_00 } } });
    // Neither the payment reference nor the bank account is searchable.
    expect((await act("setSearch", ["99887766"])).ok).toBe(true);
    expect(entry().view.matching).toBe(0);
    expect((await act("setSearch", ["17947"])).ok).toBe(true);
    expect(entry().view.matching).toBe(0);
    expect((await act("setSearch", [""])).ok).toBe(true);

    expect((await act("proposeCoding", ["s2", "6800"])).ok).toBe(true);
    expect((await act("setFilter", ["status", "coded"])).ok).toBe(true);
    expect(entry().rows.map((row: any) => row.id)).toEqual(["s2"]);
    expect((await act("clearFilters")).ok).toBe(true);
    expect((await act("setPageSize", [1])).ok).toBe(true);
    expect((await act("setPage", [3])).ok).toBe(true);
    expect(entry().rows.map((row: any) => row.id)).toEqual(["s2"]);
    // `inbox` still holds every invoice; totals still cover every match.
    expect(entry().inbox).toHaveLength(3);
    expect(entry().totals.grossMinor).toEqual({ USD: 1250_00, EUR: 40_00 });
    expect(JSON.stringify(agent.snapshot())).not.toMatch(/KID-s|17947/);
  });

  it("gives a person a status filter, sortable headers, pages and a CSV without secrets", async () => {
    const { entry, button, lastCsv } = setup(
      "supplier-invoice-inbox",
      "Leverandørfakturaer",
      <SupplierInvoiceInbox defaultInvoices={invoices} pageSize={2} actor="kari" />,
      "NO",
    );
    expect(document.querySelectorAll('[data-slot="supplier-invoice-inbox-table"] tbody tr')).toHaveLength(2);
    fireEvent.click(button("Neste side"));
    expect(entry().view.page).toBe(2);
    expect(document.querySelectorAll('[data-slot="supplier-invoice-inbox-table"] tbody tr')).toHaveLength(1);
    const header = [...document.querySelectorAll('[data-slot="supplier-invoice-inbox-sort"]')].find((b) =>
      b.textContent?.startsWith("Brutto"),
    ) as HTMLButtonElement;
    fireEvent.click(header);
    expect(header.closest("th")?.getAttribute("aria-sort")).toBe("ascending");
    expect(entry().query).toMatchObject({ sort: { column: "grossMinor", direction: "asc" }, page: 1 });
    fireEvent.change(document.querySelector('[data-slot="supplier-invoice-inbox-statusfilter"]')!, {
      target: { value: "new" },
    });
    expect(entry().query.filters).toEqual({ status: "new" });
    fireEvent.click(button("Last ned CSV"));
    const text = await lastCsv();
    expect(text.split("\r\n")[0]).toBe("Leverandør;Fakturanr.;Forfall;Brutto;Valuta;Status");
    expect(text).toContain("Birch AS;B-7;2026-01-15;250.00;USD;new");
    expect(text).not.toMatch(/KID|17947/);
  });

  it("reports a person's sort as the click it was (ui-sdk mount)", async () => {
    const view = mount(
      supplierInvoiceInbox,
      { defaultInvoices: invoices, actor: "kari" },
      `<root><sort value="supplierName">Supplier</sort></root>`,
    );
    try {
      await view.click(view.part("sort", "supplierName")!);
      await view.click(view.part("sort", "supplierName")!);
      expect(view.changes.at(-1)).toMatchObject({ key: "query", reason: "set-sort", source: "mouse" });
      expect(view.state.rows.map((row: any) => row.id)).toEqual(["s2", "s1", "s3"]);
    } finally {
      view.unmount();
    }
  });
});

describe("PaymentBatch's payment list as a table", () => {
  const batch: Batch = {
    id: "b1",
    status: "draft",
    debitAccount: "1503 40 12345",
    valueDate: "2026-02-01",
    currency: "USD",
    preparedBy: "nina",
    approvals: [],
    items: [
      { id: "p1", creditorName: "Acme", amountMinor: 100_00, creditorAccount: "8601 11 17947", reference: "INV-1" },
      { id: "p2", creditorName: "Acme", amountMinor: 120_00, creditorAccount: "86011117947", reference: "INV-2" },
      { id: "p3", creditorName: "Birch", amountMinor: 250_00, creditorAccount: "1234 56 78903" },
    ],
  };

  it("lets an agent filter by creditor, sort and page, and keeps account numbers out", async () => {
    // A US memo is shown to an agent unless the app says it is secret (memo-reference.test.tsx);
    // here it does, so the list's redaction is what is tested.
    const { entry, act } = setup(
      "payment-batch",
      "Payment batch",
      <PaymentBatch defaultBatch={batch} actor="kari" secretReference />,
    );
    expect(entry().actions).toEqual(expect.arrayContaining(TABLE_ACTIONS));
    expect(entry()).toMatchObject({
      view: { total: 3, matching: 3 },
      totals: { amountMinor: 470_00 },
      totalMinor: 470_00,
    });

    expect((await act("setFilter", ["creditorName", "acme"])).ok).toBe(true);
    expect(entry().rows).toEqual([
      // A reference the app marks secret is redacted, like the account.
      { id: "p1", creditorName: "Acme", reference: "[redacted]", amountMinor: 100_00 },
      { id: "p2", creditorName: "Acme", reference: "[redacted]", amountMinor: 120_00 },
    ]);
    // Totals over the match; the batch total is still the whole batch.
    expect(entry()).toMatchObject({ totals: { amountMinor: 220_00 }, totalMinor: 470_00 });
    expect((await act("setFilter", ["creditorAccount", "1"])).error?.message).toMatch(/No column "creditorAccount"/);
    expect((await act("clearFilters")).ok).toBe(true);
    expect((await act("setSearch", ["17947"])).ok).toBe(true);
    expect(entry().view.matching).toBe(0);
    expect((await act("setSearch", [""])).ok).toBe(true);
    expect((await act("setSort", ["amountMinor", "desc"])).ok).toBe(true);
    expect(entry().rows.map((row: any) => row.id)).toEqual(["p3", "p2", "p1"]);
    expect((await act("setPageSize", [2])).ok).toBe(true);
    expect((await act("setPage", [2])).ok).toBe(true);
    expect(entry().rows.map((row: any) => row.id)).toEqual(["p1"]);

    // Removing still drops every approval and keeps the list current.
    expect((await act("removePayment", ["p1"])).ok).toBe(true);
    expect(entry()).toMatchObject({ view: { total: 2, page: 1, pageCount: 1 }, totalMinor: 370_00 });
    expect(JSON.stringify(entry())).not.toMatch(/17947|78903|12345/);
  });

  it("gives a person a search, sortable headers and a CSV with the accounts masked", async () => {
    const { entry, button, lastCsv } = setup(
      "payment-batch",
      "Payment batch",
      <PaymentBatch defaultBatch={batch} actor="kari" />,
    );
    fireEvent.change(document.querySelector('[data-slot="payment-batch-search"]')!, { target: { value: "acme" } });
    expect(document.querySelectorAll('[data-slot="payment-batch-table"] tbody tr')).toHaveLength(2);
    expect(document.querySelector('[data-slot="payment-batch-matching"]')?.textContent).toContain("$220.00");
    const header = [...document.querySelectorAll('[data-slot="payment-batch-sort"]')].find((b) =>
      b.textContent?.startsWith("Amount"),
    ) as HTMLButtonElement;
    fireEvent.click(header);
    fireEvent.click(header);
    expect(header.closest("th")?.getAttribute("aria-sort")).toBe("descending");
    expect(entry().rows.map((row: any) => row.id)).toEqual(["p2", "p1"]);
    fireEvent.click(button("Download CSV"));
    const text = await lastCsv();
    expect(text.split("\r\n")).toEqual([
      "Pay to,Reference,Amount,Account",
      "Acme,INV-2,120.00,•••• 7947",
      "Acme,INV-1,100.00,•••• 7947",
    ]);
    expect(text).not.toMatch(/17947|8601/);
  });

  it("reports a person's sort as the click it was (ui-sdk mount)", async () => {
    const view = mount(
      paymentBatch,
      { defaultBatch: batch, actor: "kari" },
      `<root><sort value="creditorName">Creditor</sort></root>`,
    );
    try {
      await view.click(view.part("sort", "creditorName")!);
      expect(view.changes.at(-1)).toMatchObject({ key: "query", reason: "set-sort", source: "mouse" });
      expect(view.state.query.sort).toEqual({ column: "creditorName", direction: "asc" });
    } finally {
      view.unmount();
    }
  });
});
