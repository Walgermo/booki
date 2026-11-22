import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createBookiAgent } from "./booki-agent.js";
import { BookiLocaleProvider } from "./locale.js";
import { TaxCodeSelect } from "./tax-code-select.js";

afterEach(() => cleanup());

describe("TaxCodeSelect", () => {
  it("starts over at the new country's default instead of keeping a code the list no longer has", () => {
    const agent = createBookiAgent({ agentId: "test" });
    const value = () =>
      (agent.snapshot().find((c) => c.component === "tax-code-select") as unknown as { value: string }).value;

    const view = render(
      <BookiLocaleProvider country="NO">
        <TaxCodeSelect />
      </BookiLocaleProvider>,
    );
    expect(value()).toBe("MVA25");

    view.rerender(
      <BookiLocaleProvider country="US">
        <TaxCodeSelect />
      </BookiLocaleProvider>,
    );
    expect(value()).not.toBe("MVA25");
    expect(value()).toMatch(/^TAX/);
  });
});
