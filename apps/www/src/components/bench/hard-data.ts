/**
 * Invented data for the five hard tasks (document error, closed period,
 * duplicate invoice, foreign-currency invoice, partial VAT deduction). Both
 * pages of a task read the same records from here, so the replica and Booki
 * start from the same facts. The benchmark's verifiers keep their own copy of
 * what the end state must be (benchmarks/agent/src/verify-hard.ts).
 *
 * Amounts are minor units (øre for NOK, cent for EUR) unless a field says text.
 */

/** The accounts the hard tasks post to. */
export const HARD_ACCOUNTS: { number: string; name: string }[] = [
  { number: "2400", name: "Leverandørgjeld" },
  { number: "2710", name: "Inngående merverdiavgift, høy sats" },
  { number: "6800", name: "Kontorrekvisita" },
  { number: "6900", name: "Telefon" },
];

// ---------------------------------------------------------------------------
// Document error: a supplier invoice whose printed total is wrong.
// ---------------------------------------------------------------------------

export const DOC_ERROR_INVOICE = {
  supplier: "Verktøy Øst AS",
  orgNumber: "944556677",
  invoiceNumber: "2207",
  invoiceDate: "2026-10-08",
  dueDate: "2026-11-07",
  /** Mod-10 valid (checked with @booki/core/kid). */
  kid: "2207000015",
  lines: [
    { description: "Skrivebord", quantity: 2, unitMinor: 300_000, amountMinor: 600_000 },
    { description: "Kontorstol", quantity: 4, unitMinor: 100_000, amountMinor: 400_000 },
  ],
  netMinor: 1_000_000,
  vatPercent: 25,
  vatMinor: 250_000,
  /** The total the document prints. Lines plus VAT add up to more than this. */
  statedGrossMinor: 1_205_000,
  account: "6800",
  vatCode: "MVA25",
};

// ---------------------------------------------------------------------------
// Closed period: October is open, August and September are locked.
// ---------------------------------------------------------------------------

export const HARD_PERIODS = [
  { code: "2026-08", status: "hard-closed" as const },
  { code: "2026-09", status: "hard-closed" as const },
  { code: "2026-10", status: "open" as const },
];

/** The voucher the task asks for, dated in a locked period. */
export const CLOSED_PERIOD_VOUCHER = {
  date: "2026-09-15",
  lines: [
    { account: "6800", debitMinor: 1_250_000, creditMinor: 0 },
    { account: "2400", debitMinor: 0, creditMinor: 1_250_000 },
  ],
  vatCode: null,
};

// ---------------------------------------------------------------------------
// Duplicate: three invoices are already posted; the same one arrives again.
// ---------------------------------------------------------------------------

export const POSTED_INVOICES = [
  {
    supplier: "Kontorrekvisita AS",
    orgNumber: "911223344",
    invoiceNumber: "8841",
    invoiceDate: "2026-10-12",
    grossMinor: 1_550_000,
    kid: "10012342",
    voucherId: "v-101",
  },
  {
    supplier: "Fjordkraft Strøm AS",
    orgNumber: "922334455",
    invoiceNumber: "55120",
    invoiceDate: "2026-10-05",
    grossMinor: 937_500,
    kid: "5512000017",
    voucherId: "v-102",
  },
  {
    supplier: "Nordlys Eiendom AS",
    orgNumber: "933445566",
    invoiceNumber: "H-2610",
    invoiceDate: "2026-10-01",
    grossMinor: 1_800_000,
    kid: "2610000045",
    voucherId: "v-103",
  },
];

/** The invoice that arrives a second time. Received 2026-10-20. */
export const DUPLICATE_INVOICE = {
  supplier: "Kontorrekvisita AS",
  orgNumber: "911223344",
  invoiceNumber: "8841",
  invoiceDate: "2026-10-12",
  receivedDate: "2026-10-20",
  grossMinor: 1_550_000,
  netMinor: 1_240_000,
  vatMinor: 310_000,
  kid: "10012342",
  account: "6800",
  vatCode: "MVA25",
};

// ---------------------------------------------------------------------------
// Foreign currency: an EUR invoice booked in NOK at the invoice date's rate.
// ---------------------------------------------------------------------------

export const FOREIGN_INVOICE = {
  supplier: "Nordic Cloud Ltd",
  country: "IE",
  invoiceNumber: "NC-5531",
  invoiceDate: "2026-10-14",
  currency: "EUR",
  /** EUR 1 000,00 in cent. */
  foreignMinor: 100_000,
  service: true,
  vatCode: "MVA0",
  account: "6800",
};

/** NOK per EUR, scaled by RATE_SCALE (1_000_000) as @booki/core/fx stores it. */
export const FX_RATES_EUR_NOK: { date: string; rateScaled: number }[] = [
  { date: "2026-10-12", rateScaled: 11_680_000 },
  { date: "2026-10-13", rateScaled: 11_705_000 },
  { date: "2026-10-14", rateScaled: 11_725_000 },
  { date: "2026-10-15", rateScaled: 11_760_000 },
  { date: "2026-10-16", rateScaled: 11_790_000 },
];

// ---------------------------------------------------------------------------
// Partial VAT: a phone bill that is half private, so half its VAT is not deductible.
// ---------------------------------------------------------------------------

export const PARTIAL_VAT_INVOICE = {
  supplier: "Mobil og Data AS",
  orgNumber: "955667788",
  invoiceNumber: "7710",
  invoiceDate: "2026-10-20",
  grossMinor: 1_250_000,
  netMinor: 1_000_000,
  vatPercent: 25,
  vatMinor: 250_000,
  cost: { account: "6900", name: "Telefon" },
  vatAccount: "2710",
  payable: "2400",
};

/** The rule as the page shows it. */
export const PARTIAL_VAT_RULE = "Mobilabonnementet brukes halvt privat: 50 % av inngående mva kan trekkes fra.";
