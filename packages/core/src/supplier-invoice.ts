import { BookiError, msg } from "./msg.js";

/** The fields read off a supplier's invoice document. */
export const SUPPLIER_INVOICE_FIELDS = [
  "supplierName",
  "supplierOrgNumber",
  "invoiceNumber",
  "invoiceDate",
  "dueDate",
  "netMinor",
  "taxMinor",
  "grossMinor",
  "currency",
  "paymentReference",
] as const;

export type SupplierInvoiceField = (typeof SUPPLIER_INVOICE_FIELDS)[number];

const AMOUNT_FIELDS = ["netMinor", "taxMinor", "grossMinor"] as const;
type AmountField = (typeof AMOUNT_FIELDS)[number];
const DATE_FIELDS = ["invoiceDate", "dueDate"] as const;

/** One value read from the document, with how sure the extraction was. */
export type ExtractedField<T> = {
  value: T;
  /** 0 to 1. Below the threshold the value must be confirmed or corrected. */
  confidence: number;
  /** Who looked at the value and said it is right. */
  confirmedBy?: string;
  /** Who replaced the extracted value. */
  correctedBy?: string;
};

export type SupplierInvoiceFields = {
  [K in SupplierInvoiceField]: ExtractedField<K extends AmountField ? number : string>;
};

export type SupplierInvoiceCoding = {
  /** Ledger account the cost is booked on. */
  account: string;
  vatCode?: string;
  dimensions?: Record<string, string>;
};

/** `new` → `coded` → `approved` → `posted`, or `rejected` from `new` or `coded`. */
export type SupplierInvoiceStatus = "new" | "coded" | "approved" | "posted" | "rejected";

export type SupplierInvoice = {
  id: string;
  status: SupplierInvoiceStatus;
  /** Amounts are whole minor units. `paymentReference` (KID, memo) is secret. */
  fields: SupplierInvoiceFields;
  /** The document the fields were read from. */
  document: { id: string; fileName?: string; page?: number };
  /** The supplier's bank account as read from the document. Secret. */
  bankAccount?: string;
  coding?: SupplierInvoiceCoding;
  approvedBy?: string;
  /** ISO timestamp. */
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  /**
   * An agent's proposal to reject, for example a second copy. It changes
   * nothing by itself: a person reads the reason and rejects, or keeps it.
   */
  proposedRejection?: { reason: string; by: string; at: string };
};

/** An invoice that is already in the ledger. Used to catch a second copy. */
export type BookedSupplierInvoice = {
  id: string;
  supplierName?: string;
  supplierOrgNumber?: string;
  invoiceNumber: string;
};

export type SupplierInvoiceContext = {
  /** The other invoices in the inbox (the invoice itself is skipped by id). */
  inbox?: SupplierInvoice[];
  /** Invoices already booked. */
  booked?: BookedSupplierInvoice[];
  /** A field below this confidence must be confirmed or corrected. Defaults to 0.8. */
  threshold?: number;
  /** Account numbers that may be coded on. Any account is accepted when left out. */
  chart?: string[];
};

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;

const FIELD_LIST = SUPPLIER_INVOICE_FIELDS.join(", ");

function isField(field: unknown): field is SupplierInvoiceField {
  return (SUPPLIER_INVOICE_FIELDS as readonly string[]).includes(String(field));
}

function isIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

/** Throws unless the invoice can still be changed. */
export function assertSupplierInvoiceEditable(invoice: SupplierInvoice): void {
  if (invoice.status === "approved" || invoice.status === "posted" || invoice.status === "rejected") {
    throw new BookiError("supplier-invoice.locked", { id: String(invoice.id), status: invoice.status });
  }
}

function checkedValue(invoiceId: string, field: SupplierInvoiceField, value: unknown): string | number {
  if ((AMOUNT_FIELDS as readonly string[]).includes(field)) {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || (field !== "taxMinor" && value < 0)) {
      throw new BookiError("supplier-invoice.field-amount", {
        id: String(invoiceId),
        field,
        value: String(JSON.stringify(value)),
      });
    }
    return value;
  }
  const text = typeof value === "string" ? value.trim() : "";
  if ((DATE_FIELDS as readonly string[]).includes(field)) {
    if (!isIsoDate(text)) {
      throw new BookiError("supplier-invoice.field-date", {
        id: String(invoiceId),
        field,
        value: String(JSON.stringify(value)),
      });
    }
    return text;
  }
  if (field === "currency") {
    if (!/^[A-Z]{3}$/.test(text)) {
      throw new BookiError("supplier-invoice.field-currency", {
        id: String(invoiceId),
        value: String(JSON.stringify(value)),
      });
    }
    return text;
  }
  if (typeof value !== "string") {
    throw new BookiError("supplier-invoice.field-text", {
      id: String(invoiceId),
      field,
      value: String(JSON.stringify(value)),
    });
  }
  if (text === "" && (field === "supplierName" || field === "invoiceNumber")) {
    throw new BookiError("supplier-invoice.field-empty", { id: String(invoiceId), field });
  }
  return text;
}

function who(by: string, what: string): string {
  const id = String(by ?? "").trim();
  if (id === "") throw new BookiError("supplier-invoice.actor-required", { what });
  return id;
}

function fieldOf(invoice: SupplierInvoice, field: unknown): SupplierInvoiceField {
  if (!isField(field)) {
    throw new BookiError("supplier-invoice.no-field", {
      id: String(invoice.id),
      field: String(field),
      fields: FIELD_LIST,
    });
  }
  return field;
}

/** Replace an extracted value. The field then counts as reviewed, by `by`. */
export function correctField(
  invoice: SupplierInvoice,
  field: SupplierInvoiceField,
  value: string | number,
  by: string,
): SupplierInvoice {
  assertSupplierInvoiceEditable(invoice);
  const key = fieldOf(invoice, field);
  const next = checkedValue(invoice.id, key, value);
  const { confirmedBy: _dropped, ...current } = invoice.fields[key];
  return {
    ...invoice,
    fields: {
      ...invoice.fields,
      [key]: { ...current, value: next, correctedBy: who(by, msg("supplier-invoice.what.correction")) },
    },
  };
}

/** Say that an extracted value is right as it stands. */
export function confirmField(invoice: SupplierInvoice, field: SupplierInvoiceField, by: string): SupplierInvoice {
  assertSupplierInvoiceEditable(invoice);
  const key = fieldOf(invoice, field);
  return {
    ...invoice,
    fields: {
      ...invoice.fields,
      [key]: { ...invoice.fields[key], confirmedBy: who(by, msg("supplier-invoice.what.confirmation")) },
    },
  };
}

/** Fields whose confidence is below the threshold and that nobody confirmed or corrected. */
export function fieldsNeedingReview(
  invoice: SupplierInvoice,
  threshold = DEFAULT_CONFIDENCE_THRESHOLD,
): SupplierInvoiceField[] {
  return SUPPLIER_INVOICE_FIELDS.filter((field) => {
    const entry = invoice.fields[field];
    return entry.confidence < threshold && !entry.confirmedBy && !entry.correctedBy;
  });
}

/** Set the proposed coding. A new invoice becomes `coded`. */
export function proposeCoding(
  invoice: SupplierInvoice,
  coding: SupplierInvoiceCoding,
  chart?: string[],
): SupplierInvoice {
  assertSupplierInvoiceEditable(invoice);
  const account = String(coding?.account ?? "").trim();
  if (account === "") throw new BookiError("supplier-invoice.coding-account-required", { id: String(invoice.id) });
  if (chart && !chart.includes(account)) {
    throw new BookiError("supplier-invoice.coding-unknown-account", {
      id: String(invoice.id),
      account,
      accounts: chart.join(", ") || msg("word.none"),
    });
  }
  const vatCode = String(coding.vatCode ?? "").trim();
  const dimensions = coding.dimensions;
  if (
    dimensions !== undefined &&
    (typeof dimensions !== "object" || dimensions === null || Array.isArray(dimensions))
  ) {
    throw new BookiError("supplier-invoice.coding-dimensions", { id: String(invoice.id) });
  }
  return {
    ...invoice,
    status: "coded",
    coding: {
      account,
      ...(vatCode ? { vatCode } : {}),
      ...(dimensions && Object.keys(dimensions).length > 0 ? { dimensions: { ...dimensions } } : {}),
    },
  };
}

const norm = (text: string | undefined) =>
  String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
const digits = (text: string | undefined) =>
  String(text ?? "")
    .replace(/[^0-9a-z]/gi, "")
    .toLowerCase();

function sameSupplier(a: { name?: string; org?: string }, b: { name?: string; org?: string }): boolean {
  if (digits(a.org) !== "" && digits(b.org) !== "") return digits(a.org) === digits(b.org);
  return norm(a.name) !== "" && norm(a.name) === norm(b.name);
}

/**
 * Ids of other invoices with the same supplier and invoice number: in the
 * inbox (rejected ones do not count) and among the booked invoices.
 * Suppliers match on organisation number when both have one, else on name.
 */
export function duplicatesOf(invoice: SupplierInvoice, context: SupplierInvoiceContext = {}): string[] {
  const number = norm(invoice.fields.invoiceNumber.value);
  if (number === "") return [];
  const self = { name: invoice.fields.supplierName.value, org: invoice.fields.supplierOrgNumber.value };
  const ids: string[] = [];
  for (const other of context.inbox ?? []) {
    if (other.id === invoice.id || other.status === "rejected") continue;
    if (norm(other.fields.invoiceNumber.value) !== number) continue;
    if (sameSupplier(self, { name: other.fields.supplierName.value, org: other.fields.supplierOrgNumber.value })) {
      ids.push(other.id);
    }
  }
  for (const other of context.booked ?? []) {
    if (other.id === invoice.id || norm(other.invoiceNumber) !== number) continue;
    if (sameSupplier(self, { name: other.supplierName, org: other.supplierOrgNumber })) ids.push(other.id);
  }
  return ids;
}

/** Everything that stops an invoice from being approved, as sentences. */
export function supplierInvoiceIssues(invoice: SupplierInvoice, context: SupplierInvoiceContext = {}): string[] {
  const issues: string[] = [];
  const f = invoice.fields;
  for (const field of AMOUNT_FIELDS) {
    if (!Number.isSafeInteger(f[field].value)) {
      issues.push(msg("supplier-invoice.amount-issue", { field, value: String(f[field].value) }));
    }
  }
  if (issues.length === 0 && f.netMinor.value + f.taxMinor.value !== f.grossMinor.value) {
    issues.push(
      msg("supplier-invoice.totals-mismatch", {
        net: String(f.netMinor.value),
        tax: String(f.taxMinor.value),
        sum: String(f.netMinor.value + f.taxMinor.value),
        gross: String(f.grossMinor.value),
      }),
    );
  }
  if (norm(f.supplierName.value) === "") issues.push(msg("supplier-invoice.supplier-name-missing"));
  if (norm(f.invoiceNumber.value) === "") issues.push(msg("supplier-invoice.invoice-number-missing"));
  for (const field of DATE_FIELDS) {
    if (!isIsoDate(String(f[field].value)))
      issues.push(msg("supplier-invoice.date-issue", { field, value: String(f[field].value) }));
  }
  if (isIsoDate(f.invoiceDate.value) && isIsoDate(f.dueDate.value) && f.dueDate.value < f.invoiceDate.value) {
    issues.push(msg("supplier-invoice.due-before-invoice", { due: f.dueDate.value, invoiceDate: f.invoiceDate.value }));
  }
  const duplicates = duplicatesOf(invoice, context);
  if (duplicates.length > 0) {
    issues.push(
      msg("supplier-invoice.duplicate", {
        number: String(f.invoiceNumber.value),
        supplier: f.supplierName.value || msg("supplier-invoice.this-supplier"),
        othersAndList: duplicates.map((id) => `"${id}"`),
      }),
    );
  }
  const review = fieldsNeedingReview(invoice, context.threshold ?? DEFAULT_CONFIDENCE_THRESHOLD);
  if (review.length > 0) {
    issues.push(
      msg("supplier-invoice.low-confidence", {
        fields: review.join(", "),
        threshold: context.threshold ?? DEFAULT_CONFIDENCE_THRESHOLD,
      }),
    );
  }
  if (!invoice.coding) {
    issues.push(msg("supplier-invoice.no-coding"));
  } else if (context.chart && !context.chart.includes(invoice.coding.account)) {
    issues.push(msg("supplier-invoice.unknown-account", { account: invoice.coding.account }));
  }
  return issues;
}

/** Throws with every reason the invoice cannot be approved yet. */
export function assertApprovable(invoice: SupplierInvoice, context: SupplierInvoiceContext = {}): void {
  if (invoice.status !== "new" && invoice.status !== "coded") {
    throw new BookiError("supplier-invoice.already-decided", { id: String(invoice.id), status: invoice.status });
  }
  const issues = supplierInvoiceIssues(invoice, context);
  if (issues.length > 0) throw new BookiError("supplier-invoice.not-approvable", { id: String(invoice.id), issues });
}

/** A person approves the invoice for posting. After this it refuses edits. */
export function approveSupplierInvoice(
  invoice: SupplierInvoice,
  approverId: string,
  at: string,
  context: SupplierInvoiceContext = {},
): SupplierInvoice {
  const approver = who(approverId, msg("supplier-invoice.what.approval"));
  assertApprovable(invoice, context);
  return { ...invoice, status: "approved", approvedBy: approver, approvedAt: at };
}

/** A person turns the invoice down, with a reason. */
export function rejectSupplierInvoice(
  invoice: SupplierInvoice,
  rejectedBy: string,
  reason: string,
  at: string,
): SupplierInvoice {
  if (invoice.status !== "new" && invoice.status !== "coded") {
    throw new BookiError("supplier-invoice.not-rejectable", { id: String(invoice.id), status: invoice.status });
  }
  const by = who(rejectedBy, msg("supplier-invoice.what.rejection"));
  const why = String(reason ?? "").trim();
  if (why === "") throw new BookiError("supplier-invoice.reason-required", { id: String(invoice.id) });
  return { ...invoice, status: "rejected", rejectedBy: by, rejectedAt: at, rejectionReason: why };
}

/** The host marks an approved invoice as posted to the ledger. */
export function markSupplierInvoicePosted(invoice: SupplierInvoice): SupplierInvoice {
  if (invoice.status !== "approved") {
    throw new BookiError("supplier-invoice.not-postable", { id: String(invoice.id), status: invoice.status });
  }
  return { ...invoice, status: "posted" };
}

/** A supplier invoice without its payment reference and bank account. */
export type RedactedSupplierInvoice = Omit<SupplierInvoice, "fields" | "bankAccount"> & {
  fields: Omit<SupplierInvoiceFields, "paymentReference">;
  /** Whether a payment reference was read, and how sure, but never the value. */
  paymentReference: { present: boolean; confidence: number; reviewed: boolean };
  hasBankAccount: boolean;
};

/** What may be shown to an agent: everything but the payment reference and bank account. */
export function redactSupplierInvoice(invoice: SupplierInvoice): RedactedSupplierInvoice {
  const { fields, bankAccount, ...rest } = invoice;
  const { paymentReference, ...open } = fields;
  return {
    ...rest,
    fields: open,
    paymentReference: {
      present: String(paymentReference.value ?? "").trim() !== "",
      confidence: paymentReference.confidence,
      reviewed: Boolean(paymentReference.confirmedBy || paymentReference.correctedBy),
    },
    hasBankAccount: String(bankAccount ?? "").trim() !== "",
  };
}
