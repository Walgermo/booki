import { mount } from "@ui-sdk/core/testing";
import { describe, expect, it, vi } from "vitest";
import { bookiFieldAmount } from "./use-booki-field-amount.js";
import { bookiFieldCode } from "./use-booki-field-code.js";

// What a product pilot needed from useBookiField: a code by its label, a
// refusal that says what setCode takes, no code at all, and no amount at all.

type Api = Record<string, (...args: unknown[]) => unknown>;
type State = Record<string, unknown>;

const kinds = [
  { value: "faktisk", label: "Faktisk feil" },
  { value: "vurdering", label: "Vurderingsfeil" },
];

describe("useBookiField code kind", () => {
  it("names each option as value (label) in a refusal", () => {
    const view = mount(bookiFieldCode as never, { options: kinds } as never, "<root></root>");
    try {
      expect(() => (view.api as unknown as Api).setCode!("annet")).toThrow(
        /faktisk \(Faktisk feil\), vurdering \(Vurderingsfeil\)/,
      );
    } finally {
      view.unmount();
    }
  });

  it("takes an option's label in any case, and stores its value", () => {
    const onValueChange = vi.fn();
    const view = mount(bookiFieldCode as never, { options: kinds, onValueChange } as never, "<root></root>");
    try {
      expect((view.api as unknown as Api).setCode!("faktisk feil")).toBe(true);
      expect((view.state as State).code).toBe("faktisk");
      expect(onValueChange.mock.calls[0]![0]).toBe("faktisk");
    } finally {
      view.unmount();
    }
  });

  it("refuses a label two options share, since it names neither", () => {
    const twins = [
      { value: "a", label: "Same" },
      { value: "b", label: "Same" },
    ];
    const view = mount(bookiFieldCode as never, { options: twins } as never, "<root></root>");
    try {
      expect(() => (view.api as unknown as Api).setCode!("Same")).toThrow(/a \(Same\), b \(Same\)/);
    } finally {
      view.unmount();
    }
  });

  it("clears with allowEmpty, and refuses an empty code without it", () => {
    const empty = mount(bookiFieldCode as never, { options: kinds, allowEmpty: true } as never, "<root></root>");
    const strict = mount(bookiFieldCode as never, { options: kinds } as never, "<root></root>");
    try {
      const api = empty.api as unknown as Api;
      expect(api.setCode!("faktisk")).toBe(true);
      expect(api.setCode!(null)).toBe(true);
      expect((empty.state as State).code).toBe("");
      expect(() => (strict.api as unknown as Api).setCode!("")).toThrow(/faktisk/);
    } finally {
      empty.unmount();
      strict.unmount();
    }
  });
});

describe("useBookiField amount kind", () => {
  it("starts empty with allowEmpty, reads minor: null, and setMinor(null) empties it again", () => {
    const onValueChange = vi.fn();
    const view = mount(
      bookiFieldAmount as never,
      { currency: "NOK", allowEmpty: true, onValueChange } as never,
      "<root></root>",
    );
    try {
      const api = view.api as unknown as Api;
      expect((view.state as State).minor).toBeNull();
      expect(api.setMinor!(12_500)).toBe(true);
      expect(api.setMinor!(null)).toBe(true);
      expect((view.state as State).minor).toBeNull();
      expect(onValueChange.mock.calls.at(-1)![0]).toBeNull();
    } finally {
      view.unmount();
    }
  });

  it("refuses null without allowEmpty, naming the unit", () => {
    const view = mount(bookiFieldAmount as never, { currency: "NOK" } as never, "<root></root>");
    try {
      expect((view.state as State).minor).toBe(0);
      expect(() => (view.api as unknown as Api).setMinor!(null)).toThrow(/minor units/);
    } finally {
      view.unmount();
    }
  });
});

// The amount example in the install guide (skills/booki/SKILL.md, "Your own
// components"), as written there. Keep the two in sync.
import { formatMoney, parseToMinor } from "@booki/core/money";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { createBookiAgent, useBookiField } from "./index.js";

function AmountInput(props: { value: number | null; onValueChange?: (minor: number | null) => void }) {
  const show = (minor: number | null) =>
    minor === null ? "" : formatMoney(minor, { currency: "NOK", locale: "nb-NO", withCurrency: false });
  // What the person types stays text: "12," is not an amount yet.
  const [draft, setDraft] = useState(() => show(props.value));
  return useBookiField(
    {
      kind: "amount",
      value: props.value,
      allowEmpty: true,
      label: "Beløp",
      onValueChange: (minor, details) => {
        // The agent's amount replaces the text; the person's own typing is left as typed.
        if (details.source === "agent") setDraft(show(minor));
        props.onValueChange?.(minor);
      },
    },
    ({ change, refusal }) => (
      <>
        <input
          aria-label="Beløp-felt"
          inputMode="decimal"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            // Exact parsing, no floats; only text that is an amount becomes a change.
            const minor = parseToMinor(e.target.value, "NOK", { locale: "nb-NO" });
            if (minor !== null || e.target.value.trim() === "") change(minor, e.nativeEvent);
          }}
        />
        {refusal ? <p role="alert">{refusal}</p> : null}
      </>
    ),
  );
}

function Owner() {
  const [value, setValue] = useState<number | null>(null);
  return (
    <>
      <AmountInput value={value} onValueChange={setValue} />
      <output data-testid="minor">{String(value)}</output>
    </>
  );
}

describe("the guide's amount example", () => {
  it("keeps half-typed text, changes only on an amount, and shows the agent's amount", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    render(<Owner />);
    const input = screen.getByLabelText("Beløp-felt") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "12," } });
    // Not rewritten while the person types.
    expect(input.value).toBe("12,");
    fireEvent.change(input, { target: { value: "12,5x" } });
    // Not an amount: no change reaches the product.
    expect(screen.getByTestId("minor").textContent).toBe("1200");
    fireEvent.change(input, { target: { value: "12,5" } });
    expect(screen.getByTestId("minor").textContent).toBe("1250");
    const ref = agent.snapshot().find((entry) => entry.component === "field-amount")!.ref;
    const result = (await agent.act({ steps: [{ ref, action: "setMinor", args: [250_000] }] })) as { ok: boolean };
    expect(result.ok).toBe(true);
    expect(screen.getByTestId("minor").textContent).toBe("250000");
    expect(input.value.replace(/\s/g, " ")).toBe("2 500,00");
    cleanup();
  });
});
