import type { BankLine, OpenPost, ReconciliationMatch } from "@booki/core/reconciliation";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BankReconciliation } from "./bank-reconciliation.js";
import { createBookiAgent, createBookiHistory } from "./booki-agent.js";
import { BookiLocaleProvider } from "./locale.js";

afterEach(() => cleanup());

const bank: BankLine[] = [
  { id: "b1", date: "2026-10-01", description: "Nordlys AS", amountMinor: 125_000 },
  { id: "b2", date: "2026-10-02", description: "Samlebetaling", amountMinor: 300_000 },
];
const posts: OpenPost[] = [
  { id: "p1", date: "2026-09-20", description: "Faktura 1001", amountMinor: 125_000 },
  { id: "p2", date: "2026-09-21", description: "Faktura 1002", amountMinor: 100_000 },
  { id: "p3", date: "2026-09-22", description: "Faktura 1003", amountMinor: 200_000 },
];
const REF = "Bankavstemming";

type Entry = {
  actions: string[];
  matches: ReconciliationMatch[];
  unmatchedBankLines: BankLine[];
  unmatchedPosts: OpenPost[];
  reconciled: boolean;
  confirm?: string;
};

function setup() {
  const agent = createBookiAgent({ agentId: "test" });
  render(
    <BookiLocaleProvider defaultCountry="NO">
      <BankReconciliation bankLines={bank} openPosts={posts} />
    </BookiLocaleProvider>,
  );
  const entry = () => agent.snapshot().find((c) => c.component === "bank-reconciliation") as unknown as Entry;
  const act = (action: string, args: unknown[]) =>
    agent.act({ steps: [{ ref: REF, action, args }] }) as Promise<{
      ok: boolean;
      error?: { message: string };
    }>;
  const button = (name: string) => [...document.querySelectorAll("button")].find((b) => b.textContent === name)!;
  return { agent, entry, act, button };
}

describe("BankReconciliation for an agent", () => {
  it("turns setMatches from an agent into suggestions, as the real models sent them", async () => {
    const { entry, act } = setup();
    // What Haiku, DeepSeek and Sonnet sent: every match at once, with no status.
    const sent = await act("setMatches", [
      [
        { bankLineIds: ["b1"], postIds: ["p1"] },
        { bankLineIds: ["b2"], postIds: ["p2", "p3"] },
      ],
    ]);
    expect(sent.ok).toBe(true);
    expect(entry().matches.map((m) => [m.status, m.source])).toEqual([
      ["suggested", "agent"],
      ["suggested", "agent"],
    ]);
    // The person is asked: each suggestion has its approve button.
    expect(
      [...document.querySelectorAll("button")].filter((b) => /^(Attester|Approve)$/.test(b.textContent ?? "")),
    ).toHaveLength(2);
  });

  it("refuses an agent approving or rejecting through setMatches, and keeps what a person decided", async () => {
    const { entry, act } = setup();
    const approved = await act("setMatches", [
      [{ id: "m1", bankLineIds: ["b1"], postIds: ["p1"], status: "approved", source: "agent" }],
    ]);
    expect(approved.ok).toBe(false);
    expect(approved.error?.message).toMatch(/only a person approves or rejects a match/);
    expect(entry().matches).toEqual([]);

    expect((await act("suggestMatch", [["b1"], ["p1"]])).ok).toBe(true);
    const id = entry().matches[0]!.id;
    // A person approves it with the button.
    fireEvent.click(
      [...document.querySelectorAll("button")].find((b) => /^(Attester|Approve)$/.test(b.textContent ?? ""))!,
    );
    expect(entry().matches[0]!.status).toBe("approved");
    const dropped = await act("setMatches", [[]]);
    expect(dropped.ok).toBe(false);
    expect(dropped.error?.message).toMatch(new RegExp(`${id} is approved by a person and stays`));
    // Given back unchanged, alongside a new suggestion: fine.
    const kept = await act("setMatches", [[entry().matches[0], { bankLineIds: ["b2"], postIds: ["p2", "p3"] }]]);
    expect(kept.ok).toBe(true);
    expect(entry().matches.map((m) => m.status)).toEqual(["approved", "suggested"]);
  });

  it("shows what is unmatched and offers only suggest, withdraw, restore and assert", () => {
    const { entry } = setup();
    const state = entry();
    expect(state.actions).toEqual(["suggestMatch", "withdrawMatch", "setMatches", "assertReconciled"]);
    expect(state.unmatchedBankLines.map((l) => l.id)).toEqual(["b1", "b2"]);
    expect(state.unmatchedPosts.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    expect(state.reconciled).toBe(false);
    expect(state.confirm).toBeUndefined();
  });

  it("lets the agent suggest one to one and one to many, without approving", async () => {
    const { entry, act } = setup();
    expect((await act("suggestMatch", ["b1", "p1"])).ok).toBe(true);
    expect((await act("suggestMatch", [["b2"], ["p2", "p3"]])).ok).toBe(true);
    const state = entry();
    expect(state.matches.map((m) => [m.id, m.status, m.source])).toEqual([
      ["m1", "suggested", "agent"],
      ["m2", "suggested", "agent"],
    ]);
    expect(state.unmatchedBankLines).toEqual([]);
    expect(state.reconciled).toBe(false);
    const refused = await act("assertReconciled", []);
    expect(refused.ok).toBe(false);
    expect(refused.error?.message).toMatch(/2 waiting for approval/);
  });

  it("refuses a match that does not sum, an unknown id and a taken line", async () => {
    const { entry, act } = setup();
    const cases: Array<[unknown[], RegExp]> = [
      [["b2", "p2"], /differ by 200000 minor units/],
      [["b9", "p1"], /No bank line "b9"/],
      [["b1", "p9"], /No open post "p9"/],
    ];
    for (const [args, message] of cases) {
      const result = await act("suggestMatch", args);
      expect(result.ok).toBe(false);
      expect(result.error?.message).toMatch(message);
    }
    await act("suggestMatch", ["b1", "p1"]);
    const taken = await act("suggestMatch", ["b1", "p1"]);
    expect(taken.error?.message).toMatch(/already in a match/);
    expect(entry().matches).toHaveLength(1);
  });

  it("cannot approve or reject: those are not agent actions", async () => {
    const { entry, act } = setup();
    await act("suggestMatch", ["b1", "p1"]);
    for (const action of ["approveMatch", "rejectMatch", "matchSelected"]) {
      const result = await act(action, ["m1"]);
      expect(result.ok, action).toBe(false);
    }
    expect(entry().matches[0]!.status).toBe("suggested");
  });

  it("can withdraw its suggestion, but not a match a person approved", async () => {
    const { entry, act, button } = setup();
    await act("suggestMatch", ["b1", "p1"]);
    expect((await act("withdrawMatch", ["m1"])).ok).toBe(true);
    expect(entry().matches).toEqual([]);
    await act("suggestMatch", ["b1", "p1"]);
    fireEvent.click(button("Attester"));
    const refused = await act("withdrawMatch", ["m1"]);
    expect(refused.ok).toBe(false);
    expect(refused.error?.message).toMatch(/is approved. Only a suggestion can be withdrawn/);
  });

  it("undoes the agent's suggestions through history", async () => {
    const { agent, entry, act } = setup();
    const history = createBookiHistory(agent);
    await act("suggestMatch", ["b1", "p1"]);
    expect(entry().matches).toHaveLength(1);
    expect(await history.undoSource("agent")).toEqual([]);
    expect(entry().matches).toEqual([]);
  });
});

describe("BankReconciliation for a person", () => {
  it("approves and rejects suggestions with the buttons", async () => {
    const { entry, act, button } = setup();
    await act("suggestMatch", ["b1", "p1"]);
    await act("suggestMatch", ["b2", ["p2", "p3"]]);
    // The first suggestion's own button must act on the first suggestion.
    fireEvent.click(button("Attester"));
    expect(entry().matches.map((m) => m.status)).toEqual(["approved", "suggested"]);
    fireEvent.click(button("Avvis"));
    expect(entry().matches.map((m) => m.status)).toEqual(["approved", "rejected"]);
    // A rejected match frees its lines again.
    expect(entry().unmatchedBankLines.map((l) => l.id)).toEqual(["b2"]);
  });

  it("matches selected rows only when both sides sum the same", () => {
    const { entry, button } = setup();
    const check = (label: string) => fireEvent.click(document.querySelector(`input[aria-label="Velg: ${label}"]`)!);
    expect(button("Avstem valgte").disabled).toBe(true);
    check("Samlebetaling");
    check("Faktura 1002");
    expect(button("Avstem valgte").disabled).toBe(true);
    expect(document.querySelector('[data-slot="bank-reconciliation-difference"]')?.textContent).toMatch(/Differanse/);
    check("Faktura 1003");
    expect(button("Avstem valgte").disabled).toBe(false);
    fireEvent.click(button("Avstem valgte"));
    expect(entry().matches).toMatchObject([
      { bankLineIds: ["b2"], postIds: ["p2", "p3"], status: "approved", source: "person" },
    ]);
  });

  it("is reconciled once every bank line is in an approved match", async () => {
    const { entry, act, button } = setup();
    await act("suggestMatch", ["b1", "p1"]);
    await act("suggestMatch", ["b2", ["p2", "p3"]]);
    fireEvent.click(button("Attester"));
    fireEvent.click(button("Attester"));
    expect(entry().reconciled).toBe(true);
    expect((await act("assertReconciled", [])).ok).toBe(true);
    expect(document.querySelector('[data-slot="bank-reconciliation"]')?.getAttribute("data-reconciled")).toBe("true");
  });
});
