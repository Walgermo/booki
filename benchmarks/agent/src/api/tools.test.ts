import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BookkeepingApi } from "./ledger.js";
import { createApiToolSet } from "./tools.js";

// Values from the task texts. They must never reach the tool definitions;
// the tests below check that by scanning the JSON the model would see.
const FORBIDDEN = [
  "6800",
  "2400",
  "2710",
  "1550000",
  "1 550 000",
  "15500",
  "15 500",
  "8841",
  "10012342",
  "Brattli",
  "Kontorrekvisita",
  "12500",
  "145000",
  "238000",
  "Rådgivning",
  "Reiseutlegg",
];

const voucherInput = {
  date: "2026-10-31",
  lines: [
    { account: "6800", debitMinor: 1_240_000, creditMinor: 0, vatCode: "MVA25" },
    { account: "2710", debitMinor: 310_000, creditMinor: 0 },
    { account: "2400", debitMinor: 0, creditMinor: 1_550_000 },
  ],
};

const supplierInvoiceInput = {
  supplier: "20001",
  invoiceNumber: "8841",
  invoiceDate: "2026-10-12",
  dueDate: "2026-11-11",
  kid: "10012342",
  grossMinor: 1_550_000,
  account: "6800",
  vatCode: "MVA25",
};

const salesInvoiceInput = {
  customer: "10001",
  lines: [
    { description: "Rådgivning", quantityMilli: 12_500, unitPriceMinor: 145_000, vatCode: "MVA25" },
    { description: "Reiseutlegg", quantityMilli: 1_000, unitPriceMinor: 238_000, vatCode: "MVA25" },
  ],
};

const setup = () => {
  const api = new BookkeepingApi();
  return { api, ...createApiToolSet(api) };
};

describe("tool definitions", () => {
  const { tools } = setup();

  it("gives every tool a snake_case name, a description and an object schema", () => {
    assert.ok(tools.length > 0);
    for (const tool of tools) {
      assert.match(tool.name, /^[a-z_]+$/);
      assert.equal(typeof tool.description, "string");
      assert.ok((tool.description ?? "").trim().length > 0, `${tool.name} has no description`);
      assert.equal(tool.input_schema.type, "object");
      assert.equal(typeof tool.input_schema.properties, "object");
      assert.ok(Array.isArray(tool.input_schema.required), `${tool.name} lists no required fields`);
      assert.equal(tool.input_schema.additionalProperties, false, `${tool.name} accepts extra fields`);
    }
  });

  it("names one tool per API read or write, and none that approves, finalises, signs, releases, sends or pays", () => {
    const names = tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, [
      "create_sales_invoice",
      "get_monthly_results",
      "get_receivables_aging",
      "get_salary_totals",
      "get_state",
      "list_accounts",
      "list_customers",
      "list_suppliers",
      "list_vat_codes",
      "post_voucher",
      "register_supplier_invoice",
    ]);
    for (const tool of tools) {
      assert.doesNotMatch(tool.name, /approve|finalize|finalise|sign|release|send|pay/);
    }
  });

  it("keeps task values out of the definitions the model sees", () => {
    const json = JSON.stringify(tools);
    for (const value of FORBIDDEN) {
      assert.ok(!json.includes(value), `definitions contain "${value}"`);
    }
  });

  it("states the unit of every amount and that dates are ISO", () => {
    const json = JSON.stringify(tools);
    assert.match(json, /integer øre/);
    assert.match(json, /thousandths/);
    assert.match(json, /yyyy-mm-dd/);
    const voucher = tools.find((tool) => tool.name === "post_voucher");
    assert.ok(voucher?.description?.includes("ISO"));
  });
});

describe("run", () => {
  it("refuses an unknown tool and lists the real names", () => {
    const { tools, run } = setup();
    const outcome = run("approve_invoice", {});
    assert.equal(outcome.isError, true);
    assert.match(outcome.content, /^Unknown tool "approve_invoice"\. Tools: /);
    for (const tool of tools) {
      assert.ok(outcome.content.includes(tool.name), `refusal does not list ${tool.name}`);
    }
  });

  it("refuses input that is not an object", () => {
    const { run } = setup();
    for (const input of [null, "x", 3, [], undefined]) {
      const outcome = run("list_suppliers", input);
      assert.equal(outcome.isError, true);
      assert.match(outcome.content, /takes an object as input/);
    }
  });

  it("refuses an unknown field and lists the valid fields, without changing state", () => {
    const { api, run } = setup();
    const outcome = run("post_voucher", { ...voucherInput, note: "extra" });
    assert.equal(outcome.isError, true);
    assert.match(outcome.content, /Unknown field "note" in post_voucher\. Valid fields: date, lines\./);
    assert.equal(api.state().vouchers.length, 0);
  });

  it("says none when a read tool is given a field", () => {
    const { run } = setup();
    const outcome = run("list_accounts", { limit: 5 });
    assert.equal(outcome.isError, true);
    assert.match(outcome.content, /Valid fields: none\./);
  });

  it("returns the listings as JSON", () => {
    const { run } = setup();
    const outcome = run("list_suppliers", {});
    assert.equal(outcome.isError, false);
    const parsed = JSON.parse(outcome.content) as { number: string }[];
    assert.deepEqual(
      parsed.map((supplier) => supplier.number),
      ["20002", "20003", "20001", "20004", "20005"],
    );
  });

  it("turns an ApiError into a refusal in plain text, without changing state", () => {
    const { api, run } = setup();
    const outcome = run("post_voucher", { date: "2026-10-31", lines: [voucherInput.lines[0], voucherInput.lines[2]] });
    assert.equal(outcome.isError, true);
    assert.match(outcome.content, /does not balance/);
    assert.equal(api.state().vouchers.length, 0);
  });

  it("rethrows any error that is not an ApiError, so a bug cannot look like a refusal", () => {
    const broken = {
      postVoucher() {
        throw new TypeError("boom");
      },
    } as unknown as BookkeepingApi;
    const { run } = createApiToolSet(broken);
    assert.throws(() => run("post_voucher", voucherInput), TypeError);
  });

  it("changes state when a voucher is posted, and records the actor given", () => {
    const api = new BookkeepingApi();
    const { run } = createApiToolSet(api, "agent:test");
    const outcome = run("post_voucher", voucherInput);
    assert.equal(outcome.isError, false);
    assert.equal((JSON.parse(outcome.content) as { id: string }).id, "v-1");
    const state = api.state();
    assert.equal(state.vouchers.length, 1);
    assert.equal(state.vouchers[0]!.actor, "agent:test");
    assert.equal(state.audit[0]!.action, "postVoucher");
  });

  it("uses the API's default actor when none is given", () => {
    const api = new BookkeepingApi();
    createApiToolSet(api).run("post_voucher", voucherInput);
    assert.equal(api.state().vouchers[0]!.actor, "agent:api");
  });

  it("does the voucher task end to end through the tools", () => {
    const api = new BookkeepingApi();
    const { run } = createApiToolSet(api);
    const outcome = run("post_voucher", voucherInput);
    assert.equal(outcome.isError, false);
    const voucher = api.state().vouchers[0]!;
    assert.equal(voucher.totalDebitMinor, 1_550_000);
    assert.equal(voucher.posted, true);
  });

  it("does the supplier invoice task end to end through the tools", () => {
    const api = new BookkeepingApi();
    const { run } = createApiToolSet(api);
    const outcome = run("register_supplier_invoice", supplierInvoiceInput);
    assert.equal(outcome.isError, false);
    const invoice = api.state().supplierInvoices[0]!;
    assert.equal(invoice.grossMinor, 1_550_000);
    assert.equal(invoice.netMinor, 1_240_000);
    assert.equal(invoice.vatMinor, 310_000);
    assert.equal(invoice.supplier, "20001");
  });

  it("refuses a supplier invoice with a bad KID check digit in plain text", () => {
    const api = new BookkeepingApi();
    const outcome = createApiToolSet(api).run("register_supplier_invoice", {
      ...supplierInvoiceInput,
      kid: "10012343",
    });
    assert.equal(outcome.isError, true);
    assert.match(outcome.content, /check digit/);
    assert.equal(api.state().supplierInvoices.length, 0);
  });

  it("does the sales invoice task end to end through the tools", () => {
    const api = new BookkeepingApi();
    const { run } = createApiToolSet(api);
    const outcome = run("create_sales_invoice", salesInvoiceInput);
    assert.equal(outcome.isError, false);
    const invoice = api.state().salesInvoices[0]!;
    assert.equal(invoice.netMinor, 2_050_500);
    assert.equal(invoice.vatMinor, 512_625);
    assert.equal(invoice.status, "draft");
  });

  it("reads the state through get_state without changing it", () => {
    const api = new BookkeepingApi();
    const { run } = createApiToolSet(api);
    run("post_voucher", voucherInput);
    const outcome = run("get_state", {});
    assert.equal(outcome.isError, false);
    const parsed = JSON.parse(outcome.content) as { vouchers: unknown[] };
    assert.equal(parsed.vouchers.length, 1);
    assert.equal(api.state().vouchers.length, 1);
  });
});
