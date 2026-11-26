import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBookiAgent } from "./booki-agent.js";
import { Button } from "./button.js";
import { IconButton } from "./icon-button.js";
import { Toolbar, ToolbarGroup, ToolbarSeparator } from "./toolbar.js";

afterEach(cleanup);

type Result = { ok: boolean };
type Control = { ref: string; component: string; label?: string; actions: string[]; buttons?: string[] };

const Glyph = () => <svg width="16" height="16" />;

function Actions({ onExport = () => undefined }: { onExport?: () => void }) {
  return (
    <Toolbar label="Invoice actions">
      <IconButton label="Print" icon={<Glyph />} />
      <IconButton label="Export CSV" icon={<Glyph />} onClick={onExport} />
      <ToolbarSeparator />
      <ToolbarGroup label="Send">
        <button type="button">Email</button>
        <a href="#portal">Portal</a>
      </ToolbarGroup>
    </Toolbar>
  );
}

describe("Toolbar", () => {
  it("is a named toolbar with one tab stop", () => {
    const { container } = render(<Actions />);
    const toolbar = screen.getByRole("toolbar", { name: "Invoice actions" });
    expect(toolbar.getAttribute("data-slot")).toBe("toolbar");
    expect(toolbar.hasAttribute("data-booki-toolbar")).toBe(true);
    expect(toolbar.getAttribute("aria-orientation")).toBe("horizontal");
    const stops = [...toolbar.querySelectorAll("button, a")].map((item) => item.getAttribute("tabindex"));
    expect(stops).toEqual(["0", "-1", "-1", "-1"]);
    expect(screen.getByRole("group", { name: "Send" })).toBeTruthy();
    expect(container.querySelector('[data-slot="toolbar-separator"]')?.getAttribute("role")).toBe("separator");
    // An IconButton keeps its own slot and look inside the toolbar.
    expect(screen.getByRole("button", { name: "Print" }).getAttribute("data-slot")).toBe("button");
  });

  it("moves focus with the arrow keys, Home and End, and wraps around", () => {
    render(<Actions />);
    const print = screen.getByRole("button", { name: "Print" });
    const csv = screen.getByRole("button", { name: "Export CSV" });
    const portal = screen.getByRole("link", { name: "Portal" });
    print.focus();
    fireEvent.keyDown(print, { key: "ArrowRight" });
    expect(document.activeElement).toBe(csv);
    expect(csv.getAttribute("tabindex")).toBe("0");
    expect(print.getAttribute("tabindex")).toBe("-1");
    fireEvent.keyDown(csv, { key: "End" });
    expect(document.activeElement).toBe(portal);
    fireEvent.keyDown(portal, { key: "Home" });
    expect(document.activeElement).toBe(print);
    fireEvent.keyDown(print, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(portal);
  });

  it("is one toolbar entry on the bridge, listing its buttons; the agent presses one by name", async () => {
    const onExport = vi.fn();
    const agent = createBookiAgent();
    render(<Actions onExport={onExport} />);
    const controls = (await agent.snapshot()) as Control[];
    const toolbar = controls.find((control) => control.component === "toolbar");
    expect(toolbar?.label).toBe("Invoice actions");
    expect(toolbar?.buttons).toEqual(expect.arrayContaining(["Print", "Export CSV", "Email"]));
    const result = (await agent.act({
      steps: [{ ref: toolbar!.ref, action: "press", args: ["Export CSV"] }],
    } as never)) as Result;
    expect(result.ok).toBe(true);
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("keeps a person's gate on a button inside it", async () => {
    const onDelete = vi.fn();
    const agent = createBookiAgent();
    render(
      <Toolbar label="Voucher">
        <IconButton
          label="Delete voucher"
          icon={<Glyph />}
          onClick={onDelete}
          data-agent-confirm="Deleting a voucher needs a person"
        />
      </Toolbar>,
    );
    const result = (await agent.act({
      steps: [{ ref: "Delete voucher", action: "press", args: [] }],
    } as never)) as Result;
    expect(result.ok).toBe(false);
    expect(onDelete).not.toHaveBeenCalled();
  });
  it("puts Booki's Button and IconButton on the roving focus, keeping their own look", async () => {
    const onSave = vi.fn();
    const agent = createBookiAgent();
    render(
      <Toolbar label="Draft">
        <Button onClick={onSave}>Save draft</Button>
        <Button variant="secondary">Preview</Button>
        <IconButton label="Delete draft" icon={<Glyph />} />
      </Toolbar>,
    );
    const save = screen.getByRole("button", { name: "Save draft" });
    const preview = screen.getByRole("button", { name: "Preview" });
    const remove = screen.getByRole("button", { name: "Delete draft" });
    expect([save, preview, remove].map((item) => item.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    for (const item of [save, preview, remove]) {
      expect(item.getAttribute("data-slot")).toBe("button");
      expect(item.hasAttribute("data-booki-button")).toBe(true);
    }
    expect(preview.getAttribute("data-variant")).toBe("secondary");
    expect(remove.getAttribute("data-variant")).toBe("ghost");
    save.focus();
    fireEvent.keyDown(save, { key: "ArrowRight" });
    expect(document.activeElement).toBe(preview);
    fireEvent.keyDown(preview, { key: "End" });
    expect(document.activeElement).toBe(remove);
    const toolbar = ((await agent.snapshot()) as Control[]).find((control) => control.component === "toolbar");
    const result = (await agent.act({
      steps: [{ ref: toolbar!.ref, action: "press", args: ["Save draft"] }],
    } as never)) as Result;
    expect(result.ok).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
