import { invoiceIssues, invoiceTotals, type Invoice, type InvoiceTotals } from "@booki/core/invoice";
import type { AccountOption } from "@booki/core/voucher";
import { AccountPicker, InvoiceEditor } from "@booki/react";
import { Button } from "@ui-sdk/react/button";
import { useEffect, useRef, useState } from "react";

import { setStepPolicy } from "@/agent";

/**
 * The new order/invoice screen on Booki: a customer picker and the
 * InvoiceEditor. An agent may draft the lines and create the order when the
 * draft has no issues; finalizing the invoice (it gets its number and is
 * fixed) stays a person's button inside the editor. Same customers as the
 * replica, in the same order.
 */

const CUSTOMERS: AccountOption[] = [
  { number: "10002", name: "Havblikk Hotell AS" },
  { number: "10003", name: "Brattvoll Bygg AS" },
  { number: "10001", name: "Brattli AS" },
  { number: "10004", name: "Brattli Eiendom AS" },
  { number: "10005", name: "Sjøkanten Kafé AS" },
];

const EMPTY: Invoice = { id: "ordre-1", kind: "invoice", status: "draft", currency: "NOK", lines: [] };

export type BookiSalesInvoiceState = {
  customer: string;
  invoice: Invoice;
  totals: InvoiceTotals | null;
  created: boolean;
  createdBy: string;
};

const safeTotals = (invoice: Invoice) => {
  try {
    return invoiceTotals(invoice.lines);
  } catch {
    return null;
  }
};

export function BookiSalesInvoice() {
  const [customer, setCustomer] = useState(CUSTOMERS[0]!.number);
  const [invoice, setInvoice] = useState<Invoice>(EMPTY);
  const [created, setCreated] = useState(false);
  const [createdBy, setCreatedBy] = useState("");
  const latest = useRef(invoice);
  latest.current = invoice;
  const grantedBy = useRef<string | null>(null);

  useEffect(
    () =>
      setStepPolicy(() => {
        // Creating a draft order is reversible: allowed when the draft has no issues.
        const ok = latest.current.lines.length > 0 && invoiceIssues(latest.current).length === 0;
        grantedBy.current = ok ? "agent: utkastet har ingen feil" : null;
        return ok ? true : undefined;
      }),
    [],
  );

  // For the benchmark's end-state checks only.
  (window as unknown as { __accSalesInvoice?: BookiSalesInvoiceState }).__accSalesInvoice = {
    customer,
    invoice,
    totals: safeTotals(invoice),
    created,
    createdBy,
  };

  return (
    <div className="acc-invoice">
      <h1 className="mt-0 text-xl font-semibold">Ny ordre</h1>
      <AccountPicker accounts={CUSTOMERS} value={customer} onValueChange={setCustomer} aria-label="Kunde" />
      <InvoiceEditor invoice={invoice} onInvoiceChange={setInvoice} nextNumber="10421" aria-label="Ordrelinjer" />
      <Button
        type="button"
        disabled={created}
        data-agent-confirm="Oppretter ordren"
        onClick={() => {
          setCreatedBy(grantedBy.current ?? "person");
          grantedBy.current = null;
          setCreated(true);
        }}
      >
        Opprett ordre
      </Button>
      <output>{created ? `Ordren er opprettet av ${createdBy}.` : ""}</output>
    </div>
  );
}
