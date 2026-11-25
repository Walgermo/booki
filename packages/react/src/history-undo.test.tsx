import type { VoucherLine } from "@booki-aui/core/voucher";
import { cleanup, render } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AmountField } from "./amount-field.js";
import { BankAccountInput } from "./bank-account-input.js";
import { createBookiAgent, createBookiHistory, proposeChanges } from "./booki-agent.js";
import { FinancialDateField } from "./financial-date-field.js";
import { IbanInput } from "./iban-input.js";
import { InvoiceNumberInput } from "./invoice-number-input.js";
import { BookiLocaleProvider } from "./locale.js";
import { OrganizationNumberInput } from "./organization-number-input.js";
import { PaymentReferenceInput } from "./payment-reference-input.js";
import { VoucherComposer } from "./voucher-composer.js";

afterEach(() => {
  cleanup();
});

type Agent = ReturnType<typeof createBookiAgent>;

function inNo(children: ReactNode) {
  return render(<BookiLocaleProvider defaultCountry="NO">{children}</BookiLocaleProvider>);
}

function entryOf(agent: Agent, component: string) {
  const entry = agent.snapshot().find((c) => c.component === component) as Record<string, unknown> | undefined;
  if (!entry) throw new Error(`${component} not in snapshot`);
  return entry;
}

function field(slot: string): HTMLInputElement {
  return document.querySelector(`[data-slot="${slot}"]`) as HTMLInputElement;
}

function ControlledAmount() {
  const [minor, setMinor] = useState(249_000);
  return <AmountField value={minor} onValueChange={(next) => setMinor(next)} aria-label="Total" />;
}

describe("history restores AmountField in minor units", () => {
  const variants: Array<[string, () => ReactNode]> = [
    ["uncontrolled", () => <AmountField defaultValue={249_000} aria-label="Total" />],
    ["controlled", () => <ControlledAmount />],
  ];

  for (const [name, view] of variants) {
    it(`undoSource("agent") puts back the amount (${name})`, async () => {
      const agent = createBookiAgent();
      const history = createBookiHistory(agent);
      inNo(view());
      await agent.act({
        steps: [{ ref: "Total", action: "setMinor", args: [312_500] }],
      });
      expect(entryOf(agent, "amount-field").value).toBe(312_500);
      expect(history.entries()).toEqual([expect.objectContaining({ key: "minor", previous: 249_000, value: 312_500 })]);
      const left = await history.undoSource("agent");
      expect(left).toEqual([]);
      expect(entryOf(agent, "amount-field").value).toBe(249_000);
      expect(entryOf(agent, "amount-field").minor).toBe(249_000);
      history.destroy();
    });

    it(`seek(0) and seek(end) restore exactly (${name})`, async () => {
      const agent = createBookiAgent();
      const history = createBookiHistory(agent);
      inNo(view());
      await agent.act({
        steps: [{ ref: "Total", action: "setMinor", args: [312_500] }],
      });
      expect(await history.seek(0)).toEqual([]);
      expect(entryOf(agent, "amount-field").value).toBe(249_000);
      expect(await history.seek(history.entries().length)).toEqual([]);
      expect(entryOf(agent, "amount-field").value).toBe(312_500);
      history.destroy();
    });

    it(`stageChanges revert restores exactly (${name})`, async () => {
      const agent = createBookiAgent();
      inNo(view());
      const staged = await proposeChanges(agent, [{ ref: "Total", key: "minor", value: 312_500 }]);
      expect(staged.applied).toHaveLength(1);
      expect(entryOf(agent, "amount-field").value).toBe(312_500);
      expect(await staged.revert()).toEqual([]);
      expect(entryOf(agent, "amount-field").value).toBe(249_000);
    });
  }

  it("records amount entries on key minor only", async () => {
    const agent = createBookiAgent();
    const history = createBookiHistory(agent);
    inNo(<AmountField defaultValue={249_000} aria-label="Total" />);
    await agent.act({
      steps: [{ ref: "Total", action: "setMinor", args: [312_500] }],
    });
    const left = await history.undoSource("agent");
    expect(left).toEqual([]);
    expect(history.entries().every((entry) => entry.key === "minor")).toBe(true);
  });

  it("still has no setValue for the history or an agent to misuse", async () => {
    const agent = createBookiAgent();
    inNo(<AmountField defaultValue={249_000} aria-label="Total" />);
    const result = await agent.act({
      steps: [{ ref: "Total", action: "setValue", args: ["3125.00"] }],
    });
    expect(result.ok).toBe(false);
    const minorText = await agent.act({
      steps: [{ ref: "Total", action: "setMinor", args: ["3125.00"] }],
    });
    expect(minorText.ok).toBe(false);
    expect(entryOf(agent, "amount-field").value).toBe(249_000);
  });
});

const seedLines: VoucherLine[] = [
  { id: "recv", account: "1500", accountName: "AR", debitMinor: 12_500, creditMinor: 0 },
];

describe("history undo across FIN primitives", () => {
  it("VoucherComposer lines", async () => {
    const agent = createBookiAgent();
    const history = createBookiHistory(agent);
    inNo(<VoucherComposer defaultLines={seedLines} aria-label="Voucher lines" />);
    await agent.act({
      steps: [{ ref: "Voucher lines", action: "addLine", args: ["3000", "Sales", 0, 12_500] }],
    });
    expect((entryOf(agent, "voucher-composer").lines as VoucherLine[]).length).toBe(2);
    expect(await history.undoSource("agent")).toEqual([]);
    expect(entryOf(agent, "voucher-composer").lines).toEqual(seedLines);
    expect(document.querySelector('[data-slot="voucher-composer"]')?.getAttribute("data-balanced")).toBe("false");
  });

  it("PaymentReferenceInput (US memo)", async () => {
    const agent = createBookiAgent();
    const history = createBookiHistory(agent);
    render(
      <BookiLocaleProvider defaultCountry="US">
        <PaymentReferenceInput defaultValue="INV-1001" />
      </BookiLocaleProvider>,
    );
    await agent.act({
      steps: [{ ref: "Payment memo", action: "setReference", args: ["INV-2048"] }],
    });
    expect(field("payment-reference-field").value).toBe("INV-2048");
    expect(await history.undoSource("agent")).toEqual([]);
    expect(field("payment-reference-field").value).toBe("INV-1001");
  });

  it("PaymentReferenceInput (NO KID) is secret: undo reports it and leaves the value", async () => {
    const agent = createBookiAgent();
    const history = createBookiHistory(agent);
    inNo(<PaymentReferenceInput defaultValue="1234567" />);
    await agent.act({ steps: [{ ref: "KID", action: "setReference", args: ["2345676"] }] });
    const left = await history.undoSource("agent");
    expect(left).toEqual([expect.objectContaining({ key: "value" })]);
    expect(field("payment-reference-field").value).toBe("2345676");
  });

  it("OrganizationNumberInput", async () => {
    const agent = createBookiAgent();
    const history = createBookiHistory(agent);
    inNo(<OrganizationNumberInput defaultValue="974760673" />);
    await agent.act({
      steps: [{ ref: "Organisasjonsnummer", action: "setOrganizationNumber", args: ["918089241"] }],
    });
    expect(field("organization-number-field").value.replace(/\D/g, "")).toBe("918089241");
    expect(await history.undoSource("agent")).toEqual([]);
    expect(field("organization-number-field").value.replace(/\D/g, "")).toBe("974760673");
  });

  it("InvoiceNumberInput", async () => {
    const agent = createBookiAgent();
    const history = createBookiHistory(agent);
    inNo(<InvoiceNumberInput defaultValue="INV-1001" />);
    await agent.act({ steps: [{ ref: "Fakturanr", action: "setInvoiceNumber", args: ["INV-2048"] }] });
    expect(field("invoice-number-field").value).toBe("INV-2048");
    expect(await history.undoSource("agent")).toEqual([]);
    expect(field("invoice-number-field").value).toBe("INV-1001");
  });

  it("FinancialDateField", async () => {
    const agent = createBookiAgent();
    const history = createBookiHistory(agent);
    inNo(<FinancialDateField kind="due" defaultValue="2026-12-15" />);
    await agent.act({ steps: [{ ref: "Forfall", action: "setDate", args: ["2026-12-31"] }] });
    expect(field("financial-date-control").value).toBe("2026-12-31");
    expect(await history.undoSource("agent")).toEqual([]);
    expect(field("financial-date-control").value).toBe("2026-12-15");
  });

  it("IbanInput is secret: undo reports it and leaves the value", async () => {
    const agent = createBookiAgent();
    const history = createBookiHistory(agent);
    inNo(<IbanInput defaultValue="NO9386011117947" />);
    await agent.act({ steps: [{ ref: "IBAN", action: "setIban", args: ["NO8330001234567"] }] });
    const left = await history.undoSource("agent");
    expect(left).toEqual([expect.objectContaining({ key: "value" })]);
    expect(field("iban-field").value.replace(/\s/g, "")).toBe("NO8330001234567");
  });

  it("BankAccountInput is secret: undo reports it and leaves the value", async () => {
    const agent = createBookiAgent();
    const history = createBookiHistory(agent);
    inNo(<BankAccountInput />);
    await agent.act({
      steps: [{ ref: "Kontonummer", action: "setKontonummer", args: ["86011117947"] }],
    });
    const left = await history.undoSource("agent");
    expect(left).toEqual([expect.objectContaining({ key: "digits" })]);
    expect(field("bank-account-kontonummer").value).toBe("8601 11 17947");
  });
});
