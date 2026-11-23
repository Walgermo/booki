import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AmountField } from "./amount-field.js";
import { createBookiAgent } from "./booki-agent.js";
import { BookiLocaleProvider } from "./locale.js";

afterEach(() => cleanup());

type Entry = { ref: string; value: number; minor: number; empty: boolean };

function setup(props: Parameters<typeof AmountField>[0]) {
  const agent = createBookiAgent();
  render(
    <BookiLocaleProvider defaultCountry="NO">
      <AmountField aria-label="Beløp" {...props} />
    </BookiLocaleProvider>,
  );
  const entry = () => agent.snapshot().find((c) => c.component === "amount-field") as unknown as Entry;
  const input = () => document.querySelector("input")!;
  return { agent, entry, input };
}

describe("an amount nobody has entered", () => {
  it("is empty, not 0, and an agent can fill and empty it", async () => {
    const onEmpty = vi.fn();
    const onValueChange = vi.fn();
    const { agent, entry, input } = setup({ allowEmpty: true, onEmpty, onValueChange });
    expect(entry()).toMatchObject({ empty: true });
    expect(input().value).toBe("");

    await agent.act({ steps: [{ ref: entry().ref, action: "setMinor", args: [0] }] });
    expect(entry()).toMatchObject({ empty: false, minor: 0 });
    expect(onValueChange).toHaveBeenCalledWith(0, expect.anything());
    expect(input().value).toBe("0,00");

    await agent.act({ steps: [{ ref: entry().ref, action: "setMinor", args: [125_000] }] });
    await agent.act({ steps: [{ ref: entry().ref, action: "clear" }] });
    expect(entry()).toMatchObject({ empty: true });
    expect(onEmpty).toHaveBeenCalledWith(expect.objectContaining({ reason: "clear" }));
    expect(input().value).toBe("");
  });

  it("becomes empty when a person deletes the text", () => {
    const onEmpty = vi.fn();
    const { entry, input } = setup({ allowEmpty: true, defaultValue: 50_000, onEmpty });
    expect(entry()).toMatchObject({ empty: false, minor: 50_000 });
    fireEvent.focus(input());
    fireEvent.input(input(), { target: { value: "" } });
    fireEvent.blur(input());
    expect(entry()).toMatchObject({ empty: true });
    expect(onEmpty).toHaveBeenCalled();
    expect(input().value).toBe("");
  });

  it("shows value={null} empty, and without allowEmpty clear is 0 as before", async () => {
    const shown = setup({ allowEmpty: true, value: null, onValueChange: () => {} });
    expect(shown.entry()).toMatchObject({ empty: true });
    cleanup();
    const plain = setup({ defaultValue: 50_000 });
    await plain.agent.act({ steps: [{ ref: plain.entry().ref, action: "clear" }] });
    expect(plain.entry()).toMatchObject({ empty: false, minor: 0 });
  });
});
