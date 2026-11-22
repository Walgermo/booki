import { digitsOnly } from "./digits.js";

export { digitsOnly };

export function formatKontonummer(value: string): string {
  const d = digitsOnly(value).slice(0, 11);
  const parts = [d.slice(0, 4), d.slice(4, 6), d.slice(6, 11)].filter(Boolean);
  return parts.join(" ");
}

export function isValidKontonummer(value: string): boolean {
  const d = digitsOnly(value);
  if (d.length !== 11 || /^0+$/.test(d)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(d[i]) * weights[i]!;
  }
  const remainder = sum % 11;
  const check = remainder === 0 ? 0 : 11 - remainder;
  if (check === 10) return false;
  return check === Number(d[10]);
}

export function kontonummerToIban(kontonummer: string): string | null {
  const d = digitsOnly(kontonummer);
  if (!isValidKontonummer(d)) return null;
  // A Norwegian IBAN's BBAN is the 11-digit kontonummer itself: NO + 2 check digits + 11 = 15 characters.
  const bban = d;
  const rearranged = `${bban}NO00`;
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
  const check = String(98 - remainder).padStart(2, "0");
  return `NO${check}${bban}`;
}
