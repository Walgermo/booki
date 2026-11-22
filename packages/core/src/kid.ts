import { digitsOnly } from "./digits.js";

export type KidModulus = 10 | 11;

export function formatKid(value: string): string {
  return digitsOnly(value).slice(0, 25);
}

export function isValidKidLength(value: string): boolean {
  const d = digitsOnly(value);
  return d.length >= 4 && d.length <= 25;
}

export function kidCheckDigitMod10(body: string): number {
  const digits = digitsOnly(body);
  let sum = 0;
  let weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    const product = Number(digits[i]) * weight;
    sum += product > 9 ? Math.floor(product / 10) + (product % 10) : product;
    weight = weight === 2 ? 1 : 2;
  }
  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

export function kidCheckDigitMod11(body: string): number | null {
  const digits = digitsOnly(body);
  const weights = [2, 3, 4, 5, 6, 7];
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    sum += Number(digits[digits.length - 1 - i]) * weights[i % weights.length]!;
  }
  const remainder = sum % 11;
  if (remainder === 1) return null;
  if (remainder === 0) return 0;
  return 11 - remainder;
}

export function isValidKid(value: string, modulus: KidModulus = 10): boolean {
  // A mod-11 KID whose remainder is 10 ends in "-", not a digit.
  const raw = String(value).replace(/\s/g, "");
  if (modulus === 11 && raw.endsWith("-")) {
    const body = digitsOnly(raw.slice(0, -1));
    return body.length === raw.length - 1 && isValidKidLength(`${body}0`) && kidCheckDigitMod11(body) === null;
  }
  const d = digitsOnly(value);
  if (!isValidKidLength(d)) return false;
  const body = d.slice(0, -1);
  const check = Number(d[d.length - 1]);
  if (modulus === 10) return kidCheckDigitMod10(body) === check;
  const expected = kidCheckDigitMod11(body);
  return expected !== null && expected === check;
}

export function generateKid(body: string, modulus: KidModulus = 10): string | null {
  const d = digitsOnly(body);
  if (d.length < 3 || d.length > 24) return null;
  if (modulus === 10) return `${d}${kidCheckDigitMod10(d)}`;
  const check = kidCheckDigitMod11(d);
  if (check === null) return null;
  return `${d}${check}`;
}
