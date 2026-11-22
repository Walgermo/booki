import { describe, expect, it } from "vitest";
import { assertForeignAmount, convertMinor, findRate, revalue } from "./fx.js";
import { BOOKI_PROFILES, SE_PROFILE, defineProfile, getBookiProfile } from "./locale/index.js";
import { isValidOrganizationNumber, formatOrganizationNumber } from "./organization-number.js";
import { STANDARD_DUTY_RULES, STANDARD_ROLES, assertCan, can } from "./permissions.js";

describe("exchange rates", () => {
  const rates = [
    { date: "2026-10-01", from: "EUR", to: "NOK", rateScaled: 11_500_000 },
    { date: "2026-10-31", from: "EUR", to: "NOK", rateScaled: 11_800_000 },
    { date: "2026-10-01", from: "USD", to: "JPY", rateScaled: 150_000_000 },
  ];
  it("converts with exact rounding and across decimal counts", () => {
    expect(convertMinor(100_00, "EUR", "NOK", 11_500_000)).toBe(1150_00);
    expect(convertMinor(1, "EUR", "NOK", 11_234_500)).toBe(11);
    expect(convertMinor(100_00, "USD", "JPY", 150_000_000)).toBe(15_000);
    expect(convertMinor(15_000, "JPY", "USD", 6_667)).toBe(100_01);
    expect(convertMinor(-5, "EUR", "NOK", 11_500_000)).toBe(-58);
    expect(() => convertMinor(1.5, "EUR", "NOK", 1)).toThrow(/whole number/);
    expect(() => convertMinor(1, "EUR", "NOK", 0)).toThrow(/above zero/);
  });
  it("picks the latest rate on or before the date, inverts, and says when there is none", () => {
    expect(findRate(rates, "EUR", "NOK", "2026-10-15").rateScaled).toBe(11_500_000);
    expect(findRate(rates, "eur", "nok", "2026-11-02").rateScaled).toBe(11_800_000);
    expect(findRate(rates, "NOK", "EUR", "2026-10-15").rateScaled).toBe(86_957);
    expect(findRate(rates, "NOK", "NOK", "2020-01-01").rateScaled).toBe(1_000_000);
    expect(() => findRate(rates, "EUR", "NOK", "2026-09-30")).toThrow(/No exchange rate from EUR to NOK/);
  });
  it("checks a booked foreign amount and revalues open items", () => {
    expect(() =>
      assertForeignAmount({ currency: "EUR", amountMinor: 100_00, rateScaled: 11_500_000 }, "NOK", 1150_00),
    ).not.toThrow();
    expect(() =>
      assertForeignAmount({ currency: "EUR", amountMinor: 100_00, rateScaled: 11_500_000 }, "NOK", 1150_01),
    ).toThrow(/not 115001/);
    const result = revalue(
      [
        { id: "ar1", currency: "EUR", amountMinor: 100_00, bookedBaseMinor: 1150_00 },
        { id: "ap1", currency: "EUR", amountMinor: -40_00, bookedBaseMinor: -460_00 },
      ],
      rates,
      "NOK",
      "2026-10-31",
    );
    expect(result.items.map((item) => item.differenceMinor)).toEqual([30_00, -12_00]);
    expect(result.totalDifferenceMinor).toBe(18_00);
  });
});

describe("country profiles", () => {
  it("ships six and refuses an unknown code by name", () => {
    expect(Object.keys(BOOKI_PROFILES).sort()).toEqual(["DE", "DK", "GB", "NO", "SE", "US"]);
    expect(getBookiProfile("SE")).toMatchObject({ currency: "SEK", bankAccount: { kind: "iban" } });
    expect(SE_PROFILE.copy.amount).toBe("Amount");
    expect(() => getBookiProfile("FI")).toThrow(/No profile for country "FI".*defineProfile/);
  });
  it("lets you define your own from one that exists", () => {
    const FI = defineProfile(SE_PROFILE, {
      country: "FI",
      locale: "fi-FI",
      currency: "EUR",
      tax: { defaultPercent: 25.5 },
    });
    expect(FI.tax.label).toBe(SE_PROFILE.tax.label);
    expect(FI.tax.defaultPercent).toBe(25.5);
    expect(getBookiProfile("FI", { FI }).currency).toBe("EUR");
    expect(SE_PROFILE.currency).toBe("SEK");
  });
  it("checks Swedish and Danish company numbers", () => {
    expect(isValidOrganizationNumber("556036-0793", "se-orgnr")).toBe(true);
    expect(isValidOrganizationNumber("556036-0794", "se-orgnr")).toBe(false);
    expect(isValidOrganizationNumber("10150817", "dk-cvr")).toBe(true);
    expect(isValidOrganizationNumber("10150818", "dk-cvr")).toBe(false);
    expect(formatOrganizationNumber("5560360793", "se-orgnr")).toBe("556036-0793");
    expect(formatOrganizationNumber("sc 123456", "generic")).toBe("SC123456");
    expect(isValidOrganizationNumber("AB", "generic")).toBe(false);
  });
});

describe("roles and separation of duties", () => {
  const kari = { id: "kari", roles: ["manager"], entities: ["no"] };
  it("grants by role and entity", () => {
    expect(can(kari, STANDARD_ROLES, "payment.approve")).toBe(true);
    expect(can(kari, STANDARD_ROLES, "payment.release")).toBe(false);
    expect(can(kari, STANDARD_ROLES, "payment.approve", { entity: "se" })).toBe(false);
    expect(can(undefined, STANDARD_ROLES, "payment.approve")).toBe(false);
  });
  it("says who may, and stops one person doing both halves", () => {
    expect(() => assertCan(kari, STANDARD_ROLES, "vat.submit")).toThrow(/takes one of these roles: Controller/);
    expect(() => assertCan(undefined, STANDARD_ROLES, "vat.submit")).toThrow(/Nobody is signed in/);
    const both = { id: "ola", roles: ["controller"] };
    expect(() =>
      assertCan(both, STANDARD_ROLES, "payment.release", {
        deeds: [{ actorId: "ola", permission: "payment.approve" }],
        dutyRules: STANDARD_DUTY_RULES,
      }),
    ).toThrow(/cannot also release/);
    expect(() =>
      assertCan(both, STANDARD_ROLES, "payment.release", {
        deeds: [{ actorId: "kari", permission: "payment.approve" }],
        dutyRules: STANDARD_DUTY_RULES,
      }),
    ).not.toThrow();
  });
});
