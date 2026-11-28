import { digitsOnly } from "./digits.js";

export function formatIban(value: string): string {
  const cleaned = value.replace(/\s/g, "").toUpperCase().slice(0, 34);
  return cleaned.replace(/(.{4})/g, "$1 ").trim();
}

export function normalizeIban(value: string): string {
  return value.replace(/\s/g, "").toUpperCase();
}

/**
 * The BBAN's shape per country (ISO 13616 registry), for the countries Booki
 * ships profiles for and their neighbours. The check digits catch one wrong
 * character only within its kind: a letter where a digit belongs turns into two
 * digits and can pass mod 97 ("NO6009357U57927" did), so the shape is checked too.
 */
const BBAN: Record<string, RegExp> = {
  NO: /^\d{11}$/,
  SE: /^\d{20}$/,
  DK: /^\d{14}$/,
  FI: /^\d{14}$/,
  IS: /^\d{22}$/,
  GB: /^[A-Z]{4}\d{14}$/,
  IE: /^[A-Z]{4}\d{14}$/,
  DE: /^\d{18}$/,
  NL: /^[A-Z]{4}\d{10}$/,
  BE: /^\d{12}$/,
  FR: /^\d{10}[A-Z0-9]{11}\d{2}$/,
  ES: /^\d{20}$/,
  IT: /^[A-Z]\d{10}[A-Z0-9]{12}$/,
  PL: /^\d{24}$/,
  CH: /^\d{5}[A-Z0-9]{12}$/,
  AT: /^\d{16}$/,
};

export function isValidIban(value: string): boolean {
  const iban = normalizeIban(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false;
  if (iban.length < 15 || iban.length > 34) return false;
  const shape = BBAN[iban.slice(0, 2)];
  if (shape && !shape.test(iban.slice(4))) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged
    .split("")
    .map((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 65 && code <= 90 ? String(code - 55) : ch;
    })
    .join("");
  let remainder = 0;
  for (const ch of numeric) {
    remainder = (remainder * 10 + Number(ch)) % 97;
  }
  return remainder === 1;
}

export function extractNorwegianKontonummer(iban: string): string | null {
  const normalized = normalizeIban(iban);
  if (!normalized.startsWith("NO") || normalized.length !== 15) return null;
  // NO + 2 check digits + the 11-digit kontonummer.
  const account = digitsOnly(normalized.slice(4));
  if (account.length !== 11 || !isValidIban(normalized)) return null;
  return account;
}
