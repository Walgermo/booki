import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AmountField } from "./amount-field.js";
import { createBookiAgent, createBookiHistory, createHistory, registerTools } from "./booki-agent.js";
import { BookiLocaleProvider } from "./locale.js";

afterEach(() => {
  cleanup();
  delete (document as { modelContext?: unknown }).modelContext;
});

// A pilot followed the install guide as written: `createBookiAgent({ language: "nb" })`,
// then `createBookiHistory(agent)` at module level. It threw "createHistory requires an agent
// with the original act method returned by createAgent" and took every page down.

type Entry = Record<string, unknown>;
const amountOf = (agent: ReturnType<typeof createBookiAgent>) =>
  (agent.snapshot().find((c) => c.component === "amount-field") as Entry | undefined)?.minor;

describe("an agent with language nb", () => {
  for (const [name, make] of [
    ["createBookiHistory", createBookiHistory],
    ["createHistory", createHistory],
  ] as const) {
    it(`works with ${name}, and undo puts the amount back`, async () => {
      const agent = createBookiAgent({ agentId: "test", language: "nb" });
      const history = make(agent);
      render(
        <BookiLocaleProvider defaultCountry="NO">
          <AmountField defaultValue={249_000} aria-label="Beløp" />
        </BookiLocaleProvider>,
      );
      await agent.act({ steps: [{ ref: "Beløp", action: "setMinor", args: [312_500] }] });
      expect(amountOf(agent)).toBe(312_500);
      if (name === "createBookiHistory") {
        expect(await history.undoSource("agent")).toEqual([]);
        expect(amountOf(agent)).toBe(249_000);
      }
    });
  }

  it("still refuses in Norwegian through act", async () => {
    const agent = createBookiAgent({ agentId: "test", language: "nb" });
    createBookiHistory(agent);
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <AmountField aria-label="Beløp" />
      </BookiLocaleProvider>,
    );
    const result = (await agent.act({ steps: [{ ref: "Beløp", action: "setMinor", args: [12.5] }] })) as {
      ok: boolean;
      error?: { message: string };
    };
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/heltall/);
  });

  it("registers WebMCP tools whose act runs", async () => {
    const tools: { name: string; execute: (input: unknown) => Promise<{ ok: boolean }> }[] = [];
    (document as { modelContext?: unknown }).modelContext = {
      registerTool: (tool: (typeof tools)[number]) => {
        tools.push(tool);
        return Promise.resolve();
      },
    };
    const agent = createBookiAgent({ agentId: "test", language: "nb" });
    const unregister = registerTools(agent, { allow: () => true });
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <AmountField aria-label="Beløp" />
      </BookiLocaleProvider>,
    );
    const act = tools.find((tool) => tool.name === "act");
    expect(act).toBeDefined();
    const result = await act!.execute({ steps: [{ ref: "Beløp", action: "setMinor", args: [4200] }] });
    expect(result.ok).toBe(true);
    expect(amountOf(agent)).toBe(4200);
    unregister();
  });
});
