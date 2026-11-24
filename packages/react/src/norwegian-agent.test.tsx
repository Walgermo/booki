import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AgentCursor, createAgentCursor } from "./agent-cursor.js";
import { AmountField } from "./amount-field.js";
import { createBookiAgent } from "./booki-agent.js";
import { BookiLocaleProvider } from "./locale.js";

afterEach(() => cleanup());

// A pilot under a Norwegian profile saw the cursor say "set minor 1250050" and
// refusals in English.

type Result = { ok: boolean; error?: { message: string } };

describe("an agent under a Norwegian profile", () => {
  it("narrates the cursor in Norwegian, and in English under a US profile", async () => {
    for (const [country, said] of [
      ["NO", /setter beløp 1\s250,00/],
      ["US", /set minor 125000/],
    ] as const) {
      const cursor = createAgentCursor({ travel: 0, press: 0, linger: 10_000 });
      const agent = createBookiAgent({ agentId: "test", allow: cursor.wrap(() => true) });
      render(
        <BookiLocaleProvider defaultCountry={country}>
          <AmountField aria-label="Amount" />
          <AgentCursor cursor={cursor} />
        </BookiLocaleProvider>,
      );
      await agent.act({ steps: [{ ref: "Amount", action: "setMinor", args: [125000] }] });
      await waitFor(() =>
        expect(document.querySelector('[data-slot="agent-cursor-action"]')?.textContent).toMatch(said),
      );
      cleanup();
    }
  });

  it("refuses in Norwegian with language nb, and in English by default", async () => {
    const run = async (language?: "nb") => {
      const agent = createBookiAgent({ agentId: "test", ...(language ? { language } : {}) });
      render(
        <BookiLocaleProvider defaultCountry="NO">
          <AmountField aria-label="Beløp" />
        </BookiLocaleProvider>,
      );
      const result = (await agent.act({ steps: [{ ref: "Beløp", action: "setMinor", args: [12.5] }] })) as Result;
      cleanup();
      return result;
    };
    const en = await run();
    const nb = await run("nb");
    expect(en.ok).toBe(false);
    expect(nb.ok).toBe(false);
    expect(nb.error?.message).not.toBe(en.error?.message);
    expect(nb.error?.message).toMatch(/øre|heltall|beløp/i);
  });
});
