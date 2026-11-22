/** Built-in countries, or any code you pass a profile for. */
export type CountryCode = "NO" | "US" | "SE" | "DK" | "GB" | "DE" | (string & {});

/** ISO 4217 code. */
export type BookiCurrency = string;

export type TaxCode = {
  code: string;
  label: string;
  percent: number;
};

export type BookiLocaleCopy = {
  amount: string;
  amountExTax: string;
  withTax: string;
  payee: string;
  bankAccount: string;
  paymentReference: string;
  memo: string;
  fee: string;
  confirmPayment: string;
  cancel: string;
  close: string;
  postVoucher: string;
  balanced: string;
  unbalanced: string;
  debit: string;
  credit: string;
  account: string;
  accountName: string;
  dimensions: string;
  /** Editable voucher lines. */
  department: string;
  project: string;
  line: string;
  addLine: string;
  removeLine: string;
  none: string;
  invalidAmount: string;
  reconciliation: string;
  bankStatement: string;
  ledger: string;
  date: string;
  text: string;
  select: string;
  matchSelected: string;
  selectToMatch: string;
  difference: string;
  suggestions: string;
  noSuggestions: string;
  nothingUnmatched: string;
  reconciled: string;
  notReconciled: string;
  outstanding: string;
  emptyAudit: string;
  customer: string;
  paymentSent: string;
  scaVerified: string;
  selectAccount: string;
  approve: string;
  reject: string;
  escalate: string;
  typeToConfirm: string;
  exceptionTitle: string;
  proposedByAgent: string;
  organizationNumber: string;
  invoiceNumber: string;
  /** The help line under an invoice number field. */
  invoiceNumberHint: string;
  invoiceDate: string;
  dueDate: string;
  postingDate: string;
  period: string;
  attestation: string;
  attestationPending: string;
  attestationApproved: string;
  attestationRejected: string;
  attestationEscalated: string;
};

export type BookiLocaleProfile = {
  country: CountryCode;
  locale: string;
  currency: BookiCurrency;
  minorDigits: number;
  tax: {
    label: string;
    defaultPercent: number;
    codes: TaxCode[];
  };
  bankAccount: {
    kind: "kontonummer" | "routing-account" | "iban";
    label: string;
    description: string;
  };
  paymentReference: {
    kind: "kid" | "memo";
    label: string;
    description: string;
  };
  organizationNumber: {
    kind: "orgnr" | "ein" | "se-orgnr" | "dk-cvr" | "generic";
    label: string;
    description: string;
    placeholder?: string;
    /** Shown when the number fails its check. */
    invalid?: string;
  };
  period: {
    defaultGranularity: "year" | "month" | "vat-term";
    label: string;
  };
  sca: {
    kind: "bankid" | "passkey";
    brand: string;
    title: string;
    description: string;
    openLabel: string;
    pendingLabel: string;
    doneLabel: string;
  };
  accounts: {
    bank: { number: string; name: string };
    receivable: { number: string; name: string };
    revenue: { number: string; name: string };
    taxPayable: { number: string; name: string };
    expense: { number: string; name: string };
  };
  copy: BookiLocaleCopy;
  demo: {
    companyName: string;
    lineDescription: string;
  };
};
