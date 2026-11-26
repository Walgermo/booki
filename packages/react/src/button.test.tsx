import { button } from "@ui-sdk/core/button";
import { mount } from "@ui-sdk/core/testing";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBookiAgent } from "./booki-agent.js";
import { Button } from "./button.js";
import { IconButton } from "./icon-button.js";

afterEach(cleanup);

type Result = { ok: boolean; error?: { step: number; message: string } };
type Control = { ref: string; component: string; label?: string; actions: string[]; confirm?: string };

describe("Button", () => {
  it("is ui-sdk's button with Booki's marks: primary and md by default, never a submit", () => {
    render(<Button>Post voucher</Button>);
    const button = screen.getByRole("button", { name: "Post voucher" });
    expect(button.getAttribute("data-slot")).toBe("button");
    expect(button.hasAttribute("data-booki-button")).toBe(true);
    expect(button.getAttribute("data-variant")).toBe("primary");
    expect(button.getAttribute("data-size")).toBe("md");
    expect(button.getAttribute("type")).toBe("button");
  });

  it("says its variant and size, and passes native props through", () => {
    render(
      <>
        <Button variant="secondary" size="sm" className="mine" id="export">
          Export CSV
        </Button>
        <Button variant="ghost">Reset</Button>
        <Button type="submit">Save</Button>
        <Button disabled>Locked</Button>
      </>,
    );
    const exportButton = screen.getByRole("button", { name: "Export CSV" });
    expect(exportButton.getAttribute("data-variant")).toBe("secondary");
    expect(exportButton.getAttribute("data-size")).toBe("sm");
    expect(exportButton.className).toContain("mine");
    expect(exportButton.id).toBe("export");
    expect(screen.getByRole("button", { name: "Reset" }).getAttribute("data-variant")).toBe("ghost");
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("type")).toBe("submit");
    expect((screen.getByRole("button", { name: "Locked" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps its marks on ui-sdk's button primitive, which presses by keyboard and mouse (ui-sdk mount)", async () => {
    const action = vi.fn();
    const view = mount(
      button,
      { action } as never,
      `<root data-booki-button data-variant="secondary" data-size="sm">Refresh</root>`,
    );
    try {
      expect(view.root.getAttribute("data-slot")).toBe("button");
      expect(view.root.getAttribute("data-variant")).toBe("secondary");
      expect(view.root.getAttribute("data-size")).toBe("sm");
      await view.keys("Tab", "Enter");
      await view.click(view.root);
      expect(action).toHaveBeenCalledTimes(2);
    } finally {
      view.unmount();
    }
  });

  it("is on the agent's bridge by its text, and an agent's press runs it", async () => {
    const onClick = vi.fn();
    const agent = createBookiAgent();
    render(
      <Button variant="secondary" onClick={onClick}>
        Refresh balances
      </Button>,
    );
    const controls = (await agent.snapshot()) as Control[];
    expect(controls.find((control) => control.component === "button")?.label).toBe("Refresh balances");
    const result = (await agent.act({
      steps: [{ ref: "Refresh balances", action: "press", args: [] }],
    } as never)) as Result;
    expect(result.ok).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("keeps a person's gate: data-agent-confirm reaches the bridge", async () => {
    const agent = createBookiAgent();
    render(<Button data-agent-confirm="Sending a payment needs a person">Send payment</Button>);
    const button = screen.getByRole("button", { name: "Send payment" });
    expect(button.getAttribute("data-agent-confirm")).toBe("Sending a payment needs a person");
    const controls = (await agent.snapshot()) as Control[];
    expect(controls.find((control) => control.label === "Send payment")?.confirm).toBe(
      "Sending a payment needs a person",
    );
  });

  it("is what IconButton is made of: ghost unless told otherwise", () => {
    render(
      <>
        <IconButton label="Delete line 2" icon={<svg />} />
        <IconButton label="Add line" icon={<svg />} variant="secondary" size="sm" />
      </>,
    );
    const quiet = screen.getByRole("button", { name: "Delete line 2" });
    expect(quiet.hasAttribute("data-booki-button")).toBe(true);
    expect(quiet.hasAttribute("data-icon-button")).toBe(true);
    expect(quiet.getAttribute("data-variant")).toBe("ghost");
    const raised = screen.getByRole("button", { name: "Add line" });
    expect(raised.getAttribute("data-variant")).toBe("secondary");
    expect(raised.getAttribute("data-size")).toBe("sm");
  });
});
