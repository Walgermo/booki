import type { SupplierInvoice } from "@booki/core/supplier-invoice";

/**
 * The company's rule for what the agent may approve on its own. The same
 * function runs in the inbox (its `rule` option) and on the server, which
 * decides: the screen's answer is only a preview.
 *
 * Returns true, or the reason it does not apply.
 */
export const RULE_NAME = "små-faste";

const KNOWN_SUPPLIERS = new Set(["923609016" /* Kontorrekvisita AS */]);
const LIMIT_MINOR = 500_000; // 5 000,00 kr

export function smallKnownSupplier(invoice: SupplierInvoice): true | string {
  if (!KNOWN_SUPPLIERS.has(String(invoice.fields.supplierOrgNumber.value))) {
    return "Bare faste leverandører kan godkjennes etter regelen.";
  }
  if (invoice.fields.grossMinor.value > LIMIT_MINOR) return "Over 5 000 kr: en person attesterer.";
  if (!invoice.coding?.account) return "Fakturaen er ikke kontert.";
  return true;
}
