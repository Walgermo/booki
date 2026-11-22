import { describe, expect, it } from "vitest";
import {
  accountLedger,
  checkRange,
  explainVariance,
  filterEntries,
  summarizeLedger,
  trialBalance,
  unbalancedVouchers,
  type LedgerEntry,
} from "./ledger.js";

let seq = 0;
/** A balanced voucher: debit one account, credit another. */
function voucher(
  number: string,
  date: string,
  debit: string,
  credit: string,
  amountMinor: number,
  extra: Partial<LedgerEntry> = {},
): LedgerEntry[] {
  const common = { voucherId: `v-${number}`, voucherNumber: number, date, description: `Voucher ${number}`, ...extra };
  seq += 1;
  return [
    {
      ...common,
      id: `e${seq}d`,
      account: debit,
      accountName: `Account ${debit}`,
      debitMinor: amountMinor,
      creditMinor: 0,
    },
    {
      ...common,
      id: `e${seq}c`,
      account: credit,
      accountName: `Account ${credit}`,
      debitMinor: 0,
      creditMinor: amountMinor,
    },
  ];
}

const entries: LedgerEntry[] = [
  ...voucher("1", "2025-12-20", "1920", "2000", 500_00),
  ...voucher("2", "2026-01-05", "6800", "1920", 120_00, { dimensions: { costCentre: "40" } }),
  ...voucher("3", "2026-01-20", "6800", "1920", 30_00),
  ...voucher("4", "2026-02-03", "6800", "1920", 400_00, { description: "Office chairs" }),
  ...voucher("5", "2026-02-10", "1920", "3000", 900_00),
];

describe("trial balance", () => {
  it("gives opening, debit, credit and closing per account, sorted by account", () => {
    const tb = trialBalance(entries, { from: "2026-01-01", to: "2026-01-31" });
    expect(tb.rows.map((row) => row.account)).toEqual(["1920", "2000", "6800"]);
    expect(tb.rows[0]).toEqual({
      account: "1920",
      accountName: "Account 1920",
      openingMinor: 500_00,
      debitMinor: 0,
      creditMinor: 150_00,
      closingMinor: 350_00,
    });
    expect(tb.rows[1]).toMatchObject({ openingMinor: -500_00, debitMinor: 0, creditMinor: 0, closingMinor: -500_00 });
    expect(tb.rows[2]).toMatchObject({ openingMinor: 0, debitMinor: 150_00, creditMinor: 0, closingMinor: 150_00 });
    expect(tb.totals).toEqual({ openingMinor: 0, debitMinor: 150_00, creditMinor: 150_00, closingMinor: 0 });
    expect(tb).toMatchObject({ balanced: true, differenceMinor: 0, from: "2026-01-01", to: "2026-01-31" });
  });
  it("takes everything when no range is given", () => {
    const tb = trialBalance(entries);
    expect(tb.rows.find((row) => row.account === "1920")).toMatchObject({
      openingMinor: 0,
      debitMinor: 1400_00,
      creditMinor: 550_00,
      closingMinor: 850_00,
    });
    expect(tb.totals.debitMinor).toBe(tb.totals.creditMinor);
  });
  it("refuses a ledger that does not balance and names the voucher", () => {
    const broken = [...entries, { ...entries[2]!, id: "x1", voucherId: "v-9", voucherNumber: "9", debitMinor: 7 }];
    expect(() => trialBalance(broken)).toThrow(
      /does not balance.*Debit minus credit is 7 minor units.*9 \(7 minor units\)/s,
    );
    expect(summarizeLedger(broken)).toMatchObject({ balanced: false, differenceMinor: 7 });
    expect(unbalancedVouchers(broken)).toEqual([{ voucherId: "v-9", voucherNumber: "9", differenceMinor: 7 }]);
  });
  it("refuses floats, negative amounts and bad ranges", () => {
    expect(() => trialBalance([{ ...entries[0]!, debitMinor: 10.5 }])).toThrow(/whole numbers of minor units/);
    expect(() => trialBalance([{ ...entries[0]!, creditMinor: -1 }])).toThrow(/zero or above/);
    expect(() => trialBalance(entries, { from: "2026-02-30" })).toThrow(
      /start of the range must be a date written YYYY-MM-DD/,
    );
    expect(() => trialBalance(entries, { from: "2026-03-01", to: "2026-01-01" })).toThrow(
      /start must be on or before the end/,
    );
    expect(checkRange({ from: "", to: "2026-01-31" })).toEqual({ to: "2026-01-31" });
  });
  it("is correct and quick for 5,000 entries", () => {
    const big: LedgerEntry[] = [];
    const expected = new Map<string, { debit: number; credit: number }>();
    const add = (account: string, debit: number, credit: number) => {
      const sum = expected.get(account) ?? { debit: 0, credit: 0 };
      expected.set(account, { debit: sum.debit + debit, credit: sum.credit + credit });
    };
    for (let i = 0; i < 2500; i += 1) {
      const debit = String(4000 + (i % 97));
      const credit = String(1500 + (i % 13));
      const amount = 1 + ((i * 7919) % 100_000);
      const date = `2026-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`;
      big.push(...voucher(String(10_000 + i), date, debit, credit, amount));
      add(debit, amount, 0);
      add(credit, 0, amount);
    }
    expect(big).toHaveLength(5000);
    const started = performance.now();
    const tb = trialBalance(big);
    const elapsed = performance.now() - started;
    expect(tb.rows).toHaveLength(110);
    for (const row of tb.rows) {
      const sum = expected.get(row.account)!;
      expect(row).toMatchObject({
        debitMinor: sum.debit,
        creditMinor: sum.credit,
        closingMinor: sum.debit - sum.credit,
        openingMinor: 0,
      });
    }
    expect(tb.totals.debitMinor).toBe(tb.totals.creditMinor);
    expect(tb.totals.debitMinor).toBe([...expected.values()].reduce((n, sum) => n + sum.debit, 0));
    expect(elapsed).toBeLessThan(250);
    // A range moves earlier months into the opening balances, and it still balances.
    const second = trialBalance(big, { from: "2026-07-01" });
    expect(second.totals.openingMinor).toBe(0);
    expect(second.totals.debitMinor).toBeLessThan(tb.totals.debitMinor);
    const row = second.rows.find((item) => item.account === "4000")!;
    expect(row.openingMinor + row.debitMinor - row.creditMinor).toBe(expected.get("4000")!.debit);
  });
});

describe("account ledger", () => {
  it("carries a running balance from the opening balance, oldest first", () => {
    const shuffled = [...entries].reverse();
    const ledger = accountLedger(shuffled, "1920", { from: "2026-01-01" });
    expect(ledger).toMatchObject({
      account: "1920",
      accountName: "Account 1920",
      openingMinor: 500_00,
      debitMinor: 900_00,
      creditMinor: 550_00,
      closingMinor: 850_00,
    });
    expect(ledger.rows.map((row) => [row.voucherNumber, row.balanceMinor])).toEqual([
      ["2", 380_00],
      ["3", 350_00],
      ["4", -50_00],
      ["5", 850_00],
    ]);
  });
  it("names the accounts when the account is unknown", () => {
    expect(() => accountLedger(entries, "9999")).toThrow(
      /No account "9999" in the ledger. Accounts: 1920, 2000, 3000, 6800\./,
    );
  });
});

describe("filterEntries", () => {
  it("filters by range, account, voucher, text and dimension", () => {
    expect(filterEntries(entries, { from: "2026-02-01", account: "6800" }).map((e) => e.voucherNumber)).toEqual(["4"]);
    expect(filterEntries(entries, { account: ["2000", "3000"] })).toHaveLength(2);
    expect(filterEntries(entries, { voucherId: "v-3" })).toHaveLength(2);
    expect(filterEntries(entries, { text: "office CHAIRS" })).toHaveLength(2);
    expect(filterEntries(entries, { dimensions: { costCentre: "40" } }).map((e) => e.voucherNumber)).toEqual([
      "2",
      "2",
    ]);
    expect(filterEntries(entries)).toHaveLength(entries.length);
    expect(() => filterEntries(entries, { to: "January" })).toThrow(/end of the range/);
  });
});

describe("explainVariance", () => {
  it("lists the vouchers behind the difference, largest first, and they add up", () => {
    const variance = explainVariance(entries, "6800", "2026-01", "2026-02");
    expect(variance).toMatchObject({
      account: "6800",
      periodA: { code: "2026-01", from: "2026-01-01", to: "2026-01-31", netMinor: 150_00 },
      periodB: { code: "2026-02", from: "2026-02-01", to: "2026-02-28", netMinor: 400_00 },
      differenceMinor: 250_00,
    });
    expect(variance.vouchers.map((v) => [v.voucherNumber, v.period, v.effectMinor])).toEqual([
      ["4", "B", 400_00],
      ["2", "A", -120_00],
      ["3", "A", -30_00],
    ]);
    expect(variance.vouchers.reduce((sum, v) => sum + v.effectMinor, 0)).toBe(variance.differenceMinor);
  });
  it("refuses bad periods and unknown accounts with what is valid", () => {
    expect(() => explainVariance(entries, "6800", "Jan", "2026-02")).toThrow(
      /Period A must be a period code such as 2026 .*got "Jan"/,
    );
    expect(() => explainVariance(entries, "6800", "2026-01", "2026-01")).toThrow(/two different periods/);
    expect(() => explainVariance(entries, "1", "2026-01", "2026-02")).toThrow(/No account "1"/);
  });
});
