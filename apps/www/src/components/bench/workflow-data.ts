/**
 * Invented data for the three workflow tasks (inbox, reconcile, close). Both
 * pages of a task read the same records from here, so the replica and Booki
 * start from the same month. The benchmark's verifiers keep their own copy of
 * what the end state must be (benchmarks/agent/src/verify.ts).
 */
import type { SupplierInvoice } from "@booki-aui/core/supplier-invoice";
import type { BankLine, OpenPost } from "@booki-aui/core/reconciliation";
import type { CloseTask } from "@booki-aui/core/close";

// ---------------------------------------------------------------------------
// Inbox: eight supplier invoices read from documents, October 2026.
// ---------------------------------------------------------------------------

export type InboxRecord = {
  id: string;
  supplier: string;
  orgNumber: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  netMinor: number;
  taxMinor: number;
  grossMinor: number;
  kid: string;
  /** Proposed from the supplier's last invoice; absent when there is none. */
  account?: string;
  vatCode?: string;
  /** Fields read with low confidence, and how sure the reading was. */
  low?: Partial<Record<"invoiceNumber" | "dueDate" | "grossMinor", number>>;
};

export const INBOX: InboxRecord[] = [
  {
    id: "si-01",
    supplier: "Kontorrekvisita AS",
    orgNumber: "911223344",
    invoiceNumber: "8841",
    invoiceDate: "2026-10-12",
    dueDate: "2026-11-11",
    netMinor: 1_240_000,
    taxMinor: 310_000,
    grossMinor: 1_550_000,
    kid: "10012342",
    account: "6800",
    vatCode: "MVA25",
  },
  // Gross read wrong: the paper says 9 375,00 (net + VAT).
  {
    id: "si-02",
    supplier: "Fjordkraft Strøm AS",
    orgNumber: "922334455",
    invoiceNumber: "55120",
    invoiceDate: "2026-10-05",
    dueDate: "2026-10-25",
    netMinor: 750_000,
    taxMinor: 187_500,
    grossMinor: 935_700,
    kid: "5512000017",
    account: "6340",
    vatCode: "MVA25",
    low: { grossMinor: 0.52 },
  },
  // Due date read with low confidence, but right as read.
  {
    id: "si-03",
    supplier: "Nordlys Eiendom AS",
    orgNumber: "933445566",
    invoiceNumber: "H-2610",
    invoiceDate: "2026-10-01",
    dueDate: "2026-11-01",
    netMinor: 1_800_000,
    taxMinor: 0,
    grossMinor: 1_800_000,
    kid: "2610000045",
    account: "6300",
    vatCode: "MVA0",
    low: { dueDate: 0.61 },
  },
  // Invoice number read "447l": the paper says 4471.
  {
    id: "si-04",
    supplier: "Kontorservice Vest AS",
    orgNumber: "944556677",
    invoiceNumber: "447l",
    invoiceDate: "2026-10-14",
    dueDate: "2026-11-13",
    netMinor: 260_000,
    taxMinor: 65_000,
    grossMinor: 325_000,
    kid: "4471000028",
    account: "6800",
    vatCode: "MVA25",
    low: { invoiceNumber: 0.48 },
  },
  // New supplier account history: nothing proposed. Must be coded to 6810 with 25 %.
  {
    id: "si-05",
    supplier: "Datahjelp Norge AS",
    orgNumber: "955667788",
    invoiceNumber: "3318",
    invoiceDate: "2026-10-16",
    dueDate: "2026-11-15",
    netMinor: 480_000,
    taxMinor: 120_000,
    grossMinor: 600_000,
    kid: "3318000062",
  },
  // A second copy of invoice 3307, which was booked in September.
  {
    id: "si-06",
    supplier: "Datahjelp Norge AS",
    orgNumber: "955667788",
    invoiceNumber: "3307",
    invoiceDate: "2026-09-28",
    dueDate: "2026-10-28",
    netMinor: 360_000,
    taxMinor: 90_000,
    grossMinor: 450_000,
    kid: "3307000013",
    account: "6810",
    vatCode: "MVA25",
  },
  {
    id: "si-07",
    supplier: "Kurssenteret Oslo AS",
    orgNumber: "966778899",
    invoiceNumber: "9102",
    invoiceDate: "2026-10-20",
    dueDate: "2026-11-19",
    netMinor: 590_000,
    taxMinor: 147_500,
    grossMinor: 737_500,
    kid: "9102000034",
    account: "6860",
    vatCode: "MVA25",
  },
  {
    id: "si-08",
    supplier: "Reisebyrået Nord AS",
    orgNumber: "977889900",
    invoiceNumber: "7781",
    invoiceDate: "2026-10-22",
    dueDate: "2026-11-05",
    netMinor: 214_000,
    taxMinor: 0,
    grossMinor: 214_000,
    kid: "7781000051",
    account: "7140",
    vatCode: "MVA0",
  },
];

/** Already in the ledger (booked in September). The inbox copy si-06 repeats it. */
export const BOOKED = {
  id: "lf-0930-3307",
  supplier: "Datahjelp Norge AS",
  orgNumber: "955667788",
  invoiceNumber: "3307",
  invoiceDate: "2026-09-28",
  dueDate: "2026-10-28",
  grossMinor: 450_000,
};

export const INBOX_ACCOUNTS: { number: string; name: string }[] = [
  { number: "4000", name: "Innkjøp av råvarer og halvfabrikata" },
  { number: "6300", name: "Leie lokale" },
  { number: "6340", name: "Lys, varme" },
  { number: "6800", name: "Kontorrekvisita" },
  { number: "6810", name: "Datakostnader" },
  { number: "6860", name: "Møte, kurs, oppdatering" },
  { number: "7140", name: "Reisekostnad, ikke opplysningspliktig" },
  { number: "7770", name: "Bank- og kortgebyrer" },
];

/** The Booki form of an inbox record: every field with how sure the reading was. */
export function toSupplierInvoice(record: InboxRecord): SupplierInvoice {
  const sure = (field: "invoiceNumber" | "dueDate" | "grossMinor") => record.low?.[field] ?? 0.97;
  return {
    id: record.id,
    status: record.account ? "coded" : "new",
    fields: {
      supplierName: { value: record.supplier, confidence: 0.98 },
      supplierOrgNumber: { value: record.orgNumber, confidence: 0.97 },
      invoiceNumber: { value: record.invoiceNumber, confidence: sure("invoiceNumber") },
      invoiceDate: { value: record.invoiceDate, confidence: 0.96 },
      dueDate: { value: record.dueDate, confidence: sure("dueDate") },
      netMinor: { value: record.netMinor, confidence: 0.95 },
      taxMinor: { value: record.taxMinor, confidence: 0.95 },
      grossMinor: { value: record.grossMinor, confidence: sure("grossMinor") },
      currency: { value: "NOK", confidence: 0.99 },
      paymentReference: { value: record.kid, confidence: 0.96 },
    },
    document: { id: `doc-${record.id}`, fileName: `${record.id}.pdf`, page: 1 },
    ...(record.account
      ? { coding: { account: record.account, ...(record.vatCode ? { vatCode: record.vatCode } : {}) } }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Reconcile: twelve lines on the October statement for 1920, twelve open posts.
// ---------------------------------------------------------------------------

export const BANK_LINES: BankLine[] = [
  {
    id: "b01",
    date: "2026-10-02",
    description: "Innbetaling Brattli AS",
    amountMinor: 2_563_125,
    reference: "1041007",
  },
  { id: "b02", date: "2026-10-03", description: "Husleie Nordlys Eiendom AS", amountMinor: -1_800_000 },
  {
    id: "b03",
    date: "2026-10-05",
    description: "Innbetaling Fjelltopp Bygg AS",
    amountMinor: 1_250_000,
    reference: "1042005",
  },
  {
    id: "b04",
    date: "2026-10-07",
    description: "Innbetaling Lindholm Regnskap AS",
    amountMinor: 875_000,
    reference: "1044001",
  },
  {
    id: "b05",
    date: "2026-10-08",
    description: "Innbetaling Havbris Design AS",
    amountMinor: 875_000,
    reference: "1043003",
  },
  {
    id: "b06",
    date: "2026-10-10",
    description: "Solberg Maskin AS, delbetaling",
    amountMinor: 2_500_000,
    reference: "1045009",
  },
  {
    id: "b07",
    date: "2026-10-12",
    description: "Betaling Kontorrekvisita AS",
    amountMinor: -1_550_000,
    reference: "10012342",
  },
  {
    id: "b08",
    date: "2026-10-15",
    description: "Betaling Fjordkraft Strøm AS",
    amountMinor: -937_500,
    reference: "5512000017",
  },
  {
    id: "b09",
    date: "2026-10-20",
    description: "Solberg Maskin AS, restbetaling",
    amountMinor: 1_500_000,
    reference: "1045009",
  },
  { id: "b10", date: "2026-10-21", description: "Skatteetaten skattetrekk", amountMinor: -4_231_000 },
  {
    id: "b11",
    date: "2026-10-24",
    description: "Betaling Datahjelp Norge AS",
    amountMinor: -600_000,
    reference: "3318000062",
  },
  { id: "b12", date: "2026-10-27", description: "Overføring fra 1503.22.48311", amountMinor: 498_000 },
];

export const OPEN_POSTS: OpenPost[] = [
  {
    id: "p01",
    date: "2026-09-18",
    description: "Faktura 1041 Brattli AS",
    amountMinor: 2_563_125,
    reference: "1041007",
  },
  {
    id: "p02",
    date: "2026-09-20",
    description: "Faktura 1042 Fjelltopp Bygg AS",
    amountMinor: 1_250_000,
    reference: "1042005",
  },
  {
    id: "p03",
    date: "2026-09-22",
    description: "Faktura 1043 Havbris Design AS",
    amountMinor: 875_000,
    reference: "1043003",
  },
  {
    id: "p04",
    date: "2026-09-23",
    description: "Faktura 1044 Lindholm Regnskap AS",
    amountMinor: 875_000,
    reference: "1044001",
  },
  {
    id: "p05",
    date: "2026-09-25",
    description: "Faktura 1045 Solberg Maskin AS",
    amountMinor: 4_000_000,
    reference: "1045009",
  },
  {
    id: "p06",
    date: "2026-10-12",
    description: "Leverandørfaktura 8841 Kontorrekvisita AS",
    amountMinor: -1_550_000,
    reference: "10012342",
  },
  {
    id: "p07",
    date: "2026-10-05",
    description: "Leverandørfaktura 55120 Fjordkraft Strøm AS",
    amountMinor: -937_500,
    reference: "5512000017",
  },
  { id: "p08", date: "2026-10-01", description: "Husleie oktober Nordlys Eiendom AS", amountMinor: -1_800_000 },
  {
    id: "p09",
    date: "2026-10-16",
    description: "Leverandørfaktura 3318 Datahjelp Norge AS",
    amountMinor: -600_000,
    reference: "3318000062",
  },
  { id: "p10", date: "2026-10-02", description: "Faktura 1046 Brattli AS", amountMinor: 320_000, reference: "1046004" },
  {
    id: "p11",
    date: "2026-10-09",
    description: "Faktura 1047 Fjelltopp Bygg AS",
    amountMinor: 640_000,
    reference: "1047002",
  },
  { id: "p12", date: "2026-10-05", description: "Skattetrekk september", amountMinor: -4_231_000 },
];

// ---------------------------------------------------------------------------
// Close: October 2026's checklist, period statuses and the depreciation voucher.
// ---------------------------------------------------------------------------

export const PEOPLE: Record<string, string> = { kari: "Kari Nilsen", ola: "Ola Berg", agent: "agenten" };

export const CLOSE_TASKS: CloseTask[] = [
  { id: "bank", title: "Avstem bankkonto 1920", status: "done", doneBy: "kari", needsSignOff: true },
  {
    id: "suppliers",
    title: "Bokfør leverandørfakturaer for oktober",
    status: "signed",
    doneBy: "kari",
    signedBy: "ola",
    needsSignOff: true,
  },
  { id: "period", title: "Kontroller at oktober er åpen for bokføring", status: "open" },
  { id: "depreciation", title: "Bokfør avskrivning for oktober", status: "open", dependsOn: ["period"] },
  {
    id: "balance",
    title: "Kontroller saldobalansen",
    status: "open",
    dependsOn: ["bank", "depreciation"],
    needsSignOff: true,
  },
  { id: "lock", title: "Steng oktober for bokføring", status: "open", dependsOn: ["balance"] },
];

/** September and August are locked; October is open (a period not listed is open). */
export const PERIOD_CODES = ["2026-08", "2026-09", "2026-10"];
export const PERIODS = [
  { code: "2026-08", status: "hard-closed" as const },
  { code: "2026-09", status: "hard-closed" as const },
];

export const CLOSE_ACCOUNTS: { number: string; name: string }[] = [
  { number: "1290", name: "Akkumulerte avskrivninger, inventar" },
  { number: "1700", name: "Forskuddsbetalt kostnad" },
  { number: "1920", name: "Bankinnskudd" },
  { number: "2400", name: "Leverandørgjeld" },
  { number: "6010", name: "Avskrivning på inventar" },
  { number: "7500", name: "Forsikringspremie" },
];

/**
 * October's trial balance before the depreciation, signed (debit positive).
 * It sums to zero; both pages add a posted voucher's lines to it, so after the
 * depreciation 6010 shows 12 500,00 and the sum is still zero.
 */
export const TRIAL_BALANCE: { account: string; name: string; balanceMinor: number }[] = [
  { account: "1290", name: "Akkumulerte avskrivninger, inventar", balanceMinor: -15_000_000 },
  { account: "1500", name: "Kundefordringer", balanceMinor: 18_625_000 },
  { account: "1920", name: "Bankinnskudd", balanceMinor: 41_238_000 },
  { account: "2400", name: "Leverandørgjeld", balanceMinor: -9_641_000 },
  { account: "3000", name: "Salgsinntekt, avgiftspliktig", balanceMinor: -59_550_000 },
  { account: "6010", name: "Avskrivning på inventar", balanceMinor: 0 },
  { account: "6300", name: "Leie lokale", balanceMinor: 18_000_000 },
  { account: "6800", name: "Kontorrekvisita", balanceMinor: 6_328_000 },
];

/** The trial balance with posted lines added. */
export function trialBalance(posted: { account: string; debitMinor: number; creditMinor: number }[]) {
  return TRIAL_BALANCE.map((row) => ({
    ...row,
    balanceMinor:
      row.balanceMinor +
      posted
        .filter((line) => line.account === row.account)
        .reduce((sum, line) => sum + line.debitMinor - line.creditMinor, 0),
  }));
}
