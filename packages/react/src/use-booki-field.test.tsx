import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { mount } from "@ui-sdk/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BookiLocaleProvider, createBookiAgent, useBookiField, type BookiFieldDateArgs } from "./index.js";
import { preloadNorwegian } from "./say.js";
import { bookiFieldAccount } from "./use-booki-field-account.js";
import { bookiFieldAmount } from "./use-booki-field-amount.js";
import { bookiFieldCode } from "./use-booki-field-code.js";
import { bookiFieldDate } from "./use-booki-field-date.js";

afterEach(() => cleanup());

const drift = [
  { value: "100", label: "Drift" },
  { value: "200", label: "Prosjekt" },
];

type State = Record<string, unknown>;

describe("the three definitions, mounted", () => {
  it("amount: a valid minor-unit value changes the state and says why; a refusal names the unit and leaves the value", () => {
    const onValueChange = vi.fn();
    // Not controlled here: without a `value` the field holds what the agent sets.
    const view = mount(bookiFieldAmount as never, { currency: "NOK", onValueChange } as never, "<root></root>");
    const api = view.api as unknown as Record<string, (...args: unknown[]) => unknown>;
    try {
      expect(api.setMinor!(12_500)).toBe(true);
      expect((view.state as State).minor).toBe(12_500);
      expect(onValueChange.mock.calls[0]![0]).toBe(12_500);
      expect(onValueChange.mock.calls[0]![1]).toMatchObject({ reason: "set-minor" });

      expect(() => api.setMinor!(125.5)).toThrow(/minor units/);
      expect(() => api.setMinor!(-1)).toThrow(/minMinor/);
      expect((view.state as State).minor).toBe(12_500);
      expect(onValueChange).toHaveBeenCalledTimes(1);
    } finally {
      view.unmount();
    }
  });

  it("amount: a controlled value stays held until the product passes the new one back", () => {
    const view = mount(bookiFieldAmount as never, { value: 100, currency: "NOK" } as never, "<root></root>");
    const api = view.api as unknown as Record<string, (...args: unknown[]) => unknown>;
    try {
      expect(api.setMinor!(900)).toBe(true);
      expect((view.state as State).minor).toBe(100);
    } finally {
      view.unmount();
    }
  });

  it("code: a value from the list changes it; an unknown one is refused with both labels", () => {
    const onValueChange = vi.fn();
    const view = mount(bookiFieldCode as never, { options: drift, onValueChange } as never, "<root></root>");
    const api = view.api as unknown as Record<string, (...args: unknown[]) => unknown>;
    try {
      expect(api.setCode!("200")).toBe(true);
      expect((view.state as State).code).toBe("200");
      expect(onValueChange.mock.calls[0]![0]).toBe("200");
      expect(onValueChange.mock.calls[0]![1]).toMatchObject({ reason: "set-code" });

      expect(() => api.setCode!("300")).toThrow(/Drift/);
      expect(() => api.setCode!("300")).toThrow(/Prosjekt/);
      expect((view.state as State).code).toBe("200");
    } finally {
      view.unmount();
    }
  });

  it("date: an ISO date that exists changes it; an impossible or free-text one is refused", () => {
    const onValueChange = vi.fn();
    const view = mount(bookiFieldDate as never, { onValueChange } as never, "<root></root>");
    const api = view.api as unknown as Record<string, (...args: unknown[]) => unknown>;
    try {
      expect(api.setDate!("2026-03-03")).toBe(true);
      expect((view.state as State).date).toBe("2026-03-03");
      expect(onValueChange.mock.calls[0]![1]).toMatchObject({ reason: "set-date" });

      expect(() => api.setDate!("Smarch 3rd")).toThrow(/YYYY-MM-DD/);
      expect(() => api.setDate!("2026-02-30")).toThrow(/YYYY-MM-DD/);
      expect((view.state as State).date).toBe("2026-03-03");
    } finally {
      view.unmount();
    }
  });
});

// Three small components wrapping a plain input and a plain select the product
// already has. The hook only adds the agent's actions and the refusal.

function AmountField(props: {
  value: number;
  onValueChange?: (minor: number, details: { source?: string }) => void;
  disabled?: boolean;
}) {
  return useBookiField(
    {
      kind: "amount",
      value: props.value,
      currency: "NOK",
      label: "Beløp",
      onValueChange: props.onValueChange,
      disabled: props.disabled,
    },
    ({ value, change, refusal }) => (
      <div>
        <input aria-label="Beløp-felt" value={value} onChange={(e) => change(Number(e.target.value))} />
        {refusal ? <p role="alert">{refusal}</p> : null}
      </div>
    ),
  );
}

function CostCentreField(props: {
  value: string;
  onValueChange?: (code: string, details: { source?: string }) => void;
}) {
  return useBookiField(
    { kind: "code", value: props.value, options: drift, label: "Kostnadssted", onValueChange: props.onValueChange },
    ({ value, change, refusal }) => (
      <div>
        <select aria-label="Kostnadssted-velger" value={value} onChange={(e) => change(e.target.value, e.nativeEvent)}>
          {drift.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {refusal ? <p role="alert">{refusal}</p> : null}
      </div>
    ),
  );
}

/** The product owns the value: it passes the new one back, as a real select does. */
function CostCentreOwned(props: { onValueChange?: (code: string, details: { source?: string }) => void }) {
  const [code, setCode] = useState("100");
  return (
    <CostCentreField
      value={code}
      onValueChange={(next, details) => {
        setCode(next);
        props.onValueChange?.(next, details);
      }}
    />
  );
}

function DateField(props: { value: string; onValueChange?: (date: string, details: { source?: string }) => void }) {
  return useBookiField(
    { kind: "date", value: props.value, label: "Forfallsdato", onValueChange: props.onValueChange },
    ({ value, change, refusal }) => (
      <div>
        <input aria-label="Dato-felt" value={value} onChange={(e) => change(e.target.value, e.nativeEvent)} />
        {refusal ? <p role="alert">{refusal}</p> : null}
      </div>
    ),
  );
}

describe("useBookiField through the agent bridge", () => {
  it("snapshot lists each field with its label, value key and actions", () => {
    const agent = createBookiAgent();
    render(
      <>
        <AmountField value={12_500} />
        <CostCentreField value="100" />
        <DateField value="2026-03-03" />
      </>,
    );
    const snapshot = agent.snapshot();

    const amount = snapshot.find((c) => c.component === "field-amount")!;
    expect(amount).toMatchObject({ label: "Beløp", minor: 12_500, actions: ["setMinor"] });

    const code = snapshot.find((c) => c.component === "field-code")!;
    expect(code).toMatchObject({ label: "Kostnadssted", code: "100", actions: ["setCode"] });

    const date = snapshot.find((c) => c.component === "field-date")!;
    expect(date).toMatchObject({ label: "Forfallsdato", date: "2026-03-03", actions: ["setDate"] });
  });

  it("the snapshot shows no key named error", () => {
    const agent = createBookiAgent();
    render(<CostCentreField value="100" />);
    const entry = agent.snapshot().find((c) => c.component === "field-code")!;
    expect(Object.keys(entry)).not.toContain("error");
    expect(entry).toHaveProperty("refusal", null);
  });

  it("an agent's setCode changes the product's select; a refused one says what exists", async () => {
    const agent = createBookiAgent();
    const onValueChange = vi.fn();
    render(<CostCentreOwned onValueChange={onValueChange} />);
    const entry = agent.snapshot().find((c) => c.component === "field-code")!;

    const done = (await agent.act({ steps: [{ ref: entry.ref, action: "setCode", args: ["200"] }] })) as {
      ok: boolean;
    };
    expect(done.ok).toBe(true);
    expect(onValueChange.mock.calls[0]![0]).toBe("200");
    expect(onValueChange.mock.calls[0]![1].source).toBe("agent");
    expect((screen.getByLabelText("Kostnadssted-velger") as HTMLSelectElement).value).toBe("200");

    const refused = (await agent.act({ steps: [{ ref: entry.ref, action: "setCode", args: ["300"] }] })) as {
      ok: boolean;
      error?: { message: string };
    };
    expect(refused.ok).toBe(false);
    expect(refused.error?.message).toContain("Drift");
    expect(refused.error?.message).toContain("Prosjekt");
  });

  it("a person's change through the product's own select is not the agent's", () => {
    const onValueChange = vi.fn();
    render(<CostCentreField value="100" onValueChange={onValueChange} />);
    fireEvent.change(screen.getByLabelText("Kostnadssted-velger"), { target: { value: "200" } });
    expect(onValueChange.mock.calls[0]![0]).toBe("200");
    expect(onValueChange.mock.calls[0]![1].source).not.toBe("agent");
  });

  it("a person typing an invalid date shows the refusal next to the field and keeps the value", () => {
    const onValueChange = vi.fn();
    render(<DateField value="2026-03-03" onValueChange={onValueChange} />);
    const input = screen.getByLabelText("Dato-felt") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-02-30" } });
    expect(screen.getByRole("alert").textContent).toContain("YYYY-MM-DD");
    expect(onValueChange).not.toHaveBeenCalled();
    expect(input.value).toBe("2026-03-03");
  });

  it("a refused amount through the agent returns ok false with the unit named", async () => {
    const agent = createBookiAgent();
    render(<AmountField value={0} />);
    const entry = agent.snapshot().find((c) => c.component === "field-amount")!;
    const refused = (await agent.act({ steps: [{ ref: entry.ref, action: "setMinor", args: ["12.5"] }] })) as {
      ok: boolean;
      error?: { message: string };
    };
    expect(refused.ok).toBe(false);
    expect(refused.error?.message).toContain("minor units");
  });

  it("disabled leaves the snapshot entry with no actions to offer", () => {
    const agent = createBookiAgent();
    render(<AmountField value={0} disabled />);
    const entry = agent.snapshot().find((c) => c.component === "field-amount")!;
    expect(entry.actions ?? []).toEqual([]);
  });
});

describe("a code field with values only a person may choose", () => {
  const stages = [
    { value: "lead", label: "Lead" },
    { value: "won", label: "Vunnet" },
    { value: "lost", label: "Tapt" },
  ];

  function Stage({ onValueChange }: { onValueChange?: (code: string, details: { source?: string }) => void }) {
    const [code, setCode] = useState("lead");
    return useBookiField(
      {
        kind: "code",
        value: code,
        options: stages,
        personOnly: ["won", "lost"],
        label: "Steg",
        onValueChange: (next, details) => {
          setCode(next);
          onValueChange?.(next, details);
        },
      },
      ({ value, change, refusal }) => (
        <div>
          <select aria-label="Steg-velger" value={value} onChange={(e) => change(e.target.value, e.nativeEvent)}>
            {stages.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {refusal ? <p role="alert">{refusal}</p> : null}
        </div>
      ),
    );
  }

  it("refuses an agent's step to one of them, by value or label, and names it", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    render(<Stage />);
    const entry = agent.snapshot().find((c) => c.component === "field-code") as unknown as Record<string, unknown>;
    expect(entry.personOnly).toEqual(["won", "lost"]);
    for (const asked of ["won", "Vunnet"]) {
      const result = (await agent.act({ steps: [{ ref: "Steg", action: "setCode", args: [asked] }] })) as {
        ok: boolean;
        error?: { message: string };
      };
      expect(result.ok).toBe(false);
      expect(result.error?.message).toMatch(/"won \(Vunnet\)" is a person's choice here/);
    }
    expect((screen.getByLabelText("Steg-velger") as HTMLSelectElement).value).toBe("lead");
  });

  it("lets a person choose it through the product's own select", () => {
    const heard = vi.fn();
    render(<Stage onValueChange={heard} />);
    fireEvent.change(screen.getByLabelText("Steg-velger"), { target: { value: "won" } });
    expect((screen.getByLabelText("Steg-velger") as HTMLSelectElement).value).toBe("won");
    expect(heard.mock.calls[0]![1].source).not.toBe("agent");
  });

  it("refuses an agent's step that passes an event of its own, and the product never hears it", async () => {
    const heard = vi.fn();
    const agent = createBookiAgent({ agentId: "test" });
    render(<Stage onValueChange={heard} />);
    const result = (await agent.act({
      steps: [{ ref: "Steg", action: "setCode", args: ["won", new Event("change")] }],
    })) as { ok: boolean; error?: { message: string } };
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/person's choice/);
    expect(heard).not.toHaveBeenCalled();
  });

  it("hands out a list a snapshot's reader cannot change", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    render(<Stage />);
    const entry = agent.snapshot().find((c) => c.component === "field-code") as unknown as { personOnly: string[] };
    expect(() => entry.personOnly.splice(0)).toThrow();
    const result = (await agent.act({ steps: [{ ref: "Steg", action: "setCode", args: ["won"] }] })) as { ok: boolean };
    expect(result.ok).toBe(false);
  });

  it("refuses it framework-free too, when no event comes with the call", () => {
    const view = mount(bookiFieldCode as never, { options: stages, personOnly: ["won"] } as never, "<root></root>");
    const api = view.api as unknown as Record<string, (...args: unknown[]) => unknown>;
    try {
      expect(() => api.setCode!("won")).toThrow(/person's choice/);
      expect(api.setCode!("lost")).toBe(true);
    } finally {
      view.unmount();
    }
  });
});

describe("a field that already has its own labelled group", () => {
  const directions = [
    { value: "in", label: "Inn" },
    { value: "out", label: "Ut" },
  ];

  function Direction({ group }: { group?: boolean }) {
    return useBookiField({ kind: "code", value: "in", options: directions, label: "Retning", group }, ({ value }) => (
      <fieldset>
        <legend>Retning</legend>
        {directions.map((o) => (
          <label key={o.value}>
            <input type="radio" readOnly checked={value === o.value} />
            {o.label}
          </label>
        ))}
      </fieldset>
    ));
  }

  it("by default wraps the field in a group named by its label", () => {
    render(<Direction />);
    expect(screen.getAllByRole("group", { name: "Retning" })).toHaveLength(2);
  });

  it("with group: false renders the root without role, and the snapshot keeps the label", () => {
    const agent = createBookiAgent();
    const { container } = render(<Direction group={false} />);
    expect(screen.getAllByRole("group", { name: "Retning" })).toHaveLength(1);
    const root = container.querySelector('[data-slot="field-code"]')!;
    expect(root.hasAttribute("role")).toBe(false);
    const entry = agent.snapshot().find((c) => c.component === "field-code")!;
    expect(entry.label).toBe("Retning");
    expect(entry.actions).toContain("setCode");
  });
});

describe("the account kind", () => {
  const chart = [
    { number: "1500", name: "Kundefordringer" },
    { number: "1920", name: "Bank" },
    { number: "3000", name: "Salgsinntekt" },
  ];

  function Account(props: {
    chart?: typeof chart;
    allowEmpty?: boolean;
    minLength?: number;
    maxLength?: number;
    onValueChange?: (account: string, details: { source?: string }) => void;
  }) {
    const { onValueChange, ...rest } = props;
    const [value, setValue] = useState("1500");
    // A person types a number a digit at a time: the draft is held here and checked on blur.
    const [draft, setDraft] = useState<string | null>(null);
    return useBookiField(
      {
        kind: "account",
        value,
        label: "Konto",
        ...rest,
        onValueChange: (account, details) => {
          setValue(account);
          onValueChange?.(account, details);
        },
      },
      ({ value, change, refusal }) => (
        <div>
          <input
            aria-label="Konto-felt"
            value={draft ?? value}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => {
              if (draft === null) return;
              if (change(draft, e.nativeEvent)) setDraft(null);
            }}
          />
          {refusal ? <p role="alert">{refusal}</p> : null}
        </div>
      ),
    );
  }

  const run = async (agent: ReturnType<typeof createBookiAgent>, args: unknown[]) => {
    const entry = agent.snapshot().find((c) => c.component === "field-account")!;
    return (await agent.act({ steps: [{ ref: entry.ref, action: "setAccount", args }] })) as {
      ok: boolean;
      error?: { message: string };
    };
  };

  it("snapshot reads the account as digits, with the range an open field accepts", () => {
    const agent = createBookiAgent();
    render(<Account />);
    const entry = agent.snapshot().find((c) => c.component === "field-account") as unknown as Record<string, unknown>;
    expect(entry).toMatchObject({ label: "Konto", account: "1500", minLength: 4, maxLength: 10 });
    expect(entry.actions).toContain("setAccount");
  });

  it("an open field takes digits of the right length and refuses the rest, naming the range", async () => {
    const onValueChange = vi.fn();
    const agent = createBookiAgent();
    render(<Account onValueChange={onValueChange} />);
    expect((await run(agent, ["1920"])).ok).toBe(true);
    expect(onValueChange.mock.calls[0]![0]).toBe("1920");
    expect(onValueChange.mock.calls[0]![1]).toMatchObject({ source: "agent" });
    expect((await run(agent, ["19x0"])).error?.message).toContain("digits only");
    expect((await run(agent, ["192"])).error?.message).toContain("4 to 10 digits");
    expect((await run(agent, ["12345678901"])).error?.message).toContain("4 to 10 digits");
    expect(onValueChange).toHaveBeenCalledTimes(1);
  });

  it("takes minLength and maxLength", async () => {
    const agent = createBookiAgent();
    render(<Account minLength={3} maxLength={3} />);
    expect((await run(agent, ["192"])).ok).toBe(true);
    expect((await run(agent, ["1920"])).error?.message).toContain("3 to 3 digits");
  });

  it("with a chart refuses an unknown number and names the nearest accounts", async () => {
    const agent = createBookiAgent();
    render(<Account chart={chart} />);
    const refused = await run(agent, ["1921"]);
    expect(refused.ok).toBe(false);
    expect(refused.error?.message).toContain("1920 (Bank)");
    expect(refused.error?.message).toContain("1500 (Kundefordringer)");
    expect((await run(agent, ["3000"])).ok).toBe(true);
  });

  it("with a chart and no allowEmpty, an empty number says a number is needed", async () => {
    const agent = createBookiAgent();
    render(<Account chart={chart} />);
    const refused = await run(agent, [""]);
    expect(refused.ok).toBe(false);
    expect(refused.error?.message).toContain("An account number is needed");
  });

  it("with a long chart names only the nearest ones", async () => {
    const long = Array.from({ length: 60 }, (_, i) => ({ number: String(6000 + i * 10), name: `Konto ${i}` }));
    const agent = createBookiAgent();
    render(<Account chart={long} />);
    const refused = await run(agent, ["6301"]);
    expect(refused.error?.message).toContain("in the chart of 60");
    expect(refused.error?.message).toContain("6300 (");
  });

  it("a person types digit by digit; the number is checked on blur and a refusal shows next to the field", () => {
    const onValueChange = vi.fn();
    // An English screen: the refusal is shown in the screen's language.
    render(
      <BookiLocaleProvider defaultCountry="US">
        <Account allowEmpty onValueChange={onValueChange} />
      </BookiLocaleProvider>,
    );
    const input = screen.getByLabelText("Konto-felt") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    for (const typed of ["1", "19", "192"]) {
      fireEvent.change(input, { target: { value: typed } });
      expect(input.value).toBe(typed);
    }
    fireEvent.blur(input);
    expect(screen.getByRole("alert").textContent).toContain("4 to 10 digits");
    expect(input.value).toBe("192");
    fireEvent.change(input, { target: { value: "1920" } });
    fireEvent.blur(input);
    expect(input.value).toBe("1920");
    expect(onValueChange).toHaveBeenLastCalledWith("1920", expect.anything());
  });

  it("an empty value is refused with a sentence about the range, and an object with one about digits", async () => {
    const agent = createBookiAgent();
    render(<Account />);
    expect((await run(agent, [""])).error?.message).toContain("4 to 10 digits");
    expect((await run(agent, [{ a: 1 }])).error?.message).toContain("as digits");
  });

  it("refuses when minLength is greater than maxLength", async () => {
    const agent = createBookiAgent();
    render(<Account minLength={6} maxLength={4} />);
    expect((await run(agent, ["12345"])).error?.message).toContain("greater than maxLength");
  });

  it("allowEmpty lets the agent clear it; without it an empty value is refused", async () => {
    const agent = createBookiAgent();
    const { unmount } = render(<Account allowEmpty />);
    expect((await run(agent, [""])).ok).toBe(true);
    expect((await run(agent, [null])).ok).toBe(true);
    unmount();
    render(<Account />);
    expect((await run(agent, [""])).ok).toBe(false);
  });

  it("an empty chart is a closed chart: no number is allowed", () => {
    const onValueChange = vi.fn();
    const view = mount(bookiFieldAccount as never, { chart: [], onValueChange } as never, "<root></root>");
    const api = view.api as unknown as Record<string, (...args: unknown[]) => unknown>;
    try {
      expect(() => api.setAccount!("1920")).toThrow(/No account "1920" in the chart/);
      expect(onValueChange).not.toHaveBeenCalled();
    } finally {
      view.unmount();
    }
    const open = mount(bookiFieldAccount as never, { onValueChange } as never, "<root></root>");
    try {
      expect((open.api as unknown as Record<string, (...args: unknown[]) => unknown>).setAccount!("1920")).toBe(true);
    } finally {
      open.unmount();
    }
  });
});

describe("a person's edit to a wrapped field", () => {
  function Due({ disabled, readOnly, allowEmpty, onValueChange }: Partial<BookiFieldDateArgs>) {
    const [date, setDate] = useState("2026-01-01");
    return useBookiField(
      {
        kind: "date",
        value: date,
        label: "Forfall",
        disabled,
        readOnly,
        allowEmpty,
        onValueChange: (next, details) => {
          setDate(next);
          onValueChange?.(next, details);
        },
      },
      ({ value, change, refusal }) => (
        <div>
          <input aria-label="Forfallsdato" value={value} onChange={(e) => change(e.target.value, e.nativeEvent)} />
          {refusal ? <p role="alert">{refusal}</p> : null}
        </div>
      ),
    );
  }

  it("is ignored while the field is disabled or read-only", () => {
    const heard = vi.fn();
    const { unmount } = render(<Due disabled onValueChange={heard} />);
    fireEvent.change(screen.getByLabelText("Forfallsdato"), { target: { value: "2026-02-02" } });
    unmount();
    render(<Due readOnly onValueChange={heard} />);
    fireEvent.change(screen.getByLabelText("Forfallsdato"), { target: { value: "2026-02-02" } });
    expect(heard).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Forfallsdato") as HTMLInputElement).value).toBe("2026-01-01");
  });

  it("clears an optional date, by a person or an agent; a required one keeps it", async () => {
    const agent = createBookiAgent();
    const { unmount } = render(<Due allowEmpty />);
    fireEvent.change(screen.getByLabelText("Forfallsdato"), { target: { value: "" } });
    expect((screen.getByLabelText("Forfallsdato") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("Forfallsdato"), { target: { value: "2026-03-03" } });
    expect(((await agent.act({ steps: [{ ref: "Forfall", action: "setDate", args: [null] }] })) as { ok: boolean }).ok).toBe(
      true,
    );
    expect((screen.getByLabelText("Forfallsdato") as HTMLInputElement).value).toBe("");
    unmount();
    render(<Due />);
    fireEvent.change(screen.getByLabelText("Forfallsdato"), { target: { value: "" } });
    expect((screen.getByLabelText("Forfallsdato") as HTMLInputElement).value).toBe("2026-01-01");
    expect(screen.getByRole("alert").textContent).toMatch(/YYYY-MM-DD/);
  });

  it("is refused in the screen's language, while the agent reads English", async () => {
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <Due />
      </BookiLocaleProvider>,
    );
    await preloadNorwegian();
    fireEvent.change(screen.getByLabelText("Forfallsdato"), { target: { value: "2026-02-30" } });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/^Ugyldig dato "2026-02-30"/));
    const agent = createBookiAgent();
    const entry = agent.snapshot().find((c) => c.component === "field-date") as unknown as { refusal: string };
    expect(entry.refusal).toMatch(/^Invalid date/);
  });
});
