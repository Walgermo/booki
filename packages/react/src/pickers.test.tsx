import { checkPattern, mount } from "@ui-sdk/core/testing";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { accountPicker } from "@booki-aui/primitives/account-picker";
import { accountingPeriod } from "@booki-aui/primitives/accounting-period-select";
import { currencySelect } from "@booki-aui/primitives/currency-select";
import { taxCodeSelect } from "@booki-aui/primitives/tax-code-select";
import { AccountPicker } from "./account-picker.js";
import { createBookiAgent } from "./booki-agent.js";
import { CurrencySelect } from "./currency-select.js";
import { BookiLocaleProvider } from "./locale.js";
import { TaxCodeSelect } from "./tax-code-select.js";

afterEach(() => cleanup());

const codes = [
  { code: "MVA25", label: "25 % MVA", percent: 25 },
  { code: "MVA15", label: "15 % MVA (mat)", percent: 15 },
  { code: "MVA12", label: "12 % MVA", percent: 12 },
  { code: "MVA0", label: "0 % fritatt", percent: 0 },
];

const chart = [
  { number: "1500", name: "Kundefordringer" },
  { number: "1920", name: "Bankinnskudd" },
  { number: "2701", name: "Utgående MVA" },
  { number: "3000", name: "Salgsinntekt" },
  { number: "6300", name: "Leie lokale" },
];

const optionsOf = (items: { value: string; label: string }[]) =>
  items.map((i) => `<option value="${i.value}" label="${i.label}">${i.label}</option>`).join("");

/** The three select-only pickers, mounted straight from their primitives. */
const selects = [
  {
    name: "TaxCodeSelect",
    mount: (options: Record<string, unknown> = {}) =>
      mount(
        taxCodeSelect,
        { codes, defaultValue: "MVA25", label: "MVA", ...options },
        `<root><trigger></trigger><list>${optionsOf(codes.map((c) => ({ value: c.code, label: c.label })))}</list></root>`,
      ),
    values: ["MVA25", "MVA15", "MVA12", "MVA0"],
    typed: { key: "1", lands: "MVA15" },
  },
  {
    name: "CurrencySelect",
    mount: (options: Record<string, unknown> = {}) =>
      mount(
        currencySelect,
        { currencies: ["NOK", "USD", "EUR", "SEK"], defaultValue: "NOK", ...options },
        `<root><trigger></trigger><list>${optionsOf(["NOK", "USD", "EUR", "SEK"].map((c) => ({ value: c, label: c })))}</list></root>`,
      ),
    values: ["NOK", "USD", "EUR", "SEK"],
    typed: { key: "e", lands: "EUR" },
  },
  {
    name: "AccountingPeriodSelect",
    mount: (options: Record<string, unknown> = {}) => {
      const items = ["2026-01", "2026-02", "2026-03", "2026-04"].map((value, i) => ({
        value,
        label: ["January", "February", "March", "April"][i]!,
      }));
      return mount(
        accountingPeriod,
        { year: 2026, granularity: "month", locale: "en-US", defaultValue: "2026-01", ...options },
        `<root><trigger></trigger><list>${optionsOf(items)}</list></root>`,
      );
    },
    values: ["2026-01", "2026-02", "2026-03", "2026-04"],
    typed: { key: "m", lands: "2026-03" },
  },
];

describe.each(selects)("$name, a person with a keyboard", (spec) => {
  const [first, second, , last] = spec.values as [string, string, string, string];

  it("is a select-only combobox that controls its listbox", () => {
    const view = spec.mount();
    try {
      const trigger = view.part("trigger")!;
      const list = view.part("list")!;
      expect(trigger.getAttribute("role")).toBe("combobox");
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(trigger.getAttribute("aria-controls")).toBe(list.id);
      expect(list.getAttribute("role")).toBe("listbox");
      expect(list.hidden).toBe(true);
      expect(view.part("option", first)!.getAttribute("aria-selected")).toBe("true");
    } finally {
      view.unmount();
    }
  });

  it("ArrowDown opens on the selected option; arrows, Home and End move the highlight", async () => {
    const view = spec.mount();
    try {
      const trigger = view.part("trigger")!;
      trigger.focus();
      await view.keys("ArrowDown");
      expect(view.state.open).toBe(true);
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      expect(view.state.highlighted).toBe(first);
      expect(trigger.getAttribute("aria-activedescendant")).toBe(view.part("option", first)!.id);

      await view.keys("ArrowDown");
      expect(view.state.highlighted).toBe(second);
      await view.keys("End");
      expect(view.state.highlighted).toBe(last);
      await view.keys("Home");
      expect(view.state.highlighted).toBe(first);
      // Moving never chooses: only Enter, Space or a click does.
      expect(view.state.value).toBe(first);
      expect(document.activeElement).toBe(trigger);
    } finally {
      view.unmount();
    }
  });

  it("Enter chooses the highlighted option, closes, and keeps focus on the trigger", async () => {
    const view = spec.mount();
    try {
      const trigger = view.part("trigger")!;
      trigger.focus();
      await view.keys("ArrowDown");
      await view.keys("ArrowDown");
      await view.keys("Enter");
      expect(view.state.value).toBe(second);
      expect(view.state.open).toBe(false);
      expect(view.state.selected).toEqual([second]);
      expect(document.activeElement).toBe(trigger);
      expect(view.changes.find((c) => c.key === "value")).toMatchObject({ reason: "item-press", source: "keyboard" });
    } finally {
      view.unmount();
    }
  });

  it("Escape closes without choosing and keeps focus on the trigger", async () => {
    const view = spec.mount();
    try {
      const trigger = view.part("trigger")!;
      trigger.focus();
      await view.keys("ArrowDown");
      await view.keys("ArrowDown");
      await view.keys("Escape");
      expect(view.state.open).toBe(false);
      expect(view.state.value).toBe(first);
      expect(view.state.highlighted).toBeNull();
      expect(document.activeElement).toBe(trigger);
    } finally {
      view.unmount();
    }
  });

  it("typing a name highlights it on the open list, and chooses it on the closed trigger", async () => {
    const view = spec.mount();
    try {
      const trigger = view.part("trigger")!;
      trigger.focus();
      await view.keys("ArrowDown");
      await view.keys(spec.typed.key);
      expect(view.state.highlighted).toBe(spec.typed.lands);
      expect(view.state.value).toBe(first);
      await view.keys("Escape");

      await new Promise((resolve) => setTimeout(resolve, 600));
      await view.keys(spec.typed.key);
      expect(view.state.open).toBe(false);
      expect(view.state.value).toBe(spec.typed.lands);
    } finally {
      view.unmount();
    }
  });

  it("a click on an option chooses it and closes the list", async () => {
    const view = spec.mount();
    try {
      await view.click(view.part("trigger")!);
      expect(view.state.open).toBe(true);
      await view.click(view.part("option", last)!);
      expect(view.state.value).toBe(last);
      expect(view.state.open).toBe(false);
    } finally {
      view.unmount();
    }
  });

  it("read-only: keys and clicks neither open the list nor choose", async () => {
    const view = spec.mount({ readOnly: true });
    try {
      const trigger = view.part("trigger")!;
      expect(trigger.getAttribute("aria-readonly")).toBe("true");
      trigger.focus();
      await view.keys("ArrowDown");
      await view.keys(spec.typed.key);
      await view.click(trigger);
      expect(view.state.open).toBe(false);
      expect(view.state.value).toBe(first);
    } finally {
      view.unmount();
    }
  });
});

describe("On a touch screen", () => {
  it("the select-only pickers hand over to their native <select>, the platform's own picker", async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: /pointer:\s*coarse/.test(query) || /hover:\s*none/.test(query),
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    })) as unknown as typeof window.matchMedia;
    try {
      const view = render(
        <BookiLocaleProvider defaultCountry="NO">
          <TaxCodeSelect defaultValue="MVA25" />
          <AccountPicker accounts={chart} defaultValue="1500" />
        </BookiLocaleProvider>,
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      const native = document.querySelector('[data-slot="tax-code-select-control"]') as HTMLSelectElement;
      expect(native.hidden).toBe(false);
      expect((document.querySelector('[data-slot="tax-code-select-trigger"]') as HTMLElement).hidden).toBe(true);
      // AccountPicker keeps its search on a phone.
      expect((document.querySelector('[data-slot="account-picker-control"]') as HTMLElement).hidden).toBe(true);
      expect((document.querySelector('[data-slot="account-picker-input"]') as HTMLElement).hidden).toBe(false);

      fireEvent.change(native, { target: { value: "MVA15" } });
      expect(native.value).toBe("MVA15");
      view.unmount();
    } finally {
      window.matchMedia = original;
    }
  });
});

describe("AccountPicker, a person searching the chart of accounts", () => {
  const markup = `<root><input></input><list>${optionsOf(
    chart.map((a) => ({ value: a.number, label: `${a.number} — ${a.name}` })),
  )}</list><empty>No accounts match</empty></root>`;
  const start = () => mount(accountPicker, { accounts: chart, defaultValue: "1500", label: "Konto" }, markup);
  const shown = () =>
    [...document.querySelectorAll('[role="option"]')].map((o) => o.getAttribute("data-key") ?? o.textContent);

  it("is an editable combobox that shows the chosen account", () => {
    const view = start();
    try {
      const input = view.part("input") as HTMLInputElement;
      expect(input.getAttribute("role")).toBe("combobox");
      expect(input.getAttribute("aria-autocomplete")).toBe("list");
      expect(input.value).toBe("1500 — Kundefordringer");
    } finally {
      view.unmount();
    }
  });

  it("typing filters the list and highlights the first match; Enter chooses it", async () => {
    const view = start();
    try {
      const input = view.part("input") as HTMLInputElement;
      input.focus();
      await view.type("mva");
      expect(view.state.open).toBe(true);
      expect(view.state.query).toBe("mva");
      expect(shown()).toEqual(["2701 — Utgående MVA"]);
      expect(view.state.highlighted).toBe("2701");
      await view.keys("Enter");
      expect(view.state.value).toBe("2701");
      expect(view.state.name).toBe("Utgående MVA");
      expect(view.state.open).toBe(false);
      expect((view.part("input") as HTMLInputElement).value).toBe("2701 — Utgående MVA");
      expect(document.activeElement).toBe(input);
    } finally {
      view.unmount();
    }
  });

  it("matches account numbers too, and says so when nothing matches", async () => {
    const view = start();
    try {
      (view.part("input") as HTMLInputElement).focus();
      await view.type("63");
      expect(shown()).toEqual(["6300 — Leie lokale"]);
      expect(view.api.picker.listbox.count()).toBe(1);
      await view.type("x");
      expect(shown()).toEqual([]);
      expect(view.api.picker.listbox.count()).toBe(0);
    } finally {
      view.unmount();
    }
  });

  it("ArrowDown opens the whole chart on the chosen account and moves through it", async () => {
    const view = start();
    try {
      (view.part("input") as HTMLInputElement).focus();
      await view.keys("ArrowDown");
      expect(view.state.open).toBe(true);
      expect(view.state.highlighted).toBe("1500");
      expect(shown()).toHaveLength(chart.length);
      await view.keys("ArrowDown");
      await view.keys("ArrowDown");
      expect(view.state.highlighted).toBe("2701");
      await view.keys("ArrowUp");
      expect(view.state.highlighted).toBe("1920");
    } finally {
      view.unmount();
    }
  });

  it("Escape closes and drops the search without choosing", async () => {
    const view = start();
    try {
      const input = view.part("input") as HTMLInputElement;
      input.focus();
      await view.type("bank");
      await view.keys("Escape");
      expect(view.state.open).toBe(false);
      expect(view.state.query).toBe("");
      expect(view.state.value).toBe("1500");
      expect((view.part("input") as HTMLInputElement).value).toBe("1500 — Kundefordringer");
      expect(document.activeElement).toBe(input);
    } finally {
      view.unmount();
    }
  });
});

describe("The pickers in React, with the agent bridge", () => {
  it("follow ui-sdk's combobox pattern", async () => {
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <div data-testid="tax">
          <TaxCodeSelect defaultValue="MVA25" />
        </div>
        <div data-testid="account">
          <AccountPicker accounts={chart} defaultValue="1500" />
        </div>
      </BookiLocaleProvider>,
    );
    await checkPattern(document.querySelector('[data-testid="tax"]') as HTMLElement, "combobox");
    await checkPattern(document.querySelector('[data-testid="account"]') as HTMLElement, "combobox");
  });

  it("TaxCodeSelect: a person's keys and an agent's setTaxCode drive the same value", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <TaxCodeSelect defaultValue="MVA25" />
      </BookiLocaleProvider>,
    );
    const trigger = document.querySelector('[data-slot="tax-code-select-trigger"]') as HTMLButtonElement;
    const entry = () =>
      agent.snapshot().find((c) => c.component === "tax-code-select") as unknown as { ref: string; value: string };
    expect(trigger.textContent).toContain("25");

    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(entry().value).not.toBe("MVA25");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    const result = await agent.act({ steps: [{ ref: entry().ref, action: "setTaxCode", args: ["MVA25"] }] });
    expect(result.ok).toBe(true);
    expect(entry().value).toBe("MVA25");
    expect(trigger.value).toBe("MVA25");
    // The native fallback follows too.
    expect((document.querySelector('[data-slot="tax-code-select-control"]') as HTMLSelectElement).value).toBe("MVA25");
  });

  it("AccountPicker: search, choose, and the agent sees the account", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <AccountPicker accounts={chart} defaultValue="1500" />
      </BookiLocaleProvider>,
    );
    const input = document.querySelector('[data-slot="account-picker-input"]') as HTMLInputElement;
    input.focus();
    fireEvent.input(input, { target: { value: "salg" } });
    await act(async () => {});
    const options = [...document.querySelectorAll('[data-slot="account-picker-option"]')];
    expect(options.map((o) => o.textContent)).toEqual(["3000Salgsinntekt"]);
    fireEvent.keyDown(input, { key: "Enter" });
    const entry = agent.snapshot().find((c) => c.component === "account-picker") as unknown as {
      value: string;
      name: string;
    };
    expect(entry.value).toBe("3000");
    expect(input.value).toBe("3000 — Salgsinntekt");

    expect(document.querySelector('[data-slot="account-picker-empty"]')).toBeNull();
    fireEvent.input(input, { target: { value: "zzz" } });
    await act(async () => {});
    expect(document.querySelector('[data-slot="account-picker-empty"]')?.textContent).toBe(
      "Ingen kontoer passer søket",
    );
  });
});

describe("an agent naming an account", () => {
  // Without `closed`, the bridge no longer refuses first in its own words:
  // the picker resolves a name, and refuses from Booki's catalogue.
  it("finds it by name, in any case, and refuses an unknown one with the chart", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <AccountPicker aria-label="Konto" accounts={chart} />
      </BookiLocaleProvider>,
    );
    const ref = agent.snapshot().find((entry) => entry.component === "account-picker")!.ref;
    const named = (await agent.act({ steps: [{ ref, action: "setAccount", args: ["leie lokale"] }] })) as {
      ok: boolean;
    };
    expect(named.ok).toBe(true);
    expect(agent.snapshot().find((entry) => entry.ref === ref)).toMatchObject({ value: "6300" });
    const unknown = (await agent.act({ steps: [{ ref, action: "setAccount", args: ["9999"] }] })) as {
      ok: boolean;
      error?: { message: string };
    };
    expect(unknown.ok).toBe(false);
    expect(unknown.error?.message).toMatch(/No account "9999"\. Its items: .*1500/);
  });
});

describe("CurrencySelect's trigger", () => {
  it("is named in the person's language, like the group around it", () => {
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <CurrencySelect currencies={["NOK", "EUR"]} />
      </BookiLocaleProvider>,
    );
    const trigger = document.querySelector('[data-slot="currency-select"] [role="combobox"]') as HTMLElement;
    expect(trigger.getAttribute("aria-label")).toBe("Valuta");
    cleanup();
    render(
      <BookiLocaleProvider defaultCountry="US">
        <CurrencySelect currencies={["USD"]} />
      </BookiLocaleProvider>,
    );
    expect(
      (document.querySelector('[data-slot="currency-select"] [role="combobox"]') as HTMLElement).getAttribute(
        "aria-label",
      ),
    ).toBe("Currency");
  });
});

describe("CurrencySelect, controlled", () => {
  it("takes no default when it is given a value, so ui-sdk does not warn on every render", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <CurrencySelect value="EUR" onValueChange={() => {}} />
        <CurrencySelect />
      </BookiLocaleProvider>,
    );
    expect(warn.mock.calls.flat().join(" ")).not.toMatch(/got `value` and `defaultValue`/);
    warn.mockRestore();
  });
});
