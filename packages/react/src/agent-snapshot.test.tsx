import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useRef, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AgentSnapshot } from "./agent-snapshot.js";
import { AmountField } from "./amount-field.js";
import { BankAccountInput } from "./bank-account-input.js";
import { createBookiAgent } from "./booki-agent.js";
import { IconButton } from "./icon-button.js";
import { BookiLocaleProvider } from "./locale.js";

afterEach(cleanup);

type Control = { ref: string; component: string; label?: string; actions: string[]; [key: string]: unknown };

/** An English page: a page without a provider is Norwegian. */
const en = (ui: ReactNode) => render(<BookiLocaleProvider defaultCountry="US">{ui}</BookiLocaleProvider>);
const onPage = (agent: ReturnType<typeof createBookiAgent>) =>
  (agent.snapshot() as unknown as Control[]).filter((control) => !control.offPage);
const Icon = () => <svg width="16" height="16" aria-hidden="true" />;

describe("AgentSnapshot", () => {
  function Scoped({ agent, children }: { agent: ReturnType<typeof createBookiAgent>; children: ReactNode }) {
    const scope = useRef<HTMLDivElement | null>(null);
    return (
      <>
        <div ref={scope}>{children}</div>
        <AmountField defaultValue={1} aria-label="Outside" />
        <AgentSnapshot agent={agent} scope={scope} />
      </>
    );
  }

  it("shows each control in scope: its label, its actions and its state", async () => {
    const agent = createBookiAgent();
    en(
      <Scoped agent={agent}>
        <AmountField defaultValue={249_000} aria-label="Total" />
      </Scoped>,
    );
    await waitFor(() => expect(document.querySelectorAll('[data-slot="agent-snapshot-entry"]')).toHaveLength(1));
    expect(document.querySelector('[data-slot="agent-snapshot-label"]')?.textContent).toBe("Total");
    expect(document.querySelector('[data-slot="agent-snapshot-actions"]')?.textContent).toContain("setMinor");
    const state = JSON.parse(document.querySelector('[data-slot="agent-snapshot-state"]')?.textContent ?? "{}");
    const amount = onPage(agent).find((control) => control.label === "Total")!;
    expect(state.value).toEqual(amount.value);
    expect(document.querySelector('[data-slot="agent-snapshot"]')?.textContent).not.toContain("Outside");
  });

  it("updates when the agent changes a control", async () => {
    const agent = createBookiAgent();
    en(
      <Scoped agent={agent}>
        <AmountField defaultValue={100} aria-label="Total" />
      </Scoped>,
    );
    await waitFor(() => expect(document.querySelector('[data-slot="agent-snapshot-state"]')).not.toBeNull());
    await act(async () => {
      await agent.act({ steps: [{ ref: "Total", action: "setMinor", args: [312_500] }] });
    });
    await waitFor(() =>
      expect(document.querySelector('[data-slot="agent-snapshot-state"]')?.textContent).toContain("312500"),
    );
  });

  it("redacts a secret value exactly as the bridge does", async () => {
    const agent = createBookiAgent();
    en(
      <BookiLocaleProvider defaultCountry="NO">
        <Scoped agent={agent}>
          <BankAccountInput kontonummer="86011117947" />
        </Scoped>
      </BookiLocaleProvider>,
    );
    await waitFor(() => expect(document.querySelector('[data-slot="agent-snapshot-state"]')).not.toBeNull());
    const shown = document.querySelector('[data-slot="agent-snapshot"]')?.textContent ?? "";
    expect(shown).not.toContain("86011117947");
    expect(shown).not.toContain("8601 11 17947");
    expect(shown).toContain("[redacted]");
    const bank = onPage(agent).find((control) => control.component === "bank-account")!;
    const { ref: _r, component: _c, label: _l, actions: _a, confirm: _f, offPage: _o, ...state } = bank;
    expect(JSON.parse(document.querySelector('[data-slot="agent-snapshot-state"]')?.textContent ?? "{}")).toEqual(
      state,
    );
  });

  it("says when nothing in scope is in the snapshot, and adds nothing to it", async () => {
    const agent = createBookiAgent();
    en(
      <Scoped agent={agent}>
        <p>Only text</p>
      </Scoped>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    expect(document.querySelector('[data-slot="agent-snapshot-empty"]')?.textContent).toBe(
      "Nothing here is in the agent's snapshot. It only displays, so an agent has nothing to read or call on it.",
    );
    expect(onPage(agent).map((control) => control.label)).toEqual(["Outside"]);
  });

  it("shows nothing once its scope leaves the page, and never falls back to the whole page", async () => {
    const agent = createBookiAgent();
    function Toggle({ open }: { open: boolean }) {
      const scope = useRef<HTMLDivElement | null>(null);
      return (
        <>
          {open ? (
            <div ref={scope}>
              <AmountField defaultValue={100} aria-label="Total" />
            </div>
          ) : null}
          <AmountField defaultValue={1} aria-label="Outside" />
          <AgentSnapshot agent={agent} scope={scope} />
        </>
      );
    }
    const view = en(<Toggle open />);
    await waitFor(() =>
      expect(document.querySelector('[data-slot="agent-snapshot-label"]')?.textContent).toBe("Total"),
    );
    view.rerender(
      <BookiLocaleProvider defaultCountry="US">
        <Toggle open={false} />
      </BookiLocaleProvider>,
    );
    await waitFor(() => expect(document.querySelector('[data-slot="agent-snapshot-entry"]')).toBeNull());
    // A change elsewhere still lists nothing: the scope is empty, not the whole page.
    await act(async () => {
      await agent.act({ steps: [{ ref: "Outside", action: "setMinor", args: [5] }] });
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    expect(document.querySelector('[data-slot="agent-snapshot-entry"]')).toBeNull();
    expect(document.querySelector('[data-slot="agent-snapshot"]')?.textContent).not.toContain("Outside");
  });

  it("picks up an attribute-only change, like a new confirm sentence", async () => {
    const agent = createBookiAgent();
    const page = (confirm: string) => (
      <BookiLocaleProvider defaultCountry="US">
        <Scoped agent={agent}>
          <IconButton label="Post" icon={<Icon />} data-agent-confirm={confirm} />
        </Scoped>
      </BookiLocaleProvider>
    );
    const view = render(page("Posting needs a person"));
    await waitFor(() =>
      expect(document.querySelector('[data-slot="agent-snapshot-confirm"]')?.textContent).toBe(
        "Asks a person first: Posting needs a person",
      ),
    );
    view.rerender(page("Posting over 5000 needs a person"));
    await waitFor(() =>
      expect(document.querySelector('[data-slot="agent-snapshot-confirm"]')?.textContent).toBe(
        "Asks a person first: Posting over 5000 needs a person",
      ),
    );
  });

  it("with dialogs, also shows an open dialog outside its scope", async () => {
    function WithDialog({ agent, dialogs }: { agent: ReturnType<typeof createBookiAgent>; dialogs: boolean }) {
      const scope = useRef<HTMLDivElement | null>(null);
      return (
        <>
          <div ref={scope}>
            <AmountField defaultValue={1} aria-label="Total" />
          </div>
          <div role="dialog" aria-label="Confirm">
            <AmountField defaultValue={2} aria-label="In dialog" />
          </div>
          <AgentSnapshot agent={agent} scope={scope} dialogs={dialogs} />
        </>
      );
    }
    const agent = createBookiAgent();
    const { rerender } = en(<WithDialog agent={agent} dialogs={false} />);
    await waitFor(() => expect(document.querySelectorAll('[data-slot="agent-snapshot-entry"]')).toHaveLength(1));
    rerender(
      <BookiLocaleProvider defaultCountry="US">
        <WithDialog agent={agent} dialogs />
      </BookiLocaleProvider>,
    );
    await waitFor(() => expect(document.querySelectorAll('[data-slot="agent-snapshot-entry"]')).toHaveLength(2));
    expect(document.querySelector('[data-slot="agent-snapshot"]')?.textContent).toContain("In dialog");
  });

  it("writes its words in Norwegian for a Norwegian page", async () => {
    const agent = createBookiAgent();
    en(
      <BookiLocaleProvider defaultCountry="NO">
        <Scoped agent={agent}>
          <IconButton label="Bokfør" icon={<Icon />} data-agent-confirm="Bokføring krever en person" />
        </Scoped>
      </BookiLocaleProvider>,
    );
    await waitFor(() =>
      expect(document.querySelector('[data-slot="agent-snapshot-heading"]')?.textContent).toBe("Det agenten leser"),
    );
    await waitFor(() =>
      expect(document.querySelector('[data-slot="agent-snapshot-confirm"]')?.textContent).toBe(
        "Spør en person først: Bokføring krever en person",
      ),
    );
  });
});
