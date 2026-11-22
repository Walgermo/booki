import type { ApprovalLevel, ApprovalRequest } from "@booki/core/approval";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ApprovalChain } from "./approval-chain.js";
import { createBookiAgent } from "./booki-agent.js";
import { BookiLocaleProvider } from "./locale.js";

afterEach(() => cleanup());

const chain: ApprovalLevel[] = [
  { id: "l1", name: "Manager", approvers: [{ id: "kari", limitMinor: 500_000 }, { id: "per" }] },
  { id: "l2", name: "CFO", fromMinor: 100_000, approvers: [{ id: "cfo" }] },
];
const request: ApprovalRequest = { id: "r1", amountMinor: 250_000, requesterId: "nina", decisions: [] };

function setup(actor?: string) {
  const agent = createBookiAgent({ agentId: "test" });
  const seen: ApprovalRequest[] = [];
  const view = render(
    <BookiLocaleProvider defaultCountry="US">
      <ApprovalChain chain={chain} defaultRequest={request} actor={actor} onRequestChange={(r) => seen.push(r)} />
    </BookiLocaleProvider>,
  );
  const entry = () =>
    agent.snapshot().find((c) => c.component === "approval-chain") as unknown as Record<string, unknown>;
  const act = (action: string, args: unknown[] = []) =>
    agent.act({ steps: [{ ref: "Approval", action, args }] }) as Promise<{ ok: boolean; error?: { message: string } }>;
  const button = (name: string) => [...document.querySelectorAll("button")].find((b) => b.textContent === name)!;
  return { agent, entry, act, button, seen, view };
}

describe("ApprovalChain", () => {
  it("tells an agent where it stands and offers only assertApproved", async () => {
    const { entry, act } = setup("kari");
    expect(entry()).toMatchObject({
      actions: ["assertApproved"],
      status: "pending",
      currentLevel: "Manager",
      mayDecide: ["kari", "per"],
      locked: true,
    });
    const refused = await act("assertApproved");
    expect(refused.ok).toBe(false);
    expect(refused.error?.message).toMatch(/waits at level "Manager"/);
    for (const action of ["approve", "reject", "escalate"]) {
      expect((await act(action)).ok).toBe(false);
    }
    expect(entry().status).toBe("pending");
  });

  it("lets the right people approve level by level", async () => {
    const first = setup("kari");
    fireEvent.click(first.button("Approve"));
    expect(first.entry()).toMatchObject({ status: "pending", currentLevel: "CFO", mayDecide: ["cfo"] });
    expect(first.seen.at(-1)?.decisions[0]).toMatchObject({ approverId: "kari", decision: "approved" });
    // Kari cannot also take the CFO level.
    fireEvent.click(first.button("Approve"));
    expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/not an approver at level "CFO"/);
    expect(first.entry().currentLevel).toBe("CFO");
  });

  it("refuses the requester and a missing actor, in the control", () => {
    const { button, entry } = setup("nina");
    fireEvent.click(button("Approve"));
    expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/cannot decide/);
    expect(entry().status).toBe("pending");
    cleanup();
    const none = setup();
    fireEvent.click(none.button("Reject"));
    expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/Nobody is signed in/);
  });

  it("unlocks when rejected", () => {
    const { button, entry } = setup("per");
    fireEvent.click(button("Reject"));
    expect(entry()).toMatchObject({ status: "rejected", locked: false });
    expect(button("Approve")).toBeUndefined();
  });
});
