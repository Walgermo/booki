import { describe, expect, it } from "vitest";
import { assertPostable, sumVoucher, vatPostings, voucherIssues, type VoucherLine } from "./voucher.js";

const CODES = [
  { code: "MVA0", percent: 0 },
  { code: "MVA15", percent: 15 },
  { code: "MVA25", percent: 25 },
];
const line = (id: string, account: string, debitMinor: number, creditMinor: number, vatCode?: string): VoucherLine => ({
  id,
  account,
  accountName: account,
  debitMinor,
  creditMinor,
  ...(vatCode ? { vatCode } : {}),
});

describe("vatPostings", () => {
  it("splits a purchase entered gross with 25 % into net cost and input VAT, still balanced", () => {
    const postings = vatPostings([line("a", "6800", 1_550_000, 0, "MVA25"), line("b", "2400", 0, 1_550_000)], CODES);
    expect(postings.map((p) => [p.account, p.debitMinor, p.creditMinor])).toEqual([
      ["6800", 1_240_000, 0],
      ["2710", 310_000, 0],
      ["2400", 0, 1_550_000],
    ]);
    expect(sumVoucher(postings).balanced).toBe(true);
    expect(postings[1]!.vatOf).toBe("a");
  });

  it("posts output VAT for a sale on the credit side, and leaves 0 % and uncoded lines alone", () => {
    const postings = vatPostings(
      [line("r", "1500", 125_000, 0), line("s", "3000", 0, 115_000, "MVA15"), line("z", "3100", 0, 10_000, "MVA0")],
      CODES,
    );
    expect(postings.map((p) => [p.account, p.debitMinor, p.creditMinor])).toEqual([
      ["1500", 125_000, 0],
      ["3000", 0, 100_000],
      ["2700", 0, 15_000],
      ["3100", 0, 10_000],
    ]);
  });

  it("uses the accounts you give it", () => {
    const postings = vatPostings([line("a", "6800", 12_500, 0, "MVA25")], CODES, {
      input: { account: "2711", accountName: "Inngående mva, høy sats" },
    });
    expect(postings[1]).toMatchObject({ account: "2711", debitMinor: 2_500 });
  });
});

describe("VAT on a voucher", () => {
  const rules = { taxCodes: CODES };
  it("accepts the purchase entered gross with its code, or net with VAT by hand and no code", () => {
    expect(voucherIssues([line("a", "6800", 1_550_000, 0, "MVA25"), line("b", "2400", 0, 1_550_000)], rules)).toEqual(
      [],
    );
    expect(
      voucherIssues(
        [line("a", "6800", 1_240_000, 0), line("v", "2710", 310_000, 0), line("b", "2400", 0, 1_550_000)],
        rules,
      ),
    ).toEqual([]);
  });

  it("refuses VAT counted twice, with a sentence that says how to fix it", () => {
    const twice = [
      line("a", "6800", 1_240_000, 0, "MVA25"),
      line("v", "2710", 310_000, 0),
      line("b", "2400", 0, 1_550_000),
    ];
    expect(() => assertPostable(twice, rules)).toThrow(
      /counts the VAT twice\. Enter 6800 with the amount including VAT and remove the 2710 line/,
    );
  });
});
