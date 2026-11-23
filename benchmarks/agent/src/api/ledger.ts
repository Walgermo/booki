// An in-process bookkeeping API for the Norwegian profile (NOK, MVA codes,
// 2400 payables). It is the same books the screen tasks use, reached without
// a screen: no HTTP, no model, no clock. Every run starts from the same
// reference data, so an end state can be checked the same way every time.
//
// Amounts are integer minor units (øre). Dates are ISO yyyy-mm-dd strings.

import { isValidKid } from "@booki/core";

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export type Party = { number: string; name: string };
export type Account = { number: string; name: string };
export type VatCode = { code: "MVA0" | "MVA15" | "MVA25"; percent: number };

// Reference data, copied from apps/www/src/components/bench (acc-supplier-invoice,
// acc-sales-invoice, acc-voucher). Kept in one const so the tools can list it.
export const REFERENCE = {
  suppliers: [
    { number: "20002", name: "Nordlys Eiendom AS" },
    { number: "20003", name: "Fjordkraft Strøm AS" },
    { number: "20001", name: "Kontorrekvisita AS" },
    { number: "20004", name: "Kontorservice Vest AS" },
    { number: "20005", name: "Datahjelp Norge AS" },
  ] satisfies Party[],
  customers: [
    { number: "10002", name: "Havblikk Hotell AS" },
    { number: "10003", name: "Brattvoll Bygg AS" },
    { number: "10001", name: "Brattli AS" },
    { number: "10004", name: "Brattli Eiendom AS" },
    { number: "10005", name: "Sjøkanten Kafé AS" },
  ] satisfies Party[],
  accounts: [
    { number: "4000", name: "Innkjøp av råvarer og halvfabrikata" },
    { number: "6300", name: "Leie lokale" },
    { number: "6340", name: "Lys, varme" },
    { number: "6540", name: "Inventar" },
    { number: "6800", name: "Kontorrekvisita" },
    { number: "6810", name: "Datakostnader" },
    { number: "6860", name: "Møte, kurs, oppdatering" },
    { number: "7140", name: "Reisekostnad, ikke opplysningspliktig" },
    { number: "7770", name: "Bank- og kortgebyrer" },
    { number: "2400", name: "Leverandørgjeld" },
    { number: "2710", name: "Inngående merverdiavgift, høy sats" },
    { number: "1500", name: "Kundefordringer" },
    { number: "3000", name: "Salgsinntekt, avgiftspliktig" },
    { number: "2700", name: "Utgående merverdiavgift, høy sats" },
  ] satisfies Account[],
  vatCodes: [
    { code: "MVA0", percent: 0 },
    { code: "MVA15", percent: 15 },
    { code: "MVA25", percent: 25 },
  ] satisfies VatCode[],
} as const;

/** The company's auto-post rule: above 50 000,00 a person posts. */
export const AUTO_POST_LIMIT_MINOR = 5_000_000;

export const DEFAULT_ACTOR = "agent:api";

export type VoucherLineInput = {
  account: string;
  debitMinor: number;
  creditMinor: number;
  vatCode?: string;
};

export type VoucherInput = {
  date: string;
  lines: VoucherLineInput[];
};

export type Voucher = {
  id: string;
  date: string;
  lines: VoucherLineInput[];
  totalDebitMinor: number;
  posted: boolean;
  status: "posted" | "held";
  actor: string;
};

export type SupplierInvoiceInput = {
  supplier: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  kid: string;
  grossMinor: number;
  account: string;
  vatCode: string;
};

export type SupplierInvoicePosting = { account: string; debitMinor?: number; creditMinor?: number };

export type SupplierInvoice = {
  id: string;
  supplier: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  kid: string;
  grossMinor: number;
  netMinor: number;
  vatMinor: number;
  account: string;
  vatCode: string;
  postings: SupplierInvoicePosting[];
  posted: boolean;
  status: "posted" | "held";
  actor: string;
};

export type SalesLineInput = {
  description: string;
  quantityMilli: number;
  unitPriceMinor: number;
  vatCode: string;
};

export type SalesInvoiceInput = {
  customer: string;
  lines: SalesLineInput[];
};

export type SalesLine = SalesLineInput & { netMinor: number; vatMinor: number };

export type SalesInvoice = {
  id: string;
  customer: string;
  customerName: string;
  lines: SalesLine[];
  netMinor: number;
  vatMinor: number;
  grossMinor: number;
  status: "draft";
  created: true;
  actor: string;
};

export type AuditEntry = { at: number; actor: string; action: string; id: string };

export type LedgerState = {
  vouchers: Voucher[];
  supplierInvoices: SupplierInvoice[];
  salesInvoices: SalesInvoice[];
  audit: AuditEntry[];
};

const VOUCHER_FIELDS = ["date", "lines"] as const;
const VOUCHER_LINE_FIELDS = ["account", "debitMinor", "creditMinor", "vatCode"] as const;
const SUPPLIER_INVOICE_FIELDS = [
  "supplier",
  "invoiceNumber",
  "invoiceDate",
  "dueDate",
  "kid",
  "grossMinor",
  "account",
  "vatCode",
] as const;
const SALES_INVOICE_FIELDS = ["customer", "lines"] as const;
const SALES_LINE_FIELDS = ["description", "quantityMilli", "unitPriceMinor", "vatCode"] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function listOf(items: readonly { readonly number: string; readonly name: string }[]): string {
  return items.map((item) => `${item.number} ${item.name}`).join(", ");
}

function vatListOf(): string {
  return REFERENCE.vatCodes.map((vat) => `${vat.code} (${vat.percent} %)`).join(", ");
}

function assertObject(value: unknown, where: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new ApiError(`${where} must be an object.`);
}

function assertFields(value: Record<string, unknown>, valid: readonly string[], where: string): void {
  for (const key of Object.keys(value)) {
    if (!valid.includes(key)) {
      throw new ApiError(`Unknown field "${key}" in ${where}. Valid fields: ${valid.join(", ")}.`);
    }
  }
}

function assertActor(actor: unknown): asserts actor is string {
  if (typeof actor !== "string" || actor.trim() === "") {
    throw new ApiError('actor must be a non-empty string, such as "agent:api".');
  }
}

function assertText(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(`${field} must be a non-empty text.`);
  }
}

function assertMinor(value: unknown, field: string, { positive }: { positive: boolean }): asserts value is number {
  const floor = positive ? 1 : 0;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < floor) {
    const rule = positive ? "a positive whole number" : "a whole number, 0 or more";
    throw new ApiError(`${field} must be ${rule}; got ${JSON.stringify(value)}.`);
  }
}

function assertIsoDate(value: unknown, field: string): asserts value is string {
  const valid =
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!valid) throw new ApiError(`${field} must be an ISO date yyyy-mm-dd; got ${JSON.stringify(value)}.`);
}

function findAccount(id: unknown): Account {
  const found = REFERENCE.accounts.find((account) => account.number === id);
  if (!found) throw new ApiError(`Unknown account ${JSON.stringify(id)}. Accounts: ${listOf(REFERENCE.accounts)}.`);
  return found;
}

function findSupplier(id: unknown): Party {
  const found = REFERENCE.suppliers.find((supplier) => supplier.number === id);
  if (!found) throw new ApiError(`Unknown supplier ${JSON.stringify(id)}. Suppliers: ${listOf(REFERENCE.suppliers)}.`);
  return found;
}

function findCustomer(id: unknown): Party {
  const found = REFERENCE.customers.find((customer) => customer.number === id);
  if (!found) throw new ApiError(`Unknown customer ${JSON.stringify(id)}. Customers: ${listOf(REFERENCE.customers)}.`);
  return found;
}

function findVatCode(code: unknown): VatCode {
  const found = REFERENCE.vatCodes.find((vat) => vat.code === code);
  if (!found) throw new ApiError(`Unknown VAT code ${JSON.stringify(code)}. VAT codes: ${vatListOf()}.`);
  return found;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class BookkeepingApi {
  #vouchers: Voucher[] = [];
  #supplierInvoices: SupplierInvoice[] = [];
  #salesInvoices: SalesInvoice[] = [];
  #audit: AuditEntry[] = [];
  #clock = 0;

  listSuppliers(): Party[] {
    return REFERENCE.suppliers.map((supplier) => ({ ...supplier }));
  }

  listCustomers(): Party[] {
    return REFERENCE.customers.map((customer) => ({ ...customer }));
  }

  listAccounts(): Account[] {
    return REFERENCE.accounts.map((account) => ({ ...account }));
  }

  listVatCodes(): VatCode[] {
    return REFERENCE.vatCodes.map((vat) => ({ ...vat }));
  }

  postVoucher(input: VoucherInput, actor: string = DEFAULT_ACTOR): Voucher {
    assertObject(input, "postVoucher input");
    assertFields(input, VOUCHER_FIELDS, "postVoucher input");
    assertActor(actor);
    assertIsoDate(input.date, "date");
    if (!Array.isArray(input.lines) || input.lines.length < 2) {
      throw new ApiError("lines must be a list of at least two voucher lines.");
    }

    const lines: VoucherLineInput[] = input.lines.map((raw, index) => {
      const n = index + 1;
      assertObject(raw, `Voucher line ${n}`);
      assertFields(raw, VOUCHER_LINE_FIELDS, `voucher line ${n}`);
      findAccount(raw.account);
      assertMinor(raw.debitMinor, `Line ${n} debitMinor (øre)`, { positive: false });
      assertMinor(raw.creditMinor, `Line ${n} creditMinor (øre)`, { positive: false });
      const hasDebit = raw.debitMinor > 0;
      const hasCredit = raw.creditMinor > 0;
      if (hasDebit === hasCredit) {
        throw new ApiError(`Line ${n} needs exactly one of debitMinor or creditMinor above 0, not both or neither.`);
      }
      if (raw.vatCode !== undefined) findVatCode(raw.vatCode);
      return {
        account: raw.account as string,
        debitMinor: raw.debitMinor,
        creditMinor: raw.creditMinor,
        ...(raw.vatCode !== undefined ? { vatCode: raw.vatCode as string } : {}),
      };
    });

    const debit = lines.reduce((sum, line) => sum + line.debitMinor, 0);
    const credit = lines.reduce((sum, line) => sum + line.creditMinor, 0);
    if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit)) {
      throw new ApiError("The voucher sums are too large to represent exactly.");
    }
    if (debit !== credit) {
      throw new ApiError(
        `Voucher does not balance: debit sums to ${debit} øre and credit to ${credit} øre. They must be equal.`,
      );
    }

    const held = debit > AUTO_POST_LIMIT_MINOR;
    const voucher: Voucher = {
      id: `v-${this.#vouchers.length + 1}`,
      date: input.date,
      lines,
      totalDebitMinor: debit,
      posted: !held,
      status: held ? "held" : "posted",
      actor,
    };
    this.#vouchers.push(voucher);
    this.#record(actor, "postVoucher", voucher.id);
    return clone(voucher);
  }

  registerSupplierInvoice(input: SupplierInvoiceInput, actor: string = DEFAULT_ACTOR): SupplierInvoice {
    assertObject(input, "registerSupplierInvoice input");
    assertFields(input, SUPPLIER_INVOICE_FIELDS, "registerSupplierInvoice input");
    assertActor(actor);

    const supplier = findSupplier(input.supplier);
    assertText(input.invoiceNumber, "invoiceNumber");
    assertIsoDate(input.invoiceDate, "invoiceDate");
    assertIsoDate(input.dueDate, "dueDate");
    if (input.dueDate < input.invoiceDate) {
      throw new ApiError(`dueDate ${input.dueDate} is before invoiceDate ${input.invoiceDate}.`);
    }
    if (typeof input.kid !== "string" || !isValidKid(input.kid)) {
      throw new ApiError(`KID ${JSON.stringify(input.kid)} is not valid: the check digit does not match.`);
    }
    assertMinor(input.grossMinor, "grossMinor (øre)", { positive: true });
    const account = findAccount(input.account);
    const vat = findVatCode(input.vatCode);

    const duplicate = this.#supplierInvoices.find(
      (invoice) => invoice.supplier === supplier.number && invoice.invoiceNumber === input.invoiceNumber,
    );
    if (duplicate) {
      throw new ApiError(
        `Supplier invoice ${input.invoiceNumber} from ${supplier.number} is already registered as ${duplicate.id}.`,
      );
    }

    const gross = input.grossMinor;
    const vatMinor = Math.round((gross * vat.percent) / (100 + vat.percent));
    const netMinor = gross - vatMinor;
    const postings: SupplierInvoicePosting[] = [{ account: account.number, debitMinor: netMinor }];
    if (vatMinor > 0) postings.push({ account: "2710", debitMinor: vatMinor });
    postings.push({ account: "2400", creditMinor: gross });

    const held = gross > AUTO_POST_LIMIT_MINOR;
    const record: SupplierInvoice = {
      id: `si-${this.#supplierInvoices.length + 1}`,
      supplier: supplier.number,
      supplierName: supplier.name,
      invoiceNumber: input.invoiceNumber,
      invoiceDate: input.invoiceDate,
      dueDate: input.dueDate,
      kid: input.kid,
      grossMinor: gross,
      netMinor,
      vatMinor,
      account: account.number,
      vatCode: vat.code,
      postings,
      posted: !held,
      status: held ? "held" : "posted",
      actor,
    };
    this.#supplierInvoices.push(record);
    this.#record(actor, "registerSupplierInvoice", record.id);
    return clone(record);
  }

  createSalesInvoice(input: SalesInvoiceInput, actor: string = DEFAULT_ACTOR): SalesInvoice {
    assertObject(input, "createSalesInvoice input");
    assertFields(input, SALES_INVOICE_FIELDS, "createSalesInvoice input");
    assertActor(actor);

    const customer = findCustomer(input.customer);
    if (!Array.isArray(input.lines) || input.lines.length === 0) {
      throw new ApiError("lines must be a list with at least one invoice line.");
    }

    const lines: SalesLine[] = input.lines.map((raw, index) => {
      const n = index + 1;
      assertObject(raw, `Invoice line ${n}`);
      assertFields(raw, SALES_LINE_FIELDS, `invoice line ${n}`);
      assertText(raw.description, `Line ${n} description`);
      assertMinor(raw.quantityMilli, `Line ${n} quantityMilli (thousandths: 12,5 hours is 12500)`, { positive: true });
      assertMinor(raw.unitPriceMinor, `Line ${n} unitPriceMinor (øre)`, { positive: false });
      const vat = findVatCode(raw.vatCode);
      const netMinor = Math.round((raw.quantityMilli * raw.unitPriceMinor) / 1000);
      if (!Number.isSafeInteger(netMinor)) throw new ApiError(`Line ${n} is too large to represent exactly.`);
      const vatMinor = Math.round((netMinor * vat.percent) / 100);
      return {
        description: raw.description,
        quantityMilli: raw.quantityMilli,
        unitPriceMinor: raw.unitPriceMinor,
        vatCode: vat.code,
        netMinor,
        vatMinor,
      };
    });

    const netMinor = lines.reduce((sum, line) => sum + line.netMinor, 0);
    const vatMinor = lines.reduce((sum, line) => sum + line.vatMinor, 0);
    const record: SalesInvoice = {
      id: `inv-${this.#salesInvoices.length + 1}`,
      customer: customer.number,
      customerName: customer.name,
      lines,
      netMinor,
      vatMinor,
      grossMinor: netMinor + vatMinor,
      status: "draft",
      created: true,
      actor,
    };
    this.#salesInvoices.push(record);
    this.#record(actor, "createSalesInvoice", record.id);
    return clone(record);
  }

  /** A deep, JSON-safe copy of everything stored. Changing it changes nothing here. */
  state(): LedgerState {
    return clone({
      vouchers: this.#vouchers,
      supplierInvoices: this.#supplierInvoices,
      salesInvoices: this.#salesInvoices,
      audit: this.#audit,
    });
  }

  #record(actor: string, action: string, id: string): void {
    this.#clock += 1;
    this.#audit.push({ at: this.#clock, actor, action, id });
  }
}
