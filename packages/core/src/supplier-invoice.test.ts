import { describe, expect, it } from "vitest";
import {
  approveSupplierInvoice,
  assertApprovable,
  confirmField,
  correctField,
  duplicatesOf,
  fieldsNeedingReview,
  markSupplierInvoicePosted,
  proposeCoding,
  redactSupplierInvoice,
  rejectSupplierInvoice,
  supplierInvoiceIssues,
  type SupplierInvoice,
} from "./supplier-invoice.js";

const AT = "2026-02-01T09:00:00Z";
const f = <T>(value: T, confidence = 0.99) => ({ value, confidence });

function invoice(id: string, over: Partial<SupplierInvoice["fields"]> = {}): SupplierInvoice {
  return {
    id,
    status: "new",
    document: { id: `doc-${id}`, fileName: `${id}.pdf`, page: 1 },
    bankAccount: "8601 11 17947",
    fields: {
      supplierName: f("Acme AS"),
      supplierOrgNumber: f("923609016"),
      invoiceNumber: f("INV-100"),
      invoiceDate: f("2026-01-10"),
      dueDate: f("2026-02-09"),
      netMinor: f(1000_00),
      taxMinor: f(250_00),
      grossMinor: f(1250_00),
      currency: f("NOK"),
      paymentReference: f("2345676"),
      ...over,
    },
  };
}

describe("supplier invoice", () => {
  it("requires net + tax to equal gross", () => {
    const off = invoice("a", { grossMinor: f(1300_00) });
    expect(supplierInvoiceIssues(off)[0]).toMatch(/Net 100000 \+ tax 25000 is 125000, but gross is 130000/);
    const fixed = correctField(off, "grossMinor", 1250_00, "kari");
    expect(fixed.fields.grossMinor).toMatchObject({ value: 1250_00, correctedBy: "kari", confidence: 0.99 });
    expect(supplierInvoiceIssues(fixed).some((issue) => /gross/.test(issue))).toBe(false);
  });

  it("validates a corrected value by field type", () => {
    const inv = invoice("a");
    expect(() => correctField(inv, "netMinor", 10.5, "kari")).toThrow(/whole number of minor units/);
    expect(() => correctField(inv, "dueDate", "09.02.2026", "kari")).toThrow(/YYYY-MM-DD/);
    expect(() => correctField(inv, "dueDate", "2026-02-30", "kari")).toThrow(/YYYY-MM-DD/);
    expect(() => correctField(inv, "currency", "kr", "kari")).toThrow(/three-letter/);
    expect(() => correctField(inv, "supplierName", " ", "kari")).toThrow(/cannot be empty/);
    expect(() => correctField(inv, "total" as never, 1, "kari")).toThrow(/no field "total". Fields: supplierName/);
    expect(() => correctField(inv, "netMinor", 1, "")).toThrow(/needs the id/);
  });

  it("flags duplicates in the inbox and among booked invoices, naming the other id", () => {
    const a = invoice("a");
    const b = invoice("b", { supplierName: f("ACME  as"), invoiceNumber: f("inv-100") });
    const other = invoice("c", { supplierOrgNumber: f("999999999") });
    expect(duplicatesOf(a, { inbox: [a, b, other] })).toEqual(["b"]);
    expect(
      duplicatesOf(a, { inbox: [a], booked: [{ id: "v-77", supplierName: "Acme AS", invoiceNumber: "INV-100" }] }),
    ).toEqual(["v-77"]);
    expect(supplierInvoiceIssues(a, { inbox: [a, b] }).join(" ")).toMatch(/also on "b"/);
    expect(duplicatesOf(a, { inbox: [a, { ...b, status: "rejected" }] })).toEqual([]);
  });

  it("makes a low-confidence field be confirmed or corrected", () => {
    const low = invoice("a", { dueDate: f("2026-02-09", 0.55), invoiceNumber: f("INV-100", 0.79) });
    expect(fieldsNeedingReview(low)).toEqual(["invoiceNumber", "dueDate"]);
    expect(fieldsNeedingReview(low, 0.5)).toEqual([]);
    const confirmed = confirmField(low, "dueDate", "agent");
    expect(confirmed.fields.dueDate.confirmedBy).toBe("agent");
    const corrected = correctField(confirmed, "invoiceNumber", "INV-101", "kari");
    expect(fieldsNeedingReview(corrected)).toEqual([]);
    // A correction replaces an earlier confirmation.
    expect(correctField(confirmed, "dueDate", "2026-02-10", "kari").fields.dueDate).toEqual({
      value: "2026-02-10",
      confidence: 0.55,
      correctedBy: "kari",
    });
  });

  it("codes only on accounts in the chart and moves new to coded", () => {
    const inv = invoice("a");
    expect(() => proposeCoding(inv, { account: "9999" }, ["4000", "6800"])).toThrow(
      /"9999" is not in the chart of accounts. Accounts: 4000, 6800/,
    );
    expect(() => proposeCoding(inv, { account: "" })).toThrow(/needs an account/);
    const coded = proposeCoding(inv, { account: "6800", vatCode: "1", dimensions: { costCentre: "40" } }, ["6800"]);
    expect(coded).toMatchObject({
      status: "coded",
      coding: { account: "6800", vatCode: "1", dimensions: { costCentre: "40" } },
    });
    expect(proposeCoding(inv, { account: "anything" }).coding).toEqual({ account: "anything" });
  });

  it("approves only a clean, coded invoice and then refuses edits", () => {
    const low = invoice("a", { dueDate: f("2026-02-09", 0.4) });
    expect(() => assertApprovable(low)).toThrow(/Confirm or correct dueDate.*no coding/);
    const ready = proposeCoding(confirmField(low, "dueDate", "kari"), { account: "6800" });
    expect(() => approveSupplierInvoice(ready, "", AT)).toThrow(/needs the id/);
    const approved = approveSupplierInvoice(ready, "per", AT);
    expect(approved).toMatchObject({ status: "approved", approvedBy: "per", approvedAt: AT });
    expect(() => correctField(approved, "netMinor", 1, "kari")).toThrow(/is approved and cannot be edited/);
    expect(() => confirmField(approved, "netMinor", "kari")).toThrow(/cannot be edited/);
    expect(() => proposeCoding(approved, { account: "4000" })).toThrow(/cannot be edited/);
    expect(() => approveSupplierInvoice(approved, "per", AT)).toThrow(/already approved/);
    expect(() => rejectSupplierInvoice(approved, "per", "no", AT)).toThrow(/cannot be rejected/);
    expect(markSupplierInvoicePosted(approved).status).toBe("posted");
    expect(() => markSupplierInvoicePosted(ready)).toThrow(/Only an approved invoice/);
  });

  it("rejects with a reason", () => {
    expect(() => rejectSupplierInvoice(invoice("a"), "per", " ", AT)).toThrow(/needs a reason/);
    expect(rejectSupplierInvoice(invoice("a"), "per", "Not ours", AT)).toMatchObject({
      status: "rejected",
      rejectedBy: "per",
      rejectionReason: "Not ours",
    });
  });

  it("redacts the payment reference and the bank account", () => {
    const redacted = redactSupplierInvoice(invoice("a"));
    expect(JSON.stringify(redacted)).not.toMatch(/2345676|17947/);
    expect(redacted.paymentReference).toEqual({ present: true, confidence: 0.99, reviewed: false });
    expect(redacted.hasBankAccount).toBe(true);
  });
});
