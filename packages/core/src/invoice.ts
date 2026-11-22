import { BookiError, msg } from "./msg.js";

/**
 * VAT category, using the EN 16931 / Peppol codes:
 * `S` standard, `Z` zero rated, `E` exempt, `AE` reverse charge, `K` intra-community.
 */
export type TaxCategory = "S" | "Z" | "E" | "AE" | "K";

export const TAX_CATEGORIES: readonly TaxCategory[] = ["S", "Z", "E", "AE", "K"];

export type InvoiceLine = {
  id: string;
  description: string;
  /** Quantity in thousandths, so 1.5 hours is 1500. Whole number. */
  quantityMilli: number;
  /** Price for one unit, excluding tax, in minor units. */
  unitPriceMinor: number;
  /** Discount in basis points: 1000 is 10%. */
  discountBp?: number;
  taxCategory: TaxCategory;
  /** Tax rate in basis points: 2500 is 25%. Must be 0 unless the category is `S`. */
  taxRateBp: number;
};

/**
 * - `draft`: can be edited.
 * - `finalized`: has a number and is fixed. Correct it with a credit note.
 * - `paid` / `void`: closed.
 */
export type InvoiceStatus = "draft" | "finalized" | "paid" | "void";

export type Invoice = {
  id: string;
  kind: "invoice" | "credit-note";
  status: InvoiceStatus;
  /** Set when finalized. */
  number?: string;
  currency: string;
  lines: InvoiceLine[];
  /** The customer's VAT number. Required for reverse charge. */
  customerTaxId?: string;
  /** For a credit note: the id of the invoice it corrects. */
  creditOf?: string;
};

export type InvoiceTaxGroup = {
  taxCategory: TaxCategory;
  taxRateBp: number;
  netMinor: number;
  taxMinor: number;
};

export type InvoiceTotals = {
  netMinor: number;
  taxMinor: number;
  grossMinor: number;
  /** Tax is worked out per category and rate on the group's net, then summed. */
  groups: InvoiceTaxGroup[];
};

/** Round half away from zero, on exact integer arithmetic. */
function divRound(numerator: bigint, denominator: bigint): number {
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const rounded = (abs * 2n + denominator) / (denominator * 2n);
  return Number(negative ? -rounded : rounded);
}

function whole(value: unknown, what: string, lineId: string, min = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) {
    throw new BookiError("invoice.line-whole", { id: String(lineId), what, min, value: String(value) });
  }
  return value;
}

/** Check one line and return it. Throws with a sentence that says what to fix. */
export function validateInvoiceLine(line: InvoiceLine): InvoiceLine {
  whole(line.quantityMilli, msg("invoice.what.quantity"), line.id, 1);
  whole(line.unitPriceMinor, msg("invoice.what.unit-price"), line.id);
  const discount = whole(line.discountBp ?? 0, msg("invoice.what.discount"), line.id);
  if (discount > 10_000) throw new BookiError("invoice.discount-too-high", { id: String(line.id) });
  if (!TAX_CATEGORIES.includes(line.taxCategory)) {
    throw new BookiError("invoice.unknown-tax-category", {
      id: String(line.id),
      category: String(line.taxCategory),
      categories: TAX_CATEGORIES.join(", "),
    });
  }
  whole(line.taxRateBp, msg("invoice.what.tax-rate"), line.id);
  if (line.taxCategory !== "S" && line.taxRateBp !== 0) {
    throw new BookiError("invoice.category-no-tax", { id: String(line.id), category: line.taxCategory });
  }
  if (line.taxCategory === "S" && line.taxRateBp === 0) {
    throw new BookiError("invoice.standard-needs-rate", { id: String(line.id) });
  }
  return line;
}

/** Net for one line: quantity × price, less the discount, in minor units. */
export function lineNetMinor(line: InvoiceLine): number {
  validateInvoiceLine(line);
  const gross = BigInt(line.quantityMilli) * BigInt(line.unitPriceMinor);
  const keep = BigInt(10_000 - (line.discountBp ?? 0));
  return divRound(gross * keep, 1000n * 10_000n);
}

/** Totals computed from the lines. A total is never typed in. */
export function invoiceTotals(lines: InvoiceLine[]): InvoiceTotals {
  const groups = new Map<string, InvoiceTaxGroup>();
  for (const line of lines) {
    const key = `${line.taxCategory}:${line.taxRateBp}`;
    const group = groups.get(key) ?? {
      taxCategory: line.taxCategory,
      taxRateBp: line.taxRateBp,
      netMinor: 0,
      taxMinor: 0,
    };
    group.netMinor += lineNetMinor(line);
    groups.set(key, group);
  }
  const list = [...groups.values()].map((group) => ({
    ...group,
    taxMinor: divRound(BigInt(group.netMinor) * BigInt(group.taxRateBp), 10_000n),
  }));
  const netMinor = list.reduce((sum, group) => sum + group.netMinor, 0);
  const taxMinor = list.reduce((sum, group) => sum + group.taxMinor, 0);
  return { netMinor, taxMinor, grossMinor: netMinor + taxMinor, groups: list };
}

/** Throws unless the invoice is a draft. A fixed invoice is corrected by credit note. */
export function assertEditable(invoice: Invoice): void {
  if (invoice.status !== "draft") {
    const params = { number: String(invoice.number ?? invoice.id), status: invoice.status };
    if (invoice.kind === "credit-note") throw new BookiError("invoice.credit-note-locked", params);
    throw new BookiError("invoice.locked", params);
  }
}

/** Gross still open on an invoice after the credit notes already issued against it. */
export function creditableMinor(original: Invoice, creditNotes: Invoice[]): number {
  const credited = creditNotes
    .filter((note) => note.creditOf === original.id && note.status !== "draft" && note.status !== "void")
    .reduce((sum, note) => sum + invoiceTotals(note.lines).grossMinor, 0);
  return invoiceTotals(original.lines).grossMinor - credited;
}

/**
 * Everything that stops an invoice from being finalized, as sentences.
 * `others` is the rest of the ledger: needed to check a credit note against
 * the invoice it corrects.
 */
export function invoiceIssues(invoice: Invoice, others: Invoice[] = []): string[] {
  const issues: string[] = [];
  if (invoice.lines.length === 0) issues.push(msg("invoice.no-lines"));
  for (const line of invoice.lines) {
    try {
      validateInvoiceLine(line);
    } catch (error) {
      issues.push((error as Error).message);
    }
  }
  if (issues.length > 0) return issues;
  if (invoice.lines.some((line) => line.taxCategory === "AE" || line.taxCategory === "K")) {
    if (!invoice.customerTaxId?.trim()) {
      issues.push(msg("invoice.customer-vat-number"));
    }
  }
  if (invoice.kind === "credit-note") {
    const original = others.find((item) => item.id === invoice.creditOf);
    if (!invoice.creditOf) {
      issues.push(msg("invoice.credit-note-needs-original"));
    } else if (!original) {
      issues.push(msg("invoice.credit-note-original-missing", { id: invoice.creditOf }));
    } else if (original.kind !== "invoice" || original.status === "draft" || original.status === "void") {
      issues.push(msg("invoice.original-not-creditable", { id: invoice.creditOf, status: original.status }));
    } else {
      const open = creditableMinor(
        original,
        others.filter((item) => item.id !== invoice.id),
      );
      const gross = invoiceTotals(invoice.lines).grossMinor;
      if (gross > open) {
        issues.push(msg("invoice.credit-too-large", { gross, open, number: String(original.number ?? original.id) }));
      }
    }
  } else if (invoice.creditOf) {
    issues.push(msg("invoice.only-credit-note-points"));
  }
  return issues;
}

/** Fix an invoice under a number. Throws while it has issues or is not a draft. */
export function finalizeInvoice(invoice: Invoice, number: string, others: Invoice[] = []): Invoice {
  assertEditable(invoice);
  const issues = invoiceIssues(invoice, others);
  if (issues.length > 0) throw new BookiError("invoice.not-ready", { issues });
  const value = String(number ?? "").trim();
  if (value === "") throw new BookiError("invoice.number-required");
  if (others.some((item) => item.id !== invoice.id && item.number === value)) {
    throw new BookiError("invoice.number-used", { number: value });
  }
  return { ...invoice, status: "finalized", number: value };
}

/** A draft credit note for a finalized or paid invoice. Defaults to crediting every line. */
export function draftCreditNote(original: Invoice, id: string, lines: InvoiceLine[] = original.lines): Invoice {
  if (original.kind !== "invoice") throw new BookiError("invoice.only-invoice-creditable");
  if (original.status === "draft" || original.status === "void") {
    throw new BookiError("invoice.nothing-to-credit", {
      number: String(original.number ?? original.id),
      status: original.status,
    });
  }
  return {
    id,
    kind: "credit-note",
    status: "draft",
    currency: original.currency,
    lines: lines.map((line) => ({ ...line })),
    creditOf: original.id,
    ...(original.customerTaxId ? { customerTaxId: original.customerTaxId } : {}),
  };
}

/** The names a line's fields may go by, and how each reaches the stored unit. */
const LINE_FIELDS: Record<string, { field: keyof InvoiceLine; scale?: number }> = {
  description: { field: "description" },
  text: { field: "description" },
  quantity: { field: "quantityMilli", scale: 1000 },
  qty: { field: "quantityMilli", scale: 1000 },
  quantityMilli: { field: "quantityMilli" },
  unitPriceMinor: { field: "unitPriceMinor" },
  priceMinor: { field: "unitPriceMinor" },
  taxRate: { field: "taxRateBp", scale: 100 },
  vatRate: { field: "taxRateBp", scale: 100 },
  taxPercent: { field: "taxRateBp", scale: 100 },
  taxRateBp: { field: "taxRateBp" },
  taxCategory: { field: "taxCategory" },
  category: { field: "taxCategory" },
  discountPercent: { field: "discountBp", scale: 100 },
  discount: { field: "discountBp", scale: 100 },
  discountBp: { field: "discountBp" },
};

// A blank string is not zero: "" for a tax rate must be refused, not read as zero-rated.
const number = (value: unknown) =>
  typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== ""
      ? Number(value.trim().replace(/\s/g, "").replace(",", "."))
      : NaN;

/**
 * A line's fields from an object written the way a person or an agent would:
 * `{ description: "Rådgivning", quantity: 12.5, unitPriceMinor: 145000, taxRate: 25 }`.
 * Quantity in units or `quantityMilli`, rates and discounts in percent or basis
 * points; money stays in minor units, as everywhere in Booki. With a rate and
 * no category, the category follows the rate (S above 0, Z at 0). An unknown
 * field is refused with the list of the ones that exist, so nothing is lost
 * without a word.
 */
export function invoiceLineFields(input: unknown, id = "new"): Partial<InvoiceLine> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new BookiError("invoice.line-shape", { id });
  }
  const out: Partial<Record<keyof InvoiceLine, unknown>> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (key === "id" || value === undefined) continue;
    const spec = LINE_FIELDS[key];
    if (!spec) throw new BookiError("invoice.line-unknown-field", { id, field: key });
    if (spec.field === "description" || spec.field === "taxCategory") {
      out[spec.field] = String(value).trim();
      continue;
    }
    const n = number(value);
    if (!Number.isFinite(n))
      throw new BookiError("invoice.line-not-a-number", { id, field: key, value: String(value) });
    out[spec.field] = spec.scale ? Math.round(n * spec.scale) : n;
  }
  if (out.taxRateBp !== undefined && out.taxCategory === undefined) {
    out.taxCategory = (out.taxRateBp as number) > 0 ? "S" : "Z";
  }
  return out as Partial<InvoiceLine>;
}
