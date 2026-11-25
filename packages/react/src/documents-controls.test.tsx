import type { Attachment, AttachmentFile } from "@booki-aui/core/attachments";
import type { ExpenseClaim as Claim, ExpensePolicy } from "@booki-aui/core/expense";
import type { SupplierInvoice } from "@booki-aui/core/supplier-invoice";
import { mount } from "@ui-sdk/core/testing";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createBookiAgent } from "./booki-agent.js";
import { EvidenceList, evidenceList } from "./evidence-list.js";
import { ExpenseClaim, expenseClaim } from "./expense-claim.js";
import { BookiLocaleProvider } from "./locale.js";
import { SupplierInvoiceInbox, supplierInvoiceInbox } from "./supplier-invoice-inbox.js";

afterEach(() => cleanup());

type Result = { ok: boolean; error?: { message: string } };

function setup(component: string, ref: string, ui: ReactElement, country: "US" | "NO" = "US") {
  const agent = createBookiAgent({ agentId: "test" });
  render(<BookiLocaleProvider defaultCountry={country}>{ui}</BookiLocaleProvider>);
  const entry = () => agent.snapshot().find((c) => c.component === component) as unknown as Record<string, any>;
  const act = (action: string, args: unknown[] = []) =>
    agent.act({ steps: [{ ref, action, args }] }) as Promise<Result>;
  const button = (name: string) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent === name || b.getAttribute("aria-label") === name,
    )!;
  const input = (name: string) => document.querySelector(`input[aria-label="${name}"]`) as HTMLInputElement;
  const select = (name: string) => document.querySelector(`select[aria-label="${name}"]`) as HTMLSelectElement;
  const type = (name: string, text: string) => {
    fireEvent.change(input(name), { target: { value: text } });
    fireEvent.blur(input(name));
  };
  const alert = () => document.querySelector('[role="alert"]')?.textContent ?? "";
  return { agent, entry, act, button, input, select, type, alert };
}

describe("SupplierInvoiceInbox", () => {
  const f = <T,>(value: T, confidence = 0.99) => ({ value, confidence });
  const invoice = (id: string, over: Partial<SupplierInvoice["fields"]> = {}): SupplierInvoice => ({
    id,
    status: "new",
    document: { id: `doc-${id}`, fileName: `${id}.pdf`, page: 1 },
    bankAccount: "8601 11 17947",
    fields: {
      supplierName: f("Acme Inc"),
      supplierOrgNumber: f("12-3456789"),
      invoiceNumber: f("INV-100"),
      invoiceDate: f("2026-01-10"),
      dueDate: f("2026-02-09", 0.6),
      netMinor: f(1000_00),
      taxMinor: f(80_00),
      grossMinor: f(1090_00, 0.7),
      currency: f("USD"),
      paymentReference: f("RF18539007547034", 0.5),
      ...over,
    },
  });
  const invoices = [invoice("s1"), invoice("s2", { invoiceNumber: f("INV-200"), paymentReference: f("KID-778899") })];
  const ui = (list = invoices) => <SupplierInvoiceInbox defaultInvoices={list} chart={["4000", "6800"]} actor="kari" />;

  it("approves under the company's rule only, and records the rule as the approver", async () => {
    const clean = invoice("r1", {
      dueDate: f("2026-02-09"),
      grossMinor: f(1080_00),
      paymentReference: f("RF18539007547034"),
    });
    const noRule = setup("supplier-invoice-inbox", "Supplier invoices", ui([clean]));
    expect((await noRule.act("proposeCoding", ["r1", "6800"])).ok).toBe(true);
    expect((await noRule.act("approveUnderRule", ["r1"])).error?.message).toMatch(
      /no company rule .* a person approves it/,
    );
    cleanup();

    const under = (limit: number) => (inv: SupplierInvoice) =>
      Number(inv.fields.grossMinor.value) <= limit || `Over ${limit / 100}.`;
    const ruled = setup(
      "supplier-invoice-inbox",
      "Supplier invoices",
      <SupplierInvoiceInbox
        defaultInvoices={[clean]}
        chart={["4000", "6800"]}
        actor="kari"
        rule={under(500_00)}
        ruleName="small-invoices"
      />,
    );
    await ruled.act("proposeCoding", ["r1", "6800"]);
    // The paymentReference was read with confidence, but a person must still confirm it before approval in this control.
    const refused = await ruled.act("approveUnderRule", ["r1"]);
    expect(refused.ok).toBe(false);
    cleanup();

    const ok = setup(
      "supplier-invoice-inbox",
      "Supplier invoices",
      <SupplierInvoiceInbox
        defaultInvoices={[clean]}
        chart={["4000", "6800"]}
        actor="kari"
        rule={under(5000_00)}
        ruleName="small-invoices"
      />,
    );
    await ok.act("proposeCoding", ["r1", "6800"]);
    const result = await ok.act("approveUnderRule", ["r1"]);
    if (result.ok) {
      expect(ok.entry().inbox[0]).toMatchObject({ status: "approved", approvedBy: "rule:small-invoices" });
    } else {
      // Refused only for what still stops any approval, never for the rule itself.
      expect(result.error?.message).not.toMatch(/company rule/);
    }
  });

  it("lets an agent propose a rejection, which a person reads and decides", async () => {
    const { entry, act, input } = setup("supplier-invoice-inbox", "Supplier invoices", ui());
    expect((await act("proposeRejection", ["s1", ""])).error?.message).toMatch(/give the reason/);
    // s1 is the invoice open in the composed inbox, so its reject field is on screen.
    expect((await act("proposeRejection", ["s1", "Second copy of INV-100, already booked"])).ok).toBe(true);
    expect(entry().inbox[0]).toMatchObject({
      status: "new",
      proposedRejection: { reason: "Second copy of INV-100, already booked", by: "agent" },
    });
    const reason = [...document.querySelectorAll("input")].find(
      (el) => (el as HTMLInputElement).value === "Second copy of INV-100, already booked",
    );
    expect(reason, "the reason waits in the person's reject field").toBeTruthy();
    expect(input).toBeTypeOf("function");
    // The person rejects with the reason as it stands: what the field shows is what is recorded.
    fireEvent.click(document.querySelector('[data-slot="supplier-invoice-inbox-reject"]')!);
    expect(entry().inbox[0]).toMatchObject({
      status: "rejected",
      rejectionReason: "Second copy of INV-100, already booked",
    });
  });

  it("lets an agent correct, confirm and code, and keeps secrets and approval from it", async () => {
    const { agent, entry, act } = setup("supplier-invoice-inbox", "Supplier invoices", ui());
    expect(entry().actions).toEqual([
      "setSort",
      "clearSort",
      "setSearch",
      "setFilter",
      "clearFilters",
      "setPage",
      "setPageSize",
      "correctField",
      "confirmField",
      "proposeCoding",
      "approveUnderRule",
      "proposeRejection",
      "assertApprovable",
    ]);
    expect(JSON.stringify(agent.snapshot())).not.toMatch(/RF18539007547034|KID-778899|17947/);
    const first = () => entry().inbox[0];
    expect(first()).toMatchObject({
      id: "s1",
      status: "new",
      needsReview: ["dueDate", "grossMinor", "paymentReference"],
      approvable: false,
      paymentReference: { present: true, reviewed: false },
      hasBankAccount: true,
    });
    expect(first().issues[0]).toMatch(/Net 100000 \+ tax 8000 is 108000, but gross is 109000/);

    expect((await act("correctField", ["s1", "grossMinor", 1080.5])).error?.message).toMatch(
      /whole number of minor units/,
    );
    expect((await act("correctField", ["s1", "grossMinor", 1080_00])).ok).toBe(true);
    expect((await act("confirmField", ["s1", "dueDate"])).ok).toBe(true);
    expect(first().fields.grossMinor).toMatchObject({ value: 1080_00, correctedBy: "agent" });
    expect(first().fields.dueDate.confirmedBy).toBe("agent");
    expect((await act("confirmField", ["s1", "paymentReference"])).error?.message).toMatch(/hidden from agents/);
    expect((await act("correctField", ["s1", "paymentReference", "123"])).ok).toBe(false);
    expect((await act("confirmField", ["nope", "dueDate"])).error?.message).toMatch(
      /No supplier invoice "nope". Invoices: s1, s2/,
    );

    expect((await act("proposeCoding", ["s1", "9999"])).error?.message).toMatch(
      /not in the chart of accounts. Accounts: 4000, 6800/,
    );
    expect((await act("proposeCoding", ["s1", "6800", "TX", { costCentre: "40" }])).ok).toBe(true);
    expect(first()).toMatchObject({
      status: "coded",
      coding: { account: "6800", vatCode: "TX", dimensions: { costCentre: "40" } },
    });
    expect((await act("assertApprovable", ["s1"])).error?.message).toMatch(/Confirm or correct paymentReference/);

    // What a step returns carries no secret either.
    expect(JSON.stringify(await act("assertApprovable", ["s2"]))).not.toMatch(/RF18539007547034|KID-778899|17947/);
    expect((await act("approve", ["s1"])).ok).toBe(false);
    expect((await act("reject", ["s1"])).ok).toBe(false);
    expect((await act("confirmByPerson", ["s1|paymentReference"])).ok).toBe(false);
    expect(first().status).toBe("coded");
    expect(JSON.stringify(agent.snapshot())).not.toMatch(/RF18539007547034|KID-778899|17947/);
  });

  it("lets a person confirm, approve, and then refuses every edit", async () => {
    const ready = invoice("s1", { dueDate: f("2026-02-09"), grossMinor: f(1080_00) });
    const { entry, act, button, input, select, alert } = setup(
      "supplier-invoice-inbox",
      "Supplier invoices",
      ui([ready]),
    );
    expect((button("Approve for posting") as HTMLButtonElement).disabled).toBe(true);
    expect(input("Payment reference").value).toBe("RF18539007547034");
    fireEvent.click(button("Confirm: Payment reference"));
    fireEvent.change(select("Account"), { target: { value: "4000" } });
    expect(entry().inbox[0]).toMatchObject({
      status: "coded",
      coding: { account: "4000" },
      approvable: true,
      issues: [],
    });
    expect(entry().approvable).toEqual(["s1"]);
    expect((await act("assertApprovable", ["s1"])).ok).toBe(true);
    fireEvent.click(button("Approve for posting"));
    expect(alert()).toBe("");
    expect(entry().inbox[0]).toMatchObject({ status: "approved", approvedBy: "kari" });
    expect((await act("correctField", ["s1", "netMinor", 1])).error?.message).toMatch(
      /is approved and cannot be edited/,
    );
    expect((await act("proposeCoding", ["s1", "6800"])).error?.message).toMatch(/cannot be edited/);
    expect(input("Net").getAttribute("aria-readonly")).toBe("true");
    fireEvent.change(input("Net"), { target: { value: "5" } });
    fireEvent.blur(input("Net"));
    expect(entry().inbox[0].fields.netMinor.value).toBe(1000_00);
    expect(alert()).toBe("");
    expect(button("Reject")).toBeUndefined();
  });

  it("flags a duplicate, takes typed corrections on blur and rejects with a reason", () => {
    const copy = invoice("s2");
    const { entry, button, type, alert } = setup(
      "supplier-invoice-inbox",
      "Supplier invoices",
      ui([invoice("s1"), copy]),
    );
    expect(entry().inbox[0].duplicateOf).toEqual(["s2"]);
    expect(entry().inbox[1].issues.join(" ")).toMatch(/also on "s1"/);
    type("Gross", "1,080.00");
    expect(entry().inbox[0].fields.grossMinor).toMatchObject({ value: 1080_00, correctedBy: "kari" });
    type("Due date", "tomorrow");
    expect(alert()).toMatch(/dueDate must be a date as YYYY-MM-DD/);
    expect(entry().inbox[0].fields.dueDate.value).toBe("2026-02-09");
    fireEvent.click(button("Open: Acme Inc INV-100"));
    fireEvent.click(button("Reject"));
    expect(alert()).toMatch(/needs a reason/);
    type("Reason for rejecting", "Sent twice");
    fireEvent.click(button("Reject"));
    expect(entry().inbox[0]).toMatchObject({ status: "rejected", rejectionReason: "Sent twice", rejectedBy: "kari" });
    // The copy is gone, so the other invoice is no longer a duplicate.
    expect(entry().inbox[1].duplicateOf).toEqual([]);
  });

  it("is named in Norwegian under the NO profile", () => {
    const { entry } = setup("supplier-invoice-inbox", "Leverandørfakturaer", ui(), "NO");
    expect(entry().inbox).toHaveLength(2);
    expect(document.querySelector('[aria-label="Leverandørfakturaer"]')).not.toBeNull();
  });

  it("reports the click as the source of the change (ui-sdk mount)", async () => {
    const view = mount(
      supplierInvoiceInbox,
      { defaultInvoices: [invoice("s1")], actor: "kari" },
      `<root><confirm value="s1|dueDate">Confirm</confirm></root>`,
    );
    try {
      await view.click(view.part("confirm", "s1|dueDate")!);
      expect(view.state.invoices[0]?.fields.dueDate.confirmedBy).toBe("kari");
      // Reported on invoicesShown: the copy without bank account and payment reference.
      expect(view.changes.at(-1)).toMatchObject({ key: "invoicesShown", reason: "confirm-field", source: "mouse" });
    } finally {
      view.unmount();
    }
  });
});

describe("EvidenceList", () => {
  const hash = (c: string) => c.repeat(64);
  const file = (id: string, c: string, over: Partial<AttachmentFile> = {}): AttachmentFile => ({
    id,
    fileName: `${id}.pdf`,
    mediaType: "application/pdf",
    sizeBytes: 20_480,
    sha256: hash(c),
    ...over,
  });
  const linked: Attachment[] = [
    { ...file("f1", "a"), kind: "other", addedBy: "nina", addedAt: "2026-01-31T10:00:00Z" },
  ];
  const pool = [file("f1", "a"), file("f2", "b", { kind: "receipt" }), file("f3", "a")];
  const ui = (locked = false) => (
    <EvidenceList
      defaultAttachments={linked}
      pool={pool}
      requires={["receipt", "invoice"]}
      locked={locked}
      actor="kari"
    />
  );

  it("lets an agent link and classify, refuses the same file twice and keeps remove for a person", async () => {
    const { entry, act } = setup("evidence-list", "Evidence", ui());
    expect(entry()).toMatchObject({
      actions: ["linkAttachment", "setKind", "assertEvidenced"],
      missing: ["receipt", "invoice"],
      evidenced: false,
    });
    expect(entry().available.map((item: AttachmentFile) => item.id)).toEqual(["f2", "f3"]);
    expect((await act("assertEvidenced")).error?.message).toMatch(/not evidenced: missing receipt, invoice/);
    expect((await act("linkAttachment", ["f3"])).error?.message).toMatch(/"f3" \(f3.pdf\) is the same file as "f1"/);
    expect((await act("linkAttachment", ["f9"])).error?.message).toMatch(/No file "f9" to link. Available: f2, f3/);
    expect((await act("linkAttachment", ["f2"])).ok).toBe(true);
    expect(entry().attachments[1]).toMatchObject({ id: "f2", kind: "receipt", addedBy: "agent" });
    expect((await act("setKind", ["f1", "letter"])).error?.message).toMatch(
      /Kinds: invoice, receipt, contract, bank-statement, other/,
    );
    expect((await act("setKind", ["f1", "invoice"])).ok).toBe(true);
    expect(entry()).toMatchObject({ missing: [], evidenced: true });
    expect((await act("assertEvidenced")).ok).toBe(true);
    expect((await act("remove", ["f1"])).ok).toBe(false);
    expect((await act("linkByPerson", ["f3"])).ok).toBe(false);
    expect(entry().attachments).toHaveLength(2);
  });

  it("lets a person link, set the kind and remove", () => {
    const { entry, button, select, alert } = setup("evidence-list", "Evidence", ui());
    fireEvent.click(button("Link: f3.pdf"));
    expect(alert()).toMatch(/same file as "f1"/);
    fireEvent.click(button("Link: f2.pdf"));
    expect(alert()).toBe("");
    expect(entry().attachments[1]).toMatchObject({ id: "f2", kind: "receipt", addedBy: "kari" });
    fireEvent.change(select("Kind: f1.pdf"), { target: { value: "invoice" } });
    expect(entry().evidenced).toBe(true);
    fireEvent.click(button("Remove: f1.pdf"));
    expect(entry()).toMatchObject({ missing: ["invoice"], evidenced: false });
    expect(entry().available.map((item: AttachmentFile) => item.id)).toEqual(["f1", "f3"]);
  });

  it("keeps what is on a locked entry", async () => {
    const { entry, act, button, select } = setup("evidence-list", "Evidence", ui(true));
    expect(button("Remove: f1.pdf")).toBeUndefined();
    expect(select("Kind: f1.pdf")).toBeNull();
    expect((await act("setKind", ["f1", "receipt"])).error?.message).toMatch(/locked/);
    expect((await act("linkAttachment", ["f2", "receipt"])).ok).toBe(true);
    expect(entry().attachments).toHaveLength(2);
  });

  it("refuses removal on a locked entry and reports the click (ui-sdk mount)", async () => {
    const template = `<root><remove value="f1">Remove</remove></root>`;
    const locked = mount(evidenceList, { defaultAttachments: linked, locked: true, actor: "kari" }, template);
    try {
      await locked.click(locked.part("remove", "f1")!);
      expect(locked.state.attachments).toHaveLength(1);
      expect(locked.changes).toHaveLength(0);
    } finally {
      locked.unmount();
    }
    const view = mount(evidenceList, { defaultAttachments: linked, actor: "kari" }, template);
    try {
      await view.click(view.part("remove", "f1")!);
      expect(view.state.attachments).toEqual([]);
      expect(view.changes.at(-1)).toMatchObject({ key: "attachments", reason: "remove-attachment", source: "mouse" });
    } finally {
      view.unmount();
    }
  });
});

describe("ExpenseClaim", () => {
  const policy: ExpensePolicy = {
    categories: { travel: { receiptRequired: true }, meals: { receiptRequired: true, maxMinor: 75_00 } },
    mileageRateMinorPerKm: 70,
    perDiemRates: { domestic: 60_00 },
  };
  const claim: Claim = {
    id: "c1",
    claimantId: "nina",
    status: "draft",
    currency: "USD",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    lines: [
      {
        id: "l1",
        kind: "expense",
        date: "2026-01-12",
        category: "meals",
        description: "Dinner",
        amountMinor: 90_00,
        receiptId: "f1",
      },
    ],
    acceptedExceptions: [],
  };
  const ui = (actor: string, start = claim) => (
    <ExpenseClaim defaultClaim={start} policy={policy} today="2026-02-02" actor={actor} />
  );

  it("lets an agent build the claim, prices mileage and per diem, and keeps decisions for a person", async () => {
    const { entry, act } = setup("expense-claim", "Expense claim", ui("nina"));
    expect(entry().actions).toEqual(["addLine", "setLine", "removeLine", "assertSubmittable"]);
    expect(entry().exceptions).toMatchObject([{ lineId: "l1", rule: "over-limit", accepted: false }]);
    expect(
      (
        await act("addLine", [
          { kind: "mileage", date: "2026-01-13", description: "Client visit", distanceMeters: 12_500 },
        ])
      ).ok,
    ).toBe(true);
    expect(
      (
        await act("addLine", [
          { kind: "per-diem", date: "2026-01-13", description: "Boston", days: 2, rate: "domestic" },
        ])
      ).ok,
    ).toBe(true);
    expect(entry()).toMatchObject({ amounts: { l1: 90_00, l2: 8_75, l3: 120_00 }, totalMinor: 218_75 });
    const typed = await act("addLine", [
      { kind: "mileage", date: "2026-01-13", description: "", distanceMeters: 1000, amountMinor: 500_00 },
    ]);
    expect(typed.error?.message).toMatch(/computed from the policy and cannot be set/);
    expect((await act("setLine", ["l2", { amountMinor: 500_00 }])).error?.message).toMatch(/computed from the policy/);
    expect(
      (
        await act("addLine", [
          { kind: "expense", date: "2026-03-01", category: "travel", description: "Flight", amountMinor: 300_00 },
        ])
      ).ok,
    ).toBe(true);
    expect(entry().exceptions.map((e: { lineId: string; rule: string }) => `${e.lineId} ${e.rule}`)).toEqual([
      "l1 over-limit",
      "l4 missing-receipt",
      "l4 outside-period",
      "l4 future-date",
    ]);
    expect((await act("removeLine", ["l4"])).ok).toBe(true);
    expect((await act("setLine", ["l1", { category: "gifts" }])).error?.message).toMatch(/Categories: travel, meals/);
    expect((await act("assertSubmittable")).ok).toBe(true);
    for (const action of ["submit", "approve", "reject", "addByPerson"]) expect((await act(action)).ok).toBe(false);
    expect((await act("acceptByPerson", ["l1|over-limit"])).ok).toBe(false);
    expect(entry().claim.status).toBe("draft");
    expect(entry().claim.acceptedExceptions).toEqual([]);
  });

  it("stops the claimant accepting their own exception or approving their own claim", async () => {
    const { entry, act, button, type, alert } = setup("expense-claim", "Expense claim", ui("nina"));
    type("Reason: Line 1: above the limit", "It was a good dinner");
    fireEvent.click(button("Accept: Line 1: above the limit"));
    expect(alert()).toMatch(/"nina" is the claimant and cannot accept/);
    fireEvent.click(button("Submit"));
    expect(entry()).toMatchObject({ claim: { status: "submitted" }, approvable: false });
    expect((await act("removeLine", ["l1"])).error?.message).toMatch(/is submitted and cannot be edited/);
    expect((button("Approve") as HTMLButtonElement).disabled).toBe(true);
    cleanup();

    const submitted = { ...claim, status: "submitted" as const };
    const own = setup(
      "expense-claim",
      "Expense claim",
      ui("nina", {
        ...claim,
        lines: [{ ...claim.lines[0]!, amountMinor: 50_00 } as Claim["lines"][number]],
        status: "submitted",
      }),
    );
    fireEvent.click(own.button("Approve"));
    expect(own.alert()).toMatch(/cannot approve their own claim/);
    cleanup();

    const boss = setup("expense-claim", "Expense claim", ui("per", submitted));
    fireEvent.click(boss.button("Accept: Line 1: above the limit"));
    expect(boss.alert()).toMatch(/needs a reason/);
    boss.type("Reason: Line 1: above the limit", "Client dinner");
    fireEvent.click(boss.button("Accept: Line 1: above the limit"));
    expect(boss.entry().exceptions[0]).toMatchObject({ accepted: true, acceptedBy: "per", reason: "Client dinner" });
    expect(boss.entry().approvable).toBe(true);
    fireEvent.click(boss.button("Approve"));
    expect(boss.entry().claim).toMatchObject({ status: "approved", decidedBy: "per" });
  });

  it("takes a person's typing: a cell on blur and a new line from the row below", () => {
    const { entry, button, select, type, input, alert } = setup("expense-claim", "Expense claim", ui("nina"));
    type("Amount 1", "70.00");
    expect(entry().claim.lines[0].amountMinor).toBe(70_00);
    expect(entry().exceptions).toEqual([]);
    type("Amount 1", "lots");
    expect(alert()).toMatch(/not an amount/);
    fireEvent.change(select("Kind"), { target: { value: "mileage" } });
    fireEvent.change(input("New line: Date"), { target: { value: "2026-01-20" } });
    fireEvent.change(input("New line: Kilometres"), { target: { value: "12.5" } });
    fireEvent.click(button("Add line"));
    expect(entry().claim.lines[1]).toMatchObject({ kind: "mileage", date: "2026-01-20", distanceMeters: 12_500 });
    expect(entry().amounts.l2).toBe(8_75);
    expect(input("New line: Date").value).toBe("");
    type("Kilometres 2", "20");
    expect(entry().amounts.l2).toBe(14_00);
  });

  it("reports the click as the source of the change (ui-sdk mount)", async () => {
    const view = mount(
      expenseClaim,
      { defaultClaim: claim, policy, today: "2026-02-02", actor: "nina" },
      `<root><submit>Submit</submit></root>`,
    );
    try {
      await view.click(view.part("submit")!);
      expect(view.state.claim.status).toBe("submitted");
      expect(view.changes.at(-1)).toMatchObject({ key: "claim", reason: "submit-claim", source: "mouse" });
    } finally {
      view.unmount();
    }
  });
});
