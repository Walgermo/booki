import { describe, expect, it } from "vitest";
import {
  decimalFromMinor,
  formatMoney,
  minorDigitsFor,
  minorFromDecimal,
  fromMajor,
  money,
  parseMajorInput,
  parseToMinor,
  parseToMoney,
} from "./money.js";

const NBSP = " ";
const NNBSP = " ";

describe("ISO 4217 minor units", () => {
  it("uses the published precision for zero-, two-, three-, and four-decimal currencies", () => {
    expect(minorDigitsFor("clp")).toBe(0);
    expect(minorDigitsFor("CHF")).toBe(2);
    expect(minorDigitsFor("BHD")).toBe(3);
    expect(minorDigitsFor("CLF")).toBe(4);
    expect(fromMajor(123.4, "CLP")).toEqual({ minor: 123, currency: "CLP" });
    expect(minorFromDecimal("1.234", "BHD")).toBe(1234);
    expect(decimalFromMinor(1234, "BHD")).toBe("1.234");
    expect(formatMoney(1234, { currency: "BHD", withCurrency: false })).toBe("1.234");
    expect(parseToMinor("12.3", "CLP")).toBeNull();
    expect(parseToMinor("0.0125", "CLF")).toBe(125);
  });

  it.each(["QQQ", "XAU"])("refuses precision-dependent operations for %s", (currency) => {
    expect(() => minorDigitsFor(currency)).toThrow(/no defined minor unit/);
    expect(() => fromMajor(1, currency)).toThrow(/no defined minor unit/);
    expect(() => decimalFromMinor(1234, currency)).toThrow(/no defined minor unit/);
    expect(() => formatMoney(0, { currency, zero: "–" })).toThrow(/no defined minor unit/);
    expect(parseToMinor("1", currency)).toBeNull();
  });
});

describe("parseMajorInput", () => {
  const cases: Array<[string, string, number | null]> = [
    // en-US
    ["en-US", "1,234", 1234],
    ["en-US", "1,234.56", 1234.56],
    ["en-US", "1.234,56", 1234.56],
    ["en-US", "1,234,567.89", 1234567.89],
    ["en-US", "1.5", 1.5],
    ["en-US", "1,5", 1.5],
    ["en-US", "0.05", 0.05],
    ["en-US", ".5", 0.5],
    ["en-US", "100", 100],
    ["en-US", "(100.00)", -100],
    ["en-US", "($1,234.50)", -1234.5],
    ["en-US", "-100.25", -100.25],
    ["en-US", "-$100.25", -100.25],
    ["en-US", "$-100.25", -100.25],
    ["en-US", "$1,000.00", 1000],
    ["en-US", "USD 1,000.00", 1000],
    ["en-US", "1,000.00 usd", 1000],
    ["en-US", ` 1${NBSP}000.50 `, 1000.5],
    ["en-US", "1e5", null],
    ["en-US", "1E5", null],
    ["en-US", "abc", null],
    ["en-US", "12abc", null],
    ["en-US", "", null],
    ["en-US", "-", null],
    ["en-US", ".", null],
    ["en-US", ",", null],
    ["en-US", "()", null],
    ["en-US", "(-100)", null],
    ["en-US", "--100", null],
    ["en-US", "100-", null],
    ["en-US", "+100", null],
    ["en-US", "1,234,5", null],
    ["en-US", "1.2.3,4", null],
    ["en-US", "1,23,456.00", null],
    ["en-US", "1,234.5.6", null],
    // nb-NO
    ["nb-NO", "1,5", 1.5],
    ["nb-NO", "1.5", 1.5],
    ["nb-NO", "1 234,56", 1234.56],
    ["nb-NO", `1${NBSP}234,56`, 1234.56],
    ["nb-NO", `1${NNBSP}234,56`, 1234.56],
    ["nb-NO", "1.234,56", 1234.56],
    ["nb-NO", "1.234", 1234],
    ["nb-NO", "1.234.567", 1234567],
    ["nb-NO", "1,234.56", 1234.56],
    ["nb-NO", "kr 1 234,50", 1234.5],
    ["nb-NO", "1 234,50 kr", 1234.5],
    ["nb-NO", "NOK 99,90", 99.9],
    ["nb-NO", "−100,00", -100],
    ["nb-NO", "(100,00)", -100],
    ["nb-NO", "1e5", null],
    ["nb-NO", "1,2,3", null],
  ];

  for (const [locale, input, expected] of cases) {
    it(`${locale} ${JSON.stringify(input)} → ${expected}`, () => {
      const currency = locale === "nb-NO" ? "NOK" : "USD";
      expect(parseMajorInput(input, { locale, currency })).toBe(expected);
    });
  }
});

describe("parseToMinor", () => {
  const cases: Array<[string, string, string, number | null]> = [
    ["en-US", "USD", "1,234", 123_400],
    ["en-US", "USD", "1.234,56", 123_456],
    ["en-US", "USD", "1.005", null],
    ["en-US", "USD", "1.00", 100],
    ["en-US", "USD", "1.1", 110],
    ["en-US", "USD", "0.29", 29],
    ["en-US", "USD", "1.15", 115],
    ["en-US", "USD", "(100.00)", -10_000],
    ["en-US", "USD", "-0.00", 0],
    ["en-US", "USD", "1e5", null],
    ["en-US", "USD", "90071992547409.91", Number.MAX_SAFE_INTEGER],
    ["en-US", "USD", "90071992547409.92", null],
    ["en-US", "USD", "90071992547409.90", 9_007_199_254_740_990],
    ["nb-NO", "NOK", "1.5", 150],
    ["nb-NO", "NOK", "1,5", 150],
    ["nb-NO", "NOK", "1 234,56", 123_456],
    ["nb-NO", "NOK", "1,234", null],
    ["nb-NO", "NOK", "−100,00 kr", -10_000],
    // JPY has no fraction digits
    ["en-US", "JPY", "1,000", 1000],
    ["en-US", "JPY", "¥1,000", 1000],
    ["en-US", "JPY", "1000", 1000],
    ["en-US", "JPY", "100.5", null],
    ["en-US", "JPY", "100.", 100],
    // KWD has three
    ["en-US", "KWD", "1.234", 1234],
    ["en-US", "KWD", "1.5", 1500],
    ["en-US", "KWD", "1.2345", null],
    ["en-US", "KWD", "1,234.567", 1_234_567],
  ];

  for (const [locale, currency, input, expected] of cases) {
    it(`${locale} ${currency} ${JSON.stringify(input)} → ${expected}`, () => {
      expect(parseToMinor(input, currency, { locale })).toBe(expected);
    });
  }

  it("parseToMoney goes through the exact path", () => {
    expect(parseToMoney("0.29", "USD")).toEqual({ minor: 29, currency: "USD" });
    expect(parseToMoney("1.005", "USD")).toBeNull();
    expect(parseToMoney("1,234", "USD", { locale: "en-US" })).toEqual({
      minor: 123_400,
      currency: "USD",
    });
  });

  it("round-trips formatMoney output", () => {
    for (const [locale, currency] of [
      ["en-US", "USD"],
      ["nb-NO", "NOK"],
      ["en-US", "JPY"],
      ["en-US", "KWD"],
    ] as const) {
      for (const minor of [0, 1, 99, 123_456, -123_456, 100_000_000]) {
        const text = formatMoney(money(minor, currency), { locale });
        expect(parseToMinor(text, currency, { locale }), text).toBe(minor);
      }
    }
  });
});

describe("fromMajor", () => {
  const cases: Array<[number, string, number]> = [
    [1.005, "USD", 101],
    [1.015, "USD", 102],
    [2.675, "USD", 268],
    [-1.005, "USD", -101],
    [0.1 + 0.2, "USD", 30],
    [1.25, "USD", 125],
    [1.5, "JPY", 2],
    [-1.5, "JPY", -2],
    [1.0005, "KWD", 1001],
    [1e-7, "USD", 0],
    [1e21 / 1e10, "USD", 1e13],
    [0, "USD", 0],
  ];

  for (const [major, currency, minor] of cases) {
    it(`fromMajor(${major}, ${currency}).minor → ${minor}`, () => {
      expect(fromMajor(major, currency).minor).toBe(minor);
    });
  }

  it("rejects non-finite and unsafe amounts", () => {
    expect(() => fromMajor(Number.NaN, "USD")).toThrow(/finite/);
    expect(() => fromMajor(Number.POSITIVE_INFINITY, "USD")).toThrow(/finite/);
    expect(() => fromMajor(1e20, "USD")).toThrow(/safe integer/);
  });
});

describe("money", () => {
  it("rejects non-integers and unsafe integers", () => {
    expect(() => money(1.5, "NOK")).toThrow(/safe integer/);
    expect(() => money(Number.MAX_SAFE_INTEGER + 1, "NOK")).toThrow(/safe integer/);
    expect(() => money(Number.NaN, "NOK")).toThrow(/safe integer/);
    expect(money(Number.MAX_SAFE_INTEGER, "nok")).toEqual({
      minor: Number.MAX_SAFE_INTEGER,
      currency: "NOK",
    });
  });
});

describe("exact decimal text", () => {
  it("reads a database numeric as minor units, with no floating point", () => {
    expect(minorFromDecimal("1234.5", "NOK")).toBe(123450);
    expect(minorFromDecimal("-0.75", "NOK")).toBe(-75);
    expect(minorFromDecimal("0.10", "NOK")).toBe(10);
    expect(minorFromDecimal("1234.5000", "NOK")).toBe(123450);
    expect(minorFromDecimal("90071992547409.91", "NOK")).toBe(9007199254740991);
    expect(minorFromDecimal("1500", "JPY")).toBe(1500);
  });

  it("refuses a rounding nobody chose, and text that is not a decimal", () => {
    expect(() => minorFromDecimal("1234.505", "NOK")).toThrow(/more than 2 decimals/);
    expect(() => minorFromDecimal("1 234,50", "NOK")).toThrow(/not decimal text/);
    expect(() => minorFromDecimal("90071992547409.92", "NOK")).toThrow();
  });

  it("writes minor units back as the same text", () => {
    expect(decimalFromMinor(123450, "NOK")).toBe("1234.50");
    expect(decimalFromMinor(-5, "NOK")).toBe("-0.05");
    expect(decimalFromMinor(0, "NOK")).toBe("0.00");
    expect(decimalFromMinor(1500, "JPY")).toBe("1500");
    expect(minorFromDecimal(decimalFromMinor(-987654321, "NOK"), "NOK")).toBe(-987654321);
  });
});

describe("formatMoney", () => {
  // nb-NO groups with a narrow no-break space.
  const spaces = (text: string) => text.replace(/\s/g, " ");
  it("keeps the sign without the currency, and can show zero as a dash", () => {
    expect(spaces(formatMoney(money(-123450, "NOK"), { locale: "nb-NO", withCurrency: false }))).toBe("-1 234,50");
    expect(spaces(formatMoney(money(-123450, "NOK"), { locale: "nb-NO", withCurrency: false, accounting: true }))).toBe(
      "(1 234,50)",
    );
    expect(formatMoney(money(0, "NOK"), { locale: "nb-NO", zero: "–" })).toBe("–");
  });
});
