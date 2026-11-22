import { BookiError } from "../msg.js";
import type { BookiLocaleProfile } from "./types.js";

export const NO_PROFILE: BookiLocaleProfile = {
  country: "NO",
  locale: "nb-NO",
  currency: "NOK",
  minorDigits: 2,
  tax: {
    label: "MVA",
    defaultPercent: 25,
    codes: [
      { code: "MVA0", label: "0% MVA", percent: 0 },
      { code: "MVA15", label: "15% MVA", percent: 15 },
      { code: "MVA25", label: "25% MVA", percent: 25 },
    ],
  },
  bankAccount: {
    kind: "kontonummer",
    label: "Kontonummer",
    description: "11 siffer, formatert som XXXX XX XXXXX",
  },
  paymentReference: {
    kind: "kid",
    label: "KID",
    description: "Kundeidentifikasjon, 4–25 siffer",
  },
  organizationNumber: {
    kind: "orgnr",
    label: "Organisasjonsnummer",
    description: "9 siffer, mod11",
  },
  period: {
    defaultGranularity: "vat-term",
    label: "Periode",
  },
  sca: {
    kind: "bankid",
    brand: "BankID",
    title: "Bekreft med BankID",
    description: "Mock SCA-flyt. Ingen ekte BankID-kall i MVP.",
    openLabel: "Åpne BankID",
    pendingLabel: "Åpner BankID…",
    doneLabel: "Identitet bekreftet",
  },
  accounts: {
    bank: { number: "1920", name: "Bankinnskudd" },
    receivable: { number: "1500", name: "Kundefordringer" },
    revenue: { number: "3000", name: "Salgsinntekt" },
    taxPayable: { number: "2701", name: "Utgående mva" },
    expense: { number: "4000", name: "Varekostnad" },
  },
  copy: {
    amount: "Beløp",
    amountExTax: "Beløp eks. mva",
    withTax: "Med {percent}% mva",
    payee: "Mottaker",
    bankAccount: "Kontonummer",
    paymentReference: "KID",
    memo: "Melding",
    fee: "Gebyr",
    confirmPayment: "Bekreft betaling",
    cancel: "Avbryt",
    close: "Lukk",
    postVoucher: "Bokfør bilag",
    balanced: "I balanse",
    unbalanced: "Ikke i balanse",
    debit: "Debet",
    credit: "Kredit",
    account: "Konto",
    accountName: "Navn",
    dimensions: "Dimensjoner",
    department: "Avdeling",
    project: "Prosjekt",
    line: "Linje",
    addLine: "Legg til linje",
    removeLine: "Fjern linje",
    none: "Ingen",
    invalidAmount: "Ugyldig beløp",
    reconciliation: "Bankavstemming",
    bankStatement: "Kontoutskrift",
    ledger: "Åpne poster",
    date: "Dato",
    text: "Tekst",
    select: "Velg",
    matchSelected: "Avstem valgte",
    selectToMatch: "Velg linjer på begge sider",
    difference: "Differanse",
    suggestions: "Forslag",
    noSuggestions: "Ingen forslag venter",
    nothingUnmatched: "Alt er avstemt",
    reconciled: "Avstemt",
    notReconciled: "Ikke avstemt",
    outstanding: "Gjenstår",
    emptyAudit: "Ingen revisjonshendelser",
    customer: "Kunde",
    paymentSent: "Betaling sendt (mock)",
    scaVerified: "SCA fullført",
    selectAccount: "Velg konto…",
    approve: "Attester",
    reject: "Avvis",
    escalate: "Eskaler",
    typeToConfirm: "Skriv APPROVE for å bekrefte",
    exceptionTitle: "Krever gjennomgang",
    proposedByAgent: "Foreslått av agent",
    organizationNumber: "Organisasjonsnummer",
    invoiceNumber: "Fakturanr",
    invoiceNumberHint: "Nummeret som står på fakturaen",
    invoiceDate: "Fakturadato",
    dueDate: "Forfall",
    postingDate: "Bokføringsdato",
    period: "Periode",
    attestation: "Attestering",
    attestationPending: "Venter",
    attestationApproved: "Godkjent",
    attestationRejected: "Avvist",
    attestationEscalated: "Eskalert",
  },
  demo: {
    companyName: "Nordlys AS",
    lineDescription: "Konsulentbistand",
  },
};

export const US_PROFILE: BookiLocaleProfile = {
  country: "US",
  locale: "en-US",
  currency: "USD",
  minorDigits: 2,
  tax: {
    label: "Sales tax",
    defaultPercent: 8.875,
    codes: [
      { code: "TAX0", label: "0% tax", percent: 0 },
      { code: "TAX8875", label: "8.875% tax", percent: 8.875 },
    ],
  },
  bankAccount: {
    kind: "routing-account",
    label: "Bank account",
    description: "ABA routing (9 digits) + account number",
  },
  paymentReference: {
    kind: "memo",
    label: "Payment memo",
    description: "Invoice or remittance reference",
  },
  organizationNumber: {
    kind: "ein",
    label: "EIN",
    description: "Employer Identification Number",
  },
  period: {
    defaultGranularity: "month",
    label: "Period",
  },
  sca: {
    kind: "passkey",
    brand: "Passkey",
    title: "Confirm with passkey",
    description: "Mock SCA step. No live WebAuthn in MVP.",
    openLabel: "Use passkey",
    pendingLabel: "Waiting…",
    doneLabel: "Identity verified",
  },
  accounts: {
    bank: { number: "1010", name: "Operating cash" },
    receivable: { number: "1200", name: "Accounts receivable" },
    revenue: { number: "4000", name: "Sales revenue" },
    taxPayable: { number: "2150", name: "Sales tax payable" },
    expense: { number: "5000", name: "Cost of goods sold" },
  },
  copy: {
    amount: "Amount",
    amountExTax: "Amount excl. tax",
    withTax: "With {percent}% tax",
    payee: "Payee",
    bankAccount: "Account",
    paymentReference: "Reference",
    memo: "Memo",
    fee: "Fee",
    confirmPayment: "Confirm payment",
    cancel: "Cancel",
    close: "Close",
    postVoucher: "Post voucher",
    balanced: "In balance",
    unbalanced: "Out of balance",
    debit: "Debit",
    credit: "Credit",
    account: "Account",
    accountName: "Name",
    dimensions: "Dimensions",
    department: "Department",
    project: "Project",
    line: "Line",
    addLine: "Add line",
    removeLine: "Remove line",
    none: "None",
    invalidAmount: "Invalid amount",
    reconciliation: "Bank reconciliation",
    bankStatement: "Bank statement",
    ledger: "Open posts",
    date: "Date",
    text: "Text",
    select: "Select",
    matchSelected: "Match selected",
    selectToMatch: "Select lines on both sides",
    difference: "Difference",
    suggestions: "Suggestions",
    noSuggestions: "No suggestions waiting",
    nothingUnmatched: "Nothing left to match",
    reconciled: "Reconciled",
    notReconciled: "Not reconciled",
    outstanding: "Outstanding",
    emptyAudit: "No audit events yet",
    customer: "Customer",
    paymentSent: "Payment sent (mock)",
    scaVerified: "SCA completed",
    selectAccount: "Select account…",
    approve: "Approve",
    reject: "Reject",
    escalate: "Escalate",
    typeToConfirm: "Type APPROVE to confirm",
    exceptionTitle: "Needs review",
    proposedByAgent: "Proposed by agent",
    organizationNumber: "EIN",
    invoiceNumber: "Invoice #",
    invoiceNumberHint: "The number printed on the invoice",
    invoiceDate: "Invoice date",
    dueDate: "Due date",
    postingDate: "Posting date",
    period: "Period",
    attestation: "Attestation",
    attestationPending: "Pending",
    attestationApproved: "Approved",
    attestationRejected: "Rejected",
    attestationEscalated: "Escalated",
  },
  demo: {
    companyName: "Northwind LLC",
    lineDescription: "Consulting services",
  },
};

type ProfilePatch = {
  [K in keyof BookiLocaleProfile]?: BookiLocaleProfile[K] extends object
    ? BookiLocaleProfile[K] extends unknown[]
      ? BookiLocaleProfile[K]
      : Partial<BookiLocaleProfile[K]>
    : BookiLocaleProfile[K];
};

/**
 * A profile for a country Booki does not ship: start from one that does and
 * override what differs. Sections are merged one level deep; lists (such as
 * `tax.codes`) are replaced whole.
 *
 * ```ts
 * const FI = defineProfile(SE_PROFILE, { country: "FI", locale: "fi-FI", currency: "EUR" });
 * <BookiLocaleProvider profiles={{ FI }} defaultCountry="FI">
 * ```
 */
export function defineProfile(base: BookiLocaleProfile, patch: ProfilePatch): BookiLocaleProfile {
  const out = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key];
    out[key] =
      value && typeof value === "object" && !Array.isArray(value) && current && typeof current === "object"
        ? { ...(current as object), ...(value as object) }
        : value;
  }
  return out as BookiLocaleProfile;
}

const euCommon = {
  bankAccount: { kind: "iban" as const, label: "IBAN", description: "International bank account number" },
  paymentReference: {
    kind: "memo" as const,
    label: "Payment reference",
    description: "Invoice or remittance reference",
  },
  period: { defaultGranularity: "month" as const, label: "Period" },
};

/**
 * Starter profiles for Sweden, Denmark, the United Kingdom and Germany:
 * currency, number format, standard VAT rates, IBAN and the company-number
 * check. The labels are English. Treat the VAT codes and account numbers as
 * a starting point and replace them with your own.
 */
export const SE_PROFILE = defineProfile(US_PROFILE, {
  ...euCommon,
  country: "SE",
  locale: "sv-SE",
  currency: "SEK",
  tax: {
    label: "VAT (moms)",
    defaultPercent: 25,
    codes: [
      { code: "SE0", label: "0% VAT", percent: 0 },
      { code: "SE6", label: "6% VAT", percent: 6 },
      { code: "SE12", label: "12% VAT", percent: 12 },
      { code: "SE25", label: "25% VAT", percent: 25 },
    ],
  },
  organizationNumber: {
    kind: "se-orgnr",
    label: "Organisationsnummer",
    description: "10 digits, Luhn check",
    placeholder: "556036-0793",
    invalid: "Invalid organisationsnummer",
  },
  copy: { organizationNumber: "Organisationsnummer" },
  demo: { companyName: "Norrsken AB" },
});

export const DK_PROFILE = defineProfile(US_PROFILE, {
  ...euCommon,
  country: "DK",
  locale: "da-DK",
  currency: "DKK",
  tax: {
    label: "VAT (moms)",
    defaultPercent: 25,
    codes: [
      { code: "DK0", label: "0% VAT", percent: 0 },
      { code: "DK25", label: "25% VAT", percent: 25 },
    ],
  },
  organizationNumber: {
    kind: "dk-cvr",
    label: "CVR number",
    description: "8 digits, mod 11",
    placeholder: "10 15 08 17",
    invalid: "Invalid CVR number",
  },
  copy: { organizationNumber: "CVR number" },
  demo: { companyName: "Nordlys ApS" },
});

export const GB_PROFILE = defineProfile(US_PROFILE, {
  ...euCommon,
  country: "GB",
  locale: "en-GB",
  currency: "GBP",
  tax: {
    label: "VAT",
    defaultPercent: 20,
    codes: [
      { code: "GB0", label: "0% VAT", percent: 0 },
      { code: "GB5", label: "5% VAT", percent: 5 },
      { code: "GB20", label: "20% VAT", percent: 20 },
    ],
  },
  organizationNumber: {
    kind: "generic",
    label: "Company number",
    description: "Companies House number, 8 characters",
    placeholder: "01234567",
    invalid: "Enter the company number",
  },
  copy: { organizationNumber: "Company number" },
  demo: { companyName: "Northlight Ltd" },
});

export const DE_PROFILE = defineProfile(US_PROFILE, {
  ...euCommon,
  country: "DE",
  locale: "de-DE",
  currency: "EUR",
  tax: {
    label: "VAT (USt)",
    defaultPercent: 19,
    codes: [
      { code: "DE0", label: "0% VAT", percent: 0 },
      { code: "DE7", label: "7% VAT", percent: 7 },
      { code: "DE19", label: "19% VAT", percent: 19 },
    ],
  },
  organizationNumber: {
    kind: "generic",
    label: "Company register number",
    description: "Handelsregister number",
    placeholder: "HRB 12345",
    invalid: "Enter the register number",
  },
  copy: { organizationNumber: "Company register number" },
  demo: { companyName: "Nordlicht GmbH" },
});

export const BOOKI_PROFILES: Record<string, BookiLocaleProfile> = {
  NO: NO_PROFILE,
  US: US_PROFILE,
  SE: SE_PROFILE,
  DK: DK_PROFILE,
  GB: GB_PROFILE,
  DE: DE_PROFILE,
};

/** The profile for a country. Throws for a code with no profile, naming the ones that exist. */
export function getBookiProfile(country: string, extra: Record<string, BookiLocaleProfile> = {}): BookiLocaleProfile {
  const profile = extra[country] ?? BOOKI_PROFILES[country];
  if (!profile) {
    throw new BookiError("locale.no-profile", {
      country: String(country),
      countries: Object.keys(BOOKI_PROFILES).join(", "),
    });
  }
  return profile;
}
