/**
 * The invariants the rest of Booki relies on without saying so, each with a
 * property test (seeded, so a failure reproduces) or an exhaustive test where
 * the domain is small enough. `docs/invariants.md` gives the argument for each
 * and the counterexamples that were found and fixed.
 */
import { describe, expect, it } from "vitest";
import {
  addMoney,
  decimalFromMinor,
  formatMoney,
  generateKid,
  isValidDkCvr,
  isValidEin,
  isValidIban,
  isValidKid,
  isValidKontonummer,
  isValidOrgnr,
  isValidRoutingNumber,
  isValidSeOrgnr,
  kidCheckDigitMod10,
  kidCheckDigitMod11,
  kontonummerToIban,
  extractNorwegianKontonummer,
  minorFromDecimal,
  money,
  parseAmountText,
  parseToMinor,
  subMoney,
  sumMinorUnits,
} from "./index.js";
import { assertPostingAllowed, periodStatusOn, setPeriodStatus, type PeriodStatus } from "./period-lock.js";
import { periodBounds } from "./period.js";
import { sumVoucher, voucherIssues, type VoucherLine } from "./voucher.js";
import { PERSON_ONLY, guard, type ServerActor } from "./server.js";
import { PERMISSIONS, STANDARD_ROLES, type Role } from "./permissions.js";

/** A small seeded generator (mulberry32): the same seed gives the same cases. */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  const digits = (n: number) => Array.from({ length: n }, () => String(int(0, 9))).join("");
  /** A safe integer, biased toward the edges of the range. */
  const minor = () => {
    const kind = int(0, 3);
    if (kind === 0) return int(-1000, 1000);
    if (kind === 1) return Number.MAX_SAFE_INTEGER - int(0, 1000);
    if (kind === 2) return -Number.MAX_SAFE_INTEGER + int(0, 1000);
    return Math.trunc((next() * 2 - 1) * Number.MAX_SAFE_INTEGER);
  };
  return { next, int, digits, minor };
}
const RUNS = 2000;

/** Every single-digit substitution of `value`: each position, each other digit. */
function substitutions(value: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < value.length; i++) {
    for (let d = 0; d <= 9; d++) {
      if (String(d) !== value[i]) out.push(value.slice(0, i) + d + value.slice(i + 1));
    }
  }
  return out;
}

describe("Money: minor units are exact or refused", () => {
  it("I1 money() keeps a safe integer and never -0", () => {
    const r = rng(1);
    for (let i = 0; i < RUNS; i++) {
      const m = money(r.minor(), "NOK");
      expect(Number.isSafeInteger(m.minor)).toBe(true);
      expect(Object.is(m.minor, -0)).toBe(false);
    }
    expect(money(-0, "NOK").minor).toBe(0);
    expect(() => money(0.5, "NOK")).toThrow();
    expect(() => money(2 ** 53, "NOK")).toThrow();
  });

  it("I2 addMoney and subMoney give the exact sum, or throw", () => {
    const r = rng(2);
    for (let i = 0; i < RUNS; i++) {
      const a = r.minor();
      const b = r.minor();
      for (const [op, exact] of [
        [addMoney, BigInt(a) + BigInt(b)],
        [subMoney, BigInt(a) - BigInt(b)],
      ] as const) {
        const safe = exact <= BigInt(Number.MAX_SAFE_INTEGER) && exact >= BigInt(Number.MIN_SAFE_INTEGER);
        if (safe) expect(BigInt(op(money(a, "NOK"), money(b, "NOK")).minor)).toBe(exact);
        else expect(() => op(money(a, "NOK"), money(b, "NOK"))).toThrow();
      }
    }
  });

  it("I2 a currency code is the same currency in either case (counterexample: 'nok' vs 'NOK' threw)", () => {
    expect(addMoney({ minor: 1, currency: "nok" }, money(1, "NOK"))).toEqual({ minor: 2, currency: "NOK" });
    expect(() => addMoney(money(1, "NOK"), money(1, "SEK"))).toThrow();
  });

  it("I3 sumMinorUnits is the exact sum, even through unsafe partial sums", () => {
    const r = rng(3);
    for (let i = 0; i < RUNS / 4; i++) {
      const rows = Array.from({ length: r.int(0, 6) }, () => r.minor());
      const exact = rows.reduce((s, n) => s + BigInt(n), 0n);
      const safe = exact <= BigInt(Number.MAX_SAFE_INTEGER) && exact >= BigInt(Number.MIN_SAFE_INTEGER);
      if (safe) expect(BigInt(sumMinorUnits(rows, (n) => n))).toBe(exact);
      else expect(() => sumMinorUnits(rows, (n) => n)).toThrow();
    }
    const max = Number.MAX_SAFE_INTEGER;
    expect(sumMinorUnits([max, max, -max], (n) => n)).toBe(max);
  });

  it("I4 decimalFromMinor and minorFromDecimal are inverse for 0, 2 and 3 decimals", () => {
    const r = rng(4);
    for (const currency of ["JPY", "NOK", "KWD"]) {
      for (let i = 0; i < RUNS / 2; i++) {
        const minor = r.minor();
        expect(minorFromDecimal(decimalFromMinor(minor, currency), currency)).toBe(minor);
      }
    }
  });

  it("I5 formatMoney then parseToMinor gives the same minor units, in every profile's locale and more", () => {
    const r = rng(5);
    const cases: [string, string][] = [
      ["nb-NO", "NOK"],
      ["en-US", "USD"],
      ["sv-SE", "SEK"],
      ["da-DK", "DKK"],
      ["en-GB", "GBP"],
      ["de-DE", "EUR"],
      ["fr-FR", "EUR"],
      // Counterexamples before the fix: lakh grouping and the Swiss apostrophe parsed as null.
      ["en-IN", "INR"],
      ["de-CH", "CHF"],
      ["ja-JP", "JPY"],
      ["ar-KW", "KWD"],
    ];
    for (const [locale, currency] of cases) {
      for (let i = 0; i < 200; i++) {
        const minor = r.int(0, 1) ? r.int(-10_000_000, 10_000_000) : Math.trunc((r.next() * 2 - 1) * 1e14);
        for (const accounting of [false, true]) {
          const text = formatMoney(money(minor, currency), { locale, accounting });
          expect(parseToMinor(text, currency, { locale }), `${locale} ${text}`).toBe(minor);
        }
      }
    }
  });

  it("I6 spaces group digits in threes, every group (counterexample: '1 234 5' read as 12345)", () => {
    expect(parseAmountText("1 234 5", { locale: "nb-NO", currency: "NOK" })).toBeNull();
    expect(parseAmountText("12 345 6")).toBeNull();
    expect(parseAmountText("1 234 567")).toEqual({ negative: false, int: "1234567", frac: "" });
    expect(parseAmountText("1 234 567,50 kr", { locale: "nb-NO", currency: "NOK" })).toEqual({
      negative: false,
      int: "1234567",
      frac: "50",
    });
    expect(parseAmountText("1'234'5", { locale: "de-CH", currency: "CHF" })).toBeNull();
  });

  it("I7 parseToMinor never rounds and never returns an unsafe integer", () => {
    const r = rng(7);
    for (let i = 0; i < RUNS; i++) {
      const frac = r.digits(r.int(0, 4));
      const text = `${r.int(0, 1) ? "-" : ""}${r.digits(r.int(1, 18))}${frac ? `.${frac}` : ""}`;
      const result = parseToMinor(text, "NOK");
      if (frac.length > 2) expect(result).toBeNull();
      if (result !== null) {
        expect(Number.isSafeInteger(result)).toBe(true);
        expect(BigInt(result)).toBe(BigInt(minorFromDecimal(text, "NOK")));
      }
    }
  });
});

describe("Check digits", () => {
  it("I8 a generated KID is valid, and any one wrong digit is caught (mod 10 and mod 11)", () => {
    const r = rng(8);
    for (let i = 0; i < 300; i++) {
      const body = r.digits(r.int(3, 24));
      const kid10 = generateKid(body, 10)!;
      expect(isValidKid(kid10, 10)).toBe(true);
      for (const wrong of substitutions(kid10)) expect(isValidKid(wrong, 10), wrong).toBe(false);
      const kid11 = generateKid(body, 11);
      if (kid11 === null) {
        // The remainder-10 case: the KID ends in "-".
        expect(kidCheckDigitMod11(body)).toBeNull();
        expect(isValidKid(`${body}-`, 11)).toBe(true);
        continue;
      }
      expect(isValidKid(kid11, 11)).toBe(true);
      for (const wrong of substitutions(kid11)) expect(isValidKid(wrong, 11), wrong).toBe(false);
    }
  });

  it("I8 exactly one mod 10 check digit fits each body, exhaustively for every 3-digit body", () => {
    for (let n = 0; n < 1000; n++) {
      const body = String(n).padStart(3, "0");
      const fits = [...Array(10).keys()].filter((d) => isValidKid(`${body}${d}`, 10));
      expect(fits).toEqual([kidCheckDigitMod10(body)]);
    }
  });

  const mod11Body = (r: ReturnType<typeof rng>, length: number, valid: (value: string) => boolean): string => {
    for (;;) {
      const body = r.digits(length);
      const fits = [...Array(10).keys()].map((d) => `${body}${d}`).filter(valid);
      if (fits.length) return fits[0]!;
    }
  };

  it("I9 a kontonummer has at most one check digit, any one wrong digit is caught, and its IBAN round-trips", () => {
    const r = rng(9);
    for (let i = 0; i < 300; i++) {
      const body = r.digits(10);
      const fits = [...Array(10).keys()].filter((d) => isValidKontonummer(`${body}${d}`));
      expect(fits.length).toBeLessThanOrEqual(1);
      const account = mod11Body(r, 10, isValidKontonummer);
      for (const wrong of substitutions(account)) expect(isValidKontonummer(wrong), wrong).toBe(false);
      const iban = kontonummerToIban(account)!;
      expect(isValidIban(iban)).toBe(true);
      expect(extractNorwegianKontonummer(iban)).toBe(account);
    }
  });

  it("I10 an organisation number has exactly its own count of digits (counterexample: a tenth digit was cut off)", () => {
    expect(isValidOrgnr("974760673")).toBe(true);
    expect(isValidOrgnr("NO 974 760 673 MVA")).toBe(true);
    expect(isValidOrgnr("9747606731")).toBe(false);
    expect(isValidEin("12-3456789")).toBe(true);
    expect(isValidEin("1234567890")).toBe(false);
    expect(isValidSeOrgnr("556036-0793")).toBe(true);
    expect(isValidSeOrgnr("556036-07931")).toBe(false);
    expect(isValidDkCvr("10150817")).toBe(true);
    expect(isValidDkCvr("101508170")).toBe(false);
    const r = rng(10);
    for (let i = 0; i < 300; i++) {
      const orgnr = mod11Body(r, 8, isValidOrgnr);
      for (const wrong of substitutions(orgnr)) expect(isValidOrgnr(wrong), wrong).toBe(false);
      expect(isValidOrgnr(`${orgnr}${r.int(0, 9)}`)).toBe(false);
    }
  });

  it("I11 an ABA routing number has exactly one check digit, and any one wrong digit is caught", () => {
    const r = rng(11);
    for (let i = 0; i < 500; i++) {
      const body = r.digits(8);
      const fits = [...Array(10).keys()].filter((d) => isValidRoutingNumber(`${body}${d}`));
      if (/^0+$/.test(body)) {
        expect(fits).toEqual([]);
        continue;
      }
      expect(fits).toHaveLength(1);
      for (const wrong of substitutions(`${body}${fits[0]}`)) {
        if (!/^0+$/.test(wrong)) expect(isValidRoutingNumber(wrong), wrong).toBe(false);
      }
    }
  });

  it("I12 any one wrong character in a valid IBAN is caught", () => {
    const r = rng(12);
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    for (let i = 0; i < 200; i++) {
      const iban = kontonummerToIban(mod11Body(r, 10, isValidKontonummer))!;
      for (let at = 2; at < iban.length; at++) {
        for (const ch of letters) {
          if (ch === iban[at]) continue;
          const wrong = iban.slice(0, at) + ch + iban.slice(at + 1);
          expect(isValidIban(wrong), wrong).toBe(false);
        }
      }
    }
  });
});

describe("Vouchers", () => {
  const line = (id: string, debitMinor: unknown, creditMinor: unknown): VoucherLine =>
    ({ id, account: "1920", accountName: "Bank", debitMinor, creditMinor }) as VoucherLine;

  it("I13 voucherIssues lists problems and never throws (counterexample: an unsafe or text amount threw)", () => {
    const awkward: unknown[] = [0, 1, -1, 0.5, 2 ** 52, 2 ** 53, Number.MAX_SAFE_INTEGER, Number.NaN, "100", null];
    for (const a of awkward) {
      for (const b of awkward) {
        const lines = [line("1", a, 0), line("2", 0, b)];
        expect(() => voucherIssues(lines)).not.toThrow();
        // No issues only when both sides are the same whole, positive øre ("100" is read as 100).
        const whole = (v: unknown) => (typeof v === "string" ? Number(v) : v);
        const same = whole(a) === whole(b) && Number.isSafeInteger(whole(a)) && (whole(a) as number) > 0;
        expect(voucherIssues(lines).length === 0).toBe(same);
      }
    }
    expect(voucherIssues([line("1", "100", 0), line("2", 0, 99)])).toEqual([expect.stringMatching(/balance/i)]);
    expect(voucherIssues([line("1", 2 ** 52, 0), line("2", 2 ** 52, 0), line("3", 0, 1)])).toEqual(
      expect.arrayContaining([expect.stringMatching(/safe integer/)]),
    );
  });

  it("I13 a voucher with no issues balances exactly", () => {
    const r = rng(13);
    for (let i = 0; i < RUNS; i++) {
      const lines = Array.from({ length: r.int(1, 5) }, (_, n) =>
        r.int(0, 1) ? line(String(n), r.int(0, 2 ** 40), 0) : line(String(n), 0, r.int(0, 2 ** 40)),
      );
      if (r.int(0, 1)) {
        const { differenceMinor } = sumVoucher(lines);
        lines.push(differenceMinor > 0 ? line("x", 0, differenceMinor) : line("x", -differenceMinor, 0));
      }
      if (voucherIssues(lines).length === 0) {
        const debit = lines.reduce((s, l) => s + BigInt(l.debitMinor), 0n);
        const credit = lines.reduce((s, l) => s + BigInt(l.creditMinor), 0n);
        expect(debit).toBe(credit);
      }
    }
  });
});

describe("Periods and locks", () => {
  it("I14 the months, and the VAT terms, each cover every day of a year exactly once (1900–2100, exhaustive)", () => {
    for (let year = 1900; year <= 2100; year++) {
      for (const codes of [
        Array.from({ length: 12 }, (_, m) => `${year}-${String(m + 1).padStart(2, "0")}`),
        Array.from({ length: 6 }, (_, t) => `${year}-T${t + 1}`),
      ]) {
        const bounds = codes.map((code) => periodBounds(code)!);
        expect(bounds[0]!.from).toBe(`${year}-01-01`);
        expect(bounds.at(-1)!.to).toBe(`${year}-12-31`);
        for (let i = 1; i < bounds.length; i++) {
          const dayAfter = new Date(`${bounds[i - 1]!.to}T00:00:00Z`);
          dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
          expect(bounds[i]!.from).toBe(dayAfter.toISOString().slice(0, 10));
        }
      }
    }
  });

  const STATUSES: PeriodStatus[] = ["open", "soft-closed", "hard-closed"];

  it("I15 a hard-closed period never reopens, over every sequence of four status changes (exhaustive)", () => {
    const codes = ["2025", "2025-03", "2025-T2"];
    const steps = codes.flatMap((code) => STATUSES.map((status) => ({ code, status })));
    const walk = (states: ReturnType<typeof setPeriodStatus>, depth: number, hardDay: boolean): void => {
      // 2025-03-15 lies in all three codes.
      expect(periodStatusOn(states, "2025-03-15").status === "hard-closed").toBe(hardDay || false);
      if (depth === 0) return;
      for (const step of steps) {
        let next = states;
        try {
          next = setPeriodStatus(states, step.code, step.status);
        } catch {
          continue;
        }
        walk(next, depth - 1, hardDay || step.status === "hard-closed");
      }
    };
    walk([], 4, false);
  });

  it("I15 the strictest period wins, and an unknown status fails closed (counterexample: 'closed' read as open)", () => {
    for (const a of STATUSES) {
      for (const b of STATUSES) {
        const states = [
          { code: "2025", status: a },
          { code: "2025-03", status: b },
        ];
        const strictest = STATUSES[Math.max(STATUSES.indexOf(a), STATUSES.indexOf(b))];
        expect(periodStatusOn(states, "2025-03-01").status).toBe(strictest);
      }
    }
    expect(() => periodStatusOn([{ code: "2025", status: "closed" as PeriodStatus }], "2025-03-01")).toThrow();
    expect(() => assertPostingAllowed([{ code: "2025", status: "closed" as PeriodStatus }], "2025-03-01")).toThrow();
    for (const status of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
      expect(() => setPeriodStatus([], "2025", status as PeriodStatus)).toThrow();
    }
  });
});

describe("Person-only decisions on the server", () => {
  const everything: Role = { id: "all", name: "Everything", permissions: [...PERMISSIONS] };

  it("I16 every PERSON_ONLY permission is refused to an agent, whatever its roles, agentOwn or delegation (exhaustive)", () => {
    const roleSets = [[everything], STANDARD_ROLES, [...STANDARD_ROLES, everything]];
    for (const permission of PERSON_ONLY) {
      for (const roles of roleSets) {
        for (const onBehalfOf of [undefined, "nina"]) {
          const agent: ServerActor = { id: "bot", kind: "agent", roles: roles.map((r) => r.id), onBehalfOf };
          const verdict = guard(
            {
              actor: agent,
              roles,
              agentOwn: [permission],
              personOf: () => ({ id: "nina", roles: ["all"] }),
              dutyRules: [],
            },
            permission,
            () => true,
          );
          expect(verdict.ok, permission).toBe(false);
          if (!verdict.ok) expect(verdict.code).toBe("server.person-only");
        }
        const person: ServerActor = { id: "nina", kind: "person", roles: ["all"] };
        expect(guard({ actor: person, roles: [everything], dutyRules: [] }, permission, () => true).ok).toBe(true);
      }
    }
  });

  it("I16 every PERSON_ONLY permission is a known permission", () => {
    for (const permission of PERSON_ONLY) expect(PERMISSIONS as readonly string[]).toContain(permission);
  });

  it("I16 an actor of another kind is refused outright", () => {
    const actor = { id: "x", kind: "robot", roles: ["all"] } as unknown as ServerActor;
    expect(guard({ actor, roles: [everything] }, "voucher.post", () => true).ok).toBe(false);
  });
});
