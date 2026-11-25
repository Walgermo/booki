import type { SupplierInvoice, SupplierInvoiceField, SupplierInvoiceFields } from "@booki-aui/core/supplier-invoice";

/**
 * A made-up Norwegian company's week of supplier invoices. Account numbers and
 * KIDs pass their check digits; none of them belong to anyone.
 */

export const COMPANY = { name: "Nordlys Kontor AS", account: "15034277165", currency: "NOK" };

/** The chart the inbox codes against: Norwegian standard accounts. */
export const CHART = [
  { number: "6340", name: "Lys, varme" },
  { number: "6540", name: "Inventar" },
  { number: "6720", name: "Honorar for IT-tjenester" },
  { number: "6800", name: "Kontorrekvisita" },
  { number: "7770", name: "Bank- og kortgebyrer" },
];

export const VALUE_DATE = "2026-11-25";

type Raw = {
  supplierName: string;
  supplierOrgNumber: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  netMinor: number;
  taxMinor: number;
  paymentReference: string;
};

/** Every field as read from the document, sure of all but those named. */
function read(raw: Raw, unsure: Partial<Record<SupplierInvoiceField, number>> = {}): SupplierInvoiceFields {
  const values: Record<SupplierInvoiceField, string | number> = {
    ...raw,
    grossMinor: raw.netMinor + raw.taxMinor,
    currency: "NOK",
  };
  return Object.fromEntries(
    Object.entries(values).map(([field, value]) => [
      field,
      { value, confidence: unsure[field as SupplierInvoiceField] ?? 0.98 },
    ]),
  ) as SupplierInvoiceFields;
}

export function seedInvoices(): SupplierInvoice[] {
  return [
    {
      id: "si-1",
      status: "new",
      document: { id: "doc-1", fileName: "kontorrekvisita-2026-1101.pdf" },
      bankAccount: "15034134623",
      fields: read({
        supplierName: "Kontorrekvisita AS",
        supplierOrgNumber: "923609016",
        invoiceNumber: "2026-1101",
        invoiceDate: "2026-11-02",
        dueDate: "2026-11-25",
        netMinor: 124_000,
        taxMinor: 31_000,
        paymentReference: "20261101008",
      }),
    },
    {
      id: "si-2",
      status: "new",
      document: { id: "doc-2", fileName: "renhold-oktober.pdf" },
      bankAccount: "15034174218",
      fields: read({
        supplierName: "Fjord Renhold AS",
        supplierOrgNumber: "914778271",
        invoiceNumber: "R-88412",
        invoiceDate: "2026-11-01",
        dueDate: "2026-11-25",
        netMinor: 1_500_000,
        taxMinor: 375_000,
        paymentReference: "20261102378",
      }),
    },
    {
      // The same invoice as si-1, scanned twice.
      id: "si-3",
      status: "new",
      document: { id: "doc-3", fileName: "kontorrekvisita-2026-1101 (1).pdf" },
      bankAccount: "15034134623",
      fields: read({
        supplierName: "Kontorrekvisita AS",
        supplierOrgNumber: "923609016",
        invoiceNumber: "2026-1101",
        invoiceDate: "2026-11-02",
        dueDate: "2026-11-25",
        netMinor: 124_000,
        taxMinor: 31_000,
        paymentReference: "20261101008",
      }),
    },
    {
      // A blurry scan: the KID must be looked at before anyone approves it.
      id: "si-4",
      status: "new",
      document: { id: "doc-4", fileName: "fjordit-support.pdf" },
      bankAccount: "15034237570",
      fields: read(
        {
          supplierName: "Fjord IT AS",
          supplierOrgNumber: "912345674",
          invoiceNumber: "FIT-2207",
          invoiceDate: "2026-11-03",
          dueDate: "2026-11-25",
          netMinor: 360_000,
          taxMinor: 90_000,
          paymentReference: "20261103749",
        },
        { paymentReference: 0.61 },
      ),
    },
  ];
}
