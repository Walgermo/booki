import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { isPersonOnly, personOnly } from "@booki/primitives/person-only";
import { BankReconciliation } from "./bank-reconciliation.js";
import { createBookiAgent } from "./booki-agent.js";
import { BookiLocaleProvider } from "./locale.js";

// Findings of the internal security review of 23 November 2026.
afterEach(() => cleanup());

describe("payment references in a bank reconciliation", () => {
  it("never reach the agent, and equal references share a tag", async () => {
    const agent = createBookiAgent();
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <BankReconciliation
          bankLines={[
            { id: "b1", date: "2026-10-03", description: "Innbetaling", amountMinor: 100_00, reference: "2345676" },
            { id: "b2", date: "2026-10-04", description: "Innbetaling", amountMinor: 100_00, reference: "9876543" },
          ]}
          openPosts={[
            { id: "p1", date: "2026-09-20", description: "Faktura 1", amountMinor: 100_00, reference: "9876543" },
            { id: "p2", date: "2026-09-21", description: "Faktura 2", amountMinor: 100_00, reference: "2345676" },
          ]}
        />
      </BookiLocaleProvider>,
    );
    const entry = agent.snapshot().find((c) => c.component === "bank-reconciliation") as unknown as {
      ref: string;
      unmatchedBankLines: { id: string; referenceTag?: string }[];
      unmatchedPosts: { id: string; referenceTag?: string }[];
    };
    const seen = JSON.stringify(agent.snapshot());
    expect(seen).not.toContain("2345676");
    expect(seen).not.toContain("9876543");
    const tag = (list: { id: string; referenceTag?: string }[], id: string) =>
      list.find((x) => x.id === id)!.referenceTag;
    expect(tag(entry.unmatchedBankLines, "b1")).toBe(tag(entry.unmatchedPosts, "p2"));
    expect(tag(entry.unmatchedBankLines, "b2")).toBe(tag(entry.unmatchedPosts, "p1"));
    expect(tag(entry.unmatchedBankLines, "b1")).not.toBe(tag(entry.unmatchedBankLines, "b2"));
    const result = await agent.act({ steps: [{ ref: entry.ref, action: "suggestMatch", args: [["b1"], ["p2"]] }] });
    expect(JSON.stringify(result)).not.toMatch(/2345676|9876543/);
    // The person's tables still list every open line.
    expect(document.querySelectorAll('[data-slot="bank-reconciliation-bank"] tbody tr').length).toBeGreaterThan(0);
  });
});

describe("a person's decision under several confirm marks", () => {
  it("is still recognised when the bridge joins the sentences", () => {
    const sentence = personOnly("Signing the return needs a person (review)");
    expect(isPersonOnly(`Changes need review; ${sentence}`)).toBe(true);
    expect(isPersonOnly(`  ${"x".repeat(300)}`)).toBe(false);
    const long = personOnly(`${"A long person-only sentence ".repeat(10)}`);
    expect(isPersonOnly(long.trim().slice(0, 200))).toBe(true);
  });
});

describe("a step the control itself refuses", () => {
  it("gets an audit row through actAndRecord, without the step's arguments", async () => {
    const { AmountField } = await import("./amount-field.js");
    const { actAndRecord } = await import("./index.js");
    const rows: { action: string; detail?: string }[] = [];
    const audit = (row: { action: string; detail?: string }) => rows.push(row);
    const agent = createBookiAgent({ allow: () => true, audit, agentId: "bookkeeper" });
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <AmountField aria-label="Beløp" />
      </BookiLocaleProvider>,
    );
    const ref = agent.snapshot().find((c) => c.component === "amount-field")!.ref;
    const result = await actAndRecord(
      agent,
      { steps: [{ ref, action: "setMinor", args: [12.5] }] },
      { audit, agentId: "bookkeeper" },
    );
    expect(result.ok).toBe(false);
    expect(rows).toEqual([expect.objectContaining({ action: "agent.failed", actor: "agent:bookkeeper" })]);
    expect(rows[0]!.detail).toMatch(/^setMinor: /);
  });
});
