import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBookiAgent } from "./booki-agent.js";
import { IconButton } from "./icon-button.js";

afterEach(cleanup);

type Result = { ok: boolean; error?: { step: number; message: string } };
type Control = { ref: string; component: string; label?: string; actions: string[]; confirm?: string };

const Trash = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" data-icon="trash">
    <path d="M4 7h16" />
  </svg>
);

describe("IconButton", () => {
  it("is named by its label, for people and for the agent, with the icon hidden", () => {
    render(<IconButton label="Delete line 2" icon={<Trash />} />);
    const button = screen.getByRole("button", { name: "Delete line 2" });
    expect(button.getAttribute("data-slot")).toBe("button");
    expect(button.hasAttribute("data-icon-button")).toBe(true);
    expect(button.getAttribute("title")).toBe("Delete line 2");
    expect(button.querySelector('[data-slot="icon-button-icon"]')?.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows the label as text when asked, and is then named by that text", () => {
    render(<IconButton label="Export CSV" icon={<Trash />} showLabel />);
    const button = screen.getByRole("button", { name: "Export CSV" });
    expect(button.hasAttribute("aria-label")).toBe(false);
    expect(button.querySelector('[data-slot="icon-button-label"]')?.textContent).toBe("Export CSV");
  });

  it("is on the agent's bridge by its label, and an agent's press runs it", async () => {
    const onClick = vi.fn();
    const agent = createBookiAgent();
    render(<IconButton label="Refresh balances" icon={<Trash />} onClick={onClick} />);
    const controls = (await agent.snapshot()) as Control[];
    expect(controls.find((control) => control.component === "button")?.label).toBe("Refresh balances");
    const result = (await agent.act({
      steps: [{ ref: "Refresh balances", action: "press", args: [] }],
    } as never)) as Result;
    expect(result.ok).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("keeps a person's gate: a confirm-marked icon button tells the agent so", async () => {
    const agent = createBookiAgent();
    render(
      <IconButton label="Delete voucher" icon={<Trash />} data-agent-confirm="Deleting a voucher needs a person" />,
    );
    const controls = (await agent.snapshot()) as Control[];
    expect(controls.find((control) => control.label === "Delete voucher")?.confirm).toBe(
      "Deleting a voucher needs a person",
    );
  });
});
