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

  /*
   * How sure and from where vouch for one figure. The cases, for deal D-101 (NOK 180 000, known, "Tilbud 2026-114"):
   *
   * | Case                                   | Status and source shown and saved                          |
   * | -------------------------------------- | ---------------------------------------------------------- |
   * | Figure unchanged                       | kept (the deal's own, or what the person gave for it)      |
   * | Figure changed, then saved             | none, unless the person gives new ones for the new figure  |
   * | Figure changed, then changed back      | back: what was given for that figure                       |
   * | Amount edit the field refuses          | no change: what was given for the figure stays             |
   * | Undo                                   | the deal's own, and earlier drafts are gone                |
   * | Currency change                        | a figure change: none for the new currency, back on return |
   */
  describe("status and source follow the figure", () => {
    const D101 = () => crm().deals.find((deal) => deal.id === "D-101")!;
    function setup() {
      render(<CrmApp initial={structuredClone(crm())} />);
      const amount = () => document.querySelector<HTMLInputElement>("#deal-amount")!;
      const source = () =>
        screen.getByPlaceholderText("Tilbudsnummer eller grunnlag for estimatet") as HTMLInputElement;
      const status = () => document.querySelector<HTMLSelectElement>("#deal-status")!;
      const form = () => amount().closest("form")!;
      const currency = () => form().querySelector<HTMLSelectElement>("select:not(#deal-status)")!;
      /** One edit of the amount: focus, each keystroke's text, blur. */
      const edit = (...texts: string[]) => {
        fireEvent.focus(amount());
        for (const text of texts) fireEvent.input(amount(), { target: { value: text } });
        fireEvent.blur(amount());
      };
      const give = (statusValue: string, sourceValue: string) => {
        fireEvent.change(status(), { target: { value: statusValue } });
        fireEvent.change(source(), { target: { value: sourceValue } });
      };
      const shown = () => ({ status: status().value, source: source().value });
      const save = () => fireEvent.click(screen.getByRole("button", { name: "Lagre verdien" }));
      return { amount, currency, edit, give, shown, save };
    }

    it("figure unchanged: the deal's own stay, and so does what the person gave", () => {
      const { edit, give, shown } = setup();
      edit("180000");
      expect(shown()).toEqual({ status: "known", source: "Tilbud 2026-114" });
      give("estimate", "Tilbud 9");
      edit("180000");
      expect(shown()).toEqual({ status: "estimate", source: "Tilbud 9" });
    });

    it("figure changed, then saved: none, since the quote vouched for the figure before", async () => {
      const { edit, give, shown, save } = setup();
      edit("280000");
      give("known", "Tilbud 2026-200");
      edit("300000");
      expect(shown()).toEqual({ status: "unknown", source: "" });
      save();
      await waitFor(() => expect(D101().valueMinor).toBe(300_000_00));
      expect(D101().valueStatus).toBe("unknown");
      expect(D101().valueSource).toBeUndefined();
    });

    it("figure changed, then saved with new ones given for it: those are saved", async () => {
      const { edit, give, save } = setup();
      edit("300000");
      give("known", "Tilbud 2026-300");
      save();
      await waitFor(() => expect(D101().valueMinor).toBe(300_000_00));
      expect(D101().valueStatus).toBe("known");
      expect(D101().valueSource).toBe("Tilbud 2026-300");
    });

    it("figure changed, then changed back: what was given for that figure comes back", () => {
      const { edit, give, shown } = setup();
      edit("250000");
      expect(shown()).toEqual({ status: "unknown", source: "" });
      edit("180000");
      expect(shown()).toEqual({ status: "known", source: "Tilbud 2026-114" });

      edit("280000");
      give("known", "Tilbud 2026-200");
      edit("300000");
      expect(shown()).toEqual({ status: "unknown", source: "" });
      edit("280000");
      expect(shown()).toEqual({ status: "known", source: "Tilbud 2026-200" });
    });

    it("an amount edit the field refuses changes nothing: what was given stays, through to the save", async () => {
      const { amount, edit, give, shown, save } = setup();
      edit("280000");
      give("known", "Tilbud 2026-200");
      // Valid keystrokes on the way to three decimals the field refuses on blur.
      edit("280000,1", "280000,123");
      expect(amount().validity.valid).toBe(false);
      expect(shown()).toEqual({ status: "known", source: "Tilbud 2026-200" });
      edit("280000");
      expect(amount().validity.valid).toBe(true);
      expect(shown()).toEqual({ status: "known", source: "Tilbud 2026-200" });
      save();
      await waitFor(() => expect(D101().valueMinor).toBe(280_000_00));
      expect(D101().valueStatus).toBe("known");
      expect(D101().valueSource).toBe("Tilbud 2026-200");
    });

    it("an unparseable amount edit changes nothing either", () => {
      const { edit, give, shown } = setup();
      give("estimate", "Tilbud 9");
      edit("18", "180000x");
      expect(shown()).toEqual({ status: "estimate", source: "Tilbud 9" });
    });

    it("undo: back to the deal's own, and what was given in the draft is gone", () => {
      const { amount, edit, give, shown } = setup();
      give("estimate", "Tilbud 9");
      edit("280000");
      give("known", "Tilbud 2026-200");
      fireEvent.click(screen.getByRole("button", { name: "Angre" }));
      expect(amount().value).toMatch(/180/);
      expect(shown()).toEqual({ status: "known", source: "Tilbud 2026-114" });
      edit("280000");
      expect(shown()).toEqual({ status: "unknown", source: "" });
    });

    it("currency change: a figure change, so none for the new currency, and back on returning", async () => {
      const { currency, shown, save } = setup();
      fireEvent.change(currency(), { target: { value: "EUR" } });
      expect(shown()).toEqual({ status: "unknown", source: "" });
      fireEvent.change(currency(), { target: { value: "NOK" } });
      expect(shown()).toEqual({ status: "known", source: "Tilbud 2026-114" });
      fireEvent.change(currency(), { target: { value: "EUR" } });
      save();
      await waitFor(() => expect(D101().currency).toBe("EUR"));
      expect(D101().valueStatus).toBe("unknown");
      expect(D101().valueSource).toBeUndefined();
    });
  });
});
