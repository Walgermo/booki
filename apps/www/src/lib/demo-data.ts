import type {
  ChartAccount,
  ChartTaxCode,
  AttachmentFile,
  Attachment,
  ExpenseClaimData,
  ExpensePolicy,
  FixedAsset,
  LedgerEntry,
  OpenItem,
  PopulationItem,
  SupplierInvoice,
  TickMark,
  VatTransaction,
} from "@booki-aui/react";

/** Made-up books for Nordlys AS, October 2026. Shared by the docs previews and the ERP demo. */

// How sure the reading of each field is: a document is read better in some places than others.
const field = <T>(value: T, confidence: number) => ({ value, confidence });

export const SUPPLIER_INVOICES: SupplierInvoice[] = [
  {
    id: "si-1",
    status: "new",
    document: { id: "doc-1", fileName: "kontorrekvisita-8841.pdf", page: 1 },
    bankAccount: "8601 11 17947",
    fields: {
      supplierName: field("Kontorrekvisita AS", 0.99),
      supplierOrgNumber: field("974760673", 0.97),
      invoiceNumber: field("8841", 0.95),
      invoiceDate: field("2026-10-12", 0.96),
      dueDate: field("2026-11-11", 0.93),
      netMinor: field(1_240_000, 0.97),
      taxMinor: field(310_000, 0.96),
      grossMinor: field(1_550_000, 0.98),
      currency: field("NOK", 0.99),
      paymentReference: field("10012342", 0.92),
    },
  },
  {
    id: "si-2",
    status: "new",
    document: { id: "doc-2", fileName: "brattli-okt.pdf", page: 1 },
    bankAccount: "1234 56 78903",
    fields: {
      supplierName: field("Brattli AS", 0.99),
      supplierOrgNumber: field("976944682", 0.62),
      invoiceNumber: field("20045519", 0.95),
      invoiceDate: field("2026-10-20", 0.96),
      dueDate: field("2026-11-04", 0.93),
      netMinor: field(350_400, 0.97),
      taxMinor: field(87_600, 0.96),
      grossMinor: field(438_100, 0.71),
      currency: field("NOK", 0.99),
      paymentReference: field("20045519", 0.92),
    },
  },
  {
    id: "si-3",
    status: "new",
    document: { id: "doc-3", fileName: "kontorrekvisita-8841-kopi.pdf", page: 1 },
    fields: {
      supplierName: field("Kontorrekvisita AS", 0.99),
      supplierOrgNumber: field("974760673", 0.97),
      invoiceNumber: field("8841", 0.95),
      invoiceDate: field("2026-10-12", 0.96),
      dueDate: field("2026-11-11", 0.93),
      netMinor: field(1_240_000, 0.97),
      taxMinor: field(310_000, 0.96),
      grossMinor: field(1_550_000, 0.98),
      currency: field("NOK", 0.99),
      paymentReference: field("10012342", 0.92),
    },
  },
];
export const CHART_NUMBERS = ["1500", "1920", "2400", "2711", "3000", "6340", "6800", "7140"];

const account = (
  number: string,
  name: string,
  type: ChartAccount["type"],
  more: Partial<ChartAccount> = {},
): ChartAccount => ({ number, name, type, active: true, ...more });

/**
 * Nordlys AS's chart of accounts (NS 4102), with the SAF-T standard account
 * each maps to. 6800 has no mapping yet and 7320 is no longer used.
 */
export const CHART_OF_ACCOUNTS_NO: ChartAccount[] = [
  account("1200", "Maskiner og anlegg", "asset", { standardAccount: "1200", locked: true }),
  account("1250", "Inventar", "asset", { standardAccount: "1250", locked: true }),
  account("1500", "Kundefordringer", "asset", { standardAccount: "1500", locked: true }),
  account("1920", "Bankinnskudd", "asset", { standardAccount: "1920", locked: true }),
  account("1950", "Bankinnskudd for skattetrekk", "asset", { standardAccount: "1950", locked: true }),
  account("2000", "Aksjekapital", "equity", { standardAccount: "2000", locked: true }),
  account("2050", "Annen egenkapital", "equity", { standardAccount: "2050" }),
  account("2400", "Leverandørgjeld", "liability", { standardAccount: "2400", locked: true }),
  account("2600", "Forskuddstrekk", "liability", { standardAccount: "2600", locked: true }),
  account("2700", "Utgående merverdiavgift", "liability", { standardAccount: "2700", locked: true }),
  account("2710", "Inngående merverdiavgift", "liability", { standardAccount: "2710", locked: true }),
  account("2740", "Oppgjørskonto merverdiavgift", "liability", { standardAccount: "2740" }),
  account("2770", "Skyldig arbeidsgiveravgift", "liability", { standardAccount: "2770", locked: true }),
  account("3000", "Salgsinntekt, avgiftspliktig", "income", { vatCode: "3", standardAccount: "3000", locked: true }),
  account("3100", "Salgsinntekt, avgiftsfri", "income", { vatCode: "5", standardAccount: "3100" }),
  account("4300", "Innkjøp av varer for videresalg", "expense", {
    vatCode: "1",
    standardAccount: "4300",
    locked: true,
  }),
  account("5000", "Lønn til ansatte", "expense", { standardAccount: "5000", locked: true }),
  account("5400", "Arbeidsgiveravgift", "expense", { standardAccount: "5400", locked: true }),
  account("6000", "Avskrivning på varige driftsmidler", "expense", { standardAccount: "6000" }),
  account("6300", "Leie lokale", "expense", { vatCode: "0", standardAccount: "6300", locked: true }),
  account("6800", "Kontorrekvisita", "expense", { vatCode: "1", locked: true }),
  account("6860", "Møte, kurs, oppdatering", "expense", { vatCode: "1", standardAccount: "6860" }),
  account("7140", "Reisekostnad, ikke oppgavepliktig", "expense", { vatCode: "1", standardAccount: "7140" }),
  account("7320", "Reklamekostnad", "expense", { vatCode: "1", standardAccount: "7320", active: false }),
  account("7770", "Bank- og kortgebyrer", "expense", { standardAccount: "7770", locked: true }),
  account("8050", "Annen renteinntekt", "income", { standardAccount: "8050" }),
  account("8150", "Annen rentekostnad", "expense", { standardAccount: "8150" }),
  account("8300", "Betalbar skatt", "expense", { standardAccount: "8300" }),
];

/** The SAF-T VAT codes the Norwegian chart uses. */
export const CHART_TAX_NO: ChartTaxCode[] = [
  { code: "0", label: "Ingen mva" },
  { code: "1", label: "Inngående 25 %" },
  { code: "11", label: "Inngående 15 %" },
  { code: "3", label: "Utgående 25 %" },
  { code: "31", label: "Utgående 15 %" },
  { code: "5", label: "Utgående 0 %" },
];

/** A US company's chart in the common ranges. Advertising is no longer used. */
export const CHART_OF_ACCOUNTS_US: ChartAccount[] = [
  account("1000", "Cash on hand", "asset", { locked: true }),
  account("1010", "Checking account", "asset", { locked: true }),
  account("1200", "Accounts receivable", "asset", { locked: true }),
  account("1500", "Equipment", "asset", { locked: true }),
  account("1510", "Accumulated depreciation", "asset"),
  account("2000", "Accounts payable", "liability", { locked: true }),
  account("2100", "Sales tax payable", "liability", { locked: true }),
  account("2200", "Payroll liabilities", "liability", { locked: true }),
  account("3000", "Owner's equity", "equity", { locked: true }),
  account("3900", "Retained earnings", "equity"),
  account("4000", "Sales revenue", "income", { vatCode: "TAX8875", locked: true }),
  account("4100", "Service revenue", "income", { vatCode: "TAX0" }),
  account("5000", "Cost of goods sold", "expense", { locked: true }),
  account("6000", "Rent", "expense", { locked: true }),
  account("6100", "Utilities", "expense"),
  account("6200", "Office supplies", "expense", { locked: true }),
  account("6300", "Software subscriptions", "expense"),
  account("6400", "Advertising", "expense", { active: false }),
  account("7000", "Salaries and wages", "expense", { locked: true }),
  account("7100", "Payroll taxes", "expense", { locked: true }),
  account("8000", "Interest income", "income"),
  account("8100", "Interest expense", "expense"),
  account("9000", "Income tax expense", "expense"),
];

export const CHART_TAX_US: ChartTaxCode[] = [
  { code: "TAX0", label: "No sales tax" },
  { code: "TAX8875", label: "8.875% sales tax" },
];

const HASH = (seed: string) => seed.repeat(64).slice(0, 64);
export const EVIDENCE_LINKED: Attachment[] = [
  {
    id: "att-1",
    fileName: "kontorrekvisita-8841.pdf",
    mediaType: "application/pdf",
    sizeBytes: 184_220,
    sha256: HASH("a1"),
    kind: "invoice",
    addedBy: "nina",
    addedAt: "2026-10-13T08:12:00Z",
  },
];
export const EVIDENCE_POOL: AttachmentFile[] = [
  {
    id: "att-2",
    fileName: "kvittering-kontorstol.jpg",
    mediaType: "image/jpeg",
    sizeBytes: 912_400,
    sha256: HASH("b2"),
    kind: "receipt",
  },
  {
    id: "att-3",
    fileName: "rammeavtale-2026.pdf",
    mediaType: "application/pdf",
    sizeBytes: 402_118,
    sha256: HASH("c3"),
  },
  {
    id: "att-4",
    fileName: "kontorrekvisita-8841 (1).pdf",
    mediaType: "application/pdf",
    sizeBytes: 184_220,
    sha256: HASH("a1"),
  },
];

export const EXPENSE_POLICY: ExpensePolicy = {
  categories: {
    reise: { receiptRequired: true, maxMinor: 500_000 },
    bevertning: { receiptRequired: true, maxMinor: 80_000 },
    parkering: { receiptRequired: false, maxMinor: 30_000 },
  },
  mileageRateMinorPerKm: 350,
  perDiemRates: { domestic: 80_100, abroad: 105_000 },
};
export const EXPENSE_CLAIM: ExpenseClaimData = {
  id: "claim-12",
  claimantId: "nina",
  status: "draft",
  currency: "NOK",
  periodStart: "2026-10-01",
  periodEnd: "2026-10-31",
  acceptedExceptions: [],
  lines: [
    {
      id: "l1",
      kind: "expense",
      date: "2026-10-06",
      description: "Tog Oslo–Bergen",
      category: "reise",
      amountMinor: 119_900,
      receiptId: "att-2",
    },
    {
      id: "l2",
      kind: "expense",
      date: "2026-10-06",
      description: "Middag med kunde",
      category: "bevertning",
      amountMinor: 124_000,
    },
    { id: "l3", kind: "mileage", date: "2026-10-07", description: "Bergen–Voss og tilbake", distanceMeters: 204_000 },
    { id: "l4", kind: "per-diem", date: "2026-10-07", description: "Diett, to døgn", days: 2, rate: "domestic" },
  ],
};

/** A small ledger that balances: twelve vouchers across September and October. */
export const LEDGER: LedgerEntry[] = (() => {
  const out: LedgerEntry[] = [];
  let n = 0;
  const post = (number: string, date: string, description: string, lines: [string, string, number, number][]) => {
    for (const [account, accountName, debitMinor, creditMinor] of lines) {
      n += 1;
      out.push({
        id: `e${n}`,
        voucherId: `v-${number}`,
        voucherNumber: number,
        date,
        account,
        accountName,
        description,
        debitMinor,
        creditMinor,
      });
    }
  };
  const sale = (number: string, date: string, customer: string, net: number) =>
    post(number, date, `Faktura ${customer}`, [
      ["1500", "Kundefordringer", net + net / 4, 0],
      ["3000", "Salgsinntekt", 0, net],
      ["2701", "Utgående mva", 0, net / 4],
    ]);
  const cost = (number: string, date: string, text: string, account: string, name: string, net: number) =>
    post(number, date, text, [
      [account, name, net, 0],
      ["2711", "Inngående mva", net / 4, 0],
      ["2400", "Leverandørgjeld", 0, net + net / 4],
    ]);
  sale("1001", "2026-09-04", "Nordlys Eiendom", 1_000_000);
  sale("1002", "2026-09-12", "Brattli", 800_000);
  cost("2001", "2026-09-15", "Husleie september", "6340", "Husleie", 1_200_000);
  cost("2002", "2026-09-22", "Kontorrekvisita", "6800", "Kontorrekvisita", 96_000);
  post("3001", "2026-09-28", "Innbetaling Nordlys Eiendom", [
    ["1920", "Bankinnskudd", 1_250_000, 0],
    ["1500", "Kundefordringer", 0, 1_250_000],
  ]);
  sale("1003", "2026-10-03", "Brattli", 1_600_000);
  sale("1004", "2026-10-09", "Vestlandsbygg", 2_400_000);
  cost("2003", "2026-10-15", "Husleie oktober", "6340", "Husleie", 1_200_000);
  cost("2004", "2026-10-18", "Kontorstoler", "6800", "Kontorrekvisita", 1_240_000);
  cost("2005", "2026-10-21", "Reise Bergen", "7140", "Reisekostnad", 320_000);
  post("3002", "2026-10-24", "Innbetaling Brattli", [
    ["1920", "Bankinnskudd", 3_000_000, 0],
    ["1500", "Kundefordringer", 0, 3_000_000],
  ]);
  post("3003", "2026-10-28", "Betaling husleie", [
    ["2400", "Leverandørgjeld", 1_500_000, 0],
    ["1920", "Bankinnskudd", 0, 1_500_000],
  ]);
  return out;
})();

/** The document behind each voucher in LEDGER: sales invoices and supplier invoices, as files. */
export const LEDGER_DOCUMENTS: Record<string, { name: string; mediaType: string }> = Object.fromEntries(
  [...new Map(LEDGER.map((entry) => [entry.voucherId, entry.voucherNumber])).entries()].map(([voucherId, number]) => [
    voucherId,
    number.startsWith("1")
      ? { name: `faktura-${number}.pdf`, mediaType: "application/pdf" }
      : { name: `leverandorfaktura-${number}.pdf`, mediaType: "application/pdf" },
  ]),
);

export const RECEIVABLES: OpenItem[] = [
  {
    id: "r1",
    partyId: "c1",
    partyName: "Vestlandsbygg AS",
    documentNumber: "1004",
    dueDate: "2026-11-08",
    amountMinor: 3_000_000,
    kind: "receivable",
  },
  {
    id: "r2",
    partyId: "c2",
    partyName: "Brattli AS",
    documentNumber: "0988",
    dueDate: "2026-09-20",
    amountMinor: 640_000,
    kind: "receivable",
  },
  {
    id: "r3",
    partyId: "c2",
    partyName: "Brattli AS",
    documentNumber: "0991",
    dueDate: "2026-10-12",
    amountMinor: 212_500,
    kind: "receivable",
  },
  {
    id: "r4",
    partyId: "c3",
    partyName: "Havblikk Hotell",
    documentNumber: "0912",
    dueDate: "2026-06-30",
    amountMinor: 1_875_000,
    kind: "receivable",
  },
  {
    id: "r5",
    partyId: "c3",
    partyName: "Havblikk Hotell",
    documentNumber: "K-0044",
    dueDate: "2026-07-15",
    amountMinor: -250_000,
    kind: "receivable",
  },
  {
    id: "r6",
    partyId: "c4",
    partyName: "Nordlys Eiendom",
    documentNumber: "0975",
    dueDate: "2026-08-28",
    amountMinor: 96_000,
    kind: "receivable",
  },
];

/** VAT codes here are the ones the example schema maps; "9" is deliberately unmapped. */
export const VAT_TRANSACTIONS: VatTransaction[] = [
  { voucherId: "v-1003", date: "2026-09-03", vatCode: "3", baseMinor: 1_600_000, taxMinor: 400_000 },
  { voucherId: "v-1004", date: "2026-10-09", vatCode: "3", baseMinor: 2_400_000, taxMinor: 600_000 },
  { voucherId: "v-1005", date: "2026-10-11", vatCode: "31", baseMinor: 400_000, taxMinor: 60_000 },
  { voucherId: "v-2003", date: "2026-10-15", vatCode: "1", baseMinor: 1_200_000, taxMinor: 300_000 },
  { voucherId: "v-2004", date: "2026-10-18", vatCode: "1", baseMinor: 1_240_000, taxMinor: 310_000 },
  { voucherId: "v-2009", date: "2026-10-26", vatCode: "9", baseMinor: 88_000, taxMinor: 22_000 },
];

export const AUDIT_POPULATION: PopulationItem[] = [
  { id: "1001", amountMinor: 1_250_000, description: "Nordlys Eiendom" },
  { id: "1002", amountMinor: 1_000_000, description: "Brattli" },
  { id: "1003", amountMinor: 2_000_000, description: "Brattli" },
  { id: "1004", amountMinor: 3_000_000, description: "Vestlandsbygg" },
  { id: "1005", amountMinor: 460_000, description: "Havblikk Hotell" },
  { id: "1006", amountMinor: 96_000, description: "Nordlys Eiendom" },
  { id: "1007", amountMinor: 212_500, description: "Brattli" },
  { id: "1008", amountMinor: 1_875_000, description: "Havblikk Hotell" },
  { id: "1009", amountMinor: 640_000, description: "Brattli" },
  { id: "1010", amountMinor: 49_900, description: "Mobilsalg" },
];
export const TICK_MARKS: TickMark[] = [
  { symbol: "✓", meaning: "Avstemt mot faktura" },
  { symbol: "B", meaning: "Avstemt mot kontoutskrift" },
  { symbol: "C", meaning: "Bekreftet av kunden" },
];
export const AUDIT_MATERIALITY = { benchmarkMinor: 1_200_000_000, overallBp: 100, performanceBp: 7500, trivialBp: 500 };

export const ASSETS: FixedAsset[] = [
  {
    id: "a1",
    name: "Varebil, EL 48213",
    acquiredOn: "2025-03-10",
    costMinor: 42_000_000,
    residualMinor: 6_000_000,
    method: "straight-line",
    usefulLifeMonths: 60,
  },
  {
    id: "a2",
    name: "Kontormøbler",
    acquiredOn: "2026-10-18",
    costMinor: 1_240_000,
    residualMinor: 0,
    method: "straight-line",
    usefulLifeMonths: 36,
  },
  {
    id: "a3",
    name: "Server",
    acquiredOn: "2024-01-15",
    costMinor: 9_600_000,
    residualMinor: 100_000,
    method: "declining-balance",
    rateBp: 3000,
  },
];
