import { describe, expect, it } from "vitest";
import { approvalState, assertApproved, decide, type ApprovalLevel, type ApprovalRequest } from "./approval.js";
import { assertPostingAllowed, periodStatusOn, setPeriodStatus } from "./period-lock.js";
import {
  assertReadyToClose,
  checkCloseTasks,
  completeCloseTask,
  reopenCloseTask,
  signOffCloseTask,
  summarizeClose,
  type CloseTask,
} from "./close.js";
import {
  assertEditable,
  creditableMinor,
  draftCreditNote,
  finalizeInvoice,
  invoiceIssues,
  invoiceTotals,
  lineNetMinor,
  type Invoice,
  type InvoiceLine,
} from "./invoice.js";
import {
  approveBatch,
  assertReleasable,
  batchIssues,
  releaseBatch,
  setBatchItems,
  type PaymentBatch,
} from "./payment-batch.js";

const AT = "2026-01-31T10:00:00Z";

describe("approval chain", () => {
  const chain: ApprovalLevel[] = [
    {
      id: "l1",
      name: "Manager",
      approvers: [{ id: "kari", limitMinor: 5_000_00, substituteId: "ola" }, { id: "per" }],
      escalateTo: { id: "cfo" },
    },
    { id: "l2", name: "CFO", fromMinor: 10_000_00, approvers: [{ id: "cfo" }] },
  ];
  const req = (amountMinor: number, requesterId = "nina"): ApprovalRequest => ({
    id: "r1",
    amountMinor,
    requesterId,
    decisions: [],
  });

  it("skips levels below their threshold and locks while pending", () => {
    const state = approvalState(chain, req(1_000_00));
    expect(state.levels.map((l) => l.id)).toEqual(["l1"]);
    expect(state.locked).toBe(true);
    expect(state.mayDecide).toEqual(["kari", "ola", "per"]);
  });
  it("refuses the requester", () => {
    expect(() => decide(chain, req(100, "per"), { approverId: "per", decision: "approved", at: AT })).toThrow(
      /cannot decide/,
    );
  });
  it("refuses an approver whose limit is too low and names who can", () => {
    expect(() => decide(chain, req(9_000_00), { approverId: "kari", decision: "approved", at: AT })).toThrow(
      /limit.*per/s,
    );
  });
  it("records a substitute as acting on behalf", () => {
    const next = decide(chain, req(100), { approverId: "ola", decision: "approved", at: AT });
    expect(next.decisions[0]).toMatchObject({ approverId: "ola", onBehalfOf: "kari" });
    expect(assertApproved(chain, next).status).toBe("approved");
  });
  it("needs a different person at each level", () => {
    const two: ApprovalLevel[] = [
      { id: "a", name: "A", approvers: [{ id: "x" }] },
      { id: "b", name: "B", approvers: [{ id: "x" }, { id: "y" }] },
    ];
    const first = decide(two, req(1), { approverId: "x", decision: "approved", at: AT });
    expect(approvalState(two, first).mayDecide).toEqual(["y"]);
    expect(() => decide(two, first, { approverId: "x", decision: "approved", at: AT })).toThrow(/different person/);
  });
  it("escalates, rejects, and refuses strangers", () => {
    const esc = decide(chain, req(100), { approverId: "per", decision: "escalated", at: AT });
    expect(approvalState(chain, esc).mayDecide).toEqual(["cfo"]);
    expect(() => decide(chain, esc, { approverId: "per", decision: "approved", at: AT })).toThrow(/not an approver/);
    const rejected = decide(chain, esc, { approverId: "cfo", decision: "rejected", at: AT });
    expect(approvalState(chain, rejected)).toMatchObject({ status: "rejected", locked: false });
    expect(() => assertApproved(chain, rejected)).toThrow(/rejected/);
  });
  it("refuses a fractional amount", () => {
    expect(() => approvalState(chain, req(1.5))).toThrow(/whole/);
  });
});

describe("period lock", () => {
  const states = [
    { code: "2025", status: "hard-closed" as const },
    { code: "2026-01", status: "soft-closed" as const },
  ];
  it("lets the strictest period win and treats unlisted periods as open", () => {
    expect(periodStatusOn(states, "2025-06-30")).toEqual({ status: "hard-closed", code: "2025" });
    expect(periodStatusOn(states, "2026-02-01").status).toBe("open");
  });
  it("refuses postings into closed periods", () => {
    expect(() => assertPostingAllowed(states, "2025-12-31", { mayAdjustClosed: true })).toThrow(/closed/);
    expect(() => assertPostingAllowed(states, "2026-01-15")).toThrow(/adjust a closed period/);
    expect(() => assertPostingAllowed(states, "2026-01-15", { mayAdjustClosed: true })).not.toThrow();
    expect(() => assertPostingAllowed(states, "2026-02-15")).not.toThrow();
    expect(() => assertPostingAllowed(states, "15.01.2026")).toThrow(/YYYY-MM-DD/);
  });
  it("never reopens a hard-closed period", () => {
    expect(() => setPeriodStatus(states, "2025", "open")).toThrow(/cannot be reopened/);
    expect(setPeriodStatus(states, "2026-01", "open")).toEqual([states[0]]);
    expect(() => setPeriodStatus(states, "jan", "open")).toThrow(/not a period code/);
  });
});

describe("close checklist", () => {
  const tasks: CloseTask[] = [
    { id: "bank", title: "Reconcile bank", status: "open", needsSignOff: true },
    { id: "vat", title: "File VAT", status: "open", dependsOn: ["bank"] },
  ];
  it("holds a task until its dependencies are done", () => {
    expect(() => completeCloseTask(tasks, "vat", "a")).toThrow(/waits for: bank/);
    expect(summarizeClose(tasks).ready).toEqual(["bank"]);
  });
  it("needs a second person to sign off, then closes", () => {
    let next = completeCloseTask(tasks, "bank", "a");
    next = completeCloseTask(next, "vat", "a");
    expect(() => assertReadyToClose(next)).toThrow(/1 waiting for sign-off/);
    expect(() => signOffCloseTask(next, "bank", "a")).toThrow(/second person/);
    next = signOffCloseTask(next, "bank", "b");
    expect(assertReadyToClose(next).readyToClose).toBe(true);
    expect(() => reopenCloseTask(next, "bank")).toThrow(/build on it: vat/);
  });
  it("catches loops and missing dependencies", () => {
    expect(() =>
      checkCloseTasks([
        { id: "a", title: "", status: "open", dependsOn: ["b"] },
        { id: "b", title: "", status: "open", dependsOn: ["a"] },
      ]),
    ).toThrow(/loop/);
    expect(() => checkCloseTasks([{ id: "a", title: "", status: "open", dependsOn: ["z"] }])).toThrow(/does not exist/);
  });
});

describe("invoice", () => {
  const line = (over: Partial<InvoiceLine> = {}): InvoiceLine => ({
    id: "1",
    description: "Hours",
    quantityMilli: 1500,
    unitPriceMinor: 1_200_00,
    taxCategory: "S",
    taxRateBp: 2500,
    ...over,
  });
  const inv = (over: Partial<Invoice> = {}): Invoice => ({
    id: "i1",
    kind: "invoice",
    status: "draft",
    currency: "NOK",
    lines: [line()],
    ...over,
  });

  it("computes totals from lines with exact rounding", () => {
    expect(lineNetMinor(line())).toBe(1_800_00);
    expect(lineNetMinor(line({ quantityMilli: 333, unitPriceMinor: 100, discountBp: 1000 }))).toBe(30);
    expect(invoiceTotals([line(), line({ id: "2", taxCategory: "Z", taxRateBp: 0 })])).toMatchObject({
      netMinor: 3_600_00,
      taxMinor: 450_00,
      grossMinor: 4_050_00,
    });
  });
  it("refuses bad lines", () => {
    expect(() => lineNetMinor(line({ quantityMilli: 1.5 }))).toThrow(/whole number/);
    expect(() => lineNetMinor(line({ taxCategory: "AE" }))).toThrow(/rate must be 0/);
    expect(() => lineNetMinor(line({ taxRateBp: 0 }))).toThrow(/Use Z/);
    expect(() => lineNetMinor(line({ discountBp: 10_001 }))).toThrow(/100%/);
  });
  it("needs a VAT number for reverse charge", () => {
    const ae = inv({ lines: [line({ taxCategory: "AE", taxRateBp: 0 })] });
    expect(invoiceIssues(ae)[0]).toMatch(/VAT number/);
    expect(invoiceIssues({ ...ae, customerTaxId: "SE556677889901" })).toEqual([]);
  });
  it("fixes an invoice on finalize and never reuses a number", () => {
    const done = finalizeInvoice(inv(), "1001");
    expect(() => assertEditable(done)).toThrow(/credit note/);
    expect(() => finalizeInvoice(inv({ id: "i2" }), "1001", [done])).toThrow(/already used/);
    expect(() => finalizeInvoice(inv({ lines: [] }), "1002")).toThrow(/no lines/);
  });
  it("limits credit notes to what is left on the original", () => {
    const original = finalizeInvoice(inv(), "1001");
    const first = finalizeInvoice(draftCreditNote(original, "c1", [line({ quantityMilli: 1000 })]), "2001", [original]);
    expect(creditableMinor(original, [first])).toBe(750_00);
    const second = draftCreditNote(original, "c2");
    expect(invoiceIssues(second, [original, first])[0]).toMatch(/only 75000 is left/);
    expect(() => draftCreditNote(inv(), "c3")).toThrow(/nothing to credit/);
    expect(invoiceIssues({ ...second, creditOf: undefined }, [original])[0]).toMatch(/which invoice/);
  });
});

describe("payment batch", () => {
  const batch = (): PaymentBatch => ({
    id: "b1",
    status: "draft",
    debitAccount: "1503 40 12345",
    valueDate: "2026-02-01",
    currency: "NOK",
    preparedBy: "nina",
    approvals: [],
    items: [
      { id: "p1", creditorName: "A", amountMinor: 100_00, creditorAccount: "8601 11 17947", reference: "123" },
      { id: "p2", creditorName: "B", amountMinor: 200_00, creditorAccount: "8601 11 17947", reference: "456" },
    ],
  });
  it("flags duplicates and bad amounts", () => {
    const b = batch();
    b.items[1] = { ...b.items[0]!, id: "p2", creditorAccount: "86011117947" };
    expect(batchIssues(b)[0]).toMatch(/same payment/);
    expect(batchIssues({ ...batch(), items: [{ ...batch().items[0]!, amountMinor: 0 }] })[0]).toMatch(/above zero/);
  });
  it("needs two people, neither of them the preparer", () => {
    expect(() => approveBatch(batch(), "nina", AT)).toThrow(/prepared this batch/);
    const one = approveBatch(batch(), "kari", AT);
    expect(() => approveBatch(one, "kari", AT)).toThrow(/different person/);
    expect(() => assertReleasable(one)).toThrow(/1 of 2/);
    expect(releaseBatch(approveBatch(one, "per", AT)).status).toBe("released");
  });
  it("drops approvals when the batch changes", () => {
    const approved = approveBatch(approveBatch(batch(), "kari", AT), "per", AT);
    const tampered = { ...approved, items: [{ ...approved.items[0]!, amountMinor: 999_00 }, approved.items[1]!] };
    expect(() => assertReleasable(tampered)).toThrow(/0 of 2.*no longer count/);
    expect(setBatchItems(approved, approved.items).approvals).toEqual([]);
    expect(() => setBatchItems(releaseBatch(approved), [])).toThrow(/released/);
  });
});

import {
  assertPostable,
  createVoucherLine,
  resolveCustomDimension,
  setLineCustomDimension,
  voucherIssues,
  type VoucherRules,
} from "./voucher.js";

describe("voucher: further dimensions and period lock", () => {
  const rules: VoucherRules = {
    accounts: [
      { number: "6800", name: "Office", requiredDimensions: ["costCentre"] },
      { number: "2400", name: "Payables" },
    ],
    dimensions: [{ key: "costCentre", name: "cost centre", options: [{ code: "40", name: "Sales" }] }],
    periods: [{ code: "2025", status: "hard-closed" }],
  };
  const lines = [
    createVoucherLine({ id: "a", account: "6800", accountName: "Office", debitMinor: 100 }),
    createVoucherLine({ id: "b", account: "2400", accountName: "Payables", creditMinor: 100 }),
  ];
  it("requires and validates a custom dimension", () => {
    expect(voucherIssues(lines, rules)).toEqual(["Line a (account 6800) needs a cost centre."]);
    expect(() => resolveCustomDimension(rules, "costCentre", "99")).toThrow(/40 Sales/);
    expect(() => resolveCustomDimension(rules, "region", "N")).toThrow(/Dimensions: department, project, costCentre/);
    const fixed = setLineCustomDimension(lines, "a", "costCentre", resolveCustomDimension(rules, "costCentre", "40"));
    expect(fixed[0]!.dimensions).toEqual({ costCentre: "40" });
    expect(assertPostable(fixed, rules).balanced).toBe(true);
    expect(setLineCustomDimension(fixed, "a", "costCentre", undefined)[0]!.dimensions).toBeUndefined();
  });
  it("refuses a voucher dated in a closed period", () => {
    const fixed = setLineCustomDimension(lines, "a", "costCentre", "40");
    expect(() => assertPostable(fixed, rules, { date: "2025-12-31" })).toThrow(/Period 2025 is closed/);
    expect(assertPostable(fixed, rules, { date: "2026-01-02" }).balanced).toBe(true);
  });
});
