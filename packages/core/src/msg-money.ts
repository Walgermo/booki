import { createMessages } from "./message-render.js";

export const MONEY_EN = {
  "money.no-minor-unit": "Currency {currency} has no defined minor unit in the current ISO 4217 list.",
  "money.not-decimal": '"{value}" is not decimal text in major units, like "1234.50".',
  "money.too-precise":
    '"{value}" has more than {digits} decimals, which {currency} does not have. Round it first, on purpose.',
  "money.not-safe-integer": "Money.minor must be a safe integer, got {value}",
  "money.not-finite": "fromMajor expects a finite number, got {value}",
  "money.currency-mismatch": "Currency mismatch: {a} vs {b}",
  "money.not-scale": "A scale is the number of decimals the integer counts, a whole number from 0 to 18, not {value}.",
  "money.rescale-lossy":
    "{amount} at {from} decimals is not a whole number of {currency} minor units ({to} decimals). Round it first, on purpose.",
  "money.scaled-format":
    'A scaled amount is { amount, currency, scale }, such as { amount: 1500000, currency: "CLP", scale: 2 }.',
} as const;

export const moneyMessages = /* @__PURE__ */ createMessages(MONEY_EN);
