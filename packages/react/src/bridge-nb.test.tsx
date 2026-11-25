import { cleanup, render } from "@testing-library/react";
import { Button } from "@ui-sdk/react/button";
import { NumberInput, NumberInputControl, NumberInputGroup } from "@ui-sdk/react/number-input";
import { afterEach, describe, expect, it } from "vitest";
import { AmountField } from "./amount-field.js";
import { withRecordedAct } from "@booki-aui/primitives/agent-policy";
import { createAgentCursor } from "./agent-cursor.js";
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

  it("ends a failed multi-step act in Norwegian, including what stays done", async () => {
    const agent = createBookiAgent({ agentId: "test", language: "nb" });
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <AmountField value={100_00} aria-label="Fast beløp" />
      </BookiLocaleProvider>,
    );
    const result = (await agent.act({
      steps: [
        { ref: "Fast beløp", action: "expect", args: [100_00] },
        { ref: "Fast beløp", action: "expect", args: [5_00] },
        { ref: "Fast beløp", action: "expect", args: [100_00] },
      ],
    })) as Result;
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(
      /^Fast beløp \(c\d+\) er 10000, ikke 500\. Stegene før dette er utført\. Send det på nytt med steget etter det, 2 steg i ett kall\.$/,
    );
    const many = (await agent.act({
      steps: [
        { ref: "Fast beløp", action: "expect", args: [100_00] },
        { ref: "Fast beløp", action: "expect", args: [5_00] },
        { ref: "Fast beløp", action: "expect", args: [100_00] },
        { ref: "Fast beløp", action: "expect", args: [100_00] },
      ],
    })) as Result;
    expect(many.error?.message).toContain("Send det på nytt med de 2 stegene etter det, 3 steg i ett kall.");
  });

  it("keeps the same multi-step sentence in English without a language", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <AmountField value={100_00} aria-label="Fast beløp" />
      </BookiLocaleProvider>,
    );
    const result = (await agent.act({
      steps: [
        { ref: "Fast beløp", action: "expect", args: [100_00] },
        { ref: "Fast beløp", action: "expect", args: [5_00] },
      ],
    })) as Result;
    expect(result.error?.message).toContain("The steps before this one stay done.");
  });

  it("leaves the same sentences in English without a language", async () => {
    const agent = createBookiAgent({ agentId: "test", allow: () => false });
    screen();
    const result = (await agent.act({ steps: [{ ref: "Bokfør", action: "press" }] })) as Result;
    expect(result.error?.message).toBe('The person said no to "Bokføre bilaget?".');
  });

  it("says a change didn't take, and what a failed check found, in Norwegian", async () => {
    const agent = createBookiAgent({ agentId: "test", language: "nb" });
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <AmountField value={100_00} aria-label="Fast beløp" />
      </BookiLocaleProvider>,
    );
    const set = (await agent.act({ steps: [{ ref: "Fast beløp", action: "setMinor", args: [5_00] }] })) as Result;
    expect(set.error?.message).toMatch(/^setMinor på Fast beløp \(c\d+\) tok ikke: verdien er fortsatt 10000\.$/);
    const check = (await agent.act({ steps: [{ ref: "Fast beløp", action: "expect", args: [5_00] }] })) as Result;
    expect(check.error?.message).toMatch(/^Fast beløp \(c\d+\) er 10000, ikke 500\.$/);
  });

  it("refuses a number outside min and max in Norwegian", async () => {
    const agent = createBookiAgent({ agentId: "test", language: "nb" });
    render(
      <NumberInput defaultValue={2} min={1} max={20} aria-label="Antall">
        <NumberInputGroup>
          <NumberInputControl />
        </NumberInputGroup>
      </NumberInput>,
    );
    const result = (await agent.act({ steps: [{ ref: "Antall", action: "setValue", args: [25] }] })) as Result;
    expect(result.error?.message).toMatch(/^setValue på Antall \(c\d+\) tar et tall fra 1 til 20, ikke 25\.$/);
  });

  it("says in Norwegian what is wrong with a call in the wrong shape", async () => {
    const agent = createBookiAgent({ agentId: "test", language: "nb" });
    render(
      <NumberInput defaultValue={2} min={1} max={20} aria-label="Antall">
        <NumberInputGroup>
          <NumberInputControl />
        </NumberInputGroup>
      </NumberInput>,
    );
    const act = async (input: unknown) => ((await agent.act(input as never)) as Result).error?.message;
    expect(await act({ step: [] })).toMatch(/^act tar \{ "steps": .* ikke \{"step":\[\]\}\. Ingen steg ble kjørt\.$/);
    expect(await act({ steps: [{ ref: "Antall", action: "setValue", args: [3] }], why: 1 })).toBe(
      'act tar "steps" og ingenting annet, ikke "why". Ingen steg ble kjørt.',
    );
    expect(await act({ steps: [{ action: "setValue", args: [3] }] })).toMatch(/^steps\[0\] trenger en ref/);
    expect(await act({ steps: [{ ref: "Antall" }] })).toBe(
      'steps[0], på "Antall", trenger en handling, som "press". Ingen steg ble kjørt.',
    );
    expect(await act({ steps: [{ ref: "Antall", action: "setValue" }] })).toBe(
      'setValue på "Antall" trenger verdien, som "args": [verdi]. Ingen steg ble kjørt.',
    );
  });
});

describe("a decline that comes through the cursor, the audit and withRecordedAct", () => {
  it("is in Norwegian, and the audit row names who declined", async () => {
    const rows: Array<{ action: string; decidedBy?: string }> = [];
    const audit = (row: { action: string; decidedBy?: string }) => void rows.push(row);
    const cursor = createAgentCursor();
    const agent = withRecordedAct(
      createBookiAgent({
        agentId: "test",
        language: "nb",
        audit,
        allow: cursor.wrap(() => ({ allow: false, by: "person-id" })),
      }),
      { audit, agentId: "test" },
    );
    // A confirm sentence that is two sentences of its own, as an app writes it.
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <Button data-agent-confirm="Bokføre bilag 12. Dette kan ikke angres: vil du fortsette?">Registrer</Button>
      </BookiLocaleProvider>,
    );
    const result = (await agent.act({ steps: [{ ref: "Registrer", action: "press" }] })) as Result;
    expect(result.ok).toBe(false);
    expect(result.error?.message).toBe(
      'Personen sa nei til "Bokføre bilag 12. Dette kan ikke angres: vil du fortsette?".',
    );
    expect(rows.filter((row) => row.action === "agent.refused")).toEqual([
      expect.objectContaining({ decidedBy: "person-id" }),
    ]);
  });
});
