import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ApprovalGate } from "./approval-gate.js";
import { BookiLocaleProvider } from "./locale.js";

// ui-sdk waits for a popup's exit animations before unmounting it; jsdom has no Web Animations.
(Element.prototype as unknown as { getAnimations: () => unknown[] }).getAnimations ??= () => [];

afterEach(() => cleanup());

// The field has no autofocus of its own, so nothing forces a phone's keyboard
// up over what is being approved; the dialog picks where focus lands.

function open(pointerType: "mouse" | "touch") {
  render(
    <BookiLocaleProvider defaultCountry="US">
      <ApprovalGate triggerLabel="Approve payment" confirmWord="APPROVE" />
    </BookiLocaleProvider>,
  );
  const trigger = [...document.querySelectorAll("button")].find((b) => b.textContent === "Approve payment")!;
  fireEvent.pointerDown(trigger, { pointerType });
  fireEvent.pointerUp(trigger, { pointerType });
  fireEvent.click(trigger, { detail: 1 });
}

describe("ApprovalGate word field", () => {
  // Where focus lands is the dialog's choice (ui-sdk: the first field with a mouse or keys, the
  // dialog itself by touch). jsdom lays nothing out, so the dialog focuses nothing in it either
  // way and a test here would pass whatever the code did. Checked in a browser instead.

  it("has no autofocus of its own, and asks for a keyboard that fits a code word", async () => {
    open("mouse");
    await waitFor(() => expect(document.querySelector('[data-slot="approval-gate-type"] input')).not.toBeNull());
    const field = document.querySelector('[data-slot="approval-gate-type"] input') as HTMLInputElement;
    expect(field.getAttribute("autocapitalize")).toBe("characters");
    expect(field.getAttribute("enterkeyhint")).toBe("done");
    expect(field.hasAttribute("autofocus")).toBe(false);
  });
});
