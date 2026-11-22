import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BankAccountInput, type BankAccountValue } from "./bank-account-input.js";
import { createBookiAgent } from "./booki-agent.js";
import { BookiLocaleProvider } from "./locale.js";

afterEach(() => {
  cleanup();
});

/** Types one character at a time and checks each keystroke is kept. */
function typeChars(input: HTMLInputElement, text: string) {
  for (let i = 1; i <= text.length; i += 1) {
    fireEvent.input(input, { target: { value: text.slice(0, i) } });
    expect(input.value.replace(/\D/g, "")).toBe(text.slice(0, i));
  }
}

function kontonummerInput(): HTMLInputElement {
  const input = document.querySelector('[data-slot="bank-account-kontonummer"]') as HTMLInputElement | null;
  if (!input) throw new Error("kontonummer input not rendered");
  return input;
}

function Held({ onChange }: { onChange?: (value: BankAccountValue) => void }) {
  const [kontonummer, setKontonummer] = useState("");
  return (
    <BankAccountInput
      kontonummer={kontonummer}
      onValueChange={(value) => {
        if (value.kind === "kontonummer") setKontonummer(value.digits);
        onChange?.(value);
      }}
    />
  );
}

describe("BankAccountInput (NO kontonummer)", () => {
  it("keeps every typed digit without props", () => {
    const onValueChange = vi.fn();
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <BankAccountInput onValueChange={onValueChange} />
      </BookiLocaleProvider>,
    );
    typeChars(kontonummerInput(), "86011117947");
    expect(kontonummerInput().value).toBe("8601 11 17947");
    expect(onValueChange).toHaveBeenLastCalledWith(
      {
        kind: "kontonummer",
        digits: "86011117947",
        formatted: "8601 11 17947",
        isValid: true,
      },
      expect.objectContaining({ source: expect.any(String) }),
    );
    expect(onValueChange).toHaveBeenCalledTimes(11);
  });

  it("keeps every typed digit with a parent holding state", () => {
    const onChange = vi.fn();
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <Held onChange={onChange} />
      </BookiLocaleProvider>,
    );
    typeChars(kontonummerInput(), "86011117947");
    expect(kontonummerInput().value).toBe("8601 11 17947");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ digits: "86011117947", isValid: true }));
  });

  it("lands an agent setKontonummer on an empty field, redacted in the snapshot", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <BankAccountInput />
      </BookiLocaleProvider>,
    );
    const result = await agent.act({
      steps: [{ ref: "Kontonummer", action: "setKontonummer", args: ["86011117947"] }],
    });
    expect(result.ok).toBe(true);
    expect(kontonummerInput().value).toBe("8601 11 17947");

    const entry = agent.snapshot().find((c) => c.component === "bank-account") as Record<string, unknown> | undefined;
    expect(entry).toBeDefined();
    expect(JSON.stringify(entry)).not.toContain("86011117947");
    expect(JSON.stringify(entry)).not.toContain("8601 11 17947");
  });

  it("reports no change for a no-op set", async () => {
    const onValueChange = vi.fn();
    const agent = createBookiAgent({ agentId: "test" });
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <BankAccountInput onValueChange={onValueChange} />
      </BookiLocaleProvider>,
    );
    await agent.act({
      steps: [{ ref: "Kontonummer", action: "setKontonummer", args: ["86011117947"] }],
    });
    onValueChange.mockClear();
    const again = await agent.act({
      steps: [{ ref: "Kontonummer", action: "setKontonummer", args: ["8601 11 17947"] }],
    });
    expect(again.ok).toBe(true);
    expect(again.steps[0]?.result).toBe(false);
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe("BankAccountInput (US routing + account)", () => {
  it("lands both routing and account numbers from the agent", async () => {
    const onValueChange = vi.fn();
    const agent = createBookiAgent({ agentId: "test" });
    render(
      <BookiLocaleProvider defaultCountry="US">
        <BankAccountInput onValueChange={onValueChange} />
      </BookiLocaleProvider>,
    );
    const result = await agent.act({
      steps: [
        { ref: "Bank account", action: "setRouting", args: ["021000021"] },
        { ref: "Bank account", action: "setAccount", args: ["123456789"] },
      ],
    });
    expect(result.ok).toBe(true);
    const routing = screen.getByLabelText("Routing number", {
      selector: "input",
    }) as HTMLInputElement;
    const account = screen.getByLabelText("Account number", {
      selector: "input",
    }) as HTMLInputElement;
    expect(routing.value.replace(/\D/g, "")).toBe("021000021");
    expect(account.value.replace(/\D/g, "")).toBe("123456789");
    expect(onValueChange).toHaveBeenLastCalledWith(
      {
        kind: "routing-account",
        routingNumber: "021000021",
        accountNumber: "123456789",
        isValid: true,
      },
      expect.objectContaining({ source: expect.any(String) }),
    );
  });

  it("keeps every typed digit in routing and account", () => {
    render(
      <BookiLocaleProvider defaultCountry="US">
        <BankAccountInput />
      </BookiLocaleProvider>,
    );
    const routing = document.querySelector('[data-slot="bank-account-routing"]') as HTMLInputElement;
    const account = document.querySelector('[data-slot="bank-account-account"]') as HTMLInputElement;
    typeChars(routing, "021000021");
    typeChars(account, "123456789");
    expect(routing.value.replace(/\D/g, "")).toBe("021000021");
    expect(account.value.replace(/\D/g, "")).toBe("123456789");
  });
});
