import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountPicker } from "./account-picker.js";
import { AccountingPeriodSelect } from "./accounting-period-select.js";
import { createBookiAgent, createBookiHistory } from "./booki-agent.js";
import { BookiLocaleProvider } from "./locale.js";
import { TaxCodeSelect } from "./tax-code-select.js";

afterEach(() => cleanup());

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as never;

const ACCOUNTS = [
  { number: "1080", name: "Goodwill" },
  { number: "6800", name: "Kontorrekvisita" },
];

type Result = { ok: boolean };

async function cleared(component: string, ui: React.ReactElement) {
  const agent = createBookiAgent();
  render(<BookiLocaleProvider defaultCountry="NO">{ui}</BookiLocaleProvider>);
  const entry = () =>
    agent.snapshot().find((item) => item.component === component)! as unknown as { ref: string; value: string };
  const before = entry().value;
  const result = (await agent.act({ steps: [{ ref: entry().ref, action: "clear", args: [] }] })) as Result;
  return { before, ok: result.ok, after: entry().value };
}

describe("clear means empty, never the first choice", () => {
  it("AccountPicker", async () => {
    const onValueChange = vi.fn();
    const result = await cleared(
      "account-picker",
      <AccountPicker accounts={ACCOUNTS} defaultValue="6800" onValueChange={onValueChange} />,
    );
    expect(result).toEqual({ before: "6800", ok: true, after: "" });
    expect(onValueChange.mock.calls.map(([value]) => value)).toEqual([""]);
  });

  it("TaxCodeSelect", async () => {
    const result = await cleared("tax-code-select", <TaxCodeSelect />);
    expect(result).toMatchObject({ ok: true, after: "" });
    expect(result.before).not.toBe("");
  });

  it("AccountingPeriodSelect", async () => {
    const result = await cleared("accounting-period", <AccountingPeriodSelect year={2026} />);
    expect(result).toMatchObject({ ok: true, after: "" });
  });
});

describe("AccountPicker never chooses an account nobody chose", () => {
  const value = (ui: React.ReactElement) => {
    const agent = createBookiAgent();
    render(<BookiLocaleProvider defaultCountry="NO">{ui}</BookiLocaleProvider>);
    return (agent.snapshot().find((item) => item.component === "account-picker") as unknown as { value: string }).value;
  };
  it("starts empty with no default", () => expect(value(<AccountPicker accounts={ACCOUNTS} />)).toBe(""));
  it("starts empty when the default is not in the chart", () =>
    expect(value(<AccountPicker accounts={ACCOUNTS} defaultValue="9999" />)).toBe(""));
});

describe("undo reaches an empty select", () => {
  it("puts AccountPicker back to no account", async () => {
    const agent = createBookiAgent();
    const history = createBookiHistory(agent);
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <AccountPicker accounts={ACCOUNTS} />
      </BookiLocaleProvider>,
    );
    const entry = () =>
      agent.snapshot().find((item) => item.component === "account-picker") as unknown as { ref: string; value: string };
    await agent.act({ steps: [{ ref: entry().ref, action: "setAccount", args: ["6800"] }] });
    expect(entry().value).toBe("6800");
    await history.seek(0);
    expect(entry().value).toBe("");
  });
});
