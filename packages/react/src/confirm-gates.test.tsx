import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createBookiAgent } from "./booki-agent.js";
import { BookiLocaleProvider } from "./locale.js";
import { PaymentConfirm } from "./payment-confirm.js";

afterEach(() => cleanup());

describe("type-to-confirm", () => {
  // The typed word is the person's confirmation. Marking only the final button
  // left the field open, so an agent could type the word and enable it.
  it("refuses an agent typing the confirm word", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <PaymentConfirm payee="Acme" amount={1250} onConfirm={() => {}} />
      </BookiLocaleProvider>,
    );
    const field = agent.snapshot().find((entry) => entry.component === "input");
    expect(field).toBeDefined();
    const result = (await agent.act({ steps: [{ ref: field!.ref, action: "setValue", args: ["APPROVE"] }] })) as {
      ok: boolean;
    };
    expect(result.ok).toBe(false);
    expect(document.querySelector("input")!.value).toBe("");
  });
});
