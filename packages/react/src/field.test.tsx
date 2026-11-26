import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createBookiAgent } from "./booki-agent.js";
import { Field } from "./field.js";

afterEach(cleanup);

type Result = { ok: boolean };
type Control = {
  ref: string;
  component: string;
  label?: string;
  actions: string[];
  value?: unknown;
  offPage?: boolean;
};

describe("Field", () => {
  it("names the control by its label and describes it by the help line", () => {
    const { container } = render(
      <Field label="Supplier name" help="As on the invoice">
        <input name="supplier" />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Supplier name" });
    const label = container.querySelector('[data-slot="field-label"]') as HTMLLabelElement;
    expect(label.htmlFor).toBe(input.id);
    const help = container.querySelector('[data-slot="field-description"]')!;
    expect(input.getAttribute("aria-describedby")?.split(" ")).toContain(help.id);
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(container.querySelector('[data-slot="field-error"]')).toBeNull();
    const root = container.querySelector('[data-slot="field"]')!;
    expect(root.hasAttribute("data-booki")).toBe(true);
    expect(root.hasAttribute("data-booki-field")).toBe(true);
  });

  it("shows the error text, marks the control invalid and describes it by the error", () => {
    const { container } = render(
      <Field label="Organisation number" help="Nine digits" errorText="Enter nine digits">
        <input defaultValue="12345" />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Organisation number" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const error = container.querySelector('[data-slot="field-error"]')!;
    expect(error.textContent).toBe("Enter nine digits");
    expect(input.getAttribute("aria-describedby")?.split(" ")).toContain(error.id);
  });

  it("wires a select and a textarea, and keeps a controlled value", () => {
    function Form() {
      const [memo, setMemo] = useState("Rent");
      return (
        <>
          <Field label="Department">
            <select defaultValue="sales">
              <option value="sales">Sales</option>
              <option value="ops">Operations</option>
            </select>
          </Field>
          <Field label="Memo">
            <textarea value={memo} onChange={(event) => setMemo(event.target.value)} />
          </Field>
        </>
      );
    }
    render(<Form />);
    const select = screen.getByRole("combobox", { name: "Department" });
    expect(select.querySelectorAll("option")).toHaveLength(2);
    const memo = screen.getByRole("textbox", { name: "Memo" }) as HTMLTextAreaElement;
    fireEvent.change(memo, { target: { value: "Rent, November" } });
    expect(memo.value).toBe("Rent, November");
  });

  it("puts a plain text input on the agent's bridge by its label, and the agent can fill it", async () => {
    const agent = createBookiAgent();
    render(
      <Field label="Supplier name">
        <input />
      </Field>,
    );
    const controls = (await agent.snapshot()) as Control[];
    const input = controls.find((control) => control.component === "input");
    expect(input?.label).toBe("Supplier name");
    expect(input?.actions).toContain("setValue");
    const result = (await agent.act({
      steps: [{ ref: input!.ref, action: "setValue", args: ["Nordlys AS"] }],
    } as never)) as Result;
    expect(result.ok).toBe(true);
    expect((screen.getByRole("textbox", { name: "Supplier name" }) as HTMLInputElement).value).toBe("Nordlys AS");
  });

  it("keeps a password out of the agent's reach", async () => {
    const agent = createBookiAgent();
    render(
      <Field label="Password">
        <input type="password" />
      </Field>,
    );
    const controls = (await agent.snapshot()) as Control[];
    // Entries from an earlier test are history, marked offPage.
    expect(controls.some((control) => control.component === "input" && !control.offPage)).toBe(false);
  });
});
