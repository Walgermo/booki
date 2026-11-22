import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBookiAgent } from "./booki-agent.js";
import { AgentCursor, createAgentCursor, type AgentCursorPhase } from "./agent-cursor.js";
import { AmountField } from "./amount-field.js";
import { BookiLocaleProvider } from "./locale.js";

afterEach(() => cleanup());

describe("AgentCursor", () => {
  it("stops scrolling to its target once the person scrolls, and resumes after their next press", async () => {
    const cursor = createAgentCursor({ travel: 0, press: 0, linger: 10_000 });
    const agent = createBookiAgent({ agentId: "test", allow: cursor.wrap(() => true) });
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <AmountField aria-label="Beløp" />
        <button type="button">Run</button>
        <AgentCursor cursor={cursor} />
      </BookiLocaleProvider>,
    );
    const scrolled = vi.fn();
    const proto = Element.prototype as Element & { scrollIntoView: () => void };
    const before = proto.scrollIntoView;
    proto.scrollIntoView = scrolled;
    // The field sits far below the fold.
    const input = document.querySelector("input")!;
    input.getBoundingClientRect = () => ({
      top: 3000,
      bottom: 3040,
      left: 0,
      right: 200,
      width: 200,
      height: 40,
      x: 0,
      y: 3000,
      toJSON: () => ({}),
    });
    const ref = agent.snapshot().find((c) => c.component === "amount-field")!.ref;
    const step = async (minor: number) => {
      await act(async () => {
        await agent.act({ steps: [{ ref, action: "setMinor", args: [minor] }] });
      });
    };
    try {
      await step(1);
      expect(scrolled).toHaveBeenCalledTimes(1);

      window.dispatchEvent(new Event("wheel"));
      await step(2);
      expect(scrolled).toHaveBeenCalledTimes(1);

      document.querySelector("button")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      await step(3);
      expect(scrolled).toHaveBeenCalledTimes(2);
    } finally {
      proto.scrollIntoView = before;
    }
  });

  it("goes to the control and presses before the step runs, then your allow decides", async () => {
    const cursor = createAgentCursor({ travel: 0, press: 0, linger: 10_000 });
    const phases: AgentCursorPhase[] = [];
    cursor.subscribe((state) => phases.push(state.phase));
    let seenBeforeRun: AgentCursorPhase | null = null;
    const agent = createBookiAgent({
      agentId: "test",
      allow: cursor.wrap(() => {
        seenBeforeRun = cursor.state().phase;
        return true;
      }),
    });
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <AmountField aria-label="Beløp" />
        <AgentCursor cursor={cursor} />
      </BookiLocaleProvider>,
    );
    const ref = agent.snapshot().find((c) => c.component === "amount-field")!.ref;
    let result: { ok: boolean } = { ok: false };
    await act(async () => {
      result = (await agent.act({ steps: [{ ref, action: "setMinor", args: [12_500] }] })) as { ok: boolean };
    });
    expect(result.ok).toBe(true);
    expect(seenBeforeRun).toBe("press");
    expect(phases).toEqual(expect.arrayContaining(["move", "press", "done"]));
    const overlay = document.querySelector('[data-slot="agent-cursor"]')!;
    expect(overlay.getAttribute("aria-hidden")).toBe("true");
    expect(overlay.getAttribute("data-phase")).toBe("done");
    expect(document.querySelector('[data-slot="agent-cursor-label"]')?.textContent).toMatch(/Agent · set minor 12500/);
  });

  it("shows a refusal, and stays out of the way when turned off", async () => {
    const cursor = createAgentCursor({ travel: 0, press: 0, linger: 10_000 });
    const agent = createBookiAgent({ agentId: "test", allow: cursor.wrap(() => false) });
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <AmountField aria-label="Beløp" />
        <AgentCursor cursor={cursor} />
      </BookiLocaleProvider>,
    );
    const ref = agent.snapshot().find((c) => c.component === "amount-field")!.ref;
    await act(async () => {
      await agent.act({ steps: [{ ref, action: "setMinor", args: [1] }] });
    });
    expect(cursor.state().phase).toBe("refused");

    act(() => cursor.setEnabled(false));
    expect(cursor.state().phase).toBe("idle");
    await act(async () => {
      await agent.act({ steps: [{ ref, action: "setMinor", args: [2] }] });
    });
    expect(cursor.state().phase).toBe("idle");
  });
  it("rests on any element, and sticks to a target that moves instead of gliding after it", async () => {
    const cursor = createAgentCursor({ travel: 0, press: 0, linger: 10_000 });
    render(<AgentCursor cursor={cursor} />);
    const word = document.createElement("span");
    document.body.append(word);
    let top = 100;
    word.getBoundingClientRect = () =>
      ({
        left: 10,
        top,
        width: 80,
        height: 20,
        right: 90,
        bottom: top + 20,
        x: 10,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;
    await act(async () => cursor.rest(word, "starts here"));
    expect(cursor.state()).toMatchObject({ phase: "done", action: "starts here", follow: false });
    expect(cursor.state().box?.y).toBe(100);
    // The page scrolls: the next frame measures again and marks it as following.
    top = 40;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(cursor.state().box?.y).toBe(40);
    expect(cursor.state().follow).toBe(true);
    expect(document.querySelector('[data-slot="agent-cursor"]')?.hasAttribute("data-follow")).toBe(true);
    word.remove();
  });
});
