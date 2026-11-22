import { digitsOnly } from "./digits.js";

export function formatIban(value: string): string {
  const cleaned = value.replace(/\s/g, "").toUpperCase().slice(0, 34);
  return cleaned.replace(/(.{4})/g, "$1 ").trim();
}

export function normalizeIban(value: string): string {
  return value.replace(/\s/g, "").toUpperCase();
}

/** IBAN length per country, for the countries Booki ships profiles for and their neighbours. */
const IBAN_LENGTH: Record<string, number> = {
  NO: 15,
  SE: 24,
  DK: 18,
  FI: 18,
  IS: 26,
  GB: 22,
  IE: 22,
  DE: 22,
  NL: 18,
  BE: 16,
  FR: 27,
  ES: 24,
  IT: 27,
  PL: 28,
  CH: 21,
  AT: 20,
};

export function isValidIban(value: string): boolean {
  const iban = normalizeIban(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false;
  if (iban.length < 15 || iban.length > 34) return false;
  const expected = IBAN_LENGTH[iban.slice(0, 2)];
  if (expected !== undefined && iban.length !== expected) return false;
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
