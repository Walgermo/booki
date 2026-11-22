// @vitest-environment node
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AmountField } from "./amount-field.js";
import { BookiLocaleProvider } from "./locale.js";
import { PaymentBatch } from "./payment-batch.js";
import { SupplierInvoiceInbox } from "./supplier-invoice-inbox.js";
import { VoucherComposer } from "./voucher-composer.js";

// No DOM here: a control that touches window or document while rendering fails.
describe("server rendering", () => {
  it("renders the controls to HTML without a DOM", () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined");
    const html = renderToString(
      <BookiLocaleProvider defaultCountry="NO">
        <AmountField defaultValue={125_000} />
        <VoucherComposer />
        <PaymentBatch
          defaultBatch={{
            id: "b",
            status: "draft",
            debitAccount: "1503 40 12345",
            valueDate: "2026-02-01",
            currency: "NOK",
            preparedBy: "nina",
            approvals: [],
            items: [],
          }}
        />
        <SupplierInvoiceInbox defaultInvoices={[]} />
      </BookiLocaleProvider>,
    );
    expect(html).toContain('data-slot="amount-field"');
    expect(html).toContain('data-slot="voucher-composer"');
    expect(html).toContain('data-slot="payment-batch"');
    expect(html).toContain('data-slot="supplier-invoice-inbox"');
  });
});
