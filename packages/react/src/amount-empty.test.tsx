import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AmountField, type AmountFieldProps } from "./amount-field.js";
import { createBookiAgent, createBookiHistory } from "./booki-agent.js";
import { BookiLocaleProvider } from "./locale.js";

afterEach(() => cleanup());

type Entry = { ref: string; value: number | null; minor: number | null; empty: boolean };

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
    expect(entry()).toMatchObject({ empty: true, value: null, minor: null });
    expect(input().value).toBe("");

    await agent.act({ steps: [{ ref: entry().ref, action: "setMinor", args: [0] }] });
    expect(entry()).toMatchObject({ empty: false, minor: 0 });
    expect(onValueChange).toHaveBeenCalledWith(0, expect.anything());
    expect(input().value).toBe("0,00");

    await agent.act({ steps: [{ ref: entry().ref, action: "setMinor", args: [125_000] }] });
    await agent.act({ steps: [{ ref: entry().ref, action: "clear" }] });
    expect(entry()).toMatchObject({ empty: true, value: null });
    expect(onEmpty).toHaveBeenCalledWith(expect.objectContaining({ reason: "clear" }));
    // null is "no amount" for the agent too.
    await agent.act({ steps: [{ ref: entry().ref, action: "setMinor", args: [5] }] });
    await agent.act({ steps: [{ ref: entry().ref, action: "setMinor", args: [null] }] });
    expect(entry()).toMatchObject({ empty: true, value: null });
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

describe("onValueChange with allowEmpty", () => {
  it("hears null when the field is emptied, so a controlled field learns it was cleared", async () => {
    const calls: Array<number | null> = [];
    const { agent, entry } = setup({
      allowEmpty: true,
      value: 5_000,
      // Typed (minor: number | null) because allowEmpty is set.
      onValueChange: (minor: number | null) => calls.push(minor),
    });
    await agent.act({ steps: [{ ref: entry().ref, action: "clear" }] });
    expect(calls).toEqual([null]);
  });

  it("a controlled field whose owner does not take the change keeps its amount and its emptiness", async () => {
    const held = setup({ allowEmpty: true, value: 5_000, name: "amount", onValueChange: () => {}, onEmpty: () => {} });
    await held.agent.act({ steps: [{ ref: held.entry().ref, action: "clear" }] });
    expect(held.entry()).toMatchObject({ empty: false, value: 5_000, minor: 5_000 });
    expect(held.input().value).toBe("50,00");
    expect((document.querySelector("input[name=amount]") as HTMLInputElement).value).toBe("5000");
    cleanup();
    const blank = setup({ allowEmpty: true, value: null, name: "amount", onValueChange: () => {} });
    await blank.agent.act({ steps: [{ ref: blank.entry().ref, action: "setMinor", args: [5_000] }] });
    expect(blank.entry()).toMatchObject({ empty: true, value: null, minor: null });
    expect(blank.input().value).toBe("");
    expect((document.querySelector("input[name=amount]") as HTMLInputElement).value).toBe("");
  });

  it("one deletion a controlled owner does not take is reported once, and a later deletion again", () => {
    const onValueChange = vi.fn();
    const onEmpty = vi.fn();
    const { entry, input } = setup({ allowEmpty: true, value: 5_000, onValueChange, onEmpty });
    fireEvent.focus(input());
    fireEvent.input(input(), { target: { value: "" } });
    fireEvent.blur(input());
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(null, expect.anything());
    expect(onEmpty).toHaveBeenCalledTimes(1);
    expect(entry()).toMatchObject({ empty: false, value: 5_000 });
    expect(input().value).toBe("50,00");
    fireEvent.focus(input());
    fireEvent.input(input(), { target: { value: "" } });
    fireEvent.blur(input());
    expect(onValueChange).toHaveBeenCalledTimes(2);
    expect(onEmpty).toHaveBeenCalledTimes(2);
  });
});

describe("history and an emptied amount", () => {
  it("undo puts back the amount an agent cleared", async () => {
    const { agent, entry, input } = setup({ allowEmpty: true, defaultValue: 12_500 });
    const history = createBookiHistory(agent);
    await agent.act({ steps: [{ ref: entry().ref, action: "setMinor", args: [null] }] });
    expect(entry()).toMatchObject({ empty: true, minor: null });
    expect(history.entries()).toHaveLength(1);
    expect(await history.undoSource("agent")).toEqual([]);
    expect(entry()).toMatchObject({ empty: false, minor: 12_500 });
    expect(input().value).toBe("125,00");
  });

  it("is typed with null only when allowEmpty is set", () => {
    const empty: AmountFieldProps<true> = {
      allowEmpty: true,
      onValueChange: (minor: number | null) => minor,
    };
    const filled: AmountFieldProps<false> = { onValueChange: (minor: number) => minor };
    // @ts-expect-error a field that may be empty reports null, which a number-only handler cannot take
    const narrow: AmountFieldProps<true> = { allowEmpty: true, onValueChange: (minor: number) => minor };
    expect([empty, filled, narrow]).toHaveLength(3);
  });
});

describe("AmountField allowEmpty typed from a boolean variable", () => {
  it("accepts an inline handler that takes null", () => {
    const flag: boolean = Math.random() > 2;
    const seen: Array<number | null> = [];
    render(<AmountField allowEmpty={flag} defaultValue={100} onValueChange={(m) => seen.push(m)} />);
    expect(seen).toEqual([]);
  });
});

describe("AmountFieldProps in types", () => {
  it("a wrapper that takes the bare props accepts allowEmpty, and inline handlers still infer", () => {
    function MyAmount(props: AmountFieldProps) {
      return <AmountField {...props} />;
    }
    const wrapped = (
      <>
        <MyAmount aria-label="a" allowEmpty />
        <MyAmount aria-label="b" />
        <MyAmount aria-label="c" allowEmpty onValueChange={(minor: number | null) => minor} />
      </>
    );
    // allowEmpty left out: the handler gets a number.
    const plain = <AmountField aria-label="d" onValueChange={(minor) => minor.toFixed(0)} />;
    // allowEmpty: the handler gets number | null, so null must be handled.
    const empty = <AmountField aria-label="e" allowEmpty onValueChange={(minor) => minor?.toFixed(0)} />;
    // @ts-expect-error a number-only handler is wrong with allowEmpty
    const bad = <AmountField aria-label="f" allowEmpty onValueChange={(minor: number) => minor} />;
    expect([wrapped, plain, empty, bad]).toHaveLength(4);
  });
});
