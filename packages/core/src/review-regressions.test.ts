import { describe, expect, it } from "vitest";
import { normalizeIsoDate, formatFinancialDate, localToday } from "./financial-date.js";
import { extractNorwegianKontonummer, isValidIban } from "./iban.js";
import { kontonummerToIban } from "./kontonummer.js";
import { isValidKid } from "./kid.js";
import { formatMoney, money, parseAmountText } from "./money.js";
import { assertPostingAllowed } from "./period-lock.js";
import { summarize } from "./reconciliation.js";
import { batchFingerprint, duplicatePayments, type PaymentBatch } from "./payment-batch.js";
import { actorDeed, guard, guardPostVoucher, type ServerActor } from "./server.js";
import { toCsv } from "./table.js";
import { buildBalancedSalesVoucher, createVoucherLine, sumVoucher } from "./voucher.js";
import { completeCloseTask, signOffCloseTask, type CloseTask } from "./close.js";
import { convertMinor } from "./fx.js";
import { localize } from "./messages.js";

const agent: ServerActor = { id: "bookkeeper", kind: "agent", roles: ["accountant"] };
const line = (id: string, debitMinor: number, creditMinor: number) => ({
  ...createVoucherLine({ id, account: "1920", accountName: "Bank" }),
  debitMinor,
  creditMinor,
});

describe("review regressions", () => {
  it("refuses a date that does not exist, at the period lock and at the server", () => {
    expect(() => assertPostingAllowed([{ code: "2026-02", status: "hard-closed" }], "2026-02-30")).toThrow();
    const verdict = guardPostVoucher(
      { actor: agent },
      { lines: [line("a", 100, 0), line("b", 0, 100)], date: "2026-02-30" },
    );
    expect(verdict.ok).toBe(false);
  });

  it("refuses fractional, negative, two-sided and all-zero voucher lines at the server", () => {
    for (const lines of [
      [line("a", 0.5, 0), line("b", 0, 0.5)],
      [line("a", -100, 0), line("b", 100, 0)],
      [line("a", 100, 100)],
      [line("a", 0, 0), line("b", 0, 0)],
    ]) {
      expect(guardPostVoucher({ actor: agent }, { lines, date: "2026-03-02" }).ok).toBe(false);
    }
  });

  it("makes a valid Norwegian IBAN from a kontonummer and back", () => {
    expect(kontonummerToIban("86011117947")).toBe("NO9386011117947");
    expect(isValidIban("NO9386011117947")).toBe(true);
    expect(extractNorwegianKontonummer("NO9386011117947")).toBe("86011117947");
    // A DE IBAN one character short is refused.
    expect(isValidIban("DE89370400440532013000")).toBe(true);
    expect(isValidIban("DE8937040044053201300")).toBe(false);
  });

  it("counts a statement's own lines, not ids a match names from elsewhere", () => {
    const lines = [
      { id: "A", date: "2026-03-01", amountMinor: 100, text: "a" },
      { id: "B", date: "2026-03-01", amountMinor: 200, text: "b" },
    ];
    const summary = summarize(lines as never, [
      { id: "m", bankLineIds: ["A", "OLD-1"], postIds: ["p"], status: "approved" } as never,
    ]);
    expect(summary).toMatchObject({ matchedCount: 1, unmatchedCount: 1, reconciled: false });
  });

  it("keeps a batch's fingerprint apart when a reference holds the old separators", () => {
    const base: Omit<PaymentBatch, "items"> = {
      id: "b1",
      status: "draft",
      debitAccount: "1503",
      valueDate: "2026-03-01",
      currency: "NOK",
      preparedBy: "n",
      approvals: [],
    };
    const one: PaymentBatch = {
      ...base,
      items: [{ id: "a", creditorName: "x", creditorAccount: "ACC1", amountMinor: 100, reference: "r\nb|ACC2|500|" }],
    };
    const two: PaymentBatch = {
      ...base,
      items: [
        { id: "a", creditorName: "x", creditorAccount: "ACC1", amountMinor: 100, reference: "r" },
        { id: "b", creditorName: "y", creditorAccount: "ACC2", amountMinor: 500, reference: "" },
      ],
    };
    expect(batchFingerprint(one)).not.toBe(batchFingerprint(two));
  });

  it("finds a duplicate written with dots, spaces or another case", () => {
    const groups = duplicatePayments([
      { id: "1", creditorName: "x", creditorAccount: "8601.11.17947", amountMinor: 100, reference: "1234 5678" },
      { id: "2", creditorName: "x", creditorAccount: "86011117947", amountMinor: 100, reference: "12345678" },
    ]);
    expect(groups).toHaveLength(1);
  });

  it("writes formula-like text as text in CSV, and amounts exactly", () => {
    const csv = toCsv([{ d: '=HYPERLINK("x")', n: -5 }], [
      { id: "d", header: "D", value: (r: { d: string }) => r.d },
      { id: "n", header: "N", kind: "money", value: (r: { n: number }) => r.n },
    ] as never);
    expect(csv.split("\n")[1]).toBe(`"'=HYPERLINK(""x"")",-0.05`);
    expect(
      toCsv([{ n: 1500 }], [{ id: "n", header: "N", kind: "money", value: (r: { n: number }) => r.n }] as never, {
        digits: 0,
      }).split("\n")[1],
    ).toBe("1500");
  });

  it("reads slashed dates in the locale's order, and today in local time", () => {
    expect(normalizeIsoDate(formatFinancialDate("2026-04-03", "en-GB"), "en-GB")).toBe("2026-04-03");
    expect(normalizeIsoDate("04/03/2026")).toBe("2026-04-03");
    expect(localToday(new Date(2026, 2, 8, 23, 30))).toBe("2026-03-08");
  });

  it("prints zero without a sign, and the last øre of a large amount", () => {
    expect(formatMoney(money(-0, "NOK"), { locale: "en-US" })).not.toMatch(/-/);
    expect(formatMoney(money(7100000000000007, "NOK"), { locale: "en-US", withCurrency: false })).toBe(
      "71,000,000,000,000.07",
    );
  });

  it("refuses a space that is not a thousands group", () => {
    expect(parseAmountText("12 34", { locale: "nb-NO", currency: "NOK" })).toBeNull();
    expect(parseAmountText("1 234,50", { locale: "nb-NO", currency: "NOK" })).not.toBeNull();
  });

  it("rounds sales VAT half away from zero in integers", () => {
    const lines = buildBalancedSalesVoucher(
      {
        receivable: { number: "1500", name: "Kunder" },
        revenue: { number: "3000", name: "Salg" },
        taxPayable: { number: "2700", name: "MVA" },
      } as never,
      { amountMinor: 15000, taxPercent: 11.11 },
    );
    expect(lines.find((l) => l.account === "2700")?.creditMinor).toBe(1667);
  });

  it("refuses totals past the safe range, and conversions too", () => {
    expect(() => sumVoucher([line("a", Number.MAX_SAFE_INTEGER, 0), line("b", 2, 0), line("c", 0, 1)])).toThrow();
    expect(convertMinor(100, "NOK", "JPY", 150_000_000)).toBe(150);
    expect(() => convertMinor(9e15, "NOK", "JPY", 150_000_000)).toThrow(/safe integer/);
  });

  it("does not let the preparer sign off with a trailing space", () => {
    const tasks: CloseTask[] = [{ id: "bank", title: "Bank", status: "open" } as CloseTask];
    const done = completeCloseTask(tasks, "bank", "alice");
    expect(() => signOffCloseTask(done, "bank", "alice ")).toThrow();
  });

  it("accepts a mod-11 KID whose check is '-'", () => {
    // body 0000001 weights 2..7 → sum 2 → remainder 2 ... find one with remainder 1:
    let body = "";
    for (let n = 1; n < 100000; n++) {
      const candidate = String(n).padStart(6, "0");
      if (!isValidKid(`${candidate}0`, 11) && [...Array(10).keys()].every((d) => !isValidKid(`${candidate}${d}`, 11))) {
        body = candidate;
        break;
      }
    }
    expect(body).not.toBe("");
    expect(isValidKid(`${body}-`, 11)).toBe(true);
  });

  it("refuses an actor of unknown kind, and a person reviewing what their own agent prepared", () => {
    expect(
      guard({ actor: { id: "svc", kind: "Agent", roles: ["controller"] } as never }, "payment.release", () => 1).ok,
    ).toBe(false);
    expect(guard({ actor: { id: "x", roles: ["controller"] } as never }, "vat.submit", () => 1).ok).toBe(false);
    const bot: ServerActor = { id: "bot", kind: "agent", roles: ["auditor"], onBehalfOf: "kari" };
    const kari: ServerActor = { id: "kari", kind: "person", roles: ["auditor"] };
    expect(guard({ actor: kari, deeds: [actorDeed(bot, "audit.prepare")] }, "audit.review", () => 1).ok).toBe(false);
    expect(guard({ actor: kari, scope: "constructor" }, "audit.review", () => 1).ok).toBe(true);
    expect(guard({ actor: kari, minReason: 3, reason: 12345 as never }, "audit.review", () => 1).ok).toBe(true);
  });

  it("translates a refusal whose reason is a sentence of its own", () => {
    const english =
      "Invoice si-2: the company rule does not allow approving it without a person. Over 5 000 kr: a person approves. A person approves it.";
    expect(localize(english, "nb")).toBe(
      "Faktura si-2: firmaregelen tillater ikke godkjenning uten en person. Over 5 000 kr: a person approves. En person godkjenner den.",
    );
  });
});
