import type { PaymentBatch as Batch } from "@booki/core/payment-batch";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BookiAccessProvider } from "./access.js";
import { createBookiAgent } from "./booki-agent.js";
import { SE_PROFILE, defineProfile } from "@booki/core/locale";
import { BankAccountInput } from "./bank-account-input.js";
import { CurrencySelect } from "./currency-select.js";
import { BookiLocaleProvider } from "./locale.js";
import { OrganizationNumberInput } from "./organization-number-input.js";
import { PaymentBatch } from "./payment-batch.js";
import { PeriodLock } from "./period-lock.js";
import { EvidenceList } from "./evidence-list.js";

afterEach(() => cleanup());

const batch: Batch = {
  id: "b1",
  status: "draft",
  debitAccount: "1503 40 12345",
  valueDate: "2026-02-01",
  currency: "USD",
  preparedBy: "nina",
  approvals: [],
  items: [
    { id: "p1", creditorName: "Acme", amountMinor: 100_00, creditorAccount: "8601 11 17947", reference: "INV-1" },
  ],
};
const button = (name: string) => [...document.querySelectorAll("button")].find((b) => b.textContent === name)!;
const alert = () => document.querySelector('[role="alert"]')?.textContent ?? "";

function show(
  actor: { id: string; roles: string[]; entities?: string[] },
  entity?: { id: string; name: string; baseCurrency: string; country: string },
) {
  const agent = createBookiAgent({ agentId: "test" });
  render(
    <BookiLocaleProvider defaultCountry="US">
      <BookiAccessProvider actor={actor} entity={entity}>
        <PaymentBatch defaultBatch={batch} requiredApprovals={1} />
        <PeriodLock codes={["2026-01"]} />
      </BookiAccessProvider>
    </BookiLocaleProvider>,
  );
  const entry = (component: string) =>
    agent.snapshot().find((c) => c.component === component) as unknown as Record<string, any>;
  return { entry };
}

describe("BookiAccessProvider", () => {
  it("refuses a button the person's role does not allow, naming the role it takes", () => {
    const { entry } = show({ id: "ola", roles: ["accountant"] });
    fireEvent.click(button("Approve"));
    expect(alert()).toMatch(/"ola" may not do "payment.approve".*Manager, Controller/);
    expect(entry("payment-batch").approvals).toEqual([]);
    fireEvent.click(button("Close"));
    expect(entry("period-lock").periods).toEqual([]);
  });

  it("takes the actor from the provider and lets the right role through", () => {
    const { entry } = show({ id: "kari", roles: ["manager"] });
    fireEvent.click(button("Approve"));
    expect(entry("payment-batch").approvals).toEqual(["kari"]);
    // A manager approves but does not release.
    fireEvent.click(button("Release to bank"));
    expect(alert()).toMatch(/may not do "payment.release"/);
    expect(entry("payment-batch").status).toBe("draft");
  });

  it("shows the refusal in Norwegian under the NO profile, once the catalogue has loaded", async () => {
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <BookiAccessProvider actor={{ id: "ola", roles: ["accountant"] }}>
          <PaymentBatch defaultBatch={batch} requiredApprovals={1} />
        </BookiAccessProvider>
      </BookiLocaleProvider>,
    );
    fireEvent.click(button("Godkjenn"));
    // The Norwegian catalogue is fetched on demand; the provider starts it on mount.
    await waitFor(() => expect(alert()).not.toMatch(/may not|takes one of/));
    expect(alert()).toMatch(/"ola"/);
  });

  it("refuses someone who does not work in this entity", () => {
    show(
      { id: "kari", roles: ["manager"], entities: ["se"] },
      { id: "no", name: "Nordlys AS", baseCurrency: "NOK", country: "NO" },
    );
    fireEvent.click(button("Approve"));
    expect(alert()).toMatch(/does not work in entity "no"/);
  });

  it("covers the document controls too: a manager may not remove evidence, an accountant may", () => {
    const file = {
      id: "f1",
      fileName: "f1.pdf",
      mediaType: "application/pdf",
      sizeBytes: 1000,
      sha256: "a".repeat(64),
    };
    const remove = () =>
      document.querySelector<HTMLButtonElement>('[aria-label="Remove: f1.pdf"]') ?? button("Remove: f1.pdf");
    const linked = [{ ...file, kind: "receipt" as const, addedBy: "nina", addedAt: "2026-01-31T10:00:00Z" }];
    const ui = (roles: string[]) => (
      <BookiLocaleProvider defaultCountry="US">
        <BookiAccessProvider actor={{ id: "x", roles }}>
          <EvidenceList defaultAttachments={linked} />
        </BookiAccessProvider>
      </BookiLocaleProvider>
    );
    const view = render(ui(["manager"]));
    fireEvent.click(remove()!);
    expect(alert()).toMatch(/may not do "evidence.remove".*Accountant/);
    expect(remove()).toBeTruthy();
    view.unmount();
    render(ui(["accountant"]));
    fireEvent.click(remove()!);
    expect(remove()).toBeFalsy();
  });
});

describe("country profiles in the inputs", () => {
  it("uses IBAN and the Swedish company-number check for Sweden", () => {
    render(
      <BookiLocaleProvider defaultCountry="SE">
        <BankAccountInput />
        <OrganizationNumberInput defaultValue="5560360794" />
      </BookiLocaleProvider>,
    );
    expect(document.querySelector('[data-slot="iban-input"]')).not.toBeNull();
    expect(document.body.textContent).toMatch(/Invalid organisationsnummer/);
  });

  it("takes a profile you define yourself, and names what exists when there is none", () => {
    const FI = defineProfile(SE_PROFILE, { country: "FI", locale: "fi-FI", currency: "EUR" });
    render(
      <BookiLocaleProvider defaultCountry="FI" profiles={{ FI }}>
        <CurrencySelect currencies={[FI.currency, "SEK"]} />
      </BookiLocaleProvider>,
    );
    expect((document.querySelector("select") as HTMLSelectElement).value).toBe("EUR");
    cleanup();
    expect(() =>
      render(
        <BookiLocaleProvider defaultCountry="FI">
          <span />
        </BookiLocaleProvider>,
      ),
    ).toThrow(/No profile for country "FI"/);
  });
});

import { VoucherComposer } from "./voucher-composer.js";

describe("VoucherComposer: foreign currency and a dimension column", () => {
  it("books a line in another currency and lets a person pick a further dimension", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <VoucherComposer
          editable
          accounts={[
            { number: "1500", name: "Kundefordringer" },
            { number: "3000", name: "Salg" },
          ]}
          dimensions={[{ key: "costCentre", name: "Kostsenter", options: [{ code: "40", name: "Salg" }] }]}
          aria-label="Bilag"
        />
      </BookiLocaleProvider>,
    );
    const act = (action: string, args: unknown[]) =>
      agent.act({ steps: [{ ref: "Bilag", action, args }] }) as Promise<{ ok: boolean; error?: { message: string } }>;
    const entry = () =>
      agent.snapshot().find((c) => c.component === "voucher-composer") as unknown as Record<string, any>;
    await act("addLine", ["1500", undefined, 1, 0]);
    await act("addLine", ["3000", undefined, 0, 115_000]);
    const id = entry().lines[0].id;
    // 100.00 EUR at 11.5 is 1 150,00 NOK on the debit side.
    expect((await act("setForeign", [id, "EUR", 100_00, 11_500_000])).ok).toBe(true);
    expect(entry().lines[0]).toMatchObject({ debitMinor: 115_000, foreign: { currency: "EUR", amountMinor: 100_00 } });
    expect(entry().postable).toBe(true);
    // Changing the base amount by hand breaks the link, and the voucher says so.
    await act("setDebit", [id, 115_001]);
    await act("setCredit", [entry().lines[1].id, 115_001]);
    expect((await act("assertPostable", [])).error?.message).toMatch(/EUR minor units at rate 11.5 is 115000 NOK/);
    expect((await act("setForeign", [id, "EUR", 100_00, 0])).error?.message).toMatch(/above zero/);

    const select = document.querySelector('select[aria-label="Kostsenter, Linje 1"]') as HTMLSelectElement;
    expect(select).not.toBeNull();
    fireEvent.change(select, { target: { value: "40" } });
    expect(entry().lines[0].dimensions).toEqual({ costCentre: "40" });
  });
});
