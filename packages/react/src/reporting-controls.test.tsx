import type { OpenItem } from "@booki/core/aging";
import type { LedgerEntry } from "@booki/core/ledger";
import { GENERIC_VAT_SCHEMA_EXAMPLE, type VatReturnFiling, type VatTransaction } from "@booki/core/vat-return";
import { checkPattern, mount, settle } from "@ui-sdk/core/testing";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBookiAgent } from "./booki-agent.js";
import { AgedBalances, agedBalances } from "./aged-balances.js";
import { LedgerTable, ledgerTable } from "./ledger-table.js";
import { BookiLocaleProvider } from "./locale.js";
import { VatReturn, vatReturn } from "./vat-return.js";

afterEach(() => cleanup());

type Result = { ok: boolean; error?: { message: string }; steps?: unknown[] } & Record<string, any>;

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
  return { entry, act, button, alert, view };
}

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

describe("LedgerTable", () => {
  it("drills from an account to the whole voucher, onward to another account, and back one step at a time", async () => {
    const entries = ledger(6);
    const opened: unknown[] = [];
    const { entry, act } = setup(
      "ledger-table",
      "General ledger",
      <LedgerTable
        entries={entries}
        documents={{ v2: { name: "invoice-1001.pdf" } }}
        onOpenDocument={(doc) => opened.push(doc)}
      />,
    );
    expect((await act("openAccount", ["6010"])).ok).toBe(true);
    // A person opens the voucher from the account's entries.
    fireEvent.click(document.querySelector('[data-slot="ledger-table-voucher"]')!);
    expect(entry()).toMatchObject({ view: "voucher", account: "6010", voucher: "v2", total: 2 });
    expect(entry().voucherSummary).toMatchObject({
      voucherNumber: "1001",
      debitMinor: 200,
      creditMinor: 200,
      balanced: true,
      lines: 2,
      document: "invoice-1001.pdf",
    });
    expect(document.querySelector('[data-slot="ledger-table-crumbs"]')?.textContent).toMatch(
      /Trial balance.*6010 Cost 6010.*Voucher 1001/,
    );

    fireEvent.click(document.querySelector('[data-slot="ledger-table-document"]')!);
    expect(opened).toEqual([{ name: "invoice-1001.pdf", voucherId: "v2" }]);

    // From the voucher, the bank line opens the bank account.
    fireEvent.click(document.querySelector('[data-slot="ledger-table-lineaccount"][aria-label^="Open account 1920"]')!);
    expect(entry()).toMatchObject({ view: "account", account: "1920", voucher: null });

    // An agent goes straight to a voucher by number, then back one step at a time.
    expect((await act("showVoucher", ["1004"])).ok).toBe(true);
    expect(entry()).toMatchObject({ view: "voucher", voucher: "v5", account: "1920" });
    expect((await act("back")).ok).toBe(true);
    expect(entry()).toMatchObject({ view: "account", account: "1920" });
    expect((await act("back")).ok).toBe(true);
    expect(entry().view).toBe("trial-balance");
    expect((await act("showVoucher", ["9999"])).error?.message).toMatch(
      /No voucher "9999" in this ledger. Vouchers include: 1000, 1001/,
    );
  });

  it("shows the trial balance, drills into an account and explains a variance, all read-only", async () => {
    const entries = ledger(6);
    const { entry, act } = setup("ledger-table", "General ledger", <LedgerTable entries={entries} />);
    expect(entry().actions).toEqual([
      "setSort",
      "clearSort",
      "setSearch",
      "setFilter",
      "clearFilters",
      "setPage",
      "setPageSize",
      "setRange",
      "openAccount",
      "back",
      "showVoucher",
      "explainVariance",
    ]);
    expect(entry()).toMatchObject({
      view: "trial-balance",
      account: null,
      from: null,
      to: null,
      total: 4,
      truncated: false,
      balanced: true,
    });
    expect(entry().rows.map((row: any) => row.account)).toEqual(["1920", "6000", "6010", "6020"]);
    expect(entry().rows[0]).toMatchObject({ debitMinor: 0, creditMinor: 2100, closingMinor: -2100 });

    expect((await act("openAccount", ["6000"])).ok).toBe(true);
    expect(entry()).toMatchObject({ view: "account", account: "6000", total: 2 });
    expect(entry().rows.map((row: any) => row.balanceMinor)).toEqual([100, 500]);

    expect((await act("setRange", ["2026-02-01", "2026-03-31"])).ok).toBe(true);
    expect(entry()).toMatchObject({ from: "2026-02-01", to: "2026-03-31", total: 0 });
    expect((await act("setRange", [null, null])).ok).toBe(true);
    const wrong = await act("setRange", ["2026-03-01", "2026-01-01"]);
    expect(wrong.error?.message).toMatch(/start must be on or before the end/);

    expect((await act("back")).ok).toBe(true);
    expect(entry()).toMatchObject({ view: "trial-balance", account: null });
    const missing = await act("openAccount", ["9999"]);
    expect(missing.error?.message).toMatch(/No account "9999".*1920, 6000/);

    const explained = await act("explainVariance", ["1920", "2026-01", "2026-02"]);
    expect(explained.ok).toBe(true);
    expect(JSON.stringify(explained)).toMatch(/"differenceMinor":-200/);
    // Nothing an agent can call changes the ledger.
    for (const action of ["setEntries", "openVoucher", "setPage", "openAccountByPerson"]) {
      expect((await act(action, ["x"])).ok).toBe(false);
    }
    expect(entry().entries).toBeUndefined();
  });

  it("caps the rows an agent sees and renders one page of a 5,000-entry ledger", async () => {
    const entries = ledger(2500, 240);
    const started = performance.now();
    const { entry, act, button } = setup("ledger-table", "General ledger", <LedgerTable entries={entries} />);
    const elapsed = performance.now() - started;
    expect(entries).toHaveLength(5000);
    expect(entry()).toMatchObject({ total: 241, truncated: true, balanced: true });
    expect(entry().rows).toHaveLength(50);
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(100);
    expect(document.body.textContent).toContain("Rows 1–100 of 241");
    fireEvent.click(button("Next"));
    fireEvent.click(button("Next"));
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(41);
    expect((button("Next") as HTMLButtonElement).disabled).toBe(true);

    await act("openAccount", ["1920"]);
    expect(entry()).toMatchObject({ view: "account", total: 2500, truncated: true });
    expect(entry().rows).toHaveLength(50);
    // The opening row, 100 entries and no more.
    expect(document.querySelectorAll('[data-slot="ledger-table-entries"] tbody tr')).toHaveLength(101);
    expect(elapsed).toBeLessThan(2000);
  });

  it("honours snapshotRows and pageSize", () => {
    const { entry } = setup(
      "ledger-table",
      "General ledger",
      <LedgerTable entries={ledger(6)} snapshotRows={2} pageSize={3} />,
    );
    expect(entry()).toMatchObject({ total: 4, truncated: true });
    expect(entry().rows).toHaveLength(2);
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(3);
  });

  it("lets a person open an account, pick a voucher and go back", () => {
    const onOpenVoucher = vi.fn();
    const { entry, button, alert } = setup(
      "ledger-table",
      "General ledger",
      <LedgerTable entries={ledger(6)} onOpenVoucher={onOpenVoucher} />,
    );
    const row = document.querySelector('[role="option"][aria-label^="6010"]') as HTMLElement;
    fireEvent.click(row);
    expect(entry()).toMatchObject({ view: "account", account: "6010" });
    fireEvent.click(button("Open voucher 1001"));
    expect(onOpenVoucher).toHaveBeenCalledTimes(1);
    expect(onOpenVoucher.mock.calls[0]![0]).toEqual({ voucherId: "v2", voucherNumber: "1001", entryId: "e2d" });
    expect(onOpenVoucher.mock.calls[0]![1]).toMatchObject({ reason: "open-voucher" });
    // The ledger shows the whole voucher; Back returns to the account, then to the trial balance.
    expect(entry()).toMatchObject({ view: "voucher", voucher: "v2" });
    fireEvent.click(button("← 6010 Cost 6010"));
    expect(entry().view).toBe("account");
    fireEvent.click(button("Back to trial balance"));
    expect(entry().view).toBe("trial-balance");

    const from = document.querySelector('[data-slot="ledger-table-from"]') as HTMLInputElement;
    fireEvent.change(from, { target: { value: "2026-03-01" } });
    // Accounts posted to before the range stay, with an opening balance.
    expect(entry()).toMatchObject({ from: "2026-03-01", total: 4 });
    expect(entry().rows[1]).toMatchObject({ account: "6000", openingMinor: 500, debitMinor: 0, closingMinor: 500 });
    const to = document.querySelector('[data-slot="ledger-table-to"]') as HTMLInputElement;
    fireEvent.change(to, { target: { value: "2026-01-01" } });
    expect(alert()).toMatch(/start must be on or before the end/);
    expect(entry().to).toBeNull();
  });

  it("says when the ledger does not balance", () => {
    const entries = [
      ...ledger(2),
      { ...ledger(1)[0]!, id: "odd", voucherId: "v9", voucherNumber: "1009", debitMinor: 55 },
    ];
    const { entry } = setup("ledger-table", "General ledger", <LedgerTable entries={entries} />);
    expect(entry().balanced).toBe(false);
    expect(document.querySelector('[role="status"]')?.textContent).toMatch(/differ by \$0\.55/);
  });

  it("follows a controlled account and a replaced ledger", () => {
    const first = ledger(6);
    const { entry, view } = setup("ledger-table", "General ledger", <LedgerTable entries={first} account={null} />);
    view.rerender(
      <BookiLocaleProvider defaultCountry="US">
        <LedgerTable entries={first} account="6000" />
      </BookiLocaleProvider>,
    );
    expect(entry()).toMatchObject({ view: "account", account: "6000", total: 2 });
    view.rerender(
      <BookiLocaleProvider defaultCountry="US">
        <LedgerTable entries={ledger(9)} account="6000" />
      </BookiLocaleProvider>,
    );
    expect(entry().total).toBe(3);
  });

  it("is named in Norwegian", () => {
    setup("ledger-table", "Hovedbok", <LedgerTable entries={ledger(2)} />, "NO");
    expect(document.querySelector('[data-slot="ledger-table"]')?.getAttribute("aria-label")).toBe("Hovedbok");
    expect(document.querySelector('[role="listbox"]')?.getAttribute("aria-label")).toBe("Saldobalanse");
  });

  it("is a listbox: one Tab stop, arrows, Home and End, Enter opens", async () => {
    const { entry } = setup("ledger-table", "General ledger", <LedgerTable entries={ledger(6)} />);
    const list = document.querySelector('[role="listbox"]') as HTMLElement;
    await checkPattern(list, "listbox");
    const options = [...list.querySelectorAll<HTMLElement>('[role="option"]')];
    expect(options.filter((option) => option.tabIndex === 0)).toHaveLength(1);
    options[0]!.focus();
    fireEvent.keyDown(options[0]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(options[1]);
    fireEvent.keyDown(options[1]!, { key: "End" });
    expect(document.activeElement).toBe(options[3]);
    fireEvent.keyDown(options[3]!, { key: "Enter" });
    expect(entry()).toMatchObject({ view: "account", account: "6020" });
    // Focus follows the person: to Back, and from Back to the row they left.
    const back = [...document.querySelectorAll("button")].find((b) => b.textContent === "Back to trial balance")!;
    expect(document.activeElement).toBe(back);
    fireEvent.click(back);
    await settle();
    expect(document.activeElement?.getAttribute("aria-label")).toMatch(/^6020 /);
  });

  it("reports the click as the source of the change (ui-sdk mount)", async () => {
    const view = mount(
      ledgerTable,
      { entries: ledger(6) },
      `<root><list aria-label="Trial balance"><row value="1920">Bank</row><row value="6000">Cost</row></list><back>Back</back></root>`,
    );
    try {
      await view.click(view.part("row", "6000")!);
      expect(view.state).toMatchObject({ view: "account", account: "6000", total: 2 });
      expect(view.changes.at(-1)).toMatchObject({ key: "account", reason: "open-account", source: "mouse" });
      await view.click(view.part("back")!);
      expect(view.changes.at(-1)).toMatchObject({ key: "account", reason: "back", source: "mouse" });
      expect(view.state.view).toBe("trial-balance");
    } finally {
      view.unmount();
    }
  });
});

describe("AgedBalances", () => {
  const item = (
    id: string,
    partyId: string,
    dueDate: string,
    amountMinor: number,
    kind: OpenItem["kind"] = "receivable",
  ): OpenItem => ({
    id,
    partyId,
    partyName: `Party ${partyId}`,
    documentNumber: `INV-${id}`,
    dueDate,
    amountMinor,
    kind,
  });
  const items: OpenItem[] = [
    item("1", "acme", "2026-05-15", 100_00),
    item("2", "acme", "2026-04-10", 30_00),
    item("3", "birch", "2026-03-30", 300_00),
    item("4", "birch", "2026-01-29", 5_00),
    item("5", "birch", "2026-02-15", -40_00),
    item("6", "tax", "2026-04-01", 900_00, "payable"),
  ];
  const ui = <AgedBalances items={items} defaultAsOf="2026-04-30" />;

  it("ages the receivables, drills into a party and answers who is overdue", async () => {
    const { entry, act } = setup("aged-balances", "Aged receivables", ui);
    expect(entry().actions).toEqual([
      "setSort",
      "clearSort",
      "setSearch",
      "setFilter",
      "clearFilters",
      "setPage",
      "setPageSize",
      "setAsOf",
      "openParty",
      "back",
      "overdue",
    ]);
    expect(entry()).toMatchObject({
      kind: "receivable",
      asOf: "2026-04-30",
      partyId: null,
      party: null,
      total: 2,
      truncated: false,
    });
    expect(entry().buckets.map((bucket: any) => bucket.id)).toEqual(["not-due", "1-30", "31-60", "61-90", "over-90"]);
    expect(entry().rows).toEqual([
      {
        partyId: "acme",
        partyName: "Party acme",
        amountsMinor: [100_00, 30_00, 0, 0, 0],
        totalMinor: 130_00,
        itemCount: 2,
      },
      {
        partyId: "birch",
        partyName: "Party birch",
        amountsMinor: [0, 0, 300_00, -40_00, 5_00],
        totalMinor: 265_00,
        itemCount: 3,
      },
    ]);
    expect(entry().totals).toEqual({ amountsMinor: [100_00, 30_00, 300_00, -40_00, 5_00], totalMinor: 395_00 });

    const late = await act("overdue", [31]);
    expect(late.ok).toBe(true);
    expect(JSON.stringify(late)).toMatch(
      /"partyId":"birch","partyName":"Party birch","overdueMinor":26500,"oldestDays":91/,
    );
    expect(JSON.stringify(late)).not.toMatch(/"partyId":"acme"/);
    expect((await act("overdue", [0])).error?.message).toMatch(/whole number, 1 or above/);

    expect((await act("openParty", ["birch"])).ok).toBe(true);
    expect(entry().party).toMatchObject({
      partyId: "birch",
      partyName: "Party birch",
      totalMinor: 265_00,
      itemCount: 3,
      truncated: false,
    });
    expect(entry().party.items.map((i: any) => [i.id, i.daysOverdue, i.bucket])).toEqual([
      ["4", 91, "over-90"],
      ["5", 74, "61-90"],
      ["3", 31, "31-60"],
    ]);
    expect((await act("openParty", ["zed"])).error?.message).toMatch(
      /No party "zed" with open receivables. Parties: acme, birch/,
    );
    expect((await act("back")).ok).toBe(true);
    expect(entry()).toMatchObject({ partyId: null, party: null });

    expect((await act("setAsOf", ["2026-03-01"])).ok).toBe(true);
    expect(entry().rows[1]).toMatchObject({ amountsMinor: [300_00, -40_00, 5_00, 0, 0] });
    expect((await act("setAsOf", ["1 March"])).error?.message).toMatch(/as-of date must be a date written YYYY-MM-DD/);
    expect(entry().asOf).toBe("2026-03-01");
    // Read-only: there is nothing to settle, write off or edit.
    for (const action of ["setItems", "settle", "openPartyByPerson", "setKind"]) {
      expect((await act(action, ["acme"])).ok).toBe(false);
    }
  });

  it("caps the rows and the party's items in the snapshot", async () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      item(`m${i}`, i < 60 ? "big" : `p${String(i).padStart(3, "0")}`, "2026-04-01", 100 + i),
    );
    const { entry, act } = setup(
      "aged-balances",
      "Aged receivables",
      <AgedBalances items={many} defaultAsOf="2026-04-30" />,
    );
    expect(entry()).toMatchObject({ total: 61, truncated: true });
    expect(entry().rows).toHaveLength(50);
    // A person still sees every party.
    expect(document.querySelectorAll('[data-slot="aged-balances-table"] tbody tr')).toHaveLength(61);
    await act("openParty", ["big"]);
    expect(entry().party).toMatchObject({ itemCount: 60, truncated: true });
    expect(entry().party.items).toHaveLength(50);
    const late = await act("overdue", [1]);
    expect(JSON.stringify(late)).toMatch(/"total":61,"truncated":true/);
  });

  it("shows payables under their own name, in Norwegian too", () => {
    const { entry } = setup(
      "aged-balances",
      "Aldersfordelt leverandørgjeld",
      <AgedBalances items={items} kind="payable" defaultAsOf="2026-04-30" />,
      "NO",
    );
    expect(document.querySelector('[data-slot="aged-balances"]')?.getAttribute("aria-label")).toBe(
      "Aldersfordelt leverandørgjeld",
    );
    expect(entry().rows).toEqual([
      { partyId: "tax", partyName: "Party tax", amountsMinor: [0, 900_00, 0, 0, 0], totalMinor: 900_00, itemCount: 1 },
    ]);
    expect(document.querySelector("thead")?.textContent).toMatch(
      /Leverandør.*Ikke forfalt.*1–30 dager.*Over 90 dager.*Sum/,
    );
  });

  it("lets a person drill in, go back and change the date, and shows a refusal", () => {
    const { entry, button, alert } = setup("aged-balances", "Aged receivables", ui);
    fireEvent.click(button("Show open items: Party birch"));
    expect(entry().partyId).toBe("birch");
    expect(document.activeElement).toBe(button("Back to all"));
    expect(document.querySelectorAll('[data-slot="aged-balances-items"] tbody tr')).toHaveLength(3);
    expect(document.querySelector('[data-slot="aged-balances-items"] tfoot')?.textContent).toContain("$265.00");
    fireEvent.click(button("Back to all"));
    expect(entry().partyId).toBeNull();
    expect(document.activeElement).toBe(button("Show open items: Party birch"));
    const date = document.querySelector('[data-slot="aged-balances-date"]') as HTMLInputElement;
    fireEvent.change(date, { target: { value: "2026-06-30" } });
    expect(entry().asOf).toBe("2026-06-30");
    expect(entry().rows[0].amountsMinor).toEqual([0, 0, 100_00, 30_00, 0]);
    expect(alert()).toBe("");
  });

  it("reports the click as the source of the change (ui-sdk mount)", async () => {
    const view = mount(
      agedBalances,
      { items, defaultAsOf: "2026-04-30" },
      `<root><party value="acme">Acme</party><back>Back</back></root>`,
    );
    try {
      await view.click(view.part("party", "acme")!);
      expect(view.state.party).toMatchObject({ partyId: "acme", itemCount: 2 });
      expect(view.changes.at(-1)).toMatchObject({ key: "partyId", reason: "open-party", source: "mouse" });
      await view.click(view.part("back")!);
      expect(view.changes.at(-1)).toMatchObject({ key: "partyId", reason: "back", source: "mouse" });
    } finally {
      view.unmount();
    }
  });
});

describe("VatReturn", () => {
  const tx = (
    voucherId: string,
    date: string,
    vatCode: string,
    baseMinor: number,
    taxMinor: number,
  ): VatTransaction => ({ voucherId, date, vatCode, baseMinor, taxMinor });
  const clean: VatTransaction[] = [
    tx("s1", "2026-03-05", "OUT", 1000_00, 250_00),
    tx("s2", "2026-04-20", "OUT", 400_00, 100_00),
    tx("p1", "2026-03-10", "IN", 600_00, 150_00),
    tx("later", "2026-05-02", "OUT", 1_00, 25),
  ];
  const dirty = [...clean, tx("odd", "2026-03-20", "RC", 50_00, 0)];
  const base = { schema: GENERIC_VAT_SCHEMA_EXAMPLE, period: "2026-T2" } as const;

  it("shows the boxes, drills into one and keeps ready and submit for a person", async () => {
    const { entry, act } = setup("vat-return", "VAT return", <VatReturn {...base} transactions={dirty} actor="kari" />);
    expect(entry().actions).toEqual(["openBox", "back", "assertReady"]);
    expect(entry()).toMatchObject({
      period: "2026-T2",
      status: "draft",
      payableMinor: 200_00,
      direction: "payable",
      ready: false,
      unmappedTotal: 1,
      box: null,
    });
    expect(entry().boxes).toEqual([
      { id: "sales", label: "Taxable sales", kind: "base", amountMinor: 1400_00, voucherCount: 2 },
      { id: "zero-rated", label: "Zero-rated sales", kind: "base", amountMinor: 0, voucherCount: 0 },
      { id: "output-tax", label: "Tax on sales", kind: "tax", amountMinor: 350_00, voucherCount: 2 },
      { id: "purchases", label: "Purchases", kind: "base", amountMinor: 600_00, voucherCount: 1 },
      { id: "input-tax", label: "Tax on purchases", kind: "tax", amountMinor: -150_00, voucherCount: 1 },
      { id: "net", label: "Net tax (to get back when negative)", kind: "total", amountMinor: 200_00, voucherCount: 0 },
    ]);
    expect(entry().unmapped).toEqual([tx("odd", "2026-03-20", "RC", 50_00, 0)]);
    const blocked = await act("assertReady");
    expect(blocked.error?.message).toMatch(/not ready.*VAT code\(s\) "RC".*Vouchers: odd/);

    expect((await act("openBox", ["output-tax"])).ok).toBe(true);
    expect(entry()).toMatchObject({ box: "output-tax", total: 2, truncated: false });
    expect(entry().vouchers.map((v: any) => [v.voucherId, v.amountMinor])).toEqual([
      ["s1", 250_00],
      ["s2", 100_00],
    ]);
    expect((await act("openBox", ["net"])).error?.message).toMatch(
      /Box "net" is a total of boxes output-tax, input-tax/,
    );
    expect((await act("openBox", ["nope"])).error?.message).toMatch(/No box "nope".*Boxes: sales/);
    expect((await act("back")).ok).toBe(true);
    expect(entry()).toMatchObject({ box: null, vouchers: [], total: 0 });

    // Not agent actions, whatever the state.
    expect((await act("markReady")).ok).toBe(false);
    expect((await act("submit")).ok).toBe(false);
    expect((await act("setFiling", [{ status: "submitted" }])).ok).toBe(false);
    expect(entry().status).toBe("draft");
    expect(JSON.stringify(entry())).not.toMatch(/computation|"later"/);
  });

  it("caps the vouchers of a box and the unmapped list", async () => {
    const many = [
      ...Array.from({ length: 70 }, (_, i) => tx(`s${i}`, "2026-03-05", "OUT", 100_00, 25_00)),
      ...Array.from({ length: 60 }, (_, i) => tx(`u${i}`, "2026-03-06", "X", 1_00, 0)),
    ];
    const { entry, act } = setup("vat-return", "VAT return", <VatReturn {...base} transactions={many} />);
    expect(entry()).toMatchObject({ unmappedTotal: 60, ready: false });
    expect(entry().unmapped).toHaveLength(50);
    await act("openBox", ["sales"]);
    expect(entry()).toMatchObject({ total: 70, truncated: true });
    expect(entry().vouchers).toHaveLength(50);
  });

  it("lets a person mark it ready and submit, and then it is fixed", async () => {
    const onSubmit = vi.fn();
    const onFilingChange = vi.fn();
    const { entry, act, button, alert, view } = setup(
      "vat-return",
      "VAT return",
      <VatReturn {...base} transactions={clean} actor="kari" onSubmit={onSubmit} onFilingChange={onFilingChange} />,
    );
    expect((await act("assertReady")).ok).toBe(true);
    expect((button("Submit") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button("Mark ready"));
    expect(entry()).toMatchObject({ status: "ready", filing: { status: "ready", readyBy: "kari" } });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(button("Submit"));
    expect(alert()).toBe("");
    expect(entry()).toMatchObject({
      status: "submitted",
      filing: { status: "submitted", readyBy: "kari", submittedBy: "kari" },
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      country: "GENERIC",
      period: "2026-T2",
      payableMinor: 200_00,
      direction: "payable",
      filing: { status: "submitted" },
    });
    expect(onSubmit.mock.calls[0]![0].boxes).toHaveLength(6);
    expect(onSubmit.mock.calls[0]![1]).toMatchObject({ reason: "submit-return" });
    expect(onFilingChange).toHaveBeenCalledTimes(2);
    expect(button("Submit")).toBeUndefined();
    expect(button("Mark ready")).toBeUndefined();
    expect(document.querySelector('[role="status"]')?.textContent).toBe(
      "Submitted · VAT term 2 2026 · To pay $200.00 · submitted by kari",
    );
    // New transactions do not move a submitted return.
    view.rerender(
      <BookiLocaleProvider defaultCountry="US">
        <VatReturn
          {...base}
          transactions={dirty.concat(tx("s9", "2026-04-01", "OUT", 4_00, 1_00))}
          actor="kari"
          onSubmit={onSubmit}
        />
      </BookiLocaleProvider>,
    );
    expect(entry()).toMatchObject({ status: "submitted", payableMinor: 200_00, unmappedTotal: 0 });
  });

  it("needs a second person to submit when asked", () => {
    const ready: VatReturnFiling = { status: "ready", readyBy: "kari", readyAt: "2026-05-01T08:00:00Z" };
    const first = setup(
      "vat-return",
      "VAT return",
      <VatReturn {...base} transactions={clean} actor="kari" requireSecondPerson defaultFiling={ready} />,
    );
    fireEvent.click(first.button("Submit"));
    expect(first.alert()).toMatch(/"kari" marked this VAT return ready and cannot also submit it/);
    expect(first.entry().status).toBe("ready");
    cleanup();
    const second = setup(
      "vat-return",
      "VAT return",
      <VatReturn {...base} transactions={clean} actor="per" requireSecondPerson defaultFiling={ready} />,
    );
    fireEvent.click(second.button("Submit"));
    expect(second.entry().filing).toMatchObject({ status: "submitted", submittedBy: "per" });
  });

  it("blocks a person while a code is unmapped, and reports a bad period as the issue", () => {
    const { entry, button } = setup(
      "vat-return",
      "VAT return",
      <VatReturn {...base} transactions={dirty} actor="kari" />,
    );
    expect((button("Mark ready") as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('[data-slot="vat-return-unmapped"] tbody')?.textContent).toContain("RC");
    expect(document.querySelector('[data-slot="vat-return-issues"]')?.textContent).toMatch(
      /no box of the return takes/,
    );
    expect(entry().status).toBe("draft");
    cleanup();
    const bad = setup(
      "vat-return",
      "VAT return",
      <VatReturn schema={GENERIC_VAT_SCHEMA_EXAMPLE} transactions={clean} period="March" />,
    );
    expect(bad.entry()).toMatchObject({ ready: false, boxes: [] });
    expect(bad.entry().issues[0]).toMatch(/period given as a code such as 2026/);
  });

  it("is named in Norwegian and moves focus with a person", () => {
    const { button } = setup("vat-return", "Mva-melding", <VatReturn {...base} transactions={clean} />, "NO");
    expect(document.querySelector('[data-slot="vat-return"]')?.getAttribute("aria-label")).toBe("Mva-melding");
    fireEvent.click(button("Vis bilag: Tax on sales"));
    expect(document.activeElement).toBe(button("Tilbake til postene"));
    expect(document.querySelectorAll('[data-slot="vat-return-vouchers"] tbody tr')).toHaveLength(2);
    fireEvent.click(button("Tilbake til postene"));
    expect(document.activeElement).toBe(button("Vis bilag: Tax on sales"));
  });

  it("reports the click as the source of the change (ui-sdk mount)", async () => {
    const view = mount(
      vatReturn,
      { ...base, transactions: clean, actor: "kari" },
      `<root><box value="sales">Sales</box><back>Back</back><ready>Ready</ready><submit>Submit</submit></root>`,
    );
    try {
      await view.click(view.part("box", "sales")!);
      expect(view.state).toMatchObject({ box: "sales", total: 2 });
      expect(view.changes.at(-1)).toMatchObject({ key: "box", reason: "open-box", source: "mouse" });
      await view.click(view.part("ready")!);
      expect(view.state.status).toBe("ready");
      expect(view.changes.at(-1)).toMatchObject({ key: "filing", reason: "mark-ready", source: "mouse" });
      await view.click(view.part("submit")!);
      expect(view.state.filing).toMatchObject({ status: "submitted", submittedBy: "kari" });
      expect(view.changes.at(-1)).toMatchObject({ key: "filing", reason: "submit-return", source: "mouse" });
    } finally {
      view.unmount();
    }
  });
});
