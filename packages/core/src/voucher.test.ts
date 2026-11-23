import { describe, expect, it } from "vitest";
import {
  applyAccountRules,
  assertBalanced,
  assertPostable,
  resolveDimension,
  resolveVatCode,
  setLineDimension,
  setLineVatCode,
  voucherIssues,
  type VoucherLine,
  type VoucherRules,
  buildBalancedSalesVoucher,
  createVoucherLine,
  parseLineAmount,
  resolveChartAccount,
  setLineAccount,
  setLineCredit,
  setLineDebit,
  sumVoucher,
  validateVoucherLine,
} from "./voucher.js";

describe("buildBalancedSalesVoucher", () => {
  const accounts = {
    receivable: { number: "1500", name: "AR" },
    revenue: { number: "3000", name: "Sales" },
    taxPayable: { number: "2701", name: "VAT" },
  };

  it("builds a balanced sales voucher in minor units", () => {
    const lines = buildBalancedSalesVoucher(accounts, {
      amountMinor: 312_500,
      taxPercent: 25,
    });
    const balance = sumVoucher(lines);
    expect(balance.balanced).toBe(true);
    expect(balance.debitMinor).toBe(390_625);
    expect(balance.creditMinor).toBe(390_625);
    expect(assertBalanced(lines).balanced).toBe(true);
  });

  it("rejects non-integer amounts", () => {
    expect(() =>
      buildBalancedSalesVoucher(accounts, {
        amountMinor: 12.5,
        taxPercent: 25,
      }),
    ).toThrow(/non-negative integer/);
  });
});

describe("voucher line rules", () => {
  it("createVoucherLine rejects fractional, negative, unsafe and non-numeric amounts", () => {
    expect(() => createVoucherLine({ account: "1500", accountName: "AR", debitMinor: 10.5 })).toThrow(
      /debitMinor must be a non-negative integer in minor units.*10\.5/,
    );
    expect(() => createVoucherLine({ account: "3000", accountName: "Sales", debitMinor: -100 })).toThrow(
      /debitMinor.*-100/,
    );
    expect(() =>
      createVoucherLine({
        account: "3000",
        accountName: "Sales",
        creditMinor: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toThrow(/creditMinor/);
    expect(() =>
      createVoucherLine({
        account: "3000",
        accountName: "Sales",
        creditMinor: "abc" as unknown as number,
      }),
    ).toThrow(/creditMinor.*"abc"/);
  });

  it("rejects a line with both a debit and a credit", () => {
    expect(() =>
      createVoucherLine({
        account: "3000",
        accountName: "Sales",
        debitMinor: 100,
        creditMinor: 50,
      }),
    ).toThrow(/debit or a credit, not both/);
  });

  it("accepts digit strings and defaults missing amounts to 0", () => {
    const line = createVoucherLine({
      account: "1500",
      accountName: "AR",
      debitMinor: "12500" as unknown as number,
    });
    expect(line.debitMinor).toBe(12_500);
    expect(line.creditMinor).toBe(0);
  });

  it("parseLineAmount does not coerce garbage to 0", () => {
    expect(parseLineAmount(0, "debitMinor")).toBe(0);
    for (const bad of ["", " ", "1.5", "1e3", null, true, Number.NaN]) {
      expect(() => parseLineAmount(bad, "debitMinor")).toThrow(/debitMinor/);
    }
  });

  it("setters enforce the same rules", () => {
    const lines = [createVoucherLine({ id: "a", account: "1500", accountName: "AR", debitMinor: 100 })];
    expect(() => setLineDebit(lines, "a", 1.5)).toThrow(/debitMinor/);
    expect(() => setLineCredit(lines, "a", -1)).toThrow(/creditMinor/);
    expect(() => setLineAccount(lines, "a", "")).toThrow(/account/);
    expect(setLineCredit(lines, "a", 100)[0]).toMatchObject({
      debitMinor: 0,
      creditMinor: 100,
    });
    expect(() => validateVoucherLine({ account: "1500", debitMinor: 1, creditMinor: 1 })).toThrow(/not both/);
  });

  it("resolveChartAccount lists valid accounts on a miss", () => {
    const chart = [
      { number: "1500", name: "AR" },
      { number: "3000", name: "Sales" },
    ];
    expect(resolveChartAccount(chart, "3000")).toEqual({ number: "3000", name: "Sales" });
    expect(() => resolveChartAccount(chart, "9999")).toThrow(
      /"9999" is not in the chart of accounts.*1500 AR, 3000 Sales/,
    );
  });

  it("says how to give an account when none was given, and lists a short chart whole", () => {
    const chart = Array.from({ length: 11 }, (_, i) => ({ number: String(1000 + i * 500), name: `A${i}` }));
    expect(() => resolveChartAccount(chart, "")).toThrow(
      /needs an account: addLine\("7140"\).*Accounts: 1000 A0,.*6000 A10\.$/,
    );
    expect(() => resolveChartAccount(chart, "9999")).toThrow(/6000 A10\.$/);
  });
});

describe("voucher VAT codes, dimensions and account rules", () => {
  const rules: VoucherRules = {
    accounts: [
      { number: "1500", name: "AR" },
      {
        number: "3000",
        name: "Sales",
        vatCodes: ["MVA25", "MVA15"],
        defaultVatCode: "MVA25",
        requiresDepartment: true,
      },
      { number: "6800", name: "Office", requiresProject: true },
    ],
    vatCodes: ["MVA0", "MVA15", "MVA25"],
    departments: [{ code: "10", name: "Oslo" }],
    projects: [{ code: "P1", name: "Rollout" }],
  };
  const line = (over: Partial<VoucherLine>): VoucherLine => ({
    id: "l1",
    account: "3000",
    accountName: "Sales",
    debitMinor: 0,
    creditMinor: 100,
    ...over,
  });

  it("rejects an unknown VAT code and one the account does not allow", () => {
    expect(() => resolveVatCode(rules, "3000", "MVA99")).toThrow(/No VAT code "MVA99".*MVA0, MVA15, MVA25/);
    expect(() => resolveVatCode(rules, "3000", "MVA0")).toThrow(
      /Account 3000 cannot be posted with VAT code MVA0.*MVA25, MVA15/,
    );
    expect(resolveVatCode(rules, "3000", "MVA15")).toBe("MVA15");
    expect(resolveVatCode(rules, "1500", "MVA0")).toBe("MVA0");
    expect(resolveVatCode(rules, "3000", "")).toBeUndefined();
  });

  it("rejects a department or project outside its closed list", () => {
    expect(() => resolveDimension(rules, "department", "99")).toThrow(/No department "99".*10 Oslo/);
    expect(() => resolveDimension(rules, "project", "X")).toThrow(/No project "X".*P1 Rollout/);
    expect(resolveDimension(rules, "department", "10")).toBe("10");
    expect(resolveDimension({}, "project", "anything")).toBe("anything");
  });

  it("applies the account default when the VAT code is missing or not allowed", () => {
    expect(applyAccountRules(line({}), rules).vatCode).toBe("MVA25");
    expect(applyAccountRules(line({ vatCode: "MVA0" }), rules).vatCode).toBe("MVA25");
    expect(applyAccountRules(line({ vatCode: "MVA15" }), rules).vatCode).toBe("MVA15");
    expect(applyAccountRules(line({ account: "1500", vatCode: "MVA0" }), rules).vatCode).toBe("MVA0");
    expect("vatCode" in applyAccountRules(line({ account: "6800" }), rules)).toBe(false);
  });

  it("sets and clears VAT code and dimensions", () => {
    let lines = [line({})];
    lines = setLineVatCode(lines, "l1", "MVA15");
    lines = setLineDimension(lines, "l1", "department", "10");
    expect(lines[0]).toMatchObject({ vatCode: "MVA15", department: "10" });
    lines = setLineDimension(setLineVatCode(lines, "l1", undefined), "l1", "department", undefined);
    expect("vatCode" in lines[0]!).toBe(false);
    expect("department" in lines[0]!).toBe(false);
  });

  it("lists everything that blocks posting, and passes when nothing does", () => {
    const debit = line({ id: "d", account: "1500", accountName: "AR", debitMinor: 100, creditMinor: 0 });
    expect(voucherIssues([], rules)).toEqual(["The voucher has no lines."]);
    expect(voucherIssues([debit, line({})], rules)).toEqual(["Line l1 (account 3000) needs a department."]);
    expect(voucherIssues([line({ department: "10" })], rules)[0]).toMatch(/Out of balance by -100/);
    expect(() => assertPostable([debit, line({})], rules)).toThrow(/not postable.*needs a department/);
    expect(assertPostable([debit, line({ department: "10" })], rules).balanced).toBe(true);
  });
});
