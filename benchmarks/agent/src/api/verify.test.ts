import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { BookkeepingApi } from "./ledger.js";
import type { LedgerState, SalesInvoiceInput, SupplierInvoiceInput, VoucherLineInput } from "./ledger.js";
import { verifySalesInvoiceApi, verifySupplierInvoiceApi, verifyVoucherApi } from "./verify.js";
import { SALES_INVOICE_EXPECTED, SUPPLIER_INVOICE_EXPECTED, VOUCHER_EXPECTED } from "../verify.js";

const e = VOUCHER_EXPECTED;

/** The right voucher: net on 6800 with MVA25, input VAT on 2710, gross credit on 2400. */
const voucherLines = (): VoucherLineInput[] => [
  { account: "6800", debitMinor: e.netMinor, creditMinor: 0, vatCode: "MVA25" },
  { account: "2710", debitMinor: e.vatMinor, creditMinor: 0 },
  { account: "2400", debitMinor: 0, creditMinor: e.grossMinor },
];

const supplierInvoice = (): SupplierInvoiceInput => ({
  supplier: SUPPLIER_INVOICE_EXPECTED.supplier,
  invoiceNumber: SUPPLIER_INVOICE_EXPECTED.invoiceNumber,
  invoiceDate: SUPPLIER_INVOICE_EXPECTED.invoiceDate,
  dueDate: SUPPLIER_INVOICE_EXPECTED.dueDate,
  kid: SUPPLIER_INVOICE_EXPECTED.kid,
  grossMinor: SUPPLIER_INVOICE_EXPECTED.grossMinor,
  account: "6800",
  vatCode: "MVA25",
});

const [consulting, travel] = SALES_INVOICE_EXPECTED.lines;
const salesLine = (
  line: { quantityMilli: number; unitPriceMinor: number },
  description: string,
  vatCode = "MVA25",
): SalesInvoiceInput["lines"][number] => ({
  description,
  quantityMilli: line.quantityMilli,
  unitPriceMinor: line.unitPriceMinor,
  vatCode,
});
const salesInvoice = (): SalesInvoiceInput => ({
  customer: SALES_INVOICE_EXPECTED.customer,
  lines: [salesLine(consulting!, "Rådgivning"), salesLine(travel!, "Reiseutlegg")],
});

function voucherState(lines: VoucherLineInput[] = voucherLines(), date: string = e.date, count = 1): LedgerState {
  const api = new BookkeepingApi();
  for (let i = 0; i < count; i += 1) api.postVoucher({ date, lines });
  return api.state();
}

function supplierState(overrides: Partial<SupplierInvoiceInput> = {}): LedgerState {
  const api = new BookkeepingApi();
  api.registerSupplierInvoice({ ...supplierInvoice(), ...overrides });
  return api.state();
}

function salesState(input: SalesInvoiceInput = salesInvoice()): LedgerState {
  const api = new BookkeepingApi();
  api.createSalesInvoice(input);
  return api.state();
}

const EMPTY = new BookkeepingApi().state();

describe("voucher API check", () => {
  it("passes the right end state", () => {
    const result = verifyVoucherApi(voucherState());
    assert.equal(result.ok, true);
    assert.equal(result.posted, true);
    assert.deepEqual(Object.values(result.checks).every(Boolean), true);
  });

  it("fails a wrong date", () => {
    const result = verifyVoucherApi(voucherState(voucherLines(), "2026-10-30"));
    assert.equal(result.ok, false);
    assert.equal(result.checks.date, false);
  });

  it("fails when net and VAT are swapped", () => {
    const swapped = [
      { account: "6800", debitMinor: e.vatMinor, creditMinor: 0, vatCode: "MVA25" },
      { account: "2710", debitMinor: e.netMinor, creditMinor: 0 },
      { account: "2400", debitMinor: 0, creditMinor: e.grossMinor },
    ];
    const result = verifyVoucherApi(voucherState(swapped));
    assert.equal(result.ok, false);
    assert.equal(result.checks.expenseNet, false);
    assert.equal(result.checks.inputVat, false);
  });

  it("fails when the payable line is missing", () => {
    const noPayable = [
      { account: "6800", debitMinor: e.netMinor, creditMinor: 0, vatCode: "MVA25" },
      { account: "2710", debitMinor: e.vatMinor, creditMinor: 0 },
      { account: "1500", debitMinor: 0, creditMinor: e.grossMinor },
    ];
    const result = verifyVoucherApi(voucherState(noPayable));
    assert.equal(result.ok, false);
    assert.equal(result.checks.payable, false);
  });

  it("fails an over-limit voucher that is held, so it is not posted", () => {
    const held = [
      { account: "6800", debitMinor: 4_800_000, creditMinor: 0, vatCode: "MVA25" },
      { account: "2710", debitMinor: 1_200_000, creditMinor: 0 },
      { account: "2400", debitMinor: 0, creditMinor: 6_000_000 },
    ];
    const result = verifyVoucherApi(voucherState(held));
    assert.equal(result.ok, false);
    assert.equal(result.posted, false);
    assert.equal(result.checks.posted, false);
  });

  it("fails when two vouchers exist", () => {
    const result = verifyVoucherApi(voucherState(voucherLines(), e.date, 2));
    assert.equal(result.ok, false);
    assert.equal(result.checks.threePostings, false);
    assert.equal(result.checks.posted, false);
  });

  it("fails a wrong VAT code on the expense line", () => {
    const wrongCode = [
      { account: "6800", debitMinor: e.netMinor, creditMinor: 0, vatCode: "MVA15" },
      { account: "2710", debitMinor: e.vatMinor, creditMinor: 0 },
      { account: "2400", debitMinor: 0, creditMinor: e.grossMinor },
    ];
    const result = verifyVoucherApi(voucherState(wrongCode));
    assert.equal(result.ok, false);
    assert.equal(result.checks.vat25, false);
  });

  it("passes the gross on 6800 with MVA25 and the payable, as the screen script enters it", () => {
    const gross = [
      { account: "6800", debitMinor: e.grossMinor, creditMinor: 0, vatCode: "MVA25" },
      { account: "2400", debitMinor: 0, creditMinor: e.grossMinor },
    ];
    const result = verifyVoucherApi(voucherState(gross));
    assert.equal(result.ok, true, JSON.stringify(result.checks));
    assert.ok(Object.values(result.checks).every(Boolean));
  });

  it("fails the gross on 6800 without a VAT code: no VAT is split out", () => {
    const noCode = [
      { account: "6800", debitMinor: e.grossMinor, creditMinor: 0 },
      { account: "2400", debitMinor: 0, creditMinor: e.grossMinor },
    ];
    const result = verifyVoucherApi(voucherState(noCode));
    assert.equal(result.ok, false);
    assert.equal(result.checks.expenseNet, false);
    assert.equal(result.checks.inputVat, false);
  });

  it("fails the gross with MVA25 and an explicit VAT line too: the VAT is counted twice", () => {
    const twice = [
      { account: "6800", debitMinor: e.grossMinor, creditMinor: 0, vatCode: "MVA25" },
      { account: "2710", debitMinor: e.vatMinor, creditMinor: 0 },
      { account: "2400", debitMinor: 0, creditMinor: e.grossMinor + e.vatMinor },
    ];
    const result = verifyVoucherApi(voucherState(twice));
    assert.equal(result.ok, false);
    assert.equal(result.checks.payable, false);
  });

  it("fails the gross with MVA15: the code splits out the wrong VAT", () => {
    const wrongRate = [
      { account: "6800", debitMinor: e.grossMinor, creditMinor: 0, vatCode: "MVA15" },
      { account: "2400", debitMinor: 0, creditMinor: e.grossMinor },
    ];
    const result = verifyVoucherApi(voucherState(wrongRate));
    assert.equal(result.ok, false);
    assert.equal(result.checks.inputVat, false);
    assert.equal(result.checks.vat25, false);
  });

  it("fails an empty state without throwing", () => {
    const result = verifyVoucherApi(EMPTY);
    assert.equal(result.ok, false);
    assert.equal(result.posted, false);
    assert.ok(Object.values(result.checks).every((value) => value === false));
  });
});

describe("supplier invoice API check", () => {
  it("passes the right end state", () => {
    const result = verifySupplierInvoiceApi(supplierState());
    assert.equal(result.ok, true);
    assert.equal(result.posted, true);
  });

  it("fails a wrong invoice number", () => {
    const result = verifySupplierInvoiceApi(supplierState({ invoiceNumber: "8842" }));
    assert.equal(result.ok, false);
    assert.equal(result.checks.invoiceNumber, false);
  });

  it("fails a wrong account, 6810 for 6800", () => {
    const result = verifySupplierInvoiceApi(supplierState({ account: "6810" }));
    assert.equal(result.ok, false);
    assert.equal(result.checks.account, false);
  });

  it("fails MVA15 instead of MVA25", () => {
    const result = verifySupplierInvoiceApi(supplierState({ vatCode: "MVA15" }));
    assert.equal(result.ok, false);
    assert.equal(result.checks.vat25, false);
  });

  it("fails an empty state without throwing", () => {
    const result = verifySupplierInvoiceApi(EMPTY);
    assert.equal(result.ok, false);
    assert.equal(result.posted, false);
    assert.ok(Object.values(result.checks).every((value) => value === false));
  });
});

describe("sales invoice API check", () => {
  it("passes the right end state", () => {
    const result = verifySalesInvoiceApi(salesState());
    assert.equal(result.ok, true);
    assert.equal(result.posted, true);
  });

  it("fails a wrong quantity on the consulting line", () => {
    const input = salesInvoice();
    input.lines[0] = salesLine({ quantityMilli: 12_000, unitPriceMinor: consulting!.unitPriceMinor }, "Rådgivning");
    const result = verifySalesInvoiceApi(salesState(input));
    assert.equal(result.ok, false);
    assert.equal(result.checks.consulting, false);
  });

  it("fails a wrong customer", () => {
    const result = verifySalesInvoiceApi(salesState({ ...salesInvoice(), customer: "10004" }));
    assert.equal(result.ok, false);
    assert.equal(result.checks.customer, false);
  });

  it("fails when one line is missing", () => {
    const input = { ...salesInvoice(), lines: [salesInvoice().lines[0]!] };
    const result = verifySalesInvoiceApi(salesState(input));
    assert.equal(result.ok, false);
    assert.equal(result.checks.twoLines, false);
    assert.equal(result.checks.travel, false);
  });

  it("fails MVA15 on the lines", () => {
    const input = salesInvoice();
    input.lines = input.lines.map((line) => ({ ...line, vatCode: "MVA15" }));
    const result = verifySalesInvoiceApi(salesState(input));
    assert.equal(result.ok, false);
    assert.equal(result.checks.vat25, false);
  });

  it("fails an empty state without throwing", () => {
    const result = verifySalesInvoiceApi(EMPTY);
    assert.equal(result.ok, false);
    assert.equal(result.posted, false);
    assert.ok(Object.values(result.checks).every((value) => value === false));
  });
});

describe("API checks are independent of the screen runner", () => {
  it("does not import Playwright or a browser session", () => {
    const source = readFileSync(new URL("./verify.ts", import.meta.url), "utf8");
    assert.equal(/playwright/i.test(source), false);
    assert.equal(source.includes("Session"), false);
  });
});
