import { describe, expect, it } from "vitest";
import {
  formatEin,
  formatOrgnr,
  isValidEin,
  isValidOrgnr,
  normalizeOrganizationNumber,
} from "./organization-number.js";

describe("organization-number", () => {
  it("normalizes NO MVA tails and spacing", () => {
    expect(normalizeOrganizationNumber("NO974760673MVA")).toBe("974760673");
    expect(normalizeOrganizationNumber("974 760 673")).toBe("974760673");
  });

  it("formats orgnr and EIN", () => {
    expect(formatOrgnr("974760673")).toBe("974 760 673");
    expect(formatEin("123456789")).toBe("12-3456789");
  });

  it("validates Norwegian orgnr mod11", () => {
    expect(isValidOrgnr("974760673")).toBe(true);
    expect(isValidOrgnr("918089241")).toBe(true);
    expect(isValidOrgnr("123456789")).toBe(false);
    expect(isValidOrgnr("000000000")).toBe(false);
  });

  it("validates EIN as 9 non-zero digits", () => {
    expect(isValidEin("12-3456789")).toBe(true);
    expect(isValidEin("000000000")).toBe(false);
    expect(isValidEin("123")).toBe(false);
  });
});
