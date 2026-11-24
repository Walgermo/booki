import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AmountField } from "./amount-field.js";
import type { AuditEvent } from "./audit-trail.js";
import { attachAudit, createBookiAgent, createBookiHistory, isHistoryRestoring } from "./booki-agent.js";
import { BookiLocaleProvider } from "./locale.js";

afterEach(() => {
  cleanup();
});

type Row = Omit<AuditEvent, "id" | "at">;

function setup(options: Parameters<typeof createBookiAgent>[0] = {}, by?: string | (() => string | undefined)) {
  const agent = createBookiAgent(options);
  const history = createBookiHistory(agent, by === undefined ? undefined : { by });
  const rows: Row[] = [];
  const stop = attachAudit(agent, (row) => rows.push(row), "assistant");
  const seen: Array<{ value: number; source?: string; restoring: boolean }> = [];
  render(
    <BookiLocaleProvider defaultCountry="NO">
      <AmountField
        defaultValue={10_000}
        aria-label="Total"
        onValueChange={(value, details) =>
          seen.push({ value, source: details?.source, restoring: isHistoryRestoring() })
        }
      />
    </BookiLocaleProvider>,
  );
  return { agent, history, rows, seen, stop };
}

describe("an undo is the person's, not the agent's", () => {
  it("records the undo under the person who asked for it, not the agent", async () => {
    const { agent, history, rows, stop } = setup({}, "person:kari");
    await agent.act({ steps: [{ ref: "Total", action: "setMinor", args: [1_250_050] }] });
    expect(rows).toEqual([expect.objectContaining({ actor: "agent:assistant", action: "amount.setMinor" })]);

    await history.undoSource("agent");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ actor: "person:kari", action: "amount.setMinor" });
    expect(rows[1]?.detail).toMatch(/undo/);
    stop();
    history.destroy();
  });

  it("asks a function for the person at the moment of the undo", async () => {
    let signedIn = "person:ola";
    const { agent, history, rows, stop } = setup({}, () => signedIn);
    await agent.act({ steps: [{ ref: "Total", action: "setMinor", args: [50_000] }] });
    signedIn = "person:kari";
    await history.seek(0);
    expect(rows.at(-1)).toMatchObject({ actor: "person:kari" });
    stop();
    history.destroy();
  });

  it("says person without a by", async () => {
    const { agent, history, rows, stop } = setup();
    await agent.act({ steps: [{ ref: "Total", action: "setMinor", args: [50_000] }] });
    await history.undoSource("agent");
    expect(rows.at(-1)).toMatchObject({ actor: "person" });
    stop();
    history.destroy();
  });

  it("lets the app's own change callback tell an undo from the agent", async () => {
    const { agent, history, seen, stop } = setup({ language: "nb" }, "person:kari");
    await agent.act({ steps: [{ ref: "Total", action: "setMinor", args: [50_000] }] });
    await history.undoSource("agent");
    expect(seen).toEqual([
      { value: 50_000, source: "agent", restoring: false },
      { value: 10_000, source: "agent", restoring: true },
    ]);
    expect(isHistoryRestoring()).toBe(false);
    stop();
    history.destroy();
  });

  it("keeps the agent's own steps after an undo as the agent's", async () => {
    const { agent, history, rows, stop } = setup({}, "person:kari");
    await agent.act({ steps: [{ ref: "Total", action: "setMinor", args: [50_000] }] });
    await history.undoSource("agent");
    await agent.act({ steps: [{ ref: "Total", action: "setMinor", args: [70_000] }] });
    expect(rows.map((row) => row.actor)).toEqual(["agent:assistant", "person:kari", "agent:assistant"]);
    stop();
    history.destroy();
  });
});
