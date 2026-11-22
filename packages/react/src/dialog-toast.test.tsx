import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AmountField } from "./amount-field.js";
import { createBookiAgent } from "./booki-agent.js";
import { ConfirmDialog } from "./confirm-dialog.js";
import { BookiLocaleProvider } from "./locale.js";
import { BookiToasts, createToaster, useAgentToasts } from "./toasts.js";

afterEach(() => cleanup());

// jsdom has neither; ui-sdk's overlays use both for layout and exit animations.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
if (!("getAnimations" in Element.prototype)) {
  (Element.prototype as unknown as { getAnimations: () => Animation[] }).getAnimations = () => [];
}

type Result = { ok: boolean; error?: { message: string } };

describe("ConfirmDialog", () => {
  it("lets a person agree, and an agent read and cancel but never agree", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    const onConfirm = vi.fn();
    render(
      <BookiLocaleProvider defaultCountry="US">
        <ConfirmDialog
          trigger="Post voucher"
          title="Post voucher 1042?"
          description="It cannot be undone."
          onConfirm={onConfirm}
          confirmLabel="Post"
        />
      </BookiLocaleProvider>,
    );
    fireEvent.click(screen.getByText("Post voucher"));
    // The dialog is a popover; jsdom never shows one, so the queries include hidden elements.
    await screen.findByRole("alertdialog", { hidden: true });
    const dialog = agent
      .snapshot()
      .find((entry) => entry.component === "alert-dialog" || entry.label === "Post voucher 1042?");
    expect(dialog).toBeDefined();
    const pressed = (await agent.act({ steps: [{ ref: dialog!.ref, action: "press", args: ["Post"] }] })) as Result;
    expect(pressed.ok).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Post"));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it("waits for the typed word, and shows a failed answer in the dialog", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("The period is closed."));
    render(
      <BookiLocaleProvider defaultCountry="US">
        <ConfirmDialog
          defaultOpen
          title="Release payment run?"
          confirmWord="1042"
          tone="danger"
          onConfirm={onConfirm}
          confirmLabel="Release"
        />
      </BookiLocaleProvider>,
    );
    const button = await screen.findByText("Release");
    expect((button as HTMLButtonElement).disabled || button.getAttribute("aria-disabled") === "true").toBe(true);
    fireEvent.change(screen.getByLabelText("Type 1042 to confirm"), { target: { value: "1042" } });
    fireEvent.click(screen.getByText("Release"));
    expect((await screen.findByRole("alert", { hidden: true })).textContent).toMatch("The period is closed.");
    expect(screen.getByRole("alertdialog", { hidden: true })).toBeDefined();
  });
});

describe("agent toasts", () => {
  it("gives a receipt for what the agent did, with the agent's mark, and Undo", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    const toaster = createToaster();
    function Page() {
      useAgentToasts(agent, { toaster });
      return (
        <>
          <AmountField aria-label="Amount" />
          <BookiToasts toaster={toaster} />
        </>
      );
    }
    render(
      <BookiLocaleProvider defaultCountry="US">
        <Page />
      </BookiLocaleProvider>,
    );
    const ref = agent.snapshot().find((entry) => entry.component === "amount-field")!.ref;
    await act(async () => {
      await agent.act({ steps: [{ ref, action: "setMinor", args: [125_000] }] });
    });
    const toast = await waitFor(() => {
      const node = document.querySelector('[data-booki-toast=""][data-agent]');
      if (!node) throw new Error("no toast yet");
      return node;
    });
    expect(toast.textContent).toMatch(/Agent/);
    expect(toast.textContent).toMatch(/Amount/);
    await act(async () => {
      fireEvent.click(screen.getByText("Undo"));
    });
    await waitFor(() => expect(agent.snapshot().find((entry) => entry.ref === ref)).toMatchObject({ value: 0 }));
    toaster.dismiss();
  });
});
