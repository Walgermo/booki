import { createMessages, render, type MessageLanguage, type MessageParams } from "./message-render.js";

export const AMOUNT_EN = {
  "amount.invalid-draft": "Enter a valid amount such as {example}.",
  "amount.draft-below-min": "Enter an amount of at least {limit}.",
  "amount.draft-above-max": "Enter an amount of at most {limit}.",
  "amount.not-minor": "Amount must be a safe integer in minor units (e.g. 12500 = 125.00 {currency}), got {value}.",
  "amount.below-min": "Amount {minor} (minor units) is below minMinor {min}.",
  "amount.above-max": "Amount {minor} (minor units) exceeds maxMinor {max}.",
} as const;

export const amountMessages = /* @__PURE__ */ createMessages(AMOUNT_EN);

export const AMOUNT_DRAFT_NB = {
  "amount.invalid-draft": "Skriv inn et gyldig beløp, for eksempel {example}.",
  "amount.draft-below-min": "Skriv inn et beløp på minst {limit}.",
  "amount.draft-above-max": "Skriv inn et beløp på høyst {limit}.",
} as const satisfies Partial<Record<keyof typeof AMOUNT_EN, string>>;

export function amountDraftMessage(
  language: MessageLanguage,
  code: keyof typeof AMOUNT_DRAFT_NB,
  params: MessageParams,
): string {
  return render(language === "nb" ? AMOUNT_DRAFT_NB[code] : AMOUNT_EN[code], params, language);
}
