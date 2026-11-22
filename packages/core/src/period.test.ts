import { describe, expect, it } from "vitest";
import { formatPeriod, monthPeriod, parsePeriodCode, periodBounds, vatTermPeriod, yearPeriod } from "./period.js";

describe("period", () => {
  it("parses year, month, and VAT term codes", () => {
    expect(parsePeriodCode("2025")).toEqual(yearPeriod(2025));
    expect(parsePeriodCode("2025-03")).toEqual(monthPeriod(2025, 3));
    expect(parsePeriodCode("2025-T2")).toEqual(vatTermPeriod(2025, 2));
    expect(parsePeriodCode("nope")).toBeNull();
  });

  it("formats for locale", () => {
    expect(formatPeriod("2025-03", "en-US")).toBe("March 2025");
    expect(formatPeriod("2025-T1", "nb-NO")).toBe("MVA-termin 1 2025");
  });

  it("returns ISO bounds", () => {
    expect(periodBounds("2025")).toEqual({
      from: "2025-01-01",
      to: "2025-12-31",
    });
    expect(periodBounds("2024-02")).toEqual({
      from: "2024-02-01",
      to: "2024-02-29",
    });
    expect(periodBounds("2025-T1")).toEqual({
      from: "2025-01-01",
      to: "2025-02-28",
    });
  });
});
