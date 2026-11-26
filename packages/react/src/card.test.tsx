import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBookiAgent } from "./booki-agent.js";
import { Button } from "./button.js";
import { Card } from "./card.js";
import { IconButton } from "./icon-button.js";

afterEach(cleanup);

type Result = { ok: boolean };
type Control = { ref: string; component: string; label?: string };

describe("Card", () => {
  it("is a region named by its title, with header, body and footer parts", () => {
    render(
      <Card title="Open items" description="October" actions={<button type="button">Export</button>} footer="3 items">
        <p>Body text</p>
      </Card>,
    );
    const card = screen.getByRole("region", { name: "Open items" });
    expect(card.getAttribute("data-slot")).toBe("card");
    expect(card.hasAttribute("data-booki-card")).toBe(true);
    const heading = screen.getByRole("heading", { level: 3, name: "Open items" });
    expect(card.getAttribute("aria-labelledby")).toBe(heading.id);
    for (const part of [
      "card-header",
      "card-heading",
      "card-description",
      "card-actions",
      "card-body",
      "card-footer",
    ]) {
      expect(card.querySelector(`[data-slot="${part}"]`), part).not.toBeNull();
    }
    expect(card.querySelector('[data-slot="card-body"]')?.textContent).toBe("Body text");
  });

  it("leaves out the parts it is not given, and takes a heading level", () => {
    const { container } = render(
      <Card title="Totals" headingLevel={2}>
        Body
      </Card>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Totals" })).toBeTruthy();
    expect(container.querySelector('[data-slot="card-actions"]')).toBeNull();
    expect(container.querySelector('[data-slot="card-footer"]')).toBeNull();
    expect(container.querySelector('[data-slot="card-description"]')).toBeNull();
  });

  it("keeps a name you give it, and is no landmark without a name", () => {
    const { container, rerender } = render(
      <Card title="Shown" aria-label="Given">
        Body
      </Card>,
    );
    expect(container.querySelector('[data-slot="card"]')?.hasAttribute("aria-labelledby")).toBe(false);
    rerender(<Card>Body</Card>);
    expect(screen.queryByRole("region")).toBeNull();
    expect(container.querySelector('[data-slot="card-header"]')).toBeNull();
  });

  it("adds nothing to the agent's snapshot, and the buttons in its header stay pressable", async () => {
    const onClick = vi.fn();
    const agent = createBookiAgent();
    render(
      <Card title="Open items" actions={<IconButton label="Refresh open items" icon={<svg />} onClick={onClick} />}>
        Body
      </Card>,
    );
    const controls = (await agent.snapshot()) as Control[];
    expect(controls.map((control) => control.component)).toEqual(["button"]);
    const result = (await agent.act({
      steps: [{ ref: "Refresh open items", action: "press", args: [] }],
    } as never)) as Result;
    expect(result.ok).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it("holds Booki's Button and IconButton in its actions and footer, each pressable by name", async () => {
    const onPay = vi.fn();
    const agent = createBookiAgent();
    render(
      <Card
        title="Payment batch"
        actions={<IconButton label="Refresh batch" icon={<svg />} />}
        footer={
          <Button onClick={onPay} data-agent-confirm="Paying needs a person">
            Pay batch
          </Button>
        }
      >
        Body
      </Card>,
    );
    const pay = screen.getByRole("button", { name: "Pay batch" });
    expect(pay.closest('[data-slot="card-footer"]')).not.toBeNull();
    expect(pay.hasAttribute("data-booki-button")).toBe(true);
    const refresh = screen.getByRole("button", { name: "Refresh batch" });
    expect(refresh.closest('[data-slot="card-actions"]')).not.toBeNull();
    expect(refresh.hasAttribute("data-booki-button")).toBe(true);
    const ok = (await agent.act({ steps: [{ ref: "Refresh batch", action: "press", args: [] }] } as never)) as Result;
    expect(ok.ok).toBe(true);
    const gated = (await agent.act({ steps: [{ ref: "Pay batch", action: "press", args: [] }] } as never)) as Result;
    expect(gated.ok).toBe(false);
    expect(onPay).not.toHaveBeenCalled();
  });
});
