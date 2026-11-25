import type { CloseTask } from "@booki-aui/core/close";
import type { Invoice } from "@booki-aui/core/invoice";
import type { PaymentBatch as Batch } from "@booki-aui/core/payment-batch";
import { mount } from "@ui-sdk/core/testing";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createBookiAgent } from "./booki-agent.js";
import { CloseChecklist, closeChecklist } from "./close-checklist.js";
import { InvoiceEditor } from "./invoice-editor.js";
import { BookiLocaleProvider } from "./locale.js";
import { PaymentBatch } from "./payment-batch.js";
import { PeriodLock, periodLock } from "./period-lock.js";

afterEach(() => cleanup());

type Result = { ok: boolean; error?: { message: string } };

function setup(component: string, ref: string, ui: ReactElement) {
  const agent = createBookiAgent({ agentId: "test" });
  render(<BookiLocaleProvider defaultCountry="US">{ui}</BookiLocaleProvider>);
  const entry = () => agent.snapshot().find((c) => c.component === component) as unknown as Record<string, any>;
  const act = (action: string, args: unknown[] = []) =>
    agent.act({ steps: [{ ref, action, args }] }) as Promise<Result>;
  const button = (name: string) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent === name || b.getAttribute("aria-label") === name,
    )!;
  const alert = () => document.querySelector('[role="alert"]')?.textContent ?? "";
  return { entry, act, button, alert };
}

describe("PeriodLock", () => {
  const ui = (
    <PeriodLock codes={["2026-01", "2026-02"]} defaultPeriods={[{ code: "2026-01", status: "soft-closed" }]} />
  );

  it("answers an agent's posting question and refuses it the lock", async () => {
    const { entry, act } = setup("period-lock", "Periods", ui);
    expect(entry().actions).toEqual(["assertPostingAllowed"]);
    expect(entry().periods).toEqual([{ code: "2026-01", status: "soft-closed" }]);
    const closed = await act("assertPostingAllowed", ["2026-01-15"]);
    expect(closed.ok).toBe(false);
    expect(closed.error?.message).toMatch(/closed for ordinary posting/);
    expect((await act("assertPostingAllowed", ["2026-02-15"])).ok).toBe(true);
    expect((await act("setStatus", ["2026-02", "hard-closed"])).ok).toBe(false);
    expect(entry().periods).toHaveLength(1);
  });

  it("lets a person close, lock and never reopen a locked period", () => {
    const { entry, button } = setup("period-lock", "Periods", ui);
    fireEvent.click(button("Close: February 2026"));
    fireEvent.click(button("Lock: January 2026"));
    expect(entry().periods).toEqual(
      expect.arrayContaining([
        { code: "2026-02", status: "soft-closed" },
        { code: "2026-01", status: "hard-closed" },
      ]),
    );
    expect(button("Reopen: January 2026")).toBeUndefined();
  });

  it("reports the click as the source of the change (ui-sdk mount)", async () => {
    const view = mount(periodLock, {}, `<root><set value="2026-03|soft-closed">Close</set></root>`);
    try {
      await view.click(view.part("set", "2026-03|soft-closed")!);
      expect(view.state.periods).toEqual([{ code: "2026-03", status: "soft-closed" }]);
      expect(view.changes.at(-1)).toMatchObject({ key: "periods", reason: "period-soft-closed", source: "mouse" });
    } finally {
      view.unmount();
    }
  });
});

describe("CloseChecklist", () => {
  const tasks: CloseTask[] = [
    { id: "bank", title: "Reconcile bank", status: "open", needsSignOff: true },
    { id: "vat", title: "File VAT", status: "open", dependsOn: ["bank"] },
  ];

  it("lets an agent prepare but only a person sign off", async () => {
    const { entry, act, button, alert } = setup(
      "close-checklist",
      "Period close",
      <CloseChecklist defaultTasks={tasks} actor="kari" />,
    );
    expect(entry()).toMatchObject({
      actions: ["completeTask", "assertReadyToClose"],
      ready: ["bank"],
      readyToClose: false,
    });
    const early = await act("completeTask", ["vat"]);
    expect(early.error?.message).toMatch(/waits for: bank/);
    expect((await act("completeTask", ["bank"])).ok).toBe(true);
    expect((await act("completeTask", ["vat"])).ok).toBe(true);
    expect(entry().tasks[0]).toMatchObject({ status: "done", doneBy: "agent" });
    expect((await act("signOff", ["bank"])).ok).toBe(false);
    const notYet = await act("assertReadyToClose");
    expect(notYet.error?.message).toMatch(/1 waiting for sign-off/);
    fireEvent.click(button("Sign off: Reconcile bank"));
    expect(alert()).toBe("");
    expect(entry()).toMatchObject({ readyToClose: true, awaitingSignOff: [] });
    expect((await act("assertReadyToClose")).ok).toBe(true);
  });

  it("stops a person signing off their own work", () => {
    const { entry, button, alert } = setup(
      "close-checklist",
      "Period close",
      <CloseChecklist defaultTasks={tasks} actor="kari" />,
    );
    fireEvent.click(button("Mark done: Reconcile bank"));
    fireEvent.click(button("Sign off: Reconcile bank"));
    expect(alert()).toMatch(/second person/);
    expect(entry().tasks[0].status).toBe("done");
    expect((button("Mark done: File VAT") as HTMLButtonElement).disabled).toBe(false);
  });

  it("runs without a DOM", () => {
    const instance = closeChecklist({ id: "close", defaultTasks: tasks });
    try {
      instance.api.completeTask("bank");
      expect(instance.get().ready).toEqual(["vat"]);
    } finally {
      instance.destroy();
    }
  });
});

describe("PaymentBatch", () => {
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
      { id: "p2", creditorName: "Acme", amountMinor: 100_00, creditorAccount: "86011117947", reference: "INV-1" },
      { id: "p3", creditorName: "Birch", amountMinor: 250_00, creditorAccount: "1234 56 78903" },
    ],
  };

  it("hides account numbers from the agent and shows the duplicate", async () => {
    const { entry, act } = setup("payment-batch", "Payment batch", <PaymentBatch defaultBatch={batch} actor="kari" />);
    const state = entry();
    expect(state.actions).toEqual([
      "setSort",
      "clearSort",
      "setSearch",
      "setFilter",
      "clearFilters",
      "setPage",
      "setPageSize",
      "removePayment",
      "assertReleasable",
    ]);
    expect(JSON.stringify(state)).not.toMatch(/17947|78903|12345/);
    expect(state.payments).toHaveLength(3);
    expect(state.issues[0]).toMatch(/p1 and p2 look like the same payment/);
    expect((await act("approve")).ok).toBe(false);
    expect((await act("release")).ok).toBe(false);
    expect((await act("removePayment", ["p2"])).ok).toBe(true);
    expect(entry()).toMatchObject({ issues: [], totalMinor: 350_00, releasable: false });
    expect((await act("assertReleasable")).error?.message).toMatch(/0 of 2 approvals/);
  });

  it("keeps account numbers out of what agent.subscribe hears, and gives the owner all of it", async () => {
    const owner: Batch[] = [];
    const agent = createBookiAgent({ agentId: "test" });
    const heard: unknown[] = [];
    agent.subscribe((event) => heard.push(event));
    render(
      <BookiLocaleProvider defaultCountry="US">
        <PaymentBatch defaultBatch={batch} actor="kari" onBatchChange={(next) => owner.push(next)} />
      </BookiLocaleProvider>,
    );
    const result = (await agent.act({
      steps: [{ ref: "Payment batch", action: "removePayment", args: ["p2"] }],
    })) as Result;
    expect(result.ok).toBe(true);
    expect(heard.length).toBeGreaterThan(0);
    expect(JSON.stringify(heard)).not.toMatch(/17947|78903|12345/);
    expect(owner.at(-1)?.items.map((item) => item.creditorAccount)).toEqual(["8601 11 17947", "1234 56 78903"]);
  });

  it("needs two people who did not prepare it", () => {
    const clean = { ...batch, items: [batch.items[0]!, batch.items[2]!] };
    const first = setup("payment-batch", "Payment batch", <PaymentBatch defaultBatch={clean} actor="nina" />);
    fireEvent.click(first.button("Approve"));
    expect(first.alert()).toMatch(/prepared this batch/);
    cleanup();
    const one = { ...clean, approvals: [{ approverId: "per", at: "2026-01-31T10:00:00Z", fingerprint: "" }] };
    // An approval of some other version does not count.
    const second = setup("payment-batch", "Payment batch", <PaymentBatch defaultBatch={one} actor="kari" />);
    expect(second.entry().approvals).toEqual([]);
    fireEvent.click(second.button("Approve"));
    expect(second.entry().approvals).toEqual(["kari"]);
    expect((second.button("Release to bank") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("InvoiceEditor", () => {
  it("takes a line as one object with the names people use, and says which fields exist", async () => {
    const empty = { ...draft, lines: [] };
    const { entry, act } = setup(
      "invoice-editor",
      "Invoice",
      <InvoiceEditor defaultInvoice={empty} nextNumber="1001" aria-label="Invoice" />,
    );
    // What a real model sent first: units and percent, not thousandths and basis points.
    expect(
      (await act("addLine", [{ description: "Rådgivning", quantity: 12.5, unitPriceMinor: 145_000, taxRate: 25 }])).ok,
    ).toBe(true);
    expect(entry().invoice.lines[0]).toMatchObject({ quantityMilli: 12_500, taxRateBp: 2_500, taxCategory: "S" });
    expect(entry().totals).toMatchObject({ netMinor: 1_812_500, taxMinor: 453_125 });

    const unknown = await act("addLine", [
      { description: "Reise", qtyMilli: 1000, unitPriceMinor: 238_000, taxRate: 25 },
    ]);
    expect(unknown.error?.message).toMatch(
      /no field "qtyMilli"\. A line takes: description, quantity \(2\.5\) or quantityMilli/,
    );
    const missing = await act("addLine", [{ description: "Reise", taxRate: 25 }]);
    expect(missing.error?.message).toMatch(/needs quantity, unitPriceMinor/);

    expect((await act("setLine", [entry().invoice.lines[0].id, { discountPercent: 10 }])).ok).toBe(true);
    expect(entry().invoice.lines[0].discountBp).toBe(1_000);
  });

  const draft: Invoice = {
    id: "i1",
    kind: "invoice",
    status: "draft",
    currency: "USD",
    lines: [
      {
        id: "l1",
        description: "Hours",
        quantityMilli: 2000,
        unitPriceMinor: 150_00,
        taxCategory: "S",
        taxRateBp: 1000,
      },
    ],
  };

  it("lets an agent draft lines, computes totals, and keeps finalize for a person", async () => {
    const { entry, act, button } = setup(
      "invoice-editor",
      "Invoice",
      <InvoiceEditor defaultInvoice={draft} nextNumber="1001" aria-label="Invoice" />,
    );
    expect(entry().totals).toMatchObject({ netMinor: 300_00, taxMinor: 30_00, grossMinor: 330_00 });
    expect((await act("addLine", ["Licence", 1000, 99_00, "AE", 0])).ok).toBe(true);
    expect(entry().issues[0]).toMatch(/VAT number/);
    const bad = await act("setLine", ["l2", { quantityMilli: 1.5 }]);
    expect(bad.error?.message).toMatch(/whole number/);
    expect((await act("assertFinalizable")).ok).toBe(false);
    expect((await act("setCustomerTaxId", ["SE556677889901"])).ok).toBe(true);
    expect((await act("assertFinalizable")).ok).toBe(true);
    expect((await act("finalize")).ok).toBe(false);
    expect(entry().invoice.status).toBe("draft");
    fireEvent.click(button("Finalize"));
    expect(entry().invoice).toMatchObject({ status: "finalized", number: "1001" });
    const late = await act("removeLine", ["l1"]);
    expect(late.error?.message).toMatch(/takes no removeLine now|cannot be edited/);
  });

  it("cannot be finalized through setInvoice", async () => {
    const { entry, act } = setup(
      "invoice-editor",
      "Invoice",
      <InvoiceEditor defaultInvoice={draft} nextNumber="1001" aria-label="Invoice" />,
    );
    expect((await act("setInvoice", [{ ...draft, status: "finalized", number: "9999", lines: [] }])).ok).toBe(true);
    expect(entry().invoice).toMatchObject({ status: "draft", lines: [] });
    expect(entry().invoice.number).toBeUndefined();
  });

  it("takes a person's typing on blur and shows a refusal", () => {
    const { entry, alert } = setup(
      "invoice-editor",
      "Invoice",
      <InvoiceEditor defaultInvoice={draft} nextNumber="1001" aria-label="Invoice" />,
    );
    const price = document.querySelector('input[aria-label="Unit price 1"]') as HTMLInputElement;
    fireEvent.change(price, { target: { value: "200.50" } });
    expect(entry().invoice.lines[0].unitPriceMinor).toBe(150_00);
    fireEvent.blur(price);
    expect(entry().invoice.lines[0].unitPriceMinor).toBe(200_50);
    const qty = document.querySelector('input[aria-label="Quantity 1"]') as HTMLInputElement;
    fireEvent.change(qty, { target: { value: "abc" } });
    fireEvent.blur(qty);
    expect(alert()).toMatch(/not a number/);
    expect(entry().invoice.lines[0].quantityMilli).toBe(2000);
  });
});

import { VoucherComposer } from "./voucher-composer.js";

describe("VoucherComposer: further dimensions and closed periods", () => {
  const ui = (date: string) => (
    <VoucherComposer
      accounts={[
        { number: "6800", name: "Office", requiredDimensions: ["costCentre"] },
        { number: "2400", name: "Payables" },
      ]}
      dimensions={[{ key: "costCentre", name: "cost centre", options: [{ code: "40", name: "Sales" }] }]}
      periods={[{ code: "2025", status: "hard-closed" }]}
      postingDate={date}
    />
  );

  it("needs the dimension, refuses an unknown value, and then posts", async () => {
    const { entry, act } = setup("voucher-composer", "Voucher lines", ui("2026-01-05"));
    await act("addLine", ["6800", undefined, 100, 0]);
    await act("addLine", ["2400", undefined, 0, 100]);
    const id = entry().lines[0].id;
    expect((await act("assertPostable")).error?.message).toMatch(/needs a cost centre/);
    expect((await act("setDimension", [id, "costCentre", "99"])).error?.message).toMatch(/40 Sales/);
    expect((await act("setDimension", [id, "costCentre", "40"])).ok).toBe(true);
    expect(entry()).toMatchObject({ postable: true });
    expect(entry().lines[0].dimensions).toEqual({ costCentre: "40" });
  });

  it("is not postable when dated in a closed period", async () => {
    const { entry, act } = setup("voucher-composer", "Voucher lines", ui("2025-12-31"));
    await act("addLine", ["2400", undefined, 100, 0]);
    await act("addLine", ["2400", undefined, 0, 100]);
    expect(entry().postable).toBe(false);
    expect((await act("assertPostable")).error?.message).toMatch(/Period 2025 is closed/);
  });
});
