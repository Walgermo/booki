import type { SupplierInvoice } from "@booki-aui/core/supplier-invoice";

/**
 * The company's rule for what the agent may approve on its own. The same
 * function runs in the inbox (its `rule` option) and on the server, which
 * decides: the screen's answer is only a preview.
 *
 * Returns true, or the reason it does not apply.
 */
export const RULE_NAME = "små-faste";

/** A regular supplier is its organisation number and the bank account it is paid to, as registered. */
const KNOWN_SUPPLIERS = new Map([["923609016" /* Kontorrekvisita AS */, "15034134623"]]);
const LIMIT_MINOR = 500_000; // 5 000,00 kr

export function smallKnownSupplier(invoice: SupplierInvoice): true | string {
  // The bank account is the server's, never edited from a screen: a changed
  // organisation number alone does not make a supplier a regular one.
  if (KNOWN_SUPPLIERS.get(String(invoice.fields.supplierOrgNumber.value)) !== invoice.bankAccount) {
    return "Bare faste leverandører kan godkjennes etter regelen.";
  }
  if (invoice.fields.grossMinor.value > LIMIT_MINOR) return "Over 5 000 kr: en person attesterer.";
  if (!invoice.coding?.account) return "Fakturaen er ikke kontert.";
  return true;
}
