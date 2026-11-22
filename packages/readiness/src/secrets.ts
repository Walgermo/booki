/**
 * Finding secrets in the text an agent reads: bank account numbers (Norwegian
 * kontonummer, mod 11), IBANs (mod 97), payment references (KID, mod 10 or
 * 11, next to the word KID), US routing numbers (ABA checksum, next to the
 * word routing) and card numbers (Luhn, next to the word card or kort).
 * A number counts only when its check digits are valid, so amounts, dates and
 * invoice numbers are not reported.
 */

export type SecretKind = "bank-account" | "iban" | "kid" | "routing-number" | "card";

export type SecretHit = { kind: SecretKind; value: string; masked: string; index: number };

const digits = (value: string) => value.replace(/\D/g, "");

export function isKontonummer(value: string): boolean {
  const d = digits(value);
  if (d.length !== 11) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, i) => total + weight * Number(d[i]), 0);
  const rest = sum % 11;
  const check = rest === 0 ? 0 : 11 - rest;
  return check !== 10 && check === Number(d[10]);
}

export function isIban(value: string): boolean {
  const v = value.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(v)) return false;
  const moved = v.slice(4) + v.slice(0, 4);
  let rest = 0;
  for (const ch of moved) {
    const n = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const digit of n) rest = (rest * 10 + Number(digit)) % 97;
  }
  return rest === 1;
}

function mod10(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    let n = Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 2 : 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return (10 - (sum % 10)) % 10;
}

export function isLuhn(value: string): boolean {
  const d = digits(value);
  return d.length >= 2 && mod10(d.slice(0, -1)) === Number(d.at(-1));
}

export function isKid(value: string): boolean {
  const d = digits(value);
  if (d.length < 2 || d.length > 25) return false;
  if (isLuhn(d)) return true;
  const body = d.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * ((i % 6) + 2);
  const rest = sum % 11;
  const check = rest === 0 ? "0" : rest === 1 ? "-" : String(11 - rest);
  return check === d.at(-1);
}

export function isRoutingNumber(value: string): boolean {
  const d = digits(value);
  if (d.length !== 9) return false;
  const w = [3, 7, 1, 3, 7, 1, 3, 7, 1];
  return w.reduce((sum, weight, i) => sum + weight * Number(d[i]), 0) % 10 === 0;
}

export function mask(value: string): string {
  const v = value.replace(/[^0-9A-Za-z]/g, "");
  if (v.length <= 4) return "•".repeat(v.length);
  return `${v.slice(0, 2)}${"•".repeat(v.length - 4)}${v.slice(-2)}`;
}

export function findSecrets(text: string): SecretHit[] {
  const hits: SecretHit[] = [];
  const seen = new Set<string>();
  const add = (kind: SecretKind, value: string, index: number) => {
    const key = `${kind}:${value.replace(/\s/g, "")}:${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ kind, value: value.trim(), masked: mask(value), index });
  };

  for (const m of text.matchAll(/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g)) {
    if (isIban(m[0])) add("iban", m[0], m.index);
  }
  for (const m of text.matchAll(/(?<!\d|\d[.,])\d{4}[ .]?\d{2}[ .]?\d{5}(?!\d|[.,]\d)/g)) {
    // Inside an IBAN already reported.
    if (hits.some((hit) => hit.kind === "iban" && m.index >= hit.index && m.index < hit.index + hit.value.length))
      continue;
    if (isKontonummer(m[0])) add("bank-account", m[0], m.index);
  }
  // A KID next to the word KID; "maks 35 tegn" and "4–25 siffer" are limits, not values.
  for (const m of text.matchAll(
    /\bKID\b[^\n\d]{0,40}?(\d[\d ]{2,30}\d)(?![\d–-])(?!\s*(?:tegn|siffer|chars?|characters|digits)\b)/gi,
  )) {
    if (isKid(m[1]!)) add("kid", m[1]!, m.index + m[0].length - m[1]!.length);
  }
  for (const m of text.matchAll(/\brouting\b[^\n\d]{0,40}?(\d{9})(?!\d)/gi)) {
    if (isRoutingNumber(m[1]!)) add("routing-number", m[1]!, m.index + m[0].length - m[1]!.length);
  }
  for (const m of text.matchAll(/\b(?:card|kort)[^\n\d]{0,40}?((?:\d[ -]?){12,18}\d)(?!\d)/gi)) {
    if (isLuhn(m[1]!)) add("card", m[1]!, m.index + m[0].length - m[1]!.length);
  }
  return hits.sort((a, b) => a.index - b.index);
}

export const SECRET_LABEL: Record<SecretKind, string> = {
  "bank-account": "Bank account number",
  iban: "IBAN",
  kid: "Payment reference (KID)",
  "routing-number": "Routing number",
  card: "Card number",
};
