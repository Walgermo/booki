import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { FormEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AmountField } from "./amount-field.js";
import { createBookiAgent, proposeChanges } from "./booki-agent.js";
import { BookiLocaleProvider } from "./locale.js";

afterEach(() => {
  cleanup();
});

type Agent = ReturnType<typeof createBookiAgent>;

function amountEntry(agent: Agent) {
  const entry = agent.snapshot().find((c) => c.component === "amount-field") as
    | { ref: string; value?: unknown; minor?: unknown; actions: string[] }
    | undefined;
  if (!entry) throw new Error("amount-field not in snapshot");
  return entry;
}

function input(): HTMLInputElement {
  return document.querySelector('[data-slot="amount-field-input"]') as HTMLInputElement;
}

function renderAmount(props: Partial<Parameters<typeof AmountField>[0]> = {}, country: "NO" | "US" = "US") {
  return render(
    <BookiLocaleProvider defaultCountry={country}>
      <AmountField defaultValue={10_000} aria-label="Amount" {...props} />
    </BookiLocaleProvider>,
  );
}

describe("AmountField agent units", () => {
  it("offers no agent action that takes major units", () => {
    const agent = createBookiAgent();
    renderAmount();
    const entry = amountEntry(agent);
    expect(entry.actions).toEqual(expect.arrayContaining(["setMinor", "clear"]));
    expect(entry.actions).not.toContain("setValue");
    expect(entry.value).toBe(10_000);
    expect(entry.minor).toBe(10_000);
  });

  it("read-then-write-back keeps the amount", async () => {
    const agent = createBookiAgent();
    renderAmount();
    const before = amountEntry(agent).value;
    const result = await agent.act({
      steps: [{ ref: "Amount", action: "setMinor", args: [before] }],
    });
    expect(result.ok).toBe(true);
    expect(amountEntry(agent).value).toBe(10_000);

    const setValue = await agent.act({
      steps: [{ ref: "Amount", action: "setValue", args: [String(before)] }],
    });
    expect(setValue.ok).toBe(false);
    expect(amountEntry(agent).value).toBe(10_000);
  });

  it("rejects floats, unsafe integers, text and negatives with a repairable message", async () => {
    const agent = createBookiAgent();
    renderAmount();
    for (const [arg, message] of [
      [10.5, /safe integer in minor units.*got 10\.5/],
      [2 ** 60, /safe integer/],
      ["3125.00", /safe integer.*"3125\.00"/],
      ["1,000", /safe integer/],
      [Number.NaN, /safe integer.*NaN/],
      [-500, /-500.*below minMinor 0/],
    ] as const) {
      const result = await agent.act({
        steps: [{ ref: "Amount", action: "setMinor", args: [arg] }],
      });
      expect(result.ok, String(arg)).toBe(false);
      expect(result.error?.message).toMatch(message);
    }
    expect(amountEntry(agent).value).toBe(10_000);
  });

  it("enforces minMinor and maxMinor for the agent", async () => {
    const agent = createBookiAgent();
    renderAmount({ minMinor: -5_000, maxMinor: 50_000 });
    const ok = await agent.act({
      steps: [{ ref: "Amount", action: "setMinor", args: [-5_000] }],
    });
    expect(ok.ok).toBe(true);
    expect(amountEntry(agent).value).toBe(-5_000);

    const low = await agent.act({
      steps: [{ ref: "Amount", action: "setMinor", args: [-5_001] }],
    });
    expect(low.ok).toBe(false);
    expect(low.error?.message).toMatch(/below minMinor -5000/);

    const high = await agent.act({
      steps: [{ ref: "Amount", action: "setMinor", args: [50_001] }],
    });
    expect(high.ok).toBe(false);
    expect(high.error?.message).toMatch(/exceeds maxMinor 50000/);
    expect(amountEntry(agent).value).toBe(-5_000);
  });

  it('stages in minor units with proposeChanges key "minor" and reverts', async () => {
    const agent = createBookiAgent();
    const onValueChange = vi.fn();
    renderAmount({ onValueChange });
    const staged = await proposeChanges(agent, [{ ref: "Amount", key: "minor", value: 312_500 }]);
    expect(staged.applied).toEqual([expect.objectContaining({ key: "minor", before: 10_000, value: 312_500 })]);
    expect(amountEntry(agent).value).toBe(312_500);
    expect(onValueChange).toHaveBeenLastCalledWith(312_500, expect.anything());

    const failed = await staged.revert();
    expect(failed).toEqual([]);
    expect(amountEntry(agent).value).toBe(10_000);
  });

  it("never stages through a major-unit path", async () => {
    const agent = createBookiAgent();
    renderAmount();
    const byValue = await proposeChanges(agent, [{ ref: "Amount", value: "3125.00" }]);
    expect(byValue.applied).toEqual([]);
    const majorText = await proposeChanges(agent, [{ ref: "Amount", key: "minor", value: "3125.00" }]);
    expect(majorText.applied).toEqual([]);
    expect(amountEntry(agent).value).toBe(10_000);
  });
});

describe("AmountField human input", () => {
  it("commits typed major-unit text exactly", () => {
    const onValueChange = vi.fn();
    renderAmount({ defaultValue: 0, onValueChange });
    const el = input();
    fireEvent.focus(el);
    for (const text of ["1", "12", "12.", "12.3", "12.34"]) {
      fireEvent.input(el, { target: { value: text } });
      expect(el.value).toBe(text);
    }
    fireEvent.blur(el);
    expect(el.value).toBe("12.34");
    expect(onValueChange).toHaveBeenLastCalledWith(1_234, expect.anything());
  });

  it("parses nb-NO grouping and decimals", () => {
    const onValueChange = vi.fn();
    renderAmount({ defaultValue: 0, onValueChange }, "NO");
    const el = input();
    fireEvent.focus(el);
    fireEvent.input(el, { target: { value: "1 234,5" } });
    fireEvent.blur(el);
    expect(onValueChange).toHaveBeenLastCalledWith(123_450, expect.anything());
  });

  it("refuses out-of-range and invalid text on blur without throwing", () => {
    const onValueChange = vi.fn();
    renderAmount({ defaultValue: 5_000, maxMinor: 10_000, onValueChange });
    const el = input();

    fireEvent.focus(el);
    for (const text of ["2", "20", "200"]) {
      fireEvent.input(el, { target: { value: text } });
    }
    expect(() => fireEvent.blur(el)).not.toThrow();
    expect(el.value).toBe("200");
    expect(onValueChange).toHaveBeenLastCalledWith(5_000, expect.anything());

    fireEvent.focus(el);
    fireEvent.input(el, { target: { value: "-1" } });
    fireEvent.blur(el);
    expect(el.value).toBe("-1");

    fireEvent.focus(el);
    fireEvent.input(el, { target: { value: "1e5" } });
    fireEvent.blur(el);
    expect(el.value).toBe("1e5");

    fireEvent.focus(el);
    fireEvent.input(el, { target: { value: "1.005" } });
    fireEvent.blur(el);
    expect(el.value).toBe("1.005");
  });

  it("round-trips a negative amount through focus and blur", () => {
    const onValueChange = vi.fn();
    renderAmount({ defaultValue: -2_500, minMinor: -10_000, onValueChange });
    const el = input();
    fireEvent.focus(el);
    fireEvent.blur(el);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(el.value).toContain("25.00");
  });
});

describe("AmountField native form validation", () => {
  function renderForm(props: Partial<Parameters<typeof AmountField>[0]> = {}, country: "NO" | "US" = "US") {
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      return new FormData(event.currentTarget).get("amount");
    });
    const { getByTestId, getByRole } = render(
      <BookiLocaleProvider defaultCountry={country}>
        <form data-testid="amount-form" onSubmit={onSubmit}>
          <AmountField name="amount" defaultValue={312_500} {...props} />
          <button type="submit">Submit</button>
        </form>
      </BookiLocaleProvider>,
    );
    return {
      form: getByTestId("amount-form") as HTMLFormElement,
      submitter: getByRole("button", { name: "Submit" }) as HTMLButtonElement,
      onSubmit,
      field: input(),
    };
  }

  it("blocks native submission before blur, then submits the corrected amount", () => {
    const { form, field, onSubmit } = renderForm({ required: true });
    act(() => field.focus());
    fireEvent.input(field, { target: { value: "abc" } });
    expect(field.validationMessage).toMatch(/enter a valid amount/i);
    expect(new FormData(form).has("amount")).toBe(false);
    form.requestSubmit();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.input(field, { target: { value: "5.25" } });
    expect(field.checkValidity()).toBe(true);
    form.requestSubmit();
    expect(onSubmit).toHaveReturnedWith("525");
  });

  it("retains invalid text and blocks submit-button activation after blur", () => {
    const onValueChange = vi.fn();
    const { field, submitter, onSubmit } = renderForm({ value: 312_500, onValueChange, maxMinor: 500_000 });
    act(() => field.focus());
    fireEvent.input(field, { target: { value: "5500" } });
    act(() => submitter.focus());
    fireEvent.click(submitter);
    expect(field.value).toBe("5500");
    expect(field.validationMessage).toMatch(/at most 5,000.00/);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid", "Skriv inn et gyldig beløp, for eksempel 1,00."],
    ["0,50", "Skriv inn et beløp på minst 1,00."],
    ["5,01", "Skriv inn et beløp på høyst 5,00."],
  ])("reports Norwegian native validation for %s", (draft, message) => {
    const { field, form, onSubmit } = renderForm({ minMinor: 100, maxMinor: 500 }, "NO");
    act(() => field.focus());
    fireEvent.input(field, { target: { value: draft } });
    expect(field.validationMessage).toBe(message);
    form.requestSubmit();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each([false, true])("handles an empty draft with allowEmpty and required=%s", (required) => {
    const { field, submitter, onSubmit } = renderForm({ allowEmpty: true, required });
    act(() => field.focus());
    fireEvent.input(field, { target: { value: "abc" } });
    expect(field.validity.customError).toBe(true);
    fireEvent.input(field, { target: { value: "" } });
    expect(field.validity.customError).toBe(false);
    expect(field.validity.valueMissing).toBe(required);
    act(() => submitter.focus());
    fireEvent.click(submitter);
    if (required) expect(onSubmit).not.toHaveBeenCalled();
    else expect(onSubmit).toHaveReturnedWith("");
  });
});
