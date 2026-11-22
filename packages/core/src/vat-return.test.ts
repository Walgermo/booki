import { describe, expect, it } from "vitest";
import {
  DRAFT_VAT_FILING,
  GENERIC_VAT_SCHEMA_EXAMPLE,
  NO_VAT_SCHEMA_EXAMPLE,
  assertVatReturnReady,
  computeVatReturn,
  markVatReturnReady,
  submitVatReturn,
  vatBoxVouchers,
  vatReturnIssues,
  vatSchemaIssues,
  type VatReturnSchema,
  type VatTransaction,
} from "./vat-return.js";

const AT = "2026-05-10T09:00:00Z";
const tx = (voucherId: string, date: string, vatCode: string, baseMinor: number, taxMinor: number): VatTransaction => ({
  voucherId,
  date,
  vatCode,
  baseMinor,
  taxMinor,
});

const transactions: VatTransaction[] = [
  tx("s1", "2026-03-05", "OUT", 1000_00, 250_00),
  tx("s2", "2026-04-20", "OUT", 400_00, 100_00),
  tx("s3", "2026-04-21", "OUT", -100_00, -25_00), // credit note
  tx("z1", "2026-03-15", "ZERO", 300_00, 0),
  tx("p1", "2026-03-10", "IN", 600_00, 150_00),
  tx("old", "2026-02-28", "OUT", 9999_00, 2499_75),
  tx("new", "2026-05-01", "IN", 9999_00, 2499_75),
];

describe("computeVatReturn", () => {
  it("fills each box from its codes, applies the sign and totals the tax", () => {
    const result = computeVatReturn(GENERIC_VAT_SCHEMA_EXAMPLE, transactions, "2026-T2");
    expect(result).toMatchObject({
      country: "GENERIC",
      period: "2026-T2",
      from: "2026-03-01",
      to: "2026-04-30",
      transactionCount: 5,
    });
    expect(Object.fromEntries(result.boxes.map((box) => [box.id, box.amountMinor]))).toEqual({
      sales: 1300_00,
      "zero-rated": 300_00,
      "output-tax": 325_00,
      purchases: 600_00,
      "input-tax": -150_00,
      net: 175_00,
    });
    expect(result).toMatchObject({ payableMinor: 175_00, direction: "payable", unmapped: [] });
  });
  it("lists the vouchers behind a box, oldest first, with what each adds", () => {
    const result = computeVatReturn(GENERIC_VAT_SCHEMA_EXAMPLE, transactions, "2026-T2");
    expect(vatBoxVouchers(result, "output-tax").map((v) => [v.voucherId, v.amountMinor])).toEqual([
      ["s1", 250_00],
      ["s2", 100_00],
      ["s3", -25_00],
    ]);
    expect(vatBoxVouchers(result, "input-tax")).toEqual([{ ...transactions[4]!, amountMinor: -150_00 }]);
    expect(vatBoxVouchers(result, "net")).toEqual([]);
    expect(() => vatBoxVouchers(result, "box-99")).toThrow(
      /No box "box-99".*Boxes: sales, zero-rated, output-tax, purchases, input-tax, net\./,
    );
  });
  it("is refundable when input tax is larger, and zero for an empty period", () => {
    const refund = computeVatReturn(
      GENERIC_VAT_SCHEMA_EXAMPLE,
      [tx("p", "2026-01-10", "IN", 400_00, 100_00)],
      "2026-01",
    );
    expect(refund).toMatchObject({ payableMinor: -100_00, direction: "refundable" });
    expect(computeVatReturn(GENERIC_VAT_SCHEMA_EXAMPLE, transactions, "2025")).toMatchObject({
      payableMinor: 0,
      direction: "zero",
      transactionCount: 0,
    });
  });
  it("works with the Norwegian example schema", () => {
    const result = computeVatReturn(
      NO_VAT_SCHEMA_EXAMPLE,
      [
        tx("a", "2026-01-10", "3", 1000_00, 250_00),
        tx("b", "2026-02-10", "31", 200_00, 30_00),
        tx("c", "2026-02-11", "1", 400_00, 100_00),
        tx("d", "2026-02-12", "5", 80_00, 0),
      ],
      "2026-T1",
    );
    expect(result.boxes.find((box) => box.id === "to-pay")?.amountMinor).toBe(180_00);
    expect(result).toMatchObject({ payableMinor: 180_00, unmapped: [] });
  });
  it("demands a period code and whole minor units", () => {
    expect(() => computeVatReturn(GENERIC_VAT_SCHEMA_EXAMPLE, transactions, "March 2026")).toThrow(
      /period given as a code such as 2026 .*2026-T2.*got "March 2026"/,
    );
    expect(() => computeVatReturn(GENERIC_VAT_SCHEMA_EXAMPLE, transactions, "2026-T7")).toThrow(
      /period given as a code/,
    );
    expect(() =>
      computeVatReturn(GENERIC_VAT_SCHEMA_EXAMPLE, [tx("f", "2026-03-01", "OUT", 10.5, 2)], "2026-03"),
    ).toThrow(/voucher "f": base and tax are whole numbers of minor units/);
    expect(() => computeVatReturn(GENERIC_VAT_SCHEMA_EXAMPLE, [tx("f", "1 March", "OUT", 10, 2)], "2026-03")).toThrow(
      /voucher "f": the date must be written YYYY-MM-DD/,
    );
  });
});

describe("schema", () => {
  it("accepts the examples", () => {
    expect(vatSchemaIssues(GENERIC_VAT_SCHEMA_EXAMPLE)).toEqual([]);
    expect(vatSchemaIssues(NO_VAT_SCHEMA_EXAMPLE)).toEqual([]);
  });
  it("names what is wrong with a schema", () => {
    const bad: VatReturnSchema = {
      country: "XX",
      boxes: [
        { id: "a", label: "A", kind: "tax", codes: ["1"], sign: 1 },
        { id: "a", label: "A again", kind: "base", codes: ["1"], sign: 2 as never },
        { id: "t", label: "T", kind: "total", codes: [], sign: 1, formula: ["a", "missing", "t"] },
        { id: "u", label: "U", kind: "total", codes: ["1"], sign: 1 },
      ],
    };
    const issues = vatSchemaIssues(bad).join("\n");
    expect(issues).toMatch(/Box id "a" appears twice/);
    expect(issues).toMatch(/Box "a": the sign must be 1 or -1, got 2/);
    expect(issues).toMatch(/Box "t" adds up box "missing", which is not in the schema/);
    expect(issues).toMatch(/Box "t" adds itself up/);
    expect(issues).toMatch(/Box "u" is a total and needs a formula/);
    expect(issues).toMatch(/Box "u" is a total, so it takes no VAT codes/);
    expect(() => computeVatReturn(bad, [], "2026")).toThrow(/schema cannot be used/);
    expect(vatSchemaIssues({ country: "XX", boxes: [] })).toEqual(["The VAT return schema has no boxes."]);
  });
});

describe("readiness and status", () => {
  const clean = computeVatReturn(GENERIC_VAT_SCHEMA_EXAMPLE, transactions, "2026-T2");
  const dirty = computeVatReturn(
    GENERIC_VAT_SCHEMA_EXAMPLE,
    [...transactions, tx("odd", "2026-03-20", "RC", 50_00, 0), tx("far", "2026-09-01", "??", 1, 0)],
    "2026-T2",
  );

  it("lists unmapped transactions in the period and blocks readiness", () => {
    expect(dirty.unmapped).toEqual([tx("odd", "2026-03-20", "RC", 50_00, 0)]);
    expect(vatReturnIssues(dirty)[0]).toMatch(/1 transaction\(s\) in 2026-T2 use VAT code\(s\) "RC".*Vouchers: odd\./);
    expect(() => assertVatReturnReady(dirty)).toThrow(/not ready/);
    expect(() => markVatReturnReady(DRAFT_VAT_FILING, dirty, "kari", AT)).toThrow(/not ready.*"RC"/);
    expect(vatReturnIssues(clean)).toEqual([]);
    expect(() => assertVatReturnReady(clean)).not.toThrow();
  });
  it("moves draft to ready to submitted and then stays", () => {
    expect(() => submitVatReturn(DRAFT_VAT_FILING, clean, "kari", AT)).toThrow(
      /is a draft. A person must mark it ready/,
    );
    const ready = markVatReturnReady(DRAFT_VAT_FILING, clean, "kari", AT);
    expect(ready).toEqual({ status: "ready", readyBy: "kari", readyAt: AT });
    expect(() => markVatReturnReady(ready, clean, "per", AT)).toThrow(/is ready. Only a draft can be marked ready/);
    const submitted = submitVatReturn(ready, clean, "kari", AT);
    expect(submitted).toEqual({
      status: "submitted",
      readyBy: "kari",
      readyAt: AT,
      submittedBy: "kari",
      submittedAt: AT,
    });
    expect(() => submitVatReturn(submitted, clean, "per", AT)).toThrow(/already submitted and cannot be changed/);
    expect(() => markVatReturnReady(submitted, clean, "per", AT)).toThrow(/is submitted/);
  });
  it("needs a named person, and a second one when asked", () => {
    expect(() => markVatReturnReady(DRAFT_VAT_FILING, clean, " ", AT)).toThrow(/needs the id of the person/);
    const ready = markVatReturnReady(DRAFT_VAT_FILING, clean, "kari", AT);
    expect(() => submitVatReturn(ready, clean, "kari", AT, { requireSecondPerson: true })).toThrow(
      /"kari" marked this VAT return ready and cannot also submit it/,
    );
    expect(submitVatReturn(ready, clean, "per", AT, { requireSecondPerson: true }).submittedBy).toBe("per");
    expect(() => submitVatReturn(ready, clean, "", AT)).toThrow(/needs the id of the person/);
  });
  it("refuses to submit figures that stopped being ready", () => {
    const ready = markVatReturnReady(DRAFT_VAT_FILING, clean, "kari", AT);
    expect(() => submitVatReturn(ready, dirty, "per", AT)).toThrow(/not ready/);
  });
});
