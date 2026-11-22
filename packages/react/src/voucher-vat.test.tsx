import type { VoucherLine } from "@booki/core/voucher";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createBookiAgent } from "./booki-agent.js";
import { BookiLocaleProvider } from "./locale.js";
import { VoucherComposer } from "./voucher-composer.js";

/**
 * A VAT code on a line means its amount includes VAT. From a real-model
 * benchmark: one model entered 6800 gross with MVA25 (right); another entered
 * the net amount with MVA25 plus its own 2710 line, which counts the VAT twice.
 */

afterEach(() => {
  cleanup();
});

type Snapshot = { lines: VoucherLine[]; postable: boolean; postings: (VoucherLine & { vatOf?: string })[] };

function composer(agent: ReturnType<typeof createBookiAgent>) {
  return agent.snapshot().find((c) => c.component === "voucher-composer") as unknown as Snapshot;
}

function renderWith(lines: VoucherLine[]) {
  return render(
    <BookiLocaleProvider defaultCountry="NO">
      <VoucherComposer defaultLines={lines} aria-label="Voucher lines" />
    </BookiLocaleProvider>,
  );
}

const line = (id: string, account: string, debitMinor: number, creditMinor: number, vatCode?: string): VoucherLine => ({
  id,
  account,
  accountName: account,
  debitMinor,
  creditMinor,
  ...(vatCode ? { vatCode } : {}),
});

const amounts = (lines: VoucherLine[]) => lines.map((l) => [l.account, l.debitMinor, l.creditMinor]);

describe("VoucherComposer VAT on gross lines", () => {
  it("snapshots the postings the ledger receives: a gross MVA25 line splits into net and 2710", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    renderWith([line("cost", "6800", 15_500, 0, "MVA25"), line("pay", "2400", 0, 15_500)]);
    const state = composer(agent);
    expect(amounts(state.postings)).toEqual([
      ["6800", 12_400, 0],
      ["2710", 3_100, 0],
      ["2400", 0, 15_500],
    ]);
    expect(state.postings[1]).toMatchObject({ vatOf: "cost" });
    expect(state.postable).toBe(true);
    expect((await agent.act({ steps: [{ ref: "Voucher lines", action: "assertPostable", args: [] }] })).ok).toBe(true);
  });

  it("refuses MVA25 on a net line next to its own 2710 line: the VAT is counted twice", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    renderWith([
      line("cost", "6800", 12_400, 0, "MVA25"),
      line("vat", "2710", 3_100, 0),
      line("pay", "2400", 0, 15_500),
    ]);
    expect(composer(agent).postable).toBe(false);
    const result = await agent.act({ steps: [{ ref: "Voucher lines", action: "assertPostable", args: [] }] });
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(
      /Line cost on 6800 has VAT code MVA25 \(25 %\).*The separate line on 2710 counts the VAT twice/,
    );
  });
});
