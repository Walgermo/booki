import { cleanup, render } from "@testing-library/react";
import { Button } from "@ui-sdk/react/button";
import { afterEach, describe, expect, it } from "vitest";
import { AmountField } from "./amount-field.js";
import { createBookiAgent } from "./booki-agent.js";
import { BookiLocaleProvider } from "./locale.js";

afterEach(() => cleanup());

// A pilot with `language: "nb"` got Booki's own refusals in Norwegian, but the
// bridge's sentences in English: "No component … on the page", "The person said
// no to …". The model and the audit row read both. These run the real bridge, so
// a changed ui-sdk sentence fails here instead of going quietly untranslated.

type Result = { ok: boolean; error?: { message: string } };

function screen() {
  render(
    <BookiLocaleProvider defaultCountry="NO">
      <AmountField aria-label="Beløp" />
      <Button data-agent-confirm="Bokføre bilaget?">Bokfør</Button>
    </BookiLocaleProvider>,
  );
}

describe("the bridge's own sentences with language nb", () => {
  it("names a missing component in Norwegian", async () => {
    const agent = createBookiAgent({ agentId: "test", language: "nb" });
    screen();
    const result = (await agent.act({ steps: [{ ref: "Finnes ikke", action: "press" }] })) as Result;
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/^Ingen komponent "Finnes ikke" på siden\. Merkelappene på siden: .*Beløp/);
  });

  it("says the person said no, in Norwegian", async () => {
    const agent = createBookiAgent({ agentId: "test", language: "nb", allow: () => false });
    screen();
    const result = (await agent.act({ steps: [{ ref: "Bokfør", action: "press" }] })) as Result;
    expect(result.error?.message).toBe('Personen sa nei til "Bokføre bilaget?".');
  });

  it("says a step needs a person, in Norwegian", async () => {
    const agent = createBookiAgent({ agentId: "test", language: "nb" });
    screen();
    const result = (await agent.act({ steps: [{ ref: "Bokfør", action: "press" }] })) as Result;
    expect(result.error?.message).toBe('Krever en person: "Bokføre bilaget?". Be dem trykke "Bokfør" selv.');
  });

  it("says what a step did in Norwegian, not only what it refused", async () => {
    const agent = createBookiAgent({ agentId: "test", language: "nb", allow: () => true });
    screen();
    const result = (await agent.act({ steps: [{ ref: "Bokfør", action: "press" }] })) as Result & {
      results?: Array<{ result?: unknown }>;
    };
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).toContain('Trykket på \\"Bokfør\\".');
    expect(JSON.stringify(result)).not.toContain("Pressed");
  });

  it("leaves the same sentences in English without a language", async () => {
    const agent = createBookiAgent({ agentId: "test", allow: () => false });
    screen();
    const result = (await agent.act({ steps: [{ ref: "Bokfør", action: "press" }] })) as Result;
    expect(result.error?.message).toBe('The person said no to "Bokføre bilaget?".');
  });
});
