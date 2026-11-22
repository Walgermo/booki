import { digitsOnly } from "./digits.js";

export function formatRoutingNumber(value: string): string {
  return digitsOnly(value).slice(0, 9);
}

export function isValidRoutingNumber(value: string): boolean {
  const d = digitsOnly(value);
  if (d.length !== 9 || /^0+$/.test(d)) return false;
  const n = d.split("").map(Number);
  const checksum = 3 * (n[0]! + n[3]! + n[6]!) + 7 * (n[1]! + n[4]! + n[7]!) + (n[2]! + n[5]! + n[8]!);
  return checksum % 10 === 0;
}

export function isValidUsAccountNumber(value: string): boolean {
  const d = digitsOnly(value);
  return d.length >= 4 && d.length <= 17;
}

export function formatUsAccountNumber(value: string): string {
  return digitsOnly(value).slice(0, 17);
}
