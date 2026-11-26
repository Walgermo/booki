import { describe, expect, it } from "vitest";
import {
  NS4102_SCHEME,
  TYPE_SCHEME,
  US_CHART_SCHEME,
  accountIssues,
  applyChanges,
  chartOrder,
  chartSchemeFor,
  checkChange,
  checkClass,
  classForNumber,
  classOf,
  classRange,
  editAccount,
  findAccount,
  groupAccounts,
  mergeChanges,
  proposalIssues,
  type ChartAccount,
} from "./chart-of-accounts.js";
import { localize } from "./messages.js";

const acc = (number: string, name: string, type: ChartAccount["type"], more: Partial<ChartAccount> = {}) =>
  ({ number, name, type, active: true, standardAccount: number, ...more }) as ChartAccount;

const NO: ChartAccount[] = [
  acc("1920", "Bankinnskudd", "asset", { locked: true }),
  acc("1500", "Kundefordringer", "asset"),
  acc("2400", "Leverandørgjeld", "liability"),
  acc("2050", "Annen egenkapital", "equity"),
  acc("3000", "Salgsinntekt, avgiftspliktig", "income", { vatCode: "3" }),
  acc("4300", "Innkjøp av varer for videresalg", "expense"),
  acc("5000", "Lønn til ansatte", "expense"),
  acc("6300", "Leie lokale", "expense"),
  acc("7140", "Reisekostnad", "expense"),
  acc("8050", "Annen renteinntekt", "income"),
];

describe("schemes", () => {
  it("picks NS 4102 for Norway, the common ranges for the US, and types elsewhere", () => {
    expect(chartSchemeFor("NO")).toBe(NS4102_SCHEME);
    expect(chartSchemeFor("US")).toBe(US_CHART_SCHEME);
    expect(chartSchemeFor("SE")).toBe(TYPE_SCHEME);
    expect(chartSchemeFor()).toBe(TYPE_SCHEME);
    expect(NS4102_SCHEME.classes.map((cls) => cls.id)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
    expect(NS4102_SCHEME.requiresStandard).toBe(true);
    expect(US_CHART_SCHEME.requiresStandard).toBe(false);
  });

  it("finds the class by the leading digits, whatever the number's length", () => {
    expect(classForNumber(NS4102_SCHEME, "1920")?.id).toBe("1");
    expect(classForNumber(NS4102_SCHEME, "15000")?.id).toBe("1");
    expect(classForNumber(NS4102_SCHEME, "7999")?.id).toBe("7");
    expect(classForNumber(NS4102_SCHEME, "9100")).toBeUndefined();
    expect(classForNumber(US_CHART_SCHEME, "6500")?.id).toBe("expenses");
    expect(classForNumber(US_CHART_SCHEME, "8100")?.id).toBe("other");
    expect(classRange(US_CHART_SCHEME.classes[4]!)).toBe("5000–7999");
  });

  it("groups by type in a scheme without ranges, or by the class an account names", () => {
    expect(classOf(TYPE_SCHEME, acc("100", "Cash", "asset"))?.id).toBe("asset");
    expect(classOf(TYPE_SCHEME, acc("100", "Cash", "asset", { class: "equity" }))?.id).toBe("equity");
  });

  it("refuses an unknown class, listing the classes with their ranges", () => {
    expect(() => checkClass(NS4102_SCHEME, "9")).toThrow('No account class "9". Classes: 1 (1000–1999), 2 (2000–2999)');
    expect(
      localize(
        captured(() => checkClass(NS4102_SCHEME, "9")),
        "nb",
      ),
    ).toContain("Ingen kontoklasse");
  });
});

describe("grouping and order", () => {
  it("puts accounts under their classes in the scheme's order, the unclassified last", () => {
    const groups = groupAccounts(NS4102_SCHEME, [...NO, acc("9100", "Intern", "expense")]);
    expect(groups.map((group) => group.class?.id ?? null)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", null]);
    expect(groups[0]!.accounts.map((a) => a.number)).toEqual(["1920", "1500"]);
  });

  it("reads class by class, number by number", () => {
    expect(chartOrder(NS4102_SCHEME, NO).map((a) => a.number)).toEqual([
      "1500",
      "1920",
      "2050",
      "2400",
      "3000",
      "4300",
      "5000",
      "6300",
      "7140",
      "8050",
    ]);
  });
});

describe("issues", () => {
  it("finds nothing wrong with a clean Norwegian chart", () => {
    expect(accountIssues(NS4102_SCHEME, NO)).toEqual([]);
  });

  it("names a duplicate number once", () => {
    const issues = accountIssues(NS4102_SCHEME, [...NO, acc("1920", "Bank 2", "asset")]);
    expect(issues).toEqual([
      {
        number: "1920",
        code: "duplicate",
        level: "error",
        message: "Account 1920 appears 2 times in the chart.",
      },
    ]);
  });

  it("names a number outside every class, and a type its class does not hold", () => {
    const issues = accountIssues(NS4102_SCHEME, [acc("9100", "Intern", "expense"), acc("1600", "Salg", "income")]);
    expect(issues.map((issue) => issue.code)).toEqual(["no-class", "type-mismatch"]);
    expect(issues[1]!.message).toBe('Account 1600 is "income", but class 1 (1000–1999) holds "asset".');
  });

  it("names a class the number does not fit, and a number of the wrong length", () => {
    const issues = accountIssues(NS4102_SCHEME, [
      acc("3000", "Salg", "income", { class: "4" }),
      acc("19", "X", "asset"),
    ]);
    expect(issues.map((issue) => issue.code)).toEqual(["class-mismatch", "number-format"]);
    expect(issues[0]!.message).toContain("marked class 4 (4000–4999)");
  });

  it("warns of an active Norwegian account with no SAF-T mapping, not an inactive one", () => {
    const issues = accountIssues(NS4102_SCHEME, [
      acc("6800", "Kontorrekvisita", "expense", { standardAccount: undefined }),
      acc("6810", "Data", "expense", { standardAccount: undefined, active: false }),
    ]);
    expect(issues).toEqual([
      {
        number: "6800",
        code: "missing-standard",
        level: "warning",
        message: "Account 6800 has no SAF-T standard account. mapStandard(number, standardAccount) maps it.",
      },
    ]);
    expect(localize(issues[0]!.message, "nb")).toBe(
      "Konto 6800 mangler SAF-T-standardkonto. mapStandard(nummer, standardkonto) kobler den.",
    );
    // The US asks for no standard mapping.
    expect(accountIssues(US_CHART_SCHEME, [acc("6800", "Office", "expense", { standardAccount: undefined })])).toEqual(
      [],
    );
  });

  it("refuses a standard account that is not 2 or 4 digits", () => {
    const issues = accountIssues(NS4102_SCHEME, [acc("6800", "Kontor", "expense", { standardAccount: "680" })]);
    expect(issues.map((issue) => issue.code)).toEqual(["standard-format"]);
  });
});

describe("changes", () => {
  it("checks an edit and an add, and refuses what would break the chart", () => {
    expect(checkChange(NS4102_SCHEME, NO, { number: "1500", name: "Kundefordringer, innland" })).toEqual({
      kind: "edit",
      number: "1500",
      name: "Kundefordringer, innland",
    });
    expect(checkChange(NS4102_SCHEME, NO, { number: "6810", name: "Programvare", type: "expense" })).toMatchObject({
      kind: "add",
    });
    expect(() => checkChange(NS4102_SCHEME, NO, { number: "6810", name: "Programvare" })).toThrow(
      "A new account 6810 needs a name and a type. Types: asset, liability, equity, income, expense.",
    );
    expect(() => checkChange(NS4102_SCHEME, NO, { number: "1920", type: "liability" })).toThrow(
      "Account 1920 has postings, so its type is fixed.",
    );
    expect(() => checkChange(NS4102_SCHEME, NO, { number: "1920", newNumber: "1921" })).toThrow(
      "Account 1920 has postings, so its number is fixed.",
    );
    expect(() => checkChange(NS4102_SCHEME, NO, { number: "1500", newNumber: "1920" })).toThrow(
      "Account 1920 already exists.",
    );
    expect(() => checkChange(NS4102_SCHEME, NO, { number: "1500", type: "cash" as never })).toThrow(
      '"cash" is not an account type.',
    );
    expect(() => checkChange(NS4102_SCHEME, NO, { number: 1500 as never })).toThrow(
      'An account number is digits as text, like "1500"; got 1500.',
    );
  });

  it("merges later changes to the same account, and applies them", () => {
    const first = [checkChange(NS4102_SCHEME, NO, { number: "6810", name: "Programvare", type: "expense" })];
    const merged = mergeChanges(first, [
      checkChange(NS4102_SCHEME, NO, { number: "6810", standardAccount: "6810" }, first),
      checkChange(NS4102_SCHEME, NO, { number: "1500", newNumber: "1510" }),
    ]);
    expect(merged).toEqual([
      { kind: "add", number: "6810", name: "Programvare", type: "expense", standardAccount: "6810" },
      { kind: "edit", number: "1500", newNumber: "1510" },
    ]);
    const next = applyChanges(NO, merged);
    expect(next.find((a) => a.number === "6810")).toEqual({
      number: "6810",
      name: "Programvare",
      type: "expense",
      standardAccount: "6810",
      active: true,
    });
    expect(next.some((a) => a.number === "1500")).toBe(false);
    expect(next.find((a) => a.number === "1510")?.name).toBe("Kundefordringer");
  });

  it("reports the issues a proposal leaves on the accounts it touches", () => {
    const changes = [checkChange(NS4102_SCHEME, NO, { number: "3900", name: "Annen inntekt", type: "expense" })];
    expect(proposalIssues(NS4102_SCHEME, NO, changes).map((issue) => issue.code)).toEqual([
      "type-mismatch",
      "missing-standard",
    ]);
  });

  it("edits one account and clears an emptied field", () => {
    const next = editAccount(NO, "3000", { vatCode: "" });
    expect(next.find((a) => a.number === "3000")).not.toHaveProperty("vatCode");
  });

  it("refuses an unknown account, listing the chart, or the closest numbers in a big one", () => {
    expect(() => findAccount(NO, "9999")).toThrow('No account "9999" in the chart. Accounts: 1920, 1500, 2400');
    const big = Array.from({ length: 60 }, (_, i) => acc(String(1000 + i * 100), `A${i}`, "asset"));
    const message = captured(() => findAccount(big, "1950"));
    expect(message).toMatch(/^No account "1950" in the chart of 60\. Closest: /);
    expect(message).toContain("1900");
    expect(localize(message, "nb")).toContain("Nærmeste");
  });
});

function captured(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("expected a throw");
}
