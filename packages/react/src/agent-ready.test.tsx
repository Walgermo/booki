import { buildBalancedSalesVoucher } from "@booki-aui/core/voucher";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AccountPicker } from "./account-picker.js";
import { AccountingPeriodSelect } from "./accounting-period-select.js";
import { AmountField } from "./amount-field.js";
import { AttestationStatus } from "./attestation-status.js";
import { createBookiAgent } from "./booki-agent.js";
import { ExceptionBanner } from "./exception-banner.js";
import { FinancialDateField } from "./financial-date-field.js";
import { BookiLocaleProvider } from "./locale.js";
import { InvoiceNumberInput } from "./invoice-number-input.js";
import { OrganizationNumberInput } from "./organization-number-input.js";
import { TaxCodeSelect } from "./tax-code-select.js";
import { VoucherComposer } from "./voucher-composer.js";

afterEach(() => {
  cleanup();
});

function PostingStrip() {
  const lines = buildBalancedSalesVoucher(
    {
      receivable: { number: "1500", name: "AR" },
      revenue: { number: "3000", name: "Sales" },
      taxPayable: { number: "2701", name: "VAT" },
    },
    { amountMinor: 100_00, taxPercent: 25 },
  );

  return (
    <BookiLocaleProvider defaultCountry="NO">
      <AmountField defaultValue={100_00} aria-label="Amount excl. tax" />
      <TaxCodeSelect value="MVA25" />
      <AccountPicker
        accounts={[
          { number: "3000", name: "Sales" },
          { number: "4000", name: "COGS" },
        ]}
        value="3000"
      />
      <OrganizationNumberInput value="974760673" />
      <InvoiceNumberInput value="INV-1001" />
      <FinancialDateField kind="due" value="2026-12-15" />
      <AccountingPeriodSelect value="2026-T6" />
      <AttestationStatus defaultValue="pending" />
      <VoucherComposer lines={lines} aria-label="Voucher lines" />
      <ExceptionBanner reason="Needs review" onReview={() => {}} />
    </BookiLocaleProvider>
  );
}

describe("agent-ready posting strip", () => {
  it("snapshots labeled finance primitives", () => {
    const agent = createBookiAgent({ agentId: "test" });
    render(<PostingStrip />);

    const components = agent.snapshot().filter((entry) => !entry.offPage && entry.component !== "more");

    for (const entry of components) {
      expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy();
    }

    const kinds = components.map((c) => c.component);
    expect(kinds).toContain("amount-field");
    expect(kinds).toContain("voucher-composer");
    expect(kinds).toContain("tax-code-select");
    expect(kinds).toContain("account-picker");
    expect(kinds).toContain("organization-number");
    expect(kinds).toContain("invoice-number");
    expect(kinds).toContain("financial-date");
    expect(kinds).toContain("accounting-period");
    expect(kinds).toContain("attestation-status");
  });

  it("acts setMinor and setTaxCode", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    render(<PostingStrip />);

    const amount = await agent.act({
      steps: [{ ref: "Amount excl. tax", action: "setMinor", args: [312_500] }],
    });
    expect(amount.ok).toBe(true);

    const tax = await agent.act({
      steps: [{ ref: "MVA", action: "setTaxCode", args: ["MVA15"] }],
    });
    expect(tax.ok).toBe(true);

    const balance = await agent.act({
      steps: [{ ref: "Voucher lines", action: "assertBalance", args: [] }],
    });
    expect(balance.ok).toBe(true);
  });

  it("acts invoice header domain actions", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    render(<PostingStrip />);

    const org = await agent.act({
      steps: [
        {
          ref: "Organisasjonsnummer",
          action: "setOrganizationNumber",
          args: ["918089241"],
        },
      ],
    });
    expect(org.ok).toBe(true);

    const invoice = await agent.act({
      steps: [{ ref: "Fakturanr", action: "setInvoiceNumber", args: ["INV-2048"] }],
    });
    expect(invoice.ok).toBe(true);

    const due = await agent.act({
      steps: [{ ref: "Forfall", action: "setDate", args: ["2026-12-31"] }],
    });
    expect(due.ok).toBe(true);

    const period = await agent.act({
      steps: [{ ref: "Periode", action: "setPeriod", args: ["2026-T5"] }],
    });
    expect(period.ok).toBe(true);
  });

  it("denies confirm steps without allow", async () => {
    const agent = createBookiAgent({ agentId: "strict" });
    render(<PostingStrip />);

    const result = await agent.act({
      steps: [{ ref: "Review", action: "press", args: ["Review"] }],
    });
    expect(result.ok).toBe(false);

    const approve = await agent.act({
      steps: [{ ref: "Attester", action: "press", args: ["Attester"] }],
    });
    expect(approve.ok).toBe(false);
  });
});
