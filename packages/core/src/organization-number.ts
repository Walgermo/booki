import { digitsOnly } from "./digits.js";

/**
 * - `orgnr`: Norway, 9 digits, mod 11.
 * - `ein`: United States, 9 digits, no checksum.
 * - `se-orgnr`: Sweden, 10 digits, Luhn.
 * - `dk-cvr`: Denmark, 8 digits, mod 11.
 * - `generic`: letters and digits with no checksum (for example a UK company number).
 */
export type OrganizationNumberKind = "orgnr" | "ein" | "se-orgnr" | "dk-cvr" | "generic";

/** Strip non-digits; for orgnr-like MVA tails keep the first 9 digits. */
export function normalizeOrganizationNumber(value: string, kind: OrganizationNumberKind = "orgnr"): string {
  if (kind === "generic") {
    return String(value ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 20);
  }
  const digits = digitsOnly(value);
  if (kind === "ein") return digits.slice(0, 9);
  if (kind === "se-orgnr") return digits.slice(0, 10);
  if (kind === "dk-cvr") return digits.slice(0, 8);
  if (digits.length >= 9) return digits.slice(0, 9);
  return digits;
}

export function formatOrgnr(value: string): string {
  const d = normalizeOrganizationNumber(value, "orgnr");
  const parts = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter(Boolean);
  return parts.join(" ");
}

/** US EIN display form XX-XXXXXXX. */
export function formatEin(value: string): string {
  const d = normalizeOrganizationNumber(value, "ein");
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}-${d.slice(2)}`;
}

export function formatOrganizationNumber(value: string, kind: OrganizationNumberKind): string {
  if (kind === "ein") return formatEin(value);
  if (kind === "generic") return normalizeOrganizationNumber(value, "generic");
  if (kind === "se-orgnr") {
    const d = normalizeOrganizationNumber(value, kind);
    return d.length > 6 ? `${d.slice(0, 6)}-${d.slice(6)}` : d;
  }
  if (kind === "dk-cvr") {
    const d = normalizeOrganizationNumber(value, kind);
    return d.match(/.{1,2}/g)?.join(" ") ?? d;
  }
  return formatOrgnr(value);
}

/** Swedish organisationsnummer: 10 digits, Luhn check digit. */
export function isValidSeOrgnr(value: string): boolean {
  // Every digit counts: an eleventh digit is a typo, not something to cut off.
  if (digitsOnly(value).length !== 10) return false;
  const d = normalizeOrganizationNumber(value, "se-orgnr");
  if (d.length !== 10 || /^0+$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let n = Number(d[i]) * (i % 2 === 0 ? 2 : 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0;
}

/** Danish CVR number: 8 digits, mod 11 with weights 2,7,6,5,4,3,2,1. */
export function isValidDkCvr(value: string): boolean {
  if (digitsOnly(value).length !== 8) return false;
  const d = normalizeOrganizationNumber(value, "dk-cvr");
  if (d.length !== 8 || /^0+$/.test(d)) return false;
  const weights = [2, 7, 6, 5, 4, 3, 2, 1] as const;
  const sum = weights.reduce((total, weight, i) => total + Number(d[i]) * weight, 0);
  return sum % 11 === 0;
}

/**
 * Norwegian organisasjonsnummer: 9 digits, mod11 check digit.
 * Weights [3,2,7,6,5,4,3,2] over the first 8 digits.
 */
export function isValidOrgnr(value: string): boolean {
  // "NO 974 760 673 MVA" has nine digits; "9747606731" has ten and is not valid.
  if (digitsOnly(value).length !== 9) return false;
  const d = normalizeOrganizationNumber(value, "orgnr");
  if (d.length !== 9 || /^0+$/.test(d)) return false;
  const weights = [3, 2, 7, 6, 5, 4, 3, 2] as const;
  let sum = 0;
  for (let i = 0; i < weights.length; i++) {
    sum += Number(d[i]) * weights[i]!;
  }
  const remainder = sum % 11;
  const check = remainder === 0 ? 0 : 11 - remainder;
  if (check === 10) return false;
  return check === Number(d[8]);
}

/** US EIN: 9 digits, not all zeros (no public checksum). */
export function isValidEin(value: string): boolean {
  if (digitsOnly(value).length !== 9) return false;
  const d = normalizeOrganizationNumber(value, "ein");
  return d.length === 9 && !/^0+$/.test(d);
}

export function isValidOrganizationNumber(value: string, kind: OrganizationNumberKind): boolean {
  if (kind === "ein") return isValidEin(value);
  if (kind === "se-orgnr") return isValidSeOrgnr(value);
  if (kind === "dk-cvr") return isValidDkCvr(value);
  if (kind === "generic") return normalizeOrganizationNumber(value, "generic").length >= 4;
  return isValidOrgnr(value);
}
