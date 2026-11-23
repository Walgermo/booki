import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBookiAgent, createChange, definePrimitive, usePart, usePrimitive } from "./index.js";

afterEach(() => cleanup());

// The example in docs/own-controls.md: keep it the same.

type Option = { value: string; label: string };
type CostCentreOptions = {
  options: Option[];
  value: string;
  onValueChange?: (value: string, details: { source?: string }) => void;
};

const costCentre = definePrimitive({
  name: "cost-centre",
  options: { options: "value", value: "string", onValueChange: "callback" },
  controlled: ["value"],
  state: (options: CostCentreOptions) => ({ value: options.value, options: options.options }),
  sync: (options: CostCentreOptions) => ({ value: options.value, options: options.options }),
  api: (context) => {
    const change = createChange(context);
    return {
      setCostCentre: (value: string): boolean => {
        const { options } = context.store.get();
        if (!options.some((option) => option.value === value)) {
          throw new Error(`No cost centre "${value}". Use one of: ${options.map((o) => o.value).join(", ")}.`);
        }
        return change("value", value, { reason: "set-cost-centre" });
      },
      items: () => context.store.get().options,
    };
  },
  slots: (slot) => ({ root: slot({ role: "group", attrs: () => ({ "data-slot": "cost-centre" }) }) }),
  agent: { actions: ["setCostCentre"], items: (api) => api.items() },
});

// The select the product already has: it gives a value, not a DOM event.
function YourSelect(props: { options: Option[]; value: string; onValueChange: (value: string) => void }) {
  return (
    <select aria-label="Kostnadssted" value={props.value} onChange={(e) => props.onValueChange(e.target.value)}>
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function CostCentre(props: CostCentreOptions) {
  const handle = usePrimitive(costCentre, props);
  return usePart(
    handle,
    "root",
    {},
    {
      "aria-label": "Kostnadssted",
      children: (
        <YourSelect
          options={props.options}
          value={props.value}
          onValueChange={(value) => handle.api.setCostCentre(value)}
        />
      ),
    },
    "div",
  );
}

describe("a control of the product's own, operated by an agent", () => {
  it("keeps the product's select, and says whose change it was", async () => {
    const options = [
      { value: "100", label: "Drift" },
      { value: "200", label: "Prosjekt" },
    ];
    const agent = createBookiAgent();
    const onValueChange = vi.fn();
    render(<CostCentre options={options} value="100" onValueChange={onValueChange} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "200" } });
    expect(onValueChange.mock.calls[0]![0]).toBe("200");
    expect(onValueChange.mock.calls[0]![1].source).not.toBe("agent");

    const entry = agent.snapshot().find((c) => c.component === "cost-centre")!;
    expect(entry).toMatchObject({ label: "Kostnadssted", value: "100", actions: ["setCostCentre"] });
    const done = (await agent.act({ steps: [{ ref: entry.ref, action: "setCostCentre", args: ["200"] }] })) as {
      ok: boolean;
    };
    expect(done.ok).toBe(true);
    expect(onValueChange.mock.calls[1]![1].source).toBe("agent");

    const refused = (await agent.act({ steps: [{ ref: entry.ref, action: "setCostCentre", args: ["300"] }] })) as {
      ok: boolean;
      error?: { message: string };
    };
    expect(refused.ok).toBe(false);
    expect(refused.error?.message).toContain("100, 200");
  });
});
