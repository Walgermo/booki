import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidKid } from "@booki-aui/core";
import { DASHBOARD_EXPECTED } from "../verify.js";
import { ApiError, BookkeepingApi, REFERENCE } from "./ledger.js";

const voucherLines = (gross: number) => [
  { account: "6800", debitMinor: Math.round((gross * 100) / 125), creditMinor: 0, vatCode: "MVA25" },
  { account: "2710", debitMinor: gross - Math.round((gross * 100) / 125), creditMinor: 0 },
  { account: "2400", debitMinor: 0, creditMinor: gross },
];

const supplierInvoice = {
  supplier: "20001",
  invoiceNumber: "8841",
  invoiceDate: "2026-10-12",
  dueDate: "2026-11-11",
  kid: "10012342",
  grossMinor: 1_550_000,
  account: "6800",
  vatCode: "MVA25",
};

describe("reference data", () => {
  it("starts with the screen data and nothing the screens lack", () => {
    const api = new BookkeepingApi();
    assert.deepEqual(
      api.listSuppliers().map((s) => s.number),
      ["20002", "20003", "20001", "20004", "20005"],
    );
    assert.deepEqual(
      api.listCustomers().map((c) => c.number),
      ["10002", "10003", "10001", "10004", "10005"],
    );
    assert.deepEqual(
      api.listVatCodes().map((v) => [v.code, v.percent]),
      [
        ["MVA0", 0],
        ["MVA15", 15],
        ["MVA25", 25],
      ],
    );
    const accounts = api.listAccounts().map((a) => a.number);
    assert.ok(!accounts.includes("1920"), "1920 is not on the screens for these tasks");
    assert.ok(accounts.includes("2710") && accounts.includes("6800") && accounts.includes("2400"));
  });

  it("returns copies, so changing a listing changes nothing", () => {
    const api = new BookkeepingApi();
    api.listSuppliers()[0]!.name = "Changed";
    assert.equal(REFERENCE.suppliers[0]!.name, "Nordlys Eiendom AS");
  });
});

describe("postVoucher", () => {
  it("posts the balanced voucher from the task", () => {
    const api = new BookkeepingApi();
    const voucher = api.postVoucher({ date: "2026-10-31", lines: voucherLines(1_550_000) });
    assert.equal(voucher.id, "v-1");
    assert.equal(voucher.posted, true);
    assert.equal(voucher.status, "posted");
    assert.equal(voucher.actor, "agent:api");
    assert.equal(voucher.totalDebitMinor, 1_550_000);
    assert.deepEqual(voucher.lines[0], { account: "6800", debitMinor: 1_240_000, creditMinor: 0, vatCode: "MVA25" });
    assert.deepEqual(voucher.lines[1], { account: "2710", debitMinor: 310_000, creditMinor: 0 });
    assert.deepEqual(voucher.lines[2], { account: "2400", debitMinor: 0, creditMinor: 1_550_000 });
  });

  it("refuses a voucher that does not balance and says both sums", () => {
    const api = new BookkeepingApi();
    assert.throws(
      () =>
        api.postVoucher({
          date: "2026-10-31",
          lines: [
            { account: "6800", debitMinor: 1_240_000, creditMinor: 0 },
            { account: "2400", debitMinor: 0, creditMinor: 1_000_000 },
          ],
        }),
      (error: unknown) =>
        error instanceof ApiError && /1240000 øre/.test(error.message) && /1000000 øre/.test(error.message),
    );
    assert.equal(api.state().vouchers.length, 0);
  });

  it("refuses an unknown account and lists the valid ones", () => {
    const api = new BookkeepingApi();
    assert.throws(
      () =>
        api.postVoucher({
          date: "2026-10-31",
          lines: [
            { account: "9999", debitMinor: 100, creditMinor: 0 },
            { account: "2400", debitMinor: 0, creditMinor: 100 },
          ],
        }),
      (error: unknown) =>
        error instanceof ApiError &&
        error.message.startsWith('Unknown account "9999". Accounts: 4000 Innkjøp') &&
        error.message.includes("2400 Leverandørgjeld") &&
        error.message.includes("6800 Kontorrekvisita"),
    );
  });

  it("refuses a line with both debit and credit, and a line with neither", () => {
    const api = new BookkeepingApi();
    assert.throws(
      () =>
        api.postVoucher({
          date: "2026-10-31",
          lines: [
            { account: "6800", debitMinor: 100, creditMinor: 100 },
            { account: "2400", debitMinor: 0, creditMinor: 0 },
          ],
        }),
      ApiError,
    );
    assert.throws(
      () =>
        api.postVoucher({
          date: "2026-10-31",
          lines: [
            { account: "6800", debitMinor: 0, creditMinor: 0 },
            { account: "2400", debitMinor: 0, creditMinor: 0 },
          ],
        }),
      ApiError,
    );
  });

  it("refuses an unknown VAT code and a non-integer amount", () => {
    const api = new BookkeepingApi();
    assert.throws(
      () =>
        api.postVoucher({
          date: "2026-10-31",
          lines: voucherLines(1_550_000).map((l) => ({ ...l, vatCode: "MVA99" })),
        }),
      (error: unknown) => error instanceof ApiError && error.message.includes("Unknown VAT code"),
    );
    assert.throws(
      () =>
        api.postVoucher({
          date: "2026-10-31",
          lines: [
            { account: "6800", debitMinor: 10.5, creditMinor: 0 },
            { account: "2400", debitMinor: 0, creditMinor: 10.5 },
          ],
        }),
      ApiError,
    );
  });

  it("refuses an invalid date", () => {
    const api = new BookkeepingApi();
    assert.throws(() => api.postVoucher({ date: "2026-02-30", lines: voucherLines(1_550_000) }), ApiError);
    assert.throws(() => api.postVoucher({ date: "31.10.2026", lines: voucherLines(1_550_000) }), ApiError);
  });

  it("refuses a month or day out of range with an ApiError, not a RangeError", () => {
    const api = new BookkeepingApi();
    for (const date of ["2026-13-01", "2026-10-32", "2026-00-10"]) {
      assert.throws(
        () => api.postVoucher({ date, lines: voucherLines(1_550_000) }),
        (error: unknown) => error instanceof ApiError && error.message.includes(`got "${date}"`),
      );
      assert.throws(() => api.registerSupplierInvoice({ ...supplierInvoice, invoiceDate: date }), ApiError);
    }
  });

  it("refuses an unknown field and lists the valid ones", () => {
    const api = new BookkeepingApi();
    assert.throws(
      () => api.postVoucher({ date: "2026-10-31", lines: voucherLines(1_550_000), description: "x" } as never),
      (error: unknown) =>
        error instanceof ApiError &&
        error.message === 'Unknown field "description" in postVoucher input. Valid fields: date, lines.',
    );
  });

  it("holds a voucher over 50 000,00 instead of posting it", () => {
    const api = new BookkeepingApi();
    const voucher = api.postVoucher({ date: "2026-10-31", lines: voucherLines(5_000_100) });
    assert.equal(voucher.posted, false);
    assert.equal(voucher.status, "held");
    assert.equal(api.state().vouchers[0]!.posted, false);
  });

  it("posts exactly 50 000,00 without holding it", () => {
    const api = new BookkeepingApi();
    const voucher = api.postVoucher({ date: "2026-10-31", lines: voucherLines(5_000_000) });
    assert.equal(voucher.posted, true);
  });

  it("records the actor it was given", () => {
    const api = new BookkeepingApi();
    const voucher = api.postVoucher({ date: "2026-10-31", lines: voucherLines(1_550_000) }, "agent:claude");
    assert.equal(voucher.actor, "agent:claude");
    assert.equal(api.state().audit[0]!.actor, "agent:claude");
  });
});

describe("registerSupplierInvoice", () => {
  it("registers the invoice from the task and derives the postings", () => {
    const api = new BookkeepingApi();
    const invoice = api.registerSupplierInvoice(supplierInvoice);
    assert.equal(invoice.id, "si-1");
    assert.equal(invoice.supplierName, "Kontorrekvisita AS");
    assert.equal(invoice.posted, true);
    assert.equal(invoice.netMinor, 1_240_000);
    assert.equal(invoice.vatMinor, 310_000);
    assert.equal(invoice.grossMinor, 1_550_000);
    assert.deepEqual(invoice.postings, [
      { account: "6800", debitMinor: 1_240_000 },
      { account: "2710", debitMinor: 310_000 },
      { account: "2400", creditMinor: 1_550_000 },
    ]);
  });

  it("refuses an unknown supplier and lists the valid ones", () => {
    const api = new BookkeepingApi();
    assert.throws(
      () => api.registerSupplierInvoice({ ...supplierInvoice, supplier: "99999" }),
      (error: unknown) =>
        error instanceof ApiError &&
        error.message.startsWith('Unknown supplier "99999". Suppliers: 20002 Nordlys Eiendom AS') &&
        error.message.includes("20001 Kontorrekvisita AS"),
    );
  });

  it("refuses an invalid KID", () => {
    const api = new BookkeepingApi();
    const bad = "10012341";
    assert.equal(isValidKid(bad), false, "precondition: the test KID has a wrong check digit");
    assert.throws(
      () => api.registerSupplierInvoice({ ...supplierInvoice, kid: bad }),
      (error: unknown) => error instanceof ApiError && error.message.includes(`KID "${bad}" is not valid`),
    );
  });

  it("refuses a duplicate supplier invoice", () => {
    const api = new BookkeepingApi();
    api.registerSupplierInvoice(supplierInvoice);
    assert.throws(
      () => api.registerSupplierInvoice({ ...supplierInvoice, grossMinor: 100_000 }),
      (error: unknown) =>
        error instanceof ApiError &&
        error.message === "Supplier invoice 8841 from 20001 is already registered as si-1.",
    );
    assert.equal(api.state().supplierInvoices.length, 1);
  });

  it("refuses the same invoice number with spaces around it, and stores it trimmed", () => {
    const api = new BookkeepingApi();
    assert.equal(api.registerSupplierInvoice({ ...supplierInvoice, invoiceNumber: " 8841 " }).invoiceNumber, "8841");
    assert.throws(
      () => api.registerSupplierInvoice(supplierInvoice),
      (error: unknown) =>
        error instanceof ApiError &&
        error.message === "Supplier invoice 8841 from 20001 is already registered as si-1.",
    );
    assert.equal(api.state().supplierInvoices.length, 1);
  });

  it("refuses a due date before the invoice date", () => {
    const api = new BookkeepingApi();
    assert.throws(() => api.registerSupplierInvoice({ ...supplierInvoice, dueDate: "2026-10-01" }), ApiError);
  });

  it("refuses an unknown field and lists the valid ones", () => {
    const api = new BookkeepingApi();
    assert.throws(
      () => api.registerSupplierInvoice({ ...supplierInvoice, approved: true } as never),
      (error: unknown) =>
        error instanceof ApiError &&
        error.message ===
          'Unknown field "approved" in registerSupplierInvoice input. Valid fields: supplier, invoiceNumber, invoiceDate, dueDate, kid, grossMinor, account, vatCode.',
    );
  });

  it("holds an invoice over 50 000,00", () => {
    const api = new BookkeepingApi();
    const invoice = api.registerSupplierInvoice({ ...supplierInvoice, grossMinor: 5_000_100 });
    assert.equal(invoice.posted, false);
    assert.equal(invoice.status, "held");
  });
});

describe("createSalesInvoice", () => {
  it("computes the lines and totals from the task values", () => {
    const api = new BookkeepingApi();
    const invoice = api.createSalesInvoice({
      customer: "10001",
      lines: [
        { description: "Rådgivning", quantityMilli: 12_500, unitPriceMinor: 145_000, vatCode: "MVA25" },
        { description: "Reiseutlegg", quantityMilli: 1_000, unitPriceMinor: 238_000, vatCode: "MVA25" },
      ],
    });
    assert.equal(invoice.id, "inv-1");
    assert.equal(invoice.customerName, "Brattli AS");
    assert.equal(invoice.status, "draft");
    assert.equal(invoice.created, true);
    assert.equal(invoice.lines[0]!.netMinor, 1_812_500);
    assert.equal(invoice.lines[1]!.netMinor, 238_000);
    assert.equal(invoice.netMinor, 2_050_500);
    assert.equal(invoice.vatMinor, 512_625);
  });

  it("rounds the VAT once per rate, as the screen's invoice totals do", () => {
    const api = new BookkeepingApi();
    const line = { description: "Timer", quantityMilli: 1_000, unitPriceMinor: 10_002, vatCode: "MVA25" };
    const invoice = api.createSalesInvoice({ customer: "10001", lines: [line, line] });
    // Each line alone is 25,005 øre of VAT, rounded to 2501; the two together are exactly 5001.
    assert.equal(invoice.lines[0]!.vatMinor, 2_501);
    assert.equal(invoice.netMinor, 20_004);
    assert.equal(invoice.vatMinor, 5_001);
    assert.equal(invoice.grossMinor, 25_005);
  });

  it("refuses an unknown customer and lists the valid ones", () => {
    const api = new BookkeepingApi();
    assert.throws(
      () =>
        api.createSalesInvoice({
          customer: "77777",
          lines: [{ description: "x", quantityMilli: 1000, unitPriceMinor: 100, vatCode: "MVA0" }],
        }),
      (error: unknown) =>
        error instanceof ApiError &&
        error.message.startsWith('Unknown customer "77777". Customers: 10002 Havblikk Hotell AS') &&
        error.message.includes("10001 Brattli AS"),
    );
  });

  it("refuses an invoice with no lines", () => {
    const api = new BookkeepingApi();
    assert.throws(() => api.createSalesInvoice({ customer: "10001", lines: [] }), ApiError);
  });

  it("refuses a fractional quantity", () => {
    const api = new BookkeepingApi();
    assert.throws(
      () =>
        api.createSalesInvoice({
          customer: "10001",
          lines: [{ description: "Rådgivning", quantityMilli: 12.5, unitPriceMinor: 145_000, vatCode: "MVA25" }],
        }),
      ApiError,
    );
  });

  it("refuses an unknown field and lists the valid ones", () => {
    const api = new BookkeepingApi();
    assert.throws(
      () => api.createSalesInvoice({ customer: "10001", lines: [], status: "sent" } as never),
      (error: unknown) =>
        error instanceof ApiError &&
        error.message === 'Unknown field "status" in createSalesInvoice input. Valid fields: customer, lines.',
    );
  });
});

describe("state and audit", () => {
  it("returns a copy: changing it does not change the API", () => {
    const api = new BookkeepingApi();
    api.postVoucher({ date: "2026-10-31", lines: voucherLines(1_550_000) });
    const snapshot = api.state();
    snapshot.vouchers[0]!.posted = false;
    snapshot.vouchers.push({ ...snapshot.vouchers[0]! });
    snapshot.audit.length = 0;
    const again = api.state();
    assert.equal(again.vouchers.length, 1);
    assert.equal(again.vouchers[0]!.posted, true);
    assert.equal(again.audit.length, 1);
  });

  it("returns copies from write methods too", () => {
    const api = new BookkeepingApi();
    const voucher = api.postVoucher({ date: "2026-10-31", lines: voucherLines(1_550_000) });
    voucher.posted = false;
    assert.equal(api.state().vouchers[0]!.posted, true);
  });

  it("appends one audit entry per write, with a counter and the actor", () => {
    const api = new BookkeepingApi();
    api.postVoucher({ date: "2026-10-31", lines: voucherLines(1_550_000) });
    api.registerSupplierInvoice(supplierInvoice);
    api.createSalesInvoice({
      customer: "10001",
      lines: [{ description: "x", quantityMilli: 1000, unitPriceMinor: 100, vatCode: "MVA0" }],
    });
    assert.deepEqual(api.state().audit, [
      { at: 1, actor: "agent:api", action: "postVoucher", id: "v-1" },
      { at: 2, actor: "agent:api", action: "registerSupplierInvoice", id: "si-1" },
      { at: 3, actor: "agent:api", action: "createSalesInvoice", id: "inv-1" },
    ]);
  });

  it("does not record a refused write", () => {
    const api = new BookkeepingApi();
    assert.throws(() => api.registerSupplierInvoice({ ...supplierInvoice, supplier: "99999" }), ApiError);
    assert.equal(api.state().audit.length, 0);
  });
});

describe("what the API does not do", () => {
  it("has no approve, finalize, sign or release method", () => {
    const names = Object.getOwnPropertyNames(BookkeepingApi.prototype);
    for (const forbidden of ["approve", "finalize", "sign", "release", "send", "post"]) {
      assert.ok(!names.includes(forbidden), `${forbidden} must not be a method`);
    }
  });
});

describe("dashboard reads", () => {
  it("return the figures the dashboard pages draw, so the dashboard check holds for them", () => {
    const api = new BookkeepingApi();
    const months = api.monthlyResults();
    assert.equal(months.length, 12);
    assert.equal(months[0]!.period, "2025-11");
    const october = months.at(-1)!;
    assert.equal(october.period, "2026-10");
    assert.equal(october.revenueMinor, DASHBOARD_EXPECTED.octoberRevenueMinor);
    assert.equal(october.costsMinor, DASHBOARD_EXPECTED.octoberCostsMinor);
    const best = months.reduce((top, month) => (month.revenueMinor > top.revenueMinor ? month : top));
    assert.equal(best.period, "2025-12");
    assert.equal(best.revenueMinor, DASHBOARD_EXPECTED.maxRevenueMinor);
    const aging = api.receivablesAging();
    assert.equal(aging.asOf, "2026-10-31");
    assert.equal(aging.over30DaysMinor, DASHBOARD_EXPECTED.over30Minor);
    assert.equal(aging.notDueMinor + aging.days1to30Minor + aging.over30DaysMinor, aging.totalMinor);
  });

  it("hand out copies", () => {
    const api = new BookkeepingApi();
    api.monthlyResults()[0]!.revenueMinor = 0;
    api.payroll().employees = 0;
    assert.notEqual(api.monthlyResults()[0]!.revenueMinor, 0);
    assert.equal(api.payroll().employees, 4);
  });
});
