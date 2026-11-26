import { createAgent } from "@ui-sdk/react/agent";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AgentLog, useAgentLog } from "./agent-log.js";
import { AmountField } from "./amount-field.js";
import { BankAccountInput } from "./bank-account-input.js";
import { createBookiAgent } from "./booki-agent.js";
import { IconButton } from "./icon-button.js";
import { BookiLocaleProvider } from "./locale.js";

afterEach(cleanup);

type Result = { ok: boolean; error?: { step: number; message: string } };
type Control = { ref: string; component: string; label?: string; actions: string[]; [key: string]: unknown };

/** An English page: a page without a provider is Norwegian. */
const en = (ui: ReactNode) => render(<BookiLocaleProvider defaultCountry="US">{ui}</BookiLocaleProvider>);
const onPage = (agent: ReturnType<typeof createBookiAgent>) =>
  (agent.snapshot() as unknown as Control[]).filter((control) => !control.offPage);
const rows = () => [...document.querySelectorAll('[data-slot="agent-log-row"]')];
const Icon = () => <svg width="16" height="16" aria-hidden="true" />;

function Page({ agent }: { agent: ReturnType<typeof createBookiAgent> }) {
  return (
    <>
      <AmountField defaultValue={249_000} aria-label="Total" />
      <IconButton label="Post voucher" icon={<Icon />} data-agent-confirm="Posting a voucher needs a person" />
      <AgentLog agent={agent} />
    </>
  );
}

describe("AgentLog", () => {
  it("says what will appear while it is empty, on a live polite region", () => {
    en(<AgentLog rows={[]} />);
    const log = screen.getByRole("log");
    expect(log.getAttribute("aria-live")).toBe("polite");
    expect(document.querySelector('[data-slot="agent-log-empty"]')?.textContent).toBe(
      "No agent calls yet. Each call the agent makes and its answer will be listed here.",
    );
    expect(document.querySelector('[data-slot="agent-log-heading"]')?.textContent).toBe("Agent calls");
    // No fixed tall box: it only caps its height.
    expect(log.style.maxHeight).toBe("16rem");
    expect(log.style.height).toBe("");
  });

  it("shows rows it is given, with a done and a refused tag and the reason", () => {
    en(
      <AgentLog
        maxHeight={200}
        rows={[
          { id: "1", call: "Total · setMinor(312500)", status: "done" },
          { id: "2", call: 'Post voucher · press("Post voucher")', status: "refused", detail: "Needs a person." },
        ]}
      />,
    );
    const [done, refused] = rows();
    expect(done?.querySelector('[data-slot="agent-log-tag"]')?.textContent).toBe("done");
    expect(refused?.getAttribute("data-status")).toBe("refused");
    expect(refused?.querySelector('[data-slot="agent-log-detail"]')?.textContent).toBe("Needs a person.");
    expect(document.querySelector('[data-slot="agent-log-count"]')?.textContent).toBe(" · 1 refused");
    expect(screen.getByRole("log").style.maxHeight).toBe("200px");
  });

  it("lists a real agent's done step and its refused step, newest last", async () => {
    const agent = createBookiAgent();
    en(<Page agent={agent} />);

    await act(async () => {
      const result = (await agent.act({ steps: [{ ref: "Total", action: "setMinor", args: [312_500] }] })) as Result;
      expect(result.ok).toBe(true);
    });
    await act(async () => {
      const result = (await agent.act({
        steps: [{ ref: "Post voucher", action: "press", args: [] }],
      } as never)) as Result;
      expect(result.ok).toBe(false);
    });

    const [first, second] = rows();
    expect(rows()).toHaveLength(2);
    expect(first?.querySelector('[data-slot="agent-log-call"]')?.textContent).toBe("Total · setMinor(312500)");
    expect(first?.getAttribute("data-status")).toBe("done");
    expect(second?.querySelector('[data-slot="agent-log-call"]')?.textContent).toBe("Post voucher · press()");
    expect(second?.getAttribute("data-status")).toBe("refused");
    expect(second?.querySelector('[data-slot="agent-log-detail"]')?.textContent).toContain(
      "Posting a voucher needs a person",
    );
  });

  it("shows a step as waiting for a person while the app's allow is asking", async () => {
    let answer: (yes: boolean) => void = () => {};
    const agent = createBookiAgent({ allow: () => new Promise<boolean>((resolve) => (answer = resolve)) });
    en(<Page agent={agent} />);

    let pending: Promise<unknown> = Promise.resolve();
    await act(async () => {
      pending = agent.act({ steps: [{ ref: "Post voucher", action: "press", args: [] }] } as never);
    });
    await waitFor(() => expect(rows()[0]?.getAttribute("data-status")).toBe("waiting"));
    expect(rows()[0]?.querySelector('[data-slot="agent-log-tag"]')?.textContent).toBe("waiting for a person");
    expect(rows()[0]?.querySelector('[data-slot="agent-log-detail"]')?.textContent).toBe(
      "Posting a voucher needs a person",
    );

    await act(async () => {
      answer(true);
      await pending;
    });
    expect(rows()[0]?.getAttribute("data-status")).toBe("done");
  });

  it("is invisible to the agent: it adds no control to the snapshot", async () => {
    const agent = createBookiAgent();
    en(<AgentLog rows={[{ id: "1", call: "Total · setMinor(1)", status: "done" }]} />);
    expect(document.querySelector('[data-slot="agent-log"]')?.hasAttribute("data-agent-hidden")).toBe(true);
    expect(onPage(agent)).toEqual([]);
  });

  it("never shows the arguments sent to a secret control", async () => {
    const agent = createBookiAgent();
    en(
      <BookiLocaleProvider defaultCountry="NO">
        <BankAccountInput />
        <AgentLog agent={agent} />
      </BookiLocaleProvider>,
    );
    const bank = onPage(agent).find((control) => control.component === "bank-account");
    expect(bank).toBeDefined();
    const action = bank!.actions.find((name) => name.startsWith("set")) ?? bank!.actions[0]!;
    await act(async () => {
      await agent.act({ steps: [{ ref: bank!.ref, action, args: ["86011117947"] }] } as never);
    });
    const text = document.querySelector('[data-slot="agent-log"]')?.textContent ?? "";
    expect(text).toContain("[redacted]");
    expect(text).not.toContain("86011117947");
  });

  it("follows a plain bridge's changes through attachAudit", async () => {
    const agent = createAgent();
    en(
      <>
        <AmountField defaultValue={100} aria-label="Total" />
        <AgentLog agent={agent} />
      </>,
    );
    await act(async () => {
      await agent.act({ steps: [{ ref: "Total", action: "setMinor", args: [500] }] } as never);
    });
    expect(rows()[0]?.getAttribute("data-status")).toBe("done");
    expect(rows()[0]?.querySelector('[data-slot="agent-log-call"]')?.textContent).toBe("Total · amount.setMinor");
  });

  it("keeps the newest rows up to its limit, and useAgentLog hands them out", async () => {
    const agent = createBookiAgent();
    const seen: number[] = [];
    function Own() {
      const { rows: list } = useAgentLog(agent, { limit: 2 });
      seen.push(list.length);
      return <AgentLog rows={list} />;
    }
    en(
      <>
        <AmountField defaultValue={100} aria-label="Total" />
        <Own />
      </>,
    );
    for (const minor of [200, 300, 400]) {
      await act(async () => {
        await agent.act({ steps: [{ ref: "Total", action: "setMinor", args: [minor] }] });
      });
    }
    expect(rows().map((row) => row.querySelector('[data-slot="agent-log-call"]')?.textContent)).toEqual([
      "Total · setMinor(300)",
      "Total · setMinor(400)",
    ]);
    expect(Math.max(...seen)).toBe(2);
  });

  it("writes its words in Norwegian for a Norwegian page", async () => {
    en(
      <BookiLocaleProvider defaultCountry="NO">
        <AgentLog rows={[]} />
      </BookiLocaleProvider>,
    );
    await waitFor(() =>
      expect(document.querySelector('[data-slot="agent-log-empty"]')?.textContent).toBe(
        "Ingen kall fra agenten ennå. Hvert kall agenten gjør og svaret på det listes her.",
      ),
    );
    expect(document.querySelector('[data-slot="agent-log-heading"]')?.textContent).toBe("Agentens kall");
    cleanup();
    en(
      <BookiLocaleProvider defaultCountry="NO">
        <AgentLog
          rows={[
            { id: "1", call: "Total · setMinor(1)", status: "done" },
            { id: "2", call: "Post · press()", status: "refused" },
          ]}
        />
      </BookiLocaleProvider>,
    );
    const tags = [...document.querySelectorAll('[data-slot="agent-log-tag"]')].map((tag) => tag.textContent);
    expect(tags).toEqual(["utført", "avvist"]);
  });
});
