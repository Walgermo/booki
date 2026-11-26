import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AttestationStatus } from "./attestation-status.js";
import { createBookiAgent } from "./booki-agent.js";
import { ConfirmDialog } from "./confirm-dialog.js";
import { BookiLocaleProvider } from "./locale.js";

afterEach(() => cleanup());

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as never;
(Element.prototype as unknown as { getAnimations: () => unknown[] }).getAnimations ??= () => [];

type Result = { ok: boolean; error?: { message: string } };

describe("a person's decision never passes an agent", () => {
  it("refuses setStatus('approved') with the buttons hidden and with no allow", async () => {
    const agent = createBookiAgent();
    const onValueChange = vi.fn();
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <AttestationStatus showActions={false} onValueChange={onValueChange} />
      </BookiLocaleProvider>,
    );
    const ref = agent.snapshot().find((entry) => entry.component === "attestation-status")!.ref;
    const result = (await agent.act({ steps: [{ ref, action: "setStatus", args: ["approved"] }] })) as Result;
    expect(result.ok).toBe(false);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("refuses a press on a person-only button even when the app's allow says yes to everything", async () => {
    const agent = createBookiAgent({ allow: () => true });
    const onApprove = vi.fn();
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <AttestationStatus onApprove={onApprove} />
      </BookiLocaleProvider>,
    );
    const ref = agent.snapshot().find((entry) => entry.component === "attestation-status")!.ref;
    const approve = document.querySelector('[data-slot="attestation-status-approve"]')!.textContent!;
    const result = (await agent.act({ steps: [{ ref, action: "press", args: [approve] }] })) as Result;
    expect(result.ok).toBe(false);
    expect(onApprove).not.toHaveBeenCalled();
  });

  it("refuses agreeing in a ConfirmDialog with allow: () => true", async () => {
    const agent = createBookiAgent({ allow: () => true });
    const onConfirm = vi.fn();
    render(
      <BookiLocaleProvider defaultCountry="US">
        <ConfirmDialog
          trigger="Release"
          title="Release payment run?"
          confirmLabel="Release now"
          onConfirm={onConfirm}
        />
      </BookiLocaleProvider>,
    );
    fireEvent.click(screen.getByText("Release"));
    await screen.findByRole("alertdialog", { hidden: true });
    const dialog = agent.snapshot().find((entry) => entry.label === "Release payment run?")!;
    const result = (await agent.act({
      steps: [{ ref: dialog.ref, action: "press", args: ["Release now"] }],
    })) as Result;
    expect(result.ok).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("agent arguments of the wrong shape", () => {
  it("refuses an object where text goes, and a non-list where ids go", async () => {
    const { IbanInput } = await import("./iban-input.js");
    const { DataTable } = await import("./data-table.js");
    const agent = createBookiAgent();
    const onValueChange = vi.fn();
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <IbanInput onValueChange={onValueChange} />
        <DataTable
          aria-label="Rows"
          rows={[{ id: "r1", name: "A" }]}
          columns={[{ id: "name", header: "Name", value: (row: { name: string }) => row.name }]}
        />
      </BookiLocaleProvider>,
    );
    const iban = agent.snapshot().find((entry) => entry.component === "iban-input")!.ref;
    const asObject = (await agent.act({
      steps: [{ ref: iban, action: "setIban", args: [{ toString: "x" }] }],
    })) as Result;
    expect(asObject.ok).toBe(false);
    expect(asObject.error?.message).toMatch(/setIban/);
    expect(onValueChange).not.toHaveBeenCalled();

    const table = agent.snapshot().find((entry) => entry.component === "data-table")!.ref;
    const asText = (await agent.act({ steps: [{ ref: table, action: "selectRows", args: ["r1"] }] })) as Result;
    expect(asText.ok).toBe(false);
    const proto = (await agent.act({
      steps: [{ ref: table, action: "setFilter", args: ["__proto__", "x"] }],
    })) as Result;
    expect(proto.ok).toBe(false);
  });
});

describe("an empty fixed asset register", () => {
  it("says what it is and offers the app's action instead of a bare header", async () => {
    const { FixedAssetRegister } = await import("./fixed-asset-register.js");
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <FixedAssetRegister defaultAssets={[]} empty={<button type="button">Registrer anleggsmiddel</button>} />
      </BookiLocaleProvider>,
    );
    const cell = document.querySelector('[data-slot="fixed-asset-register-empty"]')!;
    expect(cell.textContent).toContain("Ingen anleggsmidler ennå");
    expect(screen.getByRole("button", { name: "Registrer anleggsmiddel" })).toBeTruthy();
    expect(document.querySelector('[data-slot="fixed-asset-register-table"] tfoot')).toBeNull();
  });
});

describe("a press on a component's own decision button is refused by name", () => {
  it("releasing a payment batch and signing off a close task, each with one audit row", async () => {
    const { PaymentBatch } = await import("./payment-batch.js");
    const { CloseChecklist } = await import("./close-checklist.js");
    const rows: { action: string; target: string; detail?: string }[] = [];
    const agent = createBookiAgent({ agentId: "assistant", audit: (row) => rows.push(row) });
    render(
      <BookiLocaleProvider defaultCountry="US">
        <PaymentBatch
          actor="kari"
          defaultBatch={{
            id: "b-1",
            status: "draft",
            debitAccount: "1503 40 12345",
            valueDate: "2026-02-02",
            currency: "USD",
            preparedBy: "nina",
            approvals: [],
            items: [{ id: "p1", creditorName: "Office", amountMinor: 100_00, creditorAccount: "8601 11 17947" }],
          }}
        />
        <CloseChecklist
          actor="kari"
          defaultTasks={[{ id: "bank", title: "Bank", status: "done", doneBy: "nina", needsSignOff: true }]}
        />
      </BookiLocaleProvider>,
    );
    const batch = agent.snapshot().find((entry) => entry.component === "payment-batch")!.ref;
    const checklist = agent.snapshot().find((entry) => entry.component === "close-checklist")!.ref;
    const release = document.querySelector('[data-person-only="Releasing payments needs a person"]')!.textContent!;
    const signOff = document.querySelector('[data-person-only="Signing off needs a person"]')!.textContent!;

    const released = (await agent.act({ steps: [{ ref: batch, action: "press", args: [release] }] })) as Result;
    expect(released.ok).toBe(false);
    expect(released.error?.message).toMatch(/person's decision.*Releasing payments needs a person/);
    const signed = (await agent.act({ steps: [{ ref: checklist, action: "press", args: [signOff] }] })) as Result;
    expect(signed.ok).toBe(false);
    expect(signed.error?.message).toMatch(/person's decision.*Signing off needs a person/);

    expect(rows.map((row) => [row.action, row.detail])).toEqual([
      ["agent.person-only", "payment-batch.press: Releasing payments needs a person"],
      ["agent.person-only", "close-checklist.press: Signing off needs a person"],
    ]);
    // The agent's own actions are not marked as a person's decision.
    const checked = (await agent.act({ steps: [{ ref: checklist, action: "assertReadyToClose" }] })) as Result;
    expect(checked.error?.message ?? "").not.toMatch(/person's decision|Needs a person/);
  });
});
