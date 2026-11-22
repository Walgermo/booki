import { describe, expect, it } from "vitest";
import { addCalendarDays, daysUntilDue, normalizeIsoDate, formatFinancialDate } from "./financial-date.js";

describe("financial-date", () => {
  it("normalizes ISO, dotted NO, and slashed US input", () => {
    expect(normalizeIsoDate("2025-03-15")).toBe("2025-03-15");
    expect(normalizeIsoDate("15.03.2025")).toBe("2025-03-15");
    expect(normalizeIsoDate("03/15/2025")).toBe("2025-03-15");
    expect(normalizeIsoDate("2025-02-30")).toBe("");
  });

  it("formats for locale", () => {
    const formatted = formatFinancialDate("2025-03-15", "nb-NO");
    expect(formatted).toMatch(/15/);
    expect(formatted).toMatch(/03|3/);
    expect(formatted).toMatch(/2025/);
  });

  it("adds days and computes due delta", () => {
    expect(addCalendarDays("2025-01-30", 2)).toBe("2025-02-01");
    expect(daysUntilDue("2025-01-10", "2025-01-08")).toBe(2);
    expect(daysUntilDue("2025-01-08", "2025-01-10")).toBe(-2);
  });
});
