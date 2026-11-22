import { supplierInvoiceIssues, type SupplierInvoice } from "@booki/core/supplier-invoice";
import { SupplierInvoiceInbox } from "@booki/react";
import { useState } from "react";

import { BOOKED, INBOX, INBOX_ACCOUNTS, toSupplierInvoice } from "./workflow-data";

/**
 * The supplier-invoice inbox on Booki: the same eight invoices as the replica,
 * read from documents, with how sure each reading was. An agent may correct
 * or confirm a field, propose the coding and ask whether an invoice can be
 * approved. Approving for posting and rejecting are a person's buttons in
 * SupplierInvoiceInbox, not agent actions, so the agent's part ends with the
 * inbox ready for the person. The invoice already booked in September is
 * passed as `booked`, so the copy in the inbox is flagged.
 */

const CHART = INBOX_ACCOUNTS.map((a) => a.number);
const BOOKED_LIST = [
  {
    id: BOOKED.id,
    supplierName: BOOKED.supplier,
    supplierOrgNumber: BOOKED.orgNumber,
    invoiceNumber: BOOKED.invoiceNumber,
  },
];

export type BookiInboxState = {
  invoices: SupplierInvoice[];
  issues: Record<string, string[]>;
  decided: string[];
};

export function BookiInbox() {
  const [invoices, setInvoices] = useState<SupplierInvoice[]>(() => INBOX.map(toSupplierInvoice));

  // For the benchmark's end-state checks only.
  const context = { inbox: invoices, booked: BOOKED_LIST, chart: CHART };
  (window as unknown as { __accInbox?: BookiInboxState }).__accInbox = {
    invoices,
    issues: Object.fromEntries(invoices.map((invoice) => [invoice.id, supplierInvoiceIssues(invoice, context)])),
    decided: invoices.filter((invoice) => !["new", "coded"].includes(invoice.status)).map((invoice) => invoice.id),
  };

  return (
    <div className="acc-invoice">
      <h1 className="mt-0 text-xl font-semibold">Leverandørfakturaer</h1>
      <SupplierInvoiceInbox
        invoices={invoices}
        onInvoicesChange={setInvoices}
        booked={BOOKED_LIST}
        chart={CHART}
        actor="kari"
        aria-label="Innboks"
      />
      <p className="m-0 text-sm text-muted-foreground">Godkjenning for bokføring og avvisning gjør en person.</p>
    </div>
  );
}
