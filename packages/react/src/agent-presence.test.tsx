import { act, cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AgentPresence, AgentProposal, attachAgentPresence, useAgentProposal } from "./agent-presence.js";
import { AmountField } from "./amount-field.js";
import { createBookiAgent } from "./booki-agent.js";
import { TaxCodeSelect } from "./tax-code-select.js";

afterEach(() => cleanup());

const amountRoot = () => document.querySelector('[data-slot="amount-field"]')!;
const taxRoot = () => document.querySelector('[data-slot="tax-code-select"]')!;
const snapshotAmount = (agent: ReturnType<typeof createBookiAgent>) =>
  (agent.snapshot().find((c) => c.component === "amount-field") as unknown as { value: number }).value;

function renderControls() {
  return render(
    <>
      <AmountField defaultValue={249_000} aria-label="Total" />
      <TaxCodeSelect defaultValue="MVA25" />
    </>,
  );
}

describe("attachAgentPresence", () => {
  it("marks a control the agent changed and reports it as active", async () => {
    const agent = createBookiAgent();
    renderControls();
    const presence = attachAgentPresence(agent, { linger: 20 });
    const seen: (string | null)[] = [];
    presence.subscribe((active) => seen.push(active?.label ?? null));

    await agent.act({ steps: [{ ref: "Total", action: "setMinor", args: [312_500] }] });

    expect(amountRoot().hasAttribute("data-agent-set")).toBe(true);
    expect(taxRoot().hasAttribute("data-agent-set")).toBe(false);
    expect(presence.marked()).toHaveLength(1);
    expect(seen[0]).toBe("Total");
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(seen.at(-1)).toBeNull();
    presence.detach();
  });

  it("drops the mark when a person edits the control", async () => {
    const agent = createBookiAgent();
    renderControls();
    const presence = attachAgentPresence(agent);
    await agent.act({ steps: [{ ref: "Total", action: "setMinor", args: [312_500] }] });
    expect(amountRoot().hasAttribute("data-agent-set")).toBe(true);

    const input = document.querySelector<HTMLInputElement>('[data-slot="amount-field-input"]')!;
    fireEvent.focus(input);
    fireEvent.input(input, { target: { value: "100" } });
    fireEvent.blur(input);

    expect(amountRoot().hasAttribute("data-agent-set")).toBe(false);
    expect(presence.marked()).toEqual([]);
    presence.detach();
  });

  it("clears every mark when the person acknowledges", async () => {
    const agent = createBookiAgent();
    renderControls();
    const presence = attachAgentPresence(agent);
    await agent.act({
      steps: [
        { ref: "Total", action: "setMinor", args: [312_500] },
        { ref: "MVA", action: "setTaxCode", args: ["MVA15"] },
      ],
    });
    expect(presence.marked()).toHaveLength(2);
    presence.acknowledge();
    expect(amountRoot().hasAttribute("data-agent-set")).toBe(false);
    expect(taxRoot().hasAttribute("data-agent-set")).toBe(false);
    presence.detach();
  });
});

describe("AgentPresence", () => {
  it("shows the marker on the control while the agent works", async () => {
    const agent = createBookiAgent();
    render(
      <>
        <AmountField defaultValue={249_000} aria-label="Total" />
        <AgentPresence agent={agent} linger={5_000} />
      </>,
    );
    const marker = () => document.querySelector('[data-slot="agent-presence"]')!;
    expect(marker().getAttribute("data-active")).toBe("false");
    await act(async () => {
      await agent.act({ steps: [{ ref: "Total", action: "setMinor", args: [312_500] }] });
    });
    expect(marker().getAttribute("data-active")).toBe("true");
    expect(marker().textContent).toContain("Total");
  });
});

describe("useAgentProposal", () => {
  it("stages a value as a proposal, then reverts it exactly", async () => {
    const agent = createBookiAgent();
    renderControls();
    const { result } = renderHook(() => useAgentProposal(agent));

    await act(async () => {
      await result.current.propose([{ ref: "Total", key: "minor", value: 480_000 }]);
    });
    expect(result.current.pending).toBe(true);
    expect(result.current.applied[0]).toMatchObject({ before: 249_000, value: 480_000 });
    expect(snapshotAmount(agent)).toBe(480_000);
    expect(amountRoot().hasAttribute("data-agent-proposed")).toBe(true);
    expect(amountRoot().hasAttribute("data-agent-set")).toBe(false);

    await act(async () => {
      await result.current.revert();
    });
    expect(result.current.pending).toBe(false);
    expect(snapshotAmount(agent)).toBe(249_000);
    expect(amountRoot().hasAttribute("data-agent-proposed")).toBe(false);
  });

  it("keeps the value and removes the proposal mark on keep", async () => {
    const agent = createBookiAgent();
    renderControls();
    const { result } = renderHook(() => useAgentProposal(agent));
    await act(async () => {
      await result.current.propose([{ ref: "Total", key: "minor", value: 480_000 }]);
    });
    act(() => result.current.keep());
    expect(snapshotAmount(agent)).toBe(480_000);
    expect(amountRoot().hasAttribute("data-agent-proposed")).toBe(false);
    expect(result.current.pending).toBe(false);
  });

  it("replaces a pending proposal instead of stacking them", async () => {
    const agent = createBookiAgent();
    renderControls();
    const { result } = renderHook(() => useAgentProposal(agent));
    await act(async () => {
      await result.current.propose([{ ref: "Total", key: "minor", value: 480_000 }]);
    });
    await act(async () => {
      await result.current.propose([{ ref: "Total", key: "minor", value: 500_000 }]);
    });
    expect(result.current.applied).toHaveLength(1);
    expect(result.current.applied[0]).toMatchObject({ before: 249_000, value: 500_000 });
    await act(async () => {
      await result.current.revert();
    });
    expect(snapshotAmount(agent)).toBe(249_000);
  });
});

describe("AgentProposal", () => {
  it("renders nothing without changes, and the change with keep and revert otherwise", () => {
    const { container, rerender } = render(<AgentProposal applied={[]} onKeep={() => {}} onRevert={() => {}} />);
    expect(container.firstChild).toBeNull();
    let kept = 0;
    rerender(
      <AgentProposal
        applied={[{ ref: "c1", key: "minor", before: 249_000, value: 480_000 }]}
        describe={() => "Total"}
        onKeep={() => (kept += 1)}
        onRevert={() => {}}
      />,
    );
    expect(container.textContent).toContain("Total");
    expect(container.textContent).toContain("249000");
    expect(container.textContent).toContain("480000");
    const [keep, revert] = [...container.querySelectorAll("button")];
    expect(keep!.getAttribute("data-agent-confirm")).toBeTruthy();
    expect(revert!.getAttribute("data-agent-confirm")).toBeTruthy();
    fireEvent.click(keep!);
    expect(kept).toBe(1);
  });
});
