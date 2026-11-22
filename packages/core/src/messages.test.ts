import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BookiError, isBookiError, localize, MESSAGES, msg, msgIn, type MessageCode } from "./messages.js";
import { assertPostingAllowed, type PeriodState } from "./period-lock.js";
import { approveBatch, assertReleasable, batchIssues, releaseBatch, type PaymentBatch } from "./payment-batch.js";
import { assertPostable, createVoucherLine, voucherIssues, type VoucherRules } from "./voucher.js";
import { trialBalance, type LedgerEntry } from "./ledger.js";
import { submitClaim, type ExpenseClaim, type ExpensePolicy } from "./expense.js";
import { assertRunnable } from "./fixed-assets.js";

const here = dirname(fileURLToPath(import.meta.url));
const AT = "2026-01-31T10:00:00Z";

const placeholders = (text: string) =>
  [...new Set([...text.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map((m) => m[1]))].sort();

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

function caught(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
}

/** English words that must not survive in a Norwegian rendering of the samples below. */
const ENGLISH = /\b(the|is|has|cannot|needs|approval|batch|voucher|period|line|account|minor units|payment)\b/i;

describe("message catalogue", () => {
  it("has a non-empty en and nb for every code, with the same placeholders", () => {
    const codes = Object.keys(MESSAGES) as MessageCode[];
    expect(codes.length).toBeGreaterThan(300);
    for (const code of codes) {
      const { en, nb } = MESSAGES[code];
      expect(code).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
      expect(en.trim(), code).not.toBe("");
      expect(nb.trim(), code).not.toBe("");
      expect(placeholders(nb), code).toEqual(placeholders(en));
      // A template that is all placeholder would read any text.
      expect(en.replace(/\{[A-Za-z][A-Za-z0-9]*\}/g, "").trim().length, code).toBeGreaterThan(2);
    }
  });

  it("reads every English sentence back as its own code, and no two codes share a sentence", () => {
    const seen = new Map<string, string>();
    for (const code of Object.keys(MESSAGES) as MessageCode[]) {
      const { en } = MESSAGES[code];
      expect(seen.get(en), `${code} repeats ${seen.get(en)}`).toBeUndefined();
      seen.set(en, code);
      const params: Record<string, string | string[]> = {};
      placeholders(en).forEach((name, index) => {
        params[name!] = ["issues", "reasons", "exceptions"].includes(name!)
          ? ["The batch has no payments.", "The voucher has no lines."]
          : name === "message"
            ? "The voucher has no lines."
            : name!.endsWith("List")
              ? [`q${index}a`, `q${index}b`]
              : `q${index}`;
      });
      expect(localize(msg(code, params), "nb"), code).toBe(msgIn("nb", code, params));
    }
  });

  it("knows every code that core sources use, and core throws no literal sentences", () => {
    const files = sourceFiles(here).filter((file) => !file.endsWith("messages.ts"));
    expect(files.length).toBeGreaterThan(20);
    const used = new Set<string>();
    const literalThrows: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/\b(?:msg|new BookiError)\(\s*"([^"]+)"/g)) used.add(match[1]!);
      for (const match of text.matchAll(/throw new (?:Range|Type)?Error\(\s*[`"']/g)) {
        literalThrows.push(`${file}: ${text.slice(match.index, match.index + 80)}`);
      }
    }
    expect(used.size).toBeGreaterThan(250);
    for (const code of used) expect(Object.hasOwn(MESSAGES, code), code).toBe(true);
    // No allowlist needed: the one remaining `throw new Error(rule.reason)` in
    // permissions.ts throws a duty rule's reason, which is a catalogue sentence
    // for the standard rules.
    expect(literalThrows).toEqual([]);
  });
});

describe("msg and BookiError", () => {
  it("render the English template", () => {
    expect(msg("period.hard-closed", { code: "2026-01", date: "2026-01-15" })).toBe(
      "Period 2026-01 is closed. Nothing can be posted on 2026-01-15; post the correction in an open period.",
    );
    const error = new BookiError("batch.not-approvable", {
      issues: ["The batch has no payments.", "The batch has no account to pay from."],
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe(
      "The batch cannot be approved yet: The batch has no payments. The batch has no account to pay from.",
    );
    expect(error.code).toBe("batch.not-approvable");
    expect(isBookiError(error)).toBe(true);
    expect(isBookiError({ code: "batch.no-payments", params: {} })).toBe(true);
    expect(isBookiError(new Error("x"))).toBe(false);
  });
});

describe("localize", () => {
  const periods: PeriodState[] = [{ code: "2026-01", status: "hard-closed" }];
  const batch = (): PaymentBatch => ({
    id: "b1",
    status: "draft",
    debitAccount: "1503 40 12345",
    valueDate: "2026-02-01",
    currency: "NOK",
    preparedBy: "nina",
    approvals: [],
    items: [
      { id: "p1", creditorName: "A", amountMinor: 100_00, creditorAccount: "8601 11 17947", reference: "123" },
      { id: "p2", creditorName: "B", amountMinor: 200_00, creditorAccount: "8601 11 17947", reference: "456" },
    ],
  });

  function both(error: unknown, expected: string | RegExp) {
    const fromError = localize(error, "nb");
    const fromText = localize((error as Error).message, "nb");
    if (typeof expected === "string") expect(fromError).toBe(expected);
    else expect(fromError).toMatch(expected);
    expect(fromText).toBe(fromError);
    expect(localize(error, "en")).toBe((error as Error).message);
    return fromError;
  }

  it("translates a hard-closed period", () => {
    const error = caught(() => assertPostingAllowed(periods, "2026-01-15"));
    expect(error).toBeInstanceOf(BookiError);
    both(error, "Perioden 2026-01 er lukket. Ingenting kan føres på 2026-01-15; før korrigeringen i en åpen periode.");
  });

  it("translates the preparer approving their own batch", () => {
    both(
      caught(() => approveBatch(batch(), "nina", AT)),
      '"nina" har klargjort betalingsoppdraget og kan ikke godkjenne det. Det må en annen gjøre.',
    );
  });

  it("translates a release with stale approvals, conditional part included", () => {
    const approved = approveBatch(approveBatch(batch(), "kari", AT), "per", AT);
    const tampered = { ...approved, items: [{ ...approved.items[0]!, amountMinor: 999_00 }, approved.items[1]!] };
    const error = caught(() => releaseBatch(tampered));
    expect((error as Error).message).toBe(
      "The batch has 0 of 2 approvals (2 earlier approval(s) no longer count because the batch changed).",
    );
    both(
      error,
      "Betalingsoppdraget har 0 av 2 godkjenninger (tidligere godkjenninger som ikke lenger gjelder fordi oppdraget er endret: 2).",
    );
    both(
      caught(() => assertReleasable(approveBatch(batch(), "kari", AT))),
      "Betalingsoppdraget har 1 av 2 godkjenninger.",
    );
  });

  it("translates a nested list of batch issues in full", () => {
    const bad: PaymentBatch = {
      ...batch(),
      debitAccount: " ",
      valueDate: "1. feb",
      items: [{ ...batch().items[0]!, amountMinor: 0 }],
    };
    bad.items.push(
      { ...bad.items[0]!, amountMinor: 100_00, id: "p2" },
      { ...bad.items[0]!, amountMinor: 100_00, id: "p3" },
    );
    expect(batchIssues(bad).length).toBeGreaterThan(3);
    const text = both(
      caught(() => approveBatch(bad, "kari", AT)),
      /^Betalingsoppdraget kan ikke godkjennes ennå: /,
    );
    expect(text).toContain('Betalingsdatoen må skrives ÅÅÅÅ-MM-DD, ikke "1. feb".');
    expect(text).toContain("Betalingsoppdraget mangler konto det skal betales fra.");
    expect(text).toContain('Betaling "p1": beløpet er et heltall i minste myntenhet over null, ikke 0.');
    expect(text).toContain("Betalingene p2 og p3 ser ut til å være samme betaling");
    expect(text).not.toMatch(ENGLISH);
    for (const issue of batchIssues(bad)) expect(localize(issue, "nb")).not.toMatch(ENGLISH);
  });

  it("translates a voucher with issues, the period issue included", () => {
    const rules: VoucherRules = {
      periods,
      accounts: [{ number: "6800", name: "Office", requiresDepartment: true, vatCodes: ["1"] }],
    };
    const lines = [
      { ...createVoucherLine({ account: "6800", accountName: "Office", debitMinor: 500_00 }), id: "l1", vatCode: "3" },
      { ...createVoucherLine({ account: "2400", accountName: "Payables", creditMinor: 400_00 }), id: "l2" },
    ];
    expect(voucherIssues(lines, rules, { date: "2026-01-10" })).toHaveLength(4);
    const text = both(
      caught(() => assertPostable(lines, rules, { date: "2026-01-10" })),
      /^Bilaget kan ikke bokføres\. /,
    );
    expect(text).toContain("Perioden 2026-01 er lukket.");
    expect(text).toContain("Bilaget er ikke i balanse. Differansen er 10000 i minste myntenhet (debet minus kredit).");
    expect(text).toContain("Linje l1 (konto 6800) må ha avdeling.");
    expect(text).toContain("Linje l1 (konto 6800) har mva-kode 3; kontoen tillater 1.");
    expect(text).not.toMatch(ENGLISH);
  });

  it("translates fragments built from parts: ledger, expense claim, depreciation", () => {
    const entries: LedgerEntry[] = [
      {
        id: "e1",
        voucherId: "v1",
        voucherNumber: "1",
        date: "2026-01-05",
        account: "1920",
        debitMinor: 100,
        creditMinor: 0,
      },
      {
        id: "e2",
        voucherId: "v1",
        voucherNumber: "1",
        date: "2026-01-05",
        account: "3000",
        debitMinor: 0,
        creditMinor: 90,
      },
    ] as LedgerEntry[];
    const ledger = both(
      caught(() => trialBalance(entries)),
      /^Hovedboken går ikke i balanse/,
    );
    expect(ledger).toContain("Bilag som ikke går i balanse: 1 (10 i minste myntenhet).");
    expect(ledger).not.toMatch(ENGLISH);

    const policy: ExpensePolicy = { categories: { travel: {} } };
    const claim: ExpenseClaim = {
      id: "c1",
      claimantId: "",
      status: "draft",
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      currency: "NOK",
      lines: [],
      acceptedExceptions: [],
    } as unknown as ExpenseClaim;
    const expense = both(
      caught(() => submitClaim(claim, "nina", AT, policy)),
      /^Utleggskravet "c1" kan ikke sendes inn: /,
    );
    expect(expense).toContain("Utleggskravet mangler innsender.");
    expect(expense).toContain("Utleggskravet har ingen linjer.");

    both(
      caught(() => submitClaim({ ...claim, claimantId: "nina" }, " ", AT, policy)),
      /^Innsending av et utleggskrav må ha id-en/,
    );

    const run = caught(() =>
      assertRunnable([], "2026-01", {
        expenseAccount: { number: "6000", name: "Depreciation" },
        accumulatedAccount: { number: "1209", name: "Accumulated" },
      }),
    );
    both(run, "Ingenting å avskrive i 2026-01: det finnes ingen anleggsmidler.");
  });

  it("passes unknown text through unchanged and never throws", () => {
    expect(localize("Something nobody wrote.", "nb")).toBe("Something nobody wrote.");
    expect(localize(new Error("Out of cheese."), "nb")).toBe("Out of cheese.");
    expect(localize("", "nb")).toBe("");
    expect(localize(undefined, "nb")).toBe("");
    expect(localize(42, "nb")).toBe("42");
    expect(localize("Unknown first. The batch has no payments.", "nb")).toBe(
      "Unknown first. Betalingsoppdraget har ingen betalinger.",
    );
  });
});
