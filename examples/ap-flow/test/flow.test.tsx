import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApFlow } from "@/components/ap-flow";
import { pageAgent, runAsAgent } from "@/lib/agent";
import { runScriptedAgent } from "@/lib/script";
import { books } from "@/lib/store";
import { settled } from "@/lib/writes";

const as = async (name: RegExp) => {
  fireEvent.click(screen.getByRole("radio", { name }));
  await settled();
};
const click = async (element: Element) => {
  fireEvent.click(element);
  await settled();
};
const slot = (name: string) => document.querySelector<HTMLElement>(`[data-slot="${name}"]`);
const openInvoice = (index: number) =>
  click(document.querySelectorAll('[data-slot="supplier-invoice-inbox-select"]')[index]!);
const invoice = (id: string) => books().invoices.find((candidate) => candidate.id === id)!;
const refusal = () =>
  screen.queryByRole("alert", { name: "" })?.textContent ??
  document.querySelector("header [role=alert]")?.textContent ??
  "";
const ref = (component: string) =>
  (pageAgent().snapshot() as unknown as { ref: string; component: string }[]).find(
    (entry) => entry.component === component,
  )!.ref;
const press = (component: string, label: string) =>
  runAsAgent(() =>
    pageAgent().act({ steps: [{ ref: ref(component), action: "press", args: [label] }] } as never),
  ) as Promise<{ ok: boolean }>;

describe("supplier invoice to payment, with four people and an agent", () => {
  it("runs from the inbox to a reconciled bank line, each decision by the person who may make it", async () => {
    render(<ApFlow initial={structuredClone(books())} />);

    // The agent codes, flags the copy and says what waits.
    const first = await runScriptedAgent(pageAgent());
    expect(first.did).toEqual(
      expect.arrayContaining([
        "si-1: konterte på 6800",
        "si-2: konterte på 6340",
        "si-3: foreslo å avvise som duplikat av si-1",
      ]),
    );
    expect(first.waiting.join(" ")).toMatch(/si-1: venter til en person har avgjort kopien si-3/);
    expect(first.waiting.join(" ")).toMatch(/si-4: paymentReference må sjekkes av en person/);

    // An agent cannot press a person's button in the inbox.
    expect((await press("supplier-invoice-inbox", "Godkjenn for bokføring")).ok).toBe(false);

    // Kari rejects the copy (the agent filled in the reason) and approves the cleaning invoice.
    await as(/Kari/);
    await openInvoice(2);
    await click(slot("supplier-invoice-inbox-reject")!);
    expect(invoice("si-3")).toMatchObject({ status: "rejected", rejectedBy: "kari" });
    await openInvoice(1);
    await click(slot("supplier-invoice-inbox-approve")!);
    expect(invoice("si-2")).toMatchObject({ status: "approved", approvedBy: "kari" });

    // With the copy gone, the agent (working for Nina) approves si-1 under the rule and prepares the batch.
    await as(/Nina/);
    const second = await runScriptedAgent(pageAgent());
    expect(second.did).toEqual(
      expect.arrayContaining(["si-1: godkjent etter selskapets regel", "betalingsforslag: laget"]),
    );
    expect(invoice("si-1").approvedBy).toBe("rule:små-faste");
    expect(
      books()
        .batch!.items.map((item) => item.id)
        .sort(),
    ).toEqual(["si-1", "si-2"]);

    // An agent cannot approve or release the batch.
    expect((await press("payment-batch", "Godkjenn")).ok).toBe(false);

    // Kari approved si-2, so she may not approve its payment: the server says so.
    await as(/Kari/);
    await click(slot("payment-batch-approve")!);
    expect(books().batch!.approvals).toHaveLength(0);
    expect(refusal()).toMatch(/Serveren sa nei/);

    // Ola approves; Ola may not also release; Per releases.
    await as(/Ola/);
    await click(slot("payment-batch-approve")!);
    expect(books().batch!.approvals.map((approval) => approval.approverId)).toEqual(["ola"]);
    await click(slot("payment-batch-release")!);
    expect(books().batch!.status).toBe("draft");
    await as(/Per/);
    await click(slot("payment-batch-release")!);
    expect(books().batch!.status).toBe("released");
    expect(books().bankLines).toHaveLength(2);

    // The statement arrived: the agent suggests the matches; Nina approves them.
    await waitFor(() => expect(slot("bank-reconciliation")).not.toBeNull());
    const third = await runScriptedAgent(pageAgent());
    expect(third.did.filter((line) => line.includes("foreslo avstemming"))).toHaveLength(2);
    expect(books().matches.every((match) => match.status === "suggested" && match.source === "agent")).toBe(true);
    expect((await press("bank-reconciliation", "Godkjenn")).ok).toBe(false);

    await as(/Nina/);
    for (const button of document.querySelectorAll('[data-slot="bank-reconciliation-approve"]')) await click(button);
    expect(books().matches.map((match) => match.status)).toEqual(["approved", "approved"]);

    // Every write is in the audit trail, the agent's under its own name.
    const trail = books().audit.map((row) => `${row.actor} ${row.action} ${row.target}`);
    expect(trail).toEqual(
      expect.arrayContaining([
        "agent:bookkeeper supplier-invoice.approve-under-rule si-1",
        "kari supplier-invoice.approve si-2",
        "kari refused pb-1",
        "ola payment.approve pb-1",
        "ola refused pb-1",
        "per payment.release pb-1",
        "agent:bookkeeper reconciliation.suggest m1",
        "nina reconciliation.approve m1",
      ]),
    );
    // Bank details never reach the agent.
    expect(JSON.stringify(pageAgent().snapshot())).not.toMatch(/15034134623|20261101008/);
  });
});
