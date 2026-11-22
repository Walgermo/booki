import { cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBookiAgent } from "./booki-agent.js";
import { FinancialDateField } from "./financial-date-field.js";
import { IbanInput } from "./iban-input.js";
import { InvoiceNumberInput } from "./invoice-number-input.js";
import { BookiLocaleProvider } from "./locale.js";
import { OrganizationNumberInput } from "./organization-number-input.js";
import { PaymentReferenceInput } from "./payment-reference-input.js";

afterEach(() => {
  cleanup();
});

function field(slot: string): HTMLInputElement {
  const el = document.querySelector(`[data-slot="${slot}"]`);
  if (!el) throw new Error(`${slot} not rendered`);
  return el as HTMLInputElement;
}

function inNo(children: React.ReactNode) {
  return render(<BookiLocaleProvider defaultCountry="NO">{children}</BookiLocaleProvider>);
}

describe("PaymentReferenceInput uncontrolled", () => {
  it("holds a value set by the agent", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    const onValueChange = vi.fn();
    inNo(<PaymentReferenceInput onValueChange={onValueChange} />);
    const result = await agent.act({
      steps: [{ ref: "KID", action: "setReference", args: ["2345676"] }],
    });
    expect(result.ok).toBe(true);
    expect(field("payment-reference-field").value).toBe("2345676");
    expect(onValueChange).toHaveBeenLastCalledWith("2345676", expect.anything());
  });

  it("holds a value typed by a human and shows the error from state", () => {
    inNo(<PaymentReferenceInput />);
    const el = field("payment-reference-field");
    fireEvent.input(el, { target: { value: "12345" } });
    expect(el.value).toBe("12345");
    expect(document.body.textContent).toContain("Ugyldig KID");
    fireEvent.input(el, { target: { value: "" } });
    expect(el.value).toBe("");
    expect(document.body.textContent).not.toContain("Ugyldig KID");
  });

  it("starts from defaultValue", () => {
    inNo(<PaymentReferenceInput defaultValue="2345676" />);
    expect(field("payment-reference-field").value).toBe("2345676");
  });

  it("still works controlled", async () => {
    function Held() {
      const [value, setValue] = useState("");
      return (
        <>
          <PaymentReferenceInput value={value} onValueChange={setValue} />
          <output data-testid="held">{value}</output>
        </>
      );
    }
    const agent = createBookiAgent({ agentId: "test" });
    inNo(<Held />);
    await agent.act({
      steps: [{ ref: "KID", action: "setReference", args: ["2345676"] }],
    });
    expect(field("payment-reference-field").value).toBe("2345676");
    expect(document.querySelector("output")?.textContent).toBe("2345676");
  });

  it("controlled without a handler keeps the owner's value", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    inNo(<PaymentReferenceInput value="" />);
    await agent.act({
      steps: [{ ref: "KID", action: "setReference", args: ["2345676"] }],
    });
    expect(field("payment-reference-field").value).toBe("");
  });
});

describe("other composed inputs work uncontrolled", () => {
  it("IbanInput", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    inNo(<IbanInput />);
    const result = await agent.act({
      steps: [{ ref: "IBAN", action: "setIban", args: ["NO9386011117947"] }],
    });
    expect(result.ok).toBe(true);
    expect(field("iban-field").value.replace(/\s/g, "")).toBe("NO9386011117947");
    fireEvent.input(field("iban-field"), { target: { value: "NO93 8601" } });
    expect(field("iban-field").value.replace(/\s/g, "")).toBe("NO938601");
    expect(document.body.textContent).toContain("Invalid IBAN");
  });

  it("OrganizationNumberInput", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    const view = inNo(<OrganizationNumberInput />);
    const result = await agent.act({
      steps: [
        {
          ref: "Organisasjonsnummer",
          action: "setOrganizationNumber",
          args: ["974760673"],
        },
      ],
    });
    expect(result.ok).toBe(true);
    // A parent re-render must not wipe the uncontrolled value.
    view.rerender(
      <BookiLocaleProvider defaultCountry="NO">
        <OrganizationNumberInput />
      </BookiLocaleProvider>,
    );
    expect(field("organization-number-field").value.replace(/\D/g, "")).toBe("974760673");
    fireEvent.input(field("organization-number-field"), {
      target: { value: "918089241" },
    });
    expect(field("organization-number-field").value.replace(/\D/g, "")).toBe("918089241");
  });

  it("InvoiceNumberInput", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    inNo(<InvoiceNumberInput />);
    const result = await agent.act({
      steps: [{ ref: "Fakturanr", action: "setInvoiceNumber", args: ["INV-2048"] }],
    });
    expect(result.ok).toBe(true);
    expect(field("invoice-number-field").value).toBe("INV-2048");
    fireEvent.input(field("invoice-number-field"), {
      target: { value: "INV-2049" },
    });
    expect(field("invoice-number-field").value).toBe("INV-2049");
  });

  it("FinancialDateField", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    const view = inNo(<FinancialDateField kind="due" />);
    const result = await agent.act({
      steps: [{ ref: "Forfall", action: "setDate", args: ["2026-12-31"] }],
    });
    expect(result.ok).toBe(true);
    view.rerender(
      <BookiLocaleProvider defaultCountry="NO">
        <FinancialDateField kind="due" />
      </BookiLocaleProvider>,
    );
    expect(field("financial-date-control").value).toBe("2026-12-31");
    fireEvent.change(field("financial-date-control"), {
      target: { value: "2027-01-15" },
    });
    expect(field("financial-date-control").value).toBe("2027-01-15");
  });
});

describe("a person's typing", () => {
  // ui-sdk derives a change's source from its DOM event; with none it reports
  // "programmatic". A person's input must carry its event, and change() already
  // calls onValueChange, so the app hears it once.
  const cases: [string, React.ReactElement<{ onValueChange?: unknown }>, string][] = [
    ["IbanInput", <IbanInput aria-label="IBAN" />, "NO9386011117947"],
    ["InvoiceNumberInput", <InvoiceNumberInput aria-label="Fakturanr" />, "INV-1042"],
    ["FinancialDateField", <FinancialDateField aria-label="Dato" />, "2026-10-31"],
    ["OrganizationNumberInput", <OrganizationNumberInput aria-label="Orgnr" />, "923609016"],
    ["PaymentReferenceInput", <PaymentReferenceInput aria-label="KID" />, "2345676"],
  ];
  for (const [name, element, typed] of cases) {
    it(`${name}: reports the person, once`, () => {
      const onValueChange = vi.fn();
      inNo(<element.type {...element.props} onValueChange={onValueChange} />);
      fireEvent.input(document.querySelector("input")!, { target: { value: typed } });
      expect(onValueChange).toHaveBeenCalledTimes(1);
      // The DOM event reaches the change; ui-sdk derives the source from it
      // (a test's untrusted event reads as "programmatic", a real one as keyboard/pointer).
      const details = onValueChange.mock.calls[0]![1] as { source: string; event?: Event };
      expect(details.event).toBeInstanceOf(Event);
      expect(details.source).not.toBe("agent");
    });
  }
});
