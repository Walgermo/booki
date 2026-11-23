import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AccountPicker } from "./account-picker.js";
import { createBookiAgent } from "./booki-agent.js";
import { BookiLocaleProvider } from "./locale.js";

afterEach(() => cleanup());

// A pilot read onValueChange's type, which had one argument, and concluded the
// picker did not say who changed it. It does: the type now says so too.
it("tells onValueChange that the agent changed the account", async () => {
  const onValueChange = vi.fn<(accountNumber: string, details: { reason: string; source?: string }) => void>();
  const agent = createBookiAgent({ agentId: "test" });
  render(
    <BookiLocaleProvider defaultCountry="NO">
      <AccountPicker
        accounts={[
          { number: "1920", name: "Bank" },
          { number: "3000", name: "Salgsinntekt" },
        ]}
        onValueChange={onValueChange}
        aria-label="Konto"
      />
    </BookiLocaleProvider>,
  );
  const result = (await agent.act({ steps: [{ ref: "Konto", action: "setAccount", args: ["3000"] }] })) as {
    ok: boolean;
  };
  expect(result.ok).toBe(true);
  expect(onValueChange).toHaveBeenCalledTimes(1);
  expect(onValueChange.mock.calls[0]![0]).toBe("3000");
  expect(onValueChange.mock.calls[0]![1]).toMatchObject({ reason: "set-account", source: "agent" });
});
