import type { PaymentBatch as Batch } from "@booki/core/payment-batch";
import { paymentBatch } from "@booki/primitives/payment-batch";
import { cleanup, render } from "@testing-library/react";
import { mount } from "@ui-sdk/core/testing";
import { afterEach, describe, expect, it } from "vitest";
import { createBookiAgent } from "./booki-agent.js";
import { BookiLocaleProvider } from "./locale.js";
import { PaymentBatch } from "./payment-batch.js";
import { PaymentReferenceInput } from "./payment-reference-input.js";

afterEach(() => cleanup());

// One rule for both controls: a KID always reads "[redacted]" to an agent; a
// memo or invoice reference does not, unless the app sets `secretReference`.

type Entry = Record<string, unknown> & { component: string };
const entry = (agent: ReturnType<typeof createBookiAgent>, component: string) =>
  agent.snapshot().find((e) => (e as Entry).component === component) as Entry | undefined;

const batch: Batch = {
  id: "b-1",
  status: "draft",
  debitAccount: "12345678903",
  valueDate: "2026-11-30",
  currency: "USD",
  preparedBy: "ola",
  items: [
    {
      id: "p-1",
      creditorName: "Acme Inc.",
      amountMinor: 125_000,
      creditorAccount: "021000021 9876543210",
      reference: "INV-77",
    },
  ],
  approvals: [],
};

describe("PaymentReferenceInput", () => {
  it("shows a US memo to an agent", () => {
    const agent = createBookiAgent({ agentId: "test" });
    render(
      <BookiLocaleProvider defaultCountry="US">
        <PaymentReferenceInput defaultValue="INV-1001" />
      </BookiLocaleProvider>,
    );
    expect(entry(agent, "payment-reference")?.value).toBe("INV-1001");
  });

  it("hides a US memo when the app sets secretReference", () => {
    const agent = createBookiAgent({ agentId: "test" });
    render(
      <BookiLocaleProvider defaultCountry="US">
        <PaymentReferenceInput defaultValue="INV-1001" secretReference />
      </BookiLocaleProvider>,
    );
    expect(entry(agent, "payment-reference")?.value).toBe("[redacted]");
  });

  it("always hides a KID, whatever secretReference says", () => {
    const agent = createBookiAgent({ agentId: "test" });
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <PaymentReferenceInput defaultValue="2345676" secretReference={false} />
      </BookiLocaleProvider>,
    );
    expect(entry(agent, "payment-reference")?.value).toBe("[redacted]");
  });
});

describe("PaymentBatch", () => {
  it("shows a US memo to an agent, never the account", () => {
    const agent = createBookiAgent({ agentId: "test" });
    render(
      <BookiLocaleProvider defaultCountry="US">
        <PaymentBatch defaultBatch={batch} aria-label="Batch" />
      </BookiLocaleProvider>,
    );
    const shown = entry(agent, "payment-batch")!;
    const payments = shown.payments as Record<string, unknown>[];
    const rows = shown.rows as Record<string, unknown>[];
    expect(payments[0]!.reference).toBe("INV-77");
    expect(rows[0]!.reference).toBe("INV-77");
    expect(JSON.stringify(shown)).not.toContain("9876543210");
  });

  it("hides a US memo when the app sets secretReference", () => {
    const agent = createBookiAgent({ agentId: "test" });
    render(
      <BookiLocaleProvider defaultCountry="US">
        <PaymentBatch defaultBatch={batch} secretReference aria-label="Batch" />
      </BookiLocaleProvider>,
    );
    const shown = entry(agent, "payment-batch")!;
    expect((shown.payments as Record<string, unknown>[])[0]!.reference).toBe("[redacted]");
    expect((shown.rows as Record<string, unknown>[])[0]!.reference).toBe("[redacted]");
  });

  it("hides a Norwegian KID", () => {
    const agent = createBookiAgent({ agentId: "test" });
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <PaymentBatch
          defaultBatch={{ ...batch, currency: "NOK", items: [{ ...batch.items[0]!, reference: "2345676" }] }}
          aria-label="Batch"
        />
      </BookiLocaleProvider>,
    );
    const shown = entry(agent, "payment-batch")!;
    expect((shown.payments as Record<string, unknown>[])[0]!.reference).toBe("[redacted]");
    expect(JSON.stringify(shown)).not.toContain("2345676");
  });

  it("hides references when no kind is given, and shows a memo when told", () => {
    const kid = mount(paymentBatch, { defaultBatch: batch }, "<root></root>");
    const memo = mount(paymentBatch, { defaultBatch: batch, referenceKind: "memo" }, "<root></root>");
    try {
      expect((kid.state.payments as { reference?: string }[])[0]!.reference).toBe("[redacted]");
      expect((memo.state.payments as { reference?: string }[])[0]!.reference).toBe("INV-77");
    } finally {
      kid.unmount();
      memo.unmount();
    }
  });
});
