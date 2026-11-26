import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBookiAgent } from "./booki-agent.js";
import { AgentCursor, createAgentCursor, narrateNorwegian, type AgentCursorPhase } from "./agent-cursor.js";
import { IbanInput } from "./iban-input.js";
import { AmountField } from "./amount-field.js";
import { BookiLocaleProvider } from "./locale.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function amountStep() {
  render(
    <BookiLocaleProvider defaultCountry="US">
      <AmountField aria-label="Amount" />
    </BookiLocaleProvider>,
  );
  const field = createBookiAgent()
    .snapshot()
    .find((entry) => entry.component === "amount-field")!;
  return { component: field.component, ref: field.ref, label: "Amount", action: "setMinor", args: [12500] };
}

describe("AgentCursor", () => {
  it.each(["assertValid", "find", "findBlocks", "overdue"])(
    "reads %s without pressing, then clears after linger",
    async (action) => {
      vi.useFakeTimers();
      const step = amountStep();
      const cursor = createAgentCursor({ travel: 0, linger: 20, scroll: false });
      const phases: AgentCursorPhase[] = [];
      cursor.subscribe((state) => phases.push(state.phase));
      await cursor.lead({ ...step, action });
      expect(cursor.state().phase).toBe("move");
      cursor.settle(true);
      await vi.advanceTimersByTimeAsync(21);
      expect(phases).toEqual(["idle", "move", "done", "idle"]);
      expect(cursor.state().point).toBeNull();
    },
  );

  it("cancels decoration during travel immediately when disabled while keeping the underlying decision", async () => {
    const step = amountStep();
    const cursor = createAgentCursor({ travel: 10000, scroll: false });
    const allow = vi.fn(() => true);
    const pending = cursor.wrap(allow)(step, { signal: new AbortController().signal });
    expect(cursor.state().phase).toBe("move");
    cursor.setEnabled(false);
    cursor.setEnabled(true);
    expect(await pending).toBe(true);
    expect(allow).toHaveBeenCalledOnce();
    expect(cursor.state().phase).toBe("idle");
  });

  it("does not call the decision or resurrect the pointer after abort during travel", async () => {
    const step = amountStep();
    const cursor = createAgentCursor({ travel: 10000, scroll: false });
    const allow = vi.fn(() => true);
    const abort = new AbortController();
    const pending = cursor.wrap(allow)(step, { signal: abort.signal });
    abort.abort();
    await expect(pending).rejects.toBe(abort.signal.reason);
    expect(allow).not.toHaveBeenCalled();
    expect(cursor.state().phase).toBe("idle");
  });

  it("keeps a newer target when an earlier decision returns or its signal aborts", async () => {
    const step = amountStep();
    const cursor = createAgentCursor({ travel: 0, press: 0, scroll: false });
    let answer!: (decision: boolean) => void;
    const abort = new AbortController();
    const allow = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          answer = resolve;
        }),
    );
    const pending = cursor.wrap(allow)(step, { signal: abort.signal });
    await vi.waitFor(() => expect(allow).toHaveBeenCalledOnce());
    cursor.rest(document.body, "Next target");
    abort.abort();
    answer(false);
    await expect(pending).rejects.toBe(abort.signal.reason);
    expect(cursor.state()).toMatchObject({ phase: "done", action: "Next target" });
    cursor.setEnabled(false);
  });

  it("clears a missing or unmounted target and never puts secret input in narration", async () => {
    const mounted = render(
      <BookiLocaleProvider defaultCountry="NO">
        <IbanInput aria-label="IBAN" />
      </BookiLocaleProvider>,
    );
    const field = createBookiAgent()
      .snapshot()
      .find((entry) => entry.component === "iban-input")!;
    const cursor = createAgentCursor({ travel: 0, press: 0, scroll: false });
    const step = { ref: field.ref, component: field.component, action: "setIban", args: ["private-test-value"] };
    await cursor.lead(step);
    expect(cursor.state().step?.args).toEqual([]);
    expect(cursor.state().action).toBe("set iban");
    mounted.unmount();
    await vi.waitFor(() => expect(cursor.state().point).toBeNull());
    cursor.rest(document.body);
    const allow = vi.fn(() => true);
    expect(await cursor.wrap(allow)({ ...step, ref: "missing" }, { signal: new AbortController().signal })).toBe(true);
    expect(cursor.state().phase).toBe("idle");
    cursor.setEnabled(false);
  });

  it("keeps unknown narrated actions readable and propagates permission errors", async () => {
    const step = amountStep();
    const cursor = createAgentCursor({ travel: 0, press: 0, scroll: false });
    const failure = new Error("Unavailable");
    const reject = cursor.wrap(() => {
      throw failure;
    });
    await expect(
      reject({ ...step, action: "customAction", args: ["entry"] }, { signal: new AbortController().signal }),
    ).rejects.toBe(failure);
    expect(cursor.state().phase).toBe("refused");
    expect(narrateNorwegian(cursor.state())).toBe("custom action entry");
    cursor.setEnabled(false);
  });

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

  it("scrolls to a control that a sticky bar covers, and not to one with its own icon on top", async () => {
    const cursor = createAgentCursor({ travel: 0, press: 0, linger: 10_000 });
    const agent = createBookiAgent({ agentId: "test", allow: cursor.wrap(() => true) });
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <div style={{ position: "sticky", top: 0 }}>
          <span id="bar">Toolbar</span>
        </div>
        <div>
          <AmountField aria-label="Beløp" />
          <span id="icon">kr</span>
        </div>
      </BookiLocaleProvider>,
    );
    const scrolled = vi.fn();
    const proto = Element.prototype as Element & { scrollIntoView: () => void };
    const before = proto.scrollIntoView;
    proto.scrollIntoView = scrolled;
    const page = document as unknown as { elementFromPoint?: (x: number, y: number) => Element | null };
    const pointed = page.elementFromPoint;
    const ref = agent.snapshot().find((c) => c.component === "amount-field")!.ref;
    const step = async (minor: number) => {
      await act(async () => {
        await agent.act({ steps: [{ ref, action: "setMinor", args: [minor] }] });
      });
    };
    try {
      page.elementFromPoint = () => document.querySelector("#icon");
      await step(1);
      expect(scrolled).not.toHaveBeenCalled();
      page.elementFromPoint = () => document.querySelector("#bar");
      await step(2);
      expect(scrolled).toHaveBeenCalledTimes(1);
    } finally {
      proto.scrollIntoView = before;
      page.elementFromPoint = pointed;
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
    expect(document.querySelector('[data-slot="agent-cursor-label"]')?.textContent).toMatch(
      /Agent · setter beløp 125,00/,
    );
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
