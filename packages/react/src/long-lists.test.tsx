import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AccountPicker } from "./account-picker.js";
import { createBookiAgent } from "./booki-agent.js";
import { BookiLocaleProvider } from "./locale.js";

afterEach(() => cleanup());

const long = Array.from({ length: 180 }, (_, i) => ({
  number: String(1000 + i * 40),
  name: `Konto nummer ${i}`,
})).concat([{ number: "6801", name: "Kontorrekvisita" }]);

type Entry = { ref: string; component: string; items?: { value: string }[]; itemsHint?: string; value?: string };

function setup(accounts: { number: string; name: string }[]) {
  const agent = createBookiAgent();
  render(
    <BookiLocaleProvider defaultCountry="NO">
      <AccountPicker accounts={accounts} />
    </BookiLocaleProvider>,
  );
  const entry = () => agent.snapshot().find((c) => c.component === "account-picker") as unknown as Entry;
  return { agent, entry };
}

describe("a chart of accounts an agent works with", () => {
  it("is listed whole in the snapshot when it is short", () => {
    const { entry } = setup(long.slice(0, 12));
    expect(entry().items).toHaveLength(12);
    expect(entry().itemsHint).toBe("");
  });

  it("is not in the snapshot when it is long: the snapshot says how to find an account", () => {
    const { agent, entry } = setup(long);
    expect(entry().items).toEqual([]);
    expect(entry().itemsHint).toContain("181 items");
    expect(JSON.stringify(agent.snapshot()).length).toBeLessThan(800);
  });

  it("is found by number and by word through query, and can be set", async () => {
    const { agent, entry } = setup(long);
    for (const text of ["6801", "Kontorrekvisita"]) {
      const found = JSON.stringify(await agent.query({ within: entry().ref, text }));
      expect(found).toContain("6801");
      expect(found).not.toContain("Konto nummer");
    }
    const result = (await agent.act({ steps: [{ ref: entry().ref, action: "setAccount", args: ["6801"] }] })) as {
      ok: boolean;
    };
    expect(result.ok).toBe(true);
    expect(entry().value).toBe("6801");
  });

  it("refuses an unknown account with the nearest ones and how to find the rest, in few words", async () => {
    const { agent, entry } = setup(long);
    const result = (await agent.act({ steps: [{ ref: entry().ref, action: "setAccount", args: ["6800x"] }] })) as {
      ok: boolean;
      error?: { message: string };
    };
    expect(result.ok).toBe(false);
    expect(result.error!.message).toContain("6801");
    expect(result.error!.message).toContain("query");
    expect(result.error!.message.length).toBeLessThan(500);
  });
});
