import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CrmApp } from "@/components/crm-app";
import { crm } from "@/lib/store";

describe("the deal's value form", () => {
  it("undo drops amount text the field refused, so the next save goes through", async () => {
    render(<CrmApp initial={structuredClone(crm())} />);
    const amount = document.querySelector<HTMLInputElement>("#deal-amount")!;
    const source = screen.getByPlaceholderText("Tilbudsnummer eller grunnlag for estimatet") as HTMLInputElement;
    const form = amount.closest("form")!;

    fireEvent.change(source, { target: { value: "Tilbud 7" } });
    fireEvent.focus(amount);
    fireEvent.input(amount, { target: { value: "abc" } });
    fireEvent.blur(amount);
    expect(amount.validity.valid).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Angre" }));
    const restored = document.querySelector<HTMLInputElement>("#deal-amount")!;
    expect(restored.value).not.toBe("abc");
    expect(restored.validity.valid).toBe(true);

    fireEvent.change(source, { target: { value: "Tilbud 8" } });
    expect(form.checkValidity()).toBe(true);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Lagre verdien" })).not.toHaveProperty("disabled", true),
    );
  });
});
