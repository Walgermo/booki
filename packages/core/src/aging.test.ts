import { describe, expect, it } from "vitest";
import { ageItems, agingBuckets, daysOverdue, overdueParties, partyItems, type OpenItem } from "./aging.js";

const item = (
  id: string,
  partyId: string,
  dueDate: string,
  amountMinor: number,
  kind: OpenItem["kind"] = "receivable",
): OpenItem => ({
  id,
  partyId,
  partyName: `Party ${partyId}`,
  documentNumber: `INV-${id}`,
  dueDate,
  amountMinor,
  kind,
});

const AS_OF = "2026-04-30";
const items: OpenItem[] = [
  item("1", "acme", "2026-05-15", 100_00), // not due
  item("2", "acme", "2026-04-30", 50_00), // due today: not due
  item("3", "acme", "2026-04-29", 20_00), // 1 day
  item("4", "acme", "2026-03-31", 10_00), // 30 days
  item("5", "birch", "2026-03-30", 300_00), // 31 days
  item("6", "birch", "2026-01-30", 70_00), // 90 days
  item("7", "birch", "2026-01-29", 5_00), // 91 days
  item("8", "birch", "2026-02-15", -40_00), // credit, 74 days
];

describe("days overdue", () => {
  it("counts whole calendar days in UTC, across leap days and DST", () => {
    expect(daysOverdue("2026-04-29", AS_OF)).toBe(1);
    expect(daysOverdue("2026-05-01", AS_OF)).toBe(-1);
    expect(daysOverdue("2024-02-28", "2024-03-01")).toBe(2);
    expect(daysOverdue("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysOverdue("2025-12-31", "2026-12-31")).toBe(365);
  });
  it("refuses anything but a real ISO date", () => {
    expect(() => daysOverdue("2026-02-30", AS_OF)).toThrow(
      /The due date must be a date written YYYY-MM-DD, got "2026-02-30"/,
    );
    expect(() => daysOverdue("2026-01-01", "30.04.2026")).toThrow(/The as-of date/);
  });
});

describe("ageItems", () => {
  it("puts each item on the right side of every bucket edge", () => {
    const report = ageItems(items, AS_OF);
    expect(report.buckets.map((bucket) => bucket.id)).toEqual(["not-due", "1-30", "31-60", "61-90", "over-90"]);
    expect(report.rows).toEqual([
      {
        partyId: "acme",
        partyName: "Party acme",
        amountsMinor: [150_00, 30_00, 0, 0, 0],
        totalMinor: 180_00,
        itemCount: 4,
      },
      {
        partyId: "birch",
        partyName: "Party birch",
        amountsMinor: [0, 0, 300_00, 30_00, 5_00],
        totalMinor: 335_00,
        itemCount: 4,
      },
    ]);
    expect(report.totalsMinor).toEqual([150_00, 30_00, 300_00, 30_00, 5_00]);
    expect(report.grandTotalMinor).toBe(515_00);
    expect(report).toMatchObject({ kind: "receivable", asOf: AS_OF });
  });
  it("lets a credit reduce the party's total", () => {
    const report = ageItems([item("a", "p", "2026-04-01", 100_00), item("b", "p", "2026-04-10", -30_00)], AS_OF);
    expect(report.rows[0]).toMatchObject({ amountsMinor: [0, 70_00, 0, 0, 0], totalMinor: 70_00 });
  });
  it("takes other limits and keeps receivables apart from payables", () => {
    expect(agingBuckets([0, 14]).map((bucket) => bucket.id)).toEqual(["not-due", "1-14", "over-14"]);
    const mixed = [...items, item("9", "tax", "2026-04-01", 900_00, "payable")];
    expect(() => ageItems(mixed, AS_OF)).toThrow(/mix receivables and payables/);
    const payables = ageItems(mixed, AS_OF, [0, 14], "payable");
    expect(payables.rows).toEqual([
      { partyId: "tax", partyName: "Party tax", amountsMinor: [0, 0, 900_00], totalMinor: 900_00, itemCount: 1 },
    ]);
    expect(ageItems(mixed, AS_OF, undefined, "receivable").grandTotalMinor).toBe(515_00);
  });
  it("refuses bad limits, floats, duplicate ids and unknown kinds", () => {
    expect(() => ageItems(items, AS_OF, [30, 60])).toThrow(/start at 0 and rise.*\[30,60\]/);
    expect(() => ageItems(items, AS_OF, [0, 30, 30])).toThrow(/start at 0 and rise/);
    expect(() => ageItems([item("a", "p", "2026-04-01", 10.5)], AS_OF)).toThrow(
      /Open item "a": the amount is a whole number of minor units, got 10.5/,
    );
    expect(() => ageItems([items[0]!, items[0]!], AS_OF)).toThrow(/id "1" appears twice/);
    expect(() => ageItems(items, AS_OF, undefined, "debtor" as never)).toThrow(/"receivable" or "payable"/);
    expect(() => ageItems([item("a", "p", "soon", 1)], AS_OF)).toThrow(/Open item "a": the due date must be a date/);
  });
});

describe("partyItems", () => {
  it("lists a party's items with days and bucket, oldest first, or one bucket", () => {
    const all = partyItems(items, AS_OF, "birch");
    expect(all.map((entry) => [entry.id, entry.daysOverdue, entry.bucket])).toEqual([
      ["7", 91, "over-90"],
      ["6", 90, "61-90"],
      ["8", 74, "61-90"],
      ["5", 31, "31-60"],
    ]);
    expect(partyItems(items, AS_OF, "birch", { bucket: "61-90" }).map((entry) => entry.id)).toEqual(["6", "8"]);
    expect(partyItems(items, AS_OF, "acme", { bucket: "not-due" }).map((entry) => entry.daysOverdue)).toEqual([0, -15]);
  });
  it("names the parties and buckets when asked for one that is not there", () => {
    expect(() => partyItems(items, AS_OF, "zed")).toThrow(
      /No party "zed" with open receivables. Parties: acme, birch\./,
    );
    expect(() => partyItems(items, AS_OF, "acme", { bucket: "0-30" })).toThrow(
      /No bucket "0-30". Buckets: not-due, 1-30, 31-60, 61-90, over-90\./,
    );
  });
});

describe("overdueParties", () => {
  it("returns who is at least that late, largest first, credits counted", () => {
    expect(overdueParties(items, AS_OF, 1)).toEqual([
      { partyId: "birch", partyName: "Party birch", overdueMinor: 335_00, oldestDays: 91, itemCount: 4 },
      { partyId: "acme", partyName: "Party acme", overdueMinor: 30_00, oldestDays: 30, itemCount: 2 },
    ]);
    expect(overdueParties(items, AS_OF, 31).map((party) => party.partyId)).toEqual(["birch"]);
    expect(overdueParties(items, AS_OF, 91)).toEqual([
      { partyId: "birch", partyName: "Party birch", overdueMinor: 5_00, oldestDays: 91, itemCount: 1 },
    ]);
    expect(overdueParties(items, AS_OF, 92)).toEqual([]);
  });
  it("leaves out a party whose overdue items net to nothing and refuses a bad day count", () => {
    expect(overdueParties([item("a", "p", "2026-04-01", 10_00), item("b", "p", "2026-04-02", -10_00)], AS_OF)).toEqual(
      [],
    );
    expect(() => overdueParties(items, AS_OF, 0)).toThrow(/whole number, 1 or above, got 0/);
    expect(() => overdueParties(items, AS_OF, 1.5)).toThrow(/whole number/);
  });
});
