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

  it("drops the source and status given for one figure when the figure changes again before saving", async () => {
    render(<CrmApp initial={structuredClone(crm())} />);
    const amount = () => document.querySelector<HTMLInputElement>("#deal-amount")!;
    const source = screen.getByPlaceholderText("Tilbudsnummer eller grunnlag for estimatet") as HTMLInputElement;
    const status = document.querySelector<HTMLSelectElement>("#deal-status")!;
    const type = (text: string) => {
      fireEvent.focus(amount());
      fireEvent.input(amount(), { target: { value: text } });
      fireEvent.blur(amount());
    };

    type("280000");
    fireEvent.change(source, { target: { value: "Tilbud 2026-200" } });
    fireEvent.change(status, { target: { value: "known" } });
    expect(source.value).toBe("Tilbud 2026-200");
    expect(status.value).toBe("known");

    // A new figure: the quote vouched for 280 000, not this.
    type("300000");
    expect(source.value).toBe("");
    expect(status.value).toBe("unknown");

    fireEvent.click(screen.getByRole("button", { name: "Lagre verdien" }));
    await waitFor(() => expect(crm().deals.find((deal) => deal.id === "D-101")?.valueMinor).toBe(300_000_00));
    const saved = crm().deals.find((deal) => deal.id === "D-101")!;
    expect(saved.valueStatus).toBe("unknown");
    expect(saved.valueSource).toBeUndefined();
  });
});
