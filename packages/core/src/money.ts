import { isoMinorUnits } from "./currency-minor-units.js";
import { moneyMessages } from "./msg-money.js";

/** Integer minor-unit money. Never use floats as source of truth. */

export type BookiCurrencyCode = string;

export type Money = {
  /** Integer minor units (øre, cents, …) */
  minor: number;
  currency: BookiCurrencyCode;
};

/** ISO 4217 fraction digits for a currency with a defined minor unit. */
export function minorDigitsFor(currency: BookiCurrencyCode): number {
  const digits = isoMinorUnits(currency);
  if (digits === undefined) throw moneyMessages.error("money.no-minor-unit", { currency });
  return digits;
}

export function money(minor: number, currency: BookiCurrencyCode): Money {
  if (!Number.isSafeInteger(minor)) {
    throw moneyMessages.error("money.not-safe-integer", { value: String(minor) });
  }
  // -0 is 0: it would print as "-NOK 0.00".
  return { minor: minor === 0 ? 0 : minor, currency: currency.toUpperCase() };
}

/**
 * Plain decimal digits for a finite number, using its shortest round-trip
 * text (so 1.005 reads as "1.005", not 1.00499999…). Expands exponents.
 */
function plainDecimal(value: number): { negative: boolean; int: string; frac: string } {
  const text = String(Math.abs(value)).toLowerCase();
  const [mantissa = "0", exponentText] = text.split("e");
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  const [intPart = "0", fracPart = ""] = mantissa.split(".");
  let digits = intPart + fracPart;
  let point = intPart.length + exponent;
  if (point < 0) {
    digits = "0".repeat(-point) + digits;
    point = 0;
  }
  if (point > digits.length) {
    digits = digits + "0".repeat(point - digits.length);
  }
  return {
    negative: value < 0,
    int: digits.slice(0, point).replace(/^0+(?=\d)/, "") || "0",
    frac: digits.slice(point),
  };
}

/**
 * Integer minor units from exact decimal digits, rounding half away from zero
 * at the currency's fraction digits.
 */
function digitsToMinor(negative: boolean, int: string, frac: string, minorDigits: number): number {
  const kept = (frac + "0".repeat(minorDigits)).slice(0, minorDigits);
  const next = frac.charAt(minorDigits);
  let magnitude = Number(`${int}${kept}`);
  if (next !== "" && next >= "5") magnitude += 1;
  const minor = negative ? -magnitude : magnitude;
  return minor === 0 ? 0 : minor;
}

/**
 * Major units (a JS number) to Money. Uses the number's decimal text, so
 * `fromMajor(1.005, "USD")` is 101 cents. Rounds half away from zero.
 */
export function fromMajor(major: number, currency: BookiCurrencyCode): Money {
  if (!Number.isFinite(major)) {
    throw moneyMessages.error("money.not-finite", { value: String(major) });
  }
  const { negative, int, frac } = plainDecimal(major);
  return money(digitsToMinor(negative, int, frac, minorDigitsFor(currency)), currency);
}

/**
 * Exact decimal text in major units, as a database numeric or decimal.js gives
 * it ("1234.5", "-0.75"), to minor units. No floating point on the way. Text
 * with more decimals than the currency has is refused unless they are zeros,
 * so a rounding never happens without you choosing it.
 */
export function minorFromDecimal(text: string, currency: BookiCurrencyCode): number {
  const value = String(text).trim();
  const match = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw moneyMessages.error("money.not-decimal", { value });
  const [, sign, int, frac = ""] = match;
  const digits = minorDigitsFor(currency);
  if (/[1-9]/.test(frac.slice(digits))) {
    throw moneyMessages.error("money.too-precise", { value, digits, currency: String(currency) });
  }
  const whole = BigInt(int! + frac.slice(0, digits).padEnd(digits, "0"));
  const minor = sign === "-" ? -whole : whole;
  if (minor > BigInt(Number.MAX_SAFE_INTEGER) || minor < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw moneyMessages.error("money.not-safe-integer", { value });
  }
  return Number(minor) || 0;
}

/** Minor units back to exact decimal text in major units: 123450 NOK → "1234.50". */
export function decimalFromMinor(minor: number, currency: BookiCurrencyCode): string {
  if (!Number.isSafeInteger(minor)) throw moneyMessages.error("money.not-safe-integer", { value: String(minor) });
  const digits = minorDigitsFor(currency);
  const abs = String(Math.abs(minor)).padStart(digits + 1, "0");
  const text = digits ? `${abs.slice(0, -digits)}.${abs.slice(-digits)}` : abs;
  return minor < 0 ? `-${text}` : text;
}

/**
 * Minor units as exact decimal text for Intl.NumberFormat, which formats a
 * numeric string without going through a float: 7100000000000007 øre stays
 * ",07", not ",06".
 */
function exact(minor: number, currency: BookiCurrencyCode): number {
  return decimalFromMinor(minor, currency) as unknown as number;
}

export function toMajor(value: Money): number {
  const digits = minorDigitsFor(value.currency);
  return value.minor / 10 ** digits;
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minor + b.minor, a.currency);
}

export function subMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minor - b.minor, a.currency);
}

export function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw moneyMessages.error("money.currency-mismatch", { a: String(a.currency), b: String(b.currency) });
  }
}

export type FormatMoneyOptions = {
  locale?: string;
  withCurrency?: boolean;
  /** Use accounting parentheses for negatives */
  accounting?: boolean;
  /** Show zero as this text instead, as many Nordic ledgers do: `zero: "–"`. */
  zero?: string;
  /** Leave out the fraction when it is zero: `12 500 kr`, but still `12 500,50 kr`. For figures, not ledgers. */
  trimZeroFraction?: boolean;
};

export function formatMoney(
  value: Money | number,
  options?: FormatMoneyOptions & { currency?: BookiCurrencyCode },
): string {
  const m = typeof value === "number" ? money(value, options?.currency ?? "NOK") : value;
  const locale = options?.locale ?? "en-US";
  const accounting = options?.accounting ?? false;
  const minorDigits = minorDigitsFor(m.currency);
  if (m.minor === 0 && options?.zero !== undefined) return options.zero;
  const digits = options?.trimZeroFraction && m.minor % 10 ** minorDigits === 0 ? 0 : minorDigits;

  if (options?.withCurrency === false) {
    const text = new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(exact(Math.abs(m.minor), m.currency));
    // Keep the sign: a minus, or the accounting parentheses.
    if (m.minor >= 0) return text;
    return accounting ? `(${text})` : `-${text}`;
  }

  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: m.currency,
    currencySign: accounting ? "accounting" : "standard",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(exact(m.minor, m.currency));

  return formatted;
}

/** Exact decimal reading of amount text: sign plus integer / fraction digits. */
export type ParsedAmount = {
  negative: boolean;
  /** Integer digits, no separators ("0" when the text starts with a separator). */
  int: string;
  /** Fraction digits as typed ("" when there are none). */
  frac: string;
};

function localeDecimalSeparator(locale: string): string {
  try {
    return new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? ".";
  } catch {
    return ".";
  }
}

function currencyMarks(locale: string, currency: string): string[] {
  const marks = new Set<string>([currency.toUpperCase()]);
  for (const currencyDisplay of ["symbol", "narrowSymbol"] as const) {
    for (const loc of [locale, "en-US"]) {
      try {
        const symbol = new Intl.NumberFormat(loc, {
          style: "currency",
          currency,
          currencyDisplay,
        })
          .formatToParts(1)
          .find((part) => part.type === "currency")?.value;
        if (symbol) marks.add(symbol.replace(/\s/g, "").toUpperCase());
      } catch {
        // Unknown currency code: the code itself is still stripped.
      }
    }
  }
  return [...marks].filter(Boolean).sort((a, b) => b.length - a.length);
}

function stripCurrencyEdges(text: string, marks: string[]): string {
  let out = text;
  let changed = true;
  while (changed) {
    changed = false;
    const upper = out.toUpperCase();
    for (const mark of marks) {
      if (upper.startsWith(mark)) {
        out = out.slice(mark.length);
        changed = true;
        break;
      }
      if (upper.endsWith(mark)) {
        out = out.slice(0, out.length - mark.length);
        changed = true;
        break;
      }
    }
  }
  return out;
}

function count(text: string, char: string): number {
  return text.split(char).length - 1;
}

function isGrouped(text: string, group: string): boolean {
  const escaped = group === "." ? "\\." : group;
  return new RegExp(`^\\d{1,3}(${escaped}\\d{3})+$`).test(text);
}

/**
 * Strict, exact parse of typed amount text. Returns null for anything that
 * isn't unambiguously a number:
 *
 * - Whitespace (incl. NBSP / narrow NBSP), the currency code and symbol are
 *   ignored; one leading minus (`-` or `−`) or wrapping parentheses mean negative.
 * - Any other character (letters, exponents, a second sign) → null.
 * - Both `.` and `,`: the last one is the decimal separator; the other must
 *   form well-formed 3-digit groups.
 * - One kind only: decimal when it's the locale's decimal separator and appears
 *   once; otherwise grouping when it forms 3-digit groups; otherwise decimal
 *   when it appears once; otherwise null.
 */
export function parseAmountText(
  input: string,
  options?: { locale?: string; currency?: BookiCurrencyCode },
): ParsedAmount | null {
  const locale = options?.locale ?? "en-US";
  const currency = options?.currency ?? "USD";
  const marks = currencyMarks(locale, currency);

  // Spaces only as thousands groups ("1 234 567"): "12 34" is a typo, not 1234.
  for (const match of String(input).matchAll(/\d[\s\u00a0\u202f]+(\d+)/g)) {
    if (match[1]!.length !== 3) return null;
  }
  let text = String(input).replace(/\s/g, "");
  text = stripCurrencyEdges(text, marks);
  let negative = false;
  if (text.startsWith("(") && text.endsWith(")")) {
    negative = true;
    text = stripCurrencyEdges(text.slice(1, -1), marks);
  }
  if (text.startsWith("-") || text.startsWith("−")) {
    if (negative) return null;
    negative = true;
    text = stripCurrencyEdges(text.slice(1), marks);
  }
  if (!/^[\d.,]+$/.test(text) || !/\d/.test(text)) return null;

  const dots = count(text, ".");
  const commas = count(text, ",");
  let decimal: string | null = null;
  let group: string | null = null;

  if (dots > 0 && commas > 0) {
    decimal = text.lastIndexOf(".") > text.lastIndexOf(",") ? "." : ",";
    group = decimal === "." ? "," : ".";
    if (count(text, decimal) !== 1) return null;
  } else if (dots > 0 || commas > 0) {
    const sep = dots > 0 ? "." : ",";
    const occurrences = dots + commas;
    if (sep === localeDecimalSeparator(locale) && occurrences === 1) {
      decimal = sep;
    } else if (isGrouped(text, sep)) {
      group = sep;
    } else if (occurrences === 1) {
      decimal = sep;
    } else {
      return null;
    }
  }

  let intText = text;
  let frac = "";
  if (decimal !== null) {
    const at = text.indexOf(decimal);
    intText = text.slice(0, at);
    frac = text.slice(at + 1);
    if (!/^\d*$/.test(frac)) return null;
    if (intText === "" && frac === "") return null;
  }
  if (group !== null && intText.includes(group)) {
    if (!isGrouped(intText, group)) return null;
    intText = intText.split(group).join("");
  }
  if (!/^\d*$/.test(intText)) return null;
  if (intText === "" && group !== null) return null;

  return {
    negative,
    int: intText.replace(/^0+(?=\d)/, "") || "0",
    frac,
  };
}

/**
 * Parse user-typed amount text into major units (a JS number).
 * Strict: see `parseAmountText`. Prefer `parseToMinor` for money.
 */
export function parseMajorInput(
  input: string,
  options?: { locale?: string; currency?: BookiCurrencyCode },
): number | null {
  const parsed = parseAmountText(input, options);
  if (!parsed) return null;
  const n = Number(`${parsed.int}${parsed.frac ? `.${parsed.frac}` : ""}`);
  if (!Number.isFinite(n)) return null;
  return parsed.negative && n !== 0 ? -n : n;
}

/**
 * Parse typed amount text straight to integer minor units, without float
 * multiplication. Returns null when the text isn't a number, has more
 * fraction digits than the currency (JPY 0, NOK 2, KWD 3), is outside the
 * safe integer range, or the currency has no defined ISO 4217 minor unit.
 */
export function parseToMinor(input: string, currency: BookiCurrencyCode, options?: { locale?: string }): number | null {
  const parsed = parseAmountText(input, { locale: options?.locale, currency });
  if (!parsed) return null;
  const digits = isoMinorUnits(currency);
  if (digits === undefined || parsed.frac.length > digits) return null;
  const minor = digitsToMinor(parsed.negative, parsed.int, parsed.frac, digits);
  return Number.isSafeInteger(minor) ? minor : null;
}

export function parseToMoney(input: string, currency: BookiCurrencyCode, options?: { locale?: string }): Money | null {
  const minor = parseToMinor(input, currency, options);
  if (minor === null) return null;
  return money(minor, currency);
}
