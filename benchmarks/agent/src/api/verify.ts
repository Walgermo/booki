/**
 * End-state checks for the bookkeeping API. They read the books the API holds
 * (its state() copy), never a model's text, and use the same check names and
 * the same expected numbers as the screen checks in ../verify.ts, so a run
 * through the API and a run on a screen can be compared check by check.
 */
import type { LedgerState } from "./ledger.js";
import { SALES_INVOICE_EXPECTED, SUPPLIER_INVOICE_EXPECTED, VOUCHER_EXPECTED, verdict } from "../verify.js";
import type { Verification } from "../verify.js";

/** The single item of a list, or undefined when there is not exactly one. */
const only = <T>(list: readonly T[]): T | undefined => (list.length === 1 ? list[0] : undefined);

/** Every named check false: used when the end state has no single record to read. */
const allFalse = (names: readonly string[]): Record<string, boolean> =>
  Object.fromEntries(names.map((name) => [name, false]));

const VOUCHER_CHECKS = ["date", "threePostings", "expenseNet", "inputVat", "payable", "vat25", "posted"];
const SUPPLIER_INVOICE_CHECKS = [
  "supplier",
  "invoiceNumber",
  "invoiceDate",
  "dueDate",
  "kid",
  "total",
  "account",
  "vat25",
  "posted",
];
const SALES_INVOICE_CHECKS = ["customer", "twoLines", "consulting", "travel", "net", "vat25", "created"];

/** The voucher task, read from the one voucher the API holds (mirrors verifyVoucherAcc). */
export function verifyVoucherApi(state: LedgerState): Verification {
  const voucher = only(state.vouchers);
  const observed = { vouchers: state.vouchers.length, voucher: voucher ?? null };
  if (!voucher) return verdict(allFalse(VOUCHER_CHECKS), false, observed);

  const e = VOUCHER_EXPECTED;
  const lines = voucher.lines;
  const onAccount = (account: string) => lines.filter((line) => line.account === account);
  const expense = onAccount("6800");
  const vat = onAccount("2710");
  const payable = onAccount("2400");
  const checks = {
    date: voucher.date === e.date,
    threePostings: lines.length === 3,
    expenseNet: expense.length === 1 && expense[0]!.debitMinor === e.netMinor && !expense[0]!.creditMinor,
    inputVat: vat.length === 1 && vat[0]!.debitMinor === e.vatMinor && !vat[0]!.creditMinor,
    payable: payable.length === 1 && payable[0]!.creditMinor === e.grossMinor && !payable[0]!.debitMinor,
    vat25: expense.length === 1 && expense[0]!.vatCode === "MVA25",
    posted: voucher.posted === true,
  };
  return verdict(checks, voucher.posted, observed);
}

/** The supplier invoice task, read from the one supplier invoice (mirrors verifySupplierInvoiceAcc). */
export function verifySupplierInvoiceApi(state: LedgerState): Verification {
  const invoice = only(state.supplierInvoices);
  const observed = { invoices: state.supplierInvoices.length, invoice: invoice ?? null };
  if (!invoice) return verdict(allFalse(SUPPLIER_INVOICE_CHECKS), false, observed);

  const e = SUPPLIER_INVOICE_EXPECTED;
  const checks = {
    supplier: invoice.supplier === e.supplier,
    invoiceNumber: invoice.invoiceNumber.trim() === e.invoiceNumber,
    invoiceDate: invoice.invoiceDate === e.invoiceDate,
    dueDate: invoice.dueDate === e.dueDate,
    kid: invoice.kid.replace(/\s/g, "") === e.kid,
    total: invoice.grossMinor === e.grossMinor,
    account: invoice.account === "6800",
    vat25: invoice.vatCode === "MVA25",
    posted: invoice.posted === true,
  };
  return verdict(checks, invoice.posted, observed);
}

/** The sales invoice task, read from the one sales invoice (mirrors verifySalesInvoiceAcc). */
export function verifySalesInvoiceApi(state: LedgerState): Verification {
  const invoice = only(state.salesInvoices);
  const observed = { invoices: state.salesInvoices.length, invoice: invoice ?? null };
  if (!invoice) return verdict(allFalse(SALES_INVOICE_CHECKS), false, observed);

  const e = SALES_INVOICE_EXPECTED;
  const lines = invoice.lines;
  const has = (expected: (typeof e.lines)[number]) =>
    lines.some(
      (line) =>
        expected.description.test(line.description) &&
        line.quantityMilli === expected.quantityMilli &&
        line.unitPriceMinor === expected.unitPriceMinor,
    );
  const created = invoice.created === true && invoice.status === "draft";
  const checks = {
    customer: invoice.customer === e.customer,
    twoLines: lines.length === 2,
    consulting: has(e.lines[0]),
    travel: has(e.lines[1]),
    net: invoice.netMinor === e.netMinor,
    vat25: lines.length > 0 && lines.every((line) => line.vatCode === "MVA25") && invoice.vatMinor === e.vatMinor,
    created,
  };
  return verdict(checks, created, observed);
}
