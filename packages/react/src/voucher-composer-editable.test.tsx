import type { AccountOption, VoucherLine } from "@booki-aui/core/voucher";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBookiAgent } from "./booki-agent.js";
import { BookiLocaleProvider } from "./locale.js";
import { VoucherComposer } from "./voucher-composer.js";

afterEach(() => cleanup());

const chart: AccountOption[] = [
  { number: "1500", name: "Kundefordringer" },
  { number: "2701", name: "Utgående MVA" },
  // Sales may only carry 25% VAT.
  { number: "3000", name: "Salgsinntekt", vatCodes: ["MVA25"], defaultVatCode: "MVA25" },
];
const departments = [
  { code: "D1", name: "Salg" },
  { code: "D2", name: "Drift" },
];
const projects = [{ code: "P7", name: "Nytt lager" }];

const seed: VoucherLine[] = [
  { id: "recv", account: "1500", accountName: "Kundefordringer", debitMinor: 12_500, creditMinor: 0 },
  { id: "sales", account: "3000", accountName: "Salgsinntekt", debitMinor: 0, creditMinor: 12_500, vatCode: "MVA25" },
];

type Props = Partial<React.ComponentProps<typeof VoucherComposer>>;

function setup(props: Props = {}, country: "NO" | "US" = "NO") {
  const agent = createBookiAgent({ agentId: "test" });
  const onLinesChange = vi.fn();
  render(
    <BookiLocaleProvider defaultCountry={country}>
      <VoucherComposer
        editable
        accounts={chart}
        departments={departments}
        projects={projects}
        defaultLines={seed}
        onLinesChange={onLinesChange}
        aria-label="Voucher lines"
        {...props}
      />
    </BookiLocaleProvider>,
  );
  const lines = () =>
    (
      agent.snapshot().find((c) => c.component === "voucher-composer") as unknown as {
        lines: VoucherLine[];
      }
    ).lines;
  const line = (id: string) => lines().find((item) => item.id === id);
  return { agent, onLinesChange, lines, line };
}

/** The control for `field` on row `row` (1-based), found by its accessible name. */
function cell<T extends HTMLElement = HTMLInputElement>(field: string, row: number): T {
  const el = document.querySelector(`[aria-label="${field}, Linje ${row}"]`);
  if (!el) throw new Error(`No "${field}" control on line ${row}`);
  return el as T;
}

const alerts = () => [...document.querySelectorAll('[role="alert"]')].map((el) => el.textContent);

function pick(el: HTMLSelectElement, value: string) {
  fireEvent.change(el, { target: { value } });
}

function type(el: HTMLInputElement, text: string) {
  fireEvent.focus(el);
  fireEvent.input(el, { target: { value: text } });
}

describe("VoucherComposer is read-only unless editable", () => {
  it("renders the plain table by default and controls with editable", () => {
    setup({ editable: false });
    expect(document.querySelector("[data-slot='voucher-lines'] input, [data-slot='voucher-lines'] select")).toBeNull();
    expect(document.querySelector("[data-slot='voucher-debit']")?.textContent).toContain("125,00");
    cleanup();

    setup();
    expect(cell("Debet", 1).value).toBe("125,00");
    expect(cell("Kredit", 1).value).toBe("");
    expect(cell<HTMLSelectElement>("Konto", 2).value).toBe("3000");
    expect(cell<HTMLSelectElement>("MVA", 2).value).toBe("MVA25");
  });
});

describe("a person edits each field of a voucher line", () => {
  it("account: picks from the chart, and the name follows the chart", () => {
    const { line, onLinesChange } = setup();
    pick(cell<HTMLSelectElement>("Konto", 1), "2701");
    expect(line("recv")).toMatchObject({ account: "2701", accountName: "Utgående MVA" });
    const [, details] = onLinesChange.mock.lastCall as [
      VoucherLine[],
      { reason: string; source: string; event?: Event },
    ];
    expect(details.reason).toBe("set-account");
    // Reported as the person's own change: it carries their DOM event and is
    // never attributed to the agent.
    expect(details.source).not.toBe("agent");
    expect(details.event?.type).toBe("change");
  });

  it("account: a text input without a chart, committed on Enter, with an editable name", () => {
    const { line, onLinesChange } = setup({ accounts: undefined });
    const account = cell("Konto", 1);
    expect(account.tagName).toBe("INPUT");
    type(account, "1920");
    expect(onLinesChange).not.toHaveBeenCalled();
    fireEvent.keyDown(account, { key: "Enter" });
    expect(line("recv")?.account).toBe("1920");

    const name = cell("Navn", 1);
    type(name, "Bank");
    fireEvent.blur(name);
    expect(line("recv")).toMatchObject({ account: "1920", accountName: "Bank" });
  });

  it("VAT code: sets and clears it", () => {
    const { line } = setup();
    const vat = cell<HTMLSelectElement>("MVA", 1);
    pick(vat, "MVA15");
    expect(line("recv")?.vatCode).toBe("MVA15");
    pick(vat, "");
    expect(line("recv")?.vatCode).toBeUndefined();
  });

  it("department and project: selects from the supplied lists", () => {
    const { line } = setup();
    pick(cell<HTMLSelectElement>("Avdeling", 1), "D2");
    pick(cell<HTMLSelectElement>("Prosjekt", 1), "P7");
    expect(line("recv")).toMatchObject({ department: "D2", project: "P7" });
  });

  it("leaves out the department and project columns when no list is supplied", () => {
    setup({ departments: undefined, projects: undefined });
    expect(document.querySelector('[data-slot="voucher-line-department"]')).toBeNull();
    expect(document.querySelector('[data-slot="voucher-line-project"]')).toBeNull();
    expect(cell("Debet", 1)).toBeTruthy();
  });

  it("debit: typed in major units, committed on blur and not on every keystroke", () => {
    const { line, onLinesChange } = setup();
    const debit = cell("Debet", 1);
    type(debit, "1 2");
    type(debit, "1 234,5");
    expect(onLinesChange).not.toHaveBeenCalled();
    expect(line("recv")?.debitMinor).toBe(12_500);
    fireEvent.blur(debit);
    expect(line("recv")?.debitMinor).toBe(123_450);
    expect(onLinesChange).toHaveBeenCalledTimes(1);
    expect(debit.value).toBe("1 234,50");
  });

  it("credit: committed on Enter, and it takes the line's debit with it", () => {
    const { line, onLinesChange } = setup();
    const credit = cell("Kredit", 1);
    type(credit, "80");
    const enter = fireEvent.keyDown(credit, { key: "Enter" });
    // Enter is consumed, so a surrounding form is not submitted.
    expect(enter).toBe(false);
    expect(line("recv")).toMatchObject({ debitMinor: 0, creditMinor: 8_000 });
    // The blur that follows has nothing left to commit.
    fireEvent.blur(credit);
    expect(onLinesChange).toHaveBeenCalledTimes(1);
    expect(cell("Debet", 1).value).toBe("");
  });

  it("an emptied amount cell means zero", () => {
    const { line } = setup();
    const debit = cell("Debet", 1);
    type(debit, "");
    fireEvent.blur(debit);
    expect(line("recv")?.debitMinor).toBe(0);
  });
});

describe("a refused edit by a person", () => {
  it("shows the rule's message on that row, leaves the lines unchanged, and clears on the next good edit", () => {
    const { lines } = setup();
    const before = lines();
    const vat = cell<HTMLSelectElement>("MVA", 2);
    expect(() => pick(vat, "MVA15")).not.toThrow();
    expect(lines()).toEqual(before);
    // The select shows what the line still holds, not the refused choice.
    expect(vat.value).toBe("MVA25");
    expect(alerts()).toEqual(["Account 3000 cannot be posted with VAT code MVA15. It allows: MVA25."]);
    // The message sits in the row after the line it belongs to.
    const row = vat.closest("tr")!;
    expect(row.nextElementSibling?.getAttribute("data-slot")).toBe("voucher-line-error");
    expect(row.nextElementSibling?.querySelector('[role="alert"]')).not.toBeNull();

    pick(cell<HTMLSelectElement>("Avdeling", 2), "D1");
    expect(alerts()).toEqual([]);
  });

  it("an amount that is not a number is refused in the person's language", () => {
    for (const text of ["abc", "-50", "1,234.567", "1e5"]) {
      const { lines } = setup();
      const before = lines();
      const debit = cell("Debet", 1);
      type(debit, text);
      expect(() => fireEvent.blur(debit)).not.toThrow();
      expect(lines()).toEqual(before);
      expect(alerts()).toEqual(["Ugyldig beløp"]);
      // The cell goes back to the line's amount.
      expect(debit.value).toBe("125,00");
      cleanup();
    }
  });

  it("an app that cancels the change keeps the lines and shows no error", () => {
    const { lines } = setup({
      onLinesChange: ((_next: VoucherLine[], details: { cancel?: () => void }) =>
        details.cancel?.()) as Props["onLinesChange"],
    });
    const before = lines();
    pick(cell<HTMLSelectElement>("Konto", 1), "2701");
    expect(lines()).toEqual(before);
    expect(cell<HTMLSelectElement>("Konto", 1).value).toBe("1500");
    expect(alerts()).toEqual([]);
  });
});

describe("a person adds and removes lines", () => {
  const add = () => document.querySelector('[data-slot="voucher-line-add"]') as HTMLButtonElement;
  const newAccount = <T extends HTMLElement>() => document.querySelector('[data-slot="voucher-new-account"]') as T;

  it("adds a line on the chosen account, with the account's default VAT code", () => {
    const { lines } = setup();
    expect(add().textContent).toBe("Legg til linje");
    expect(add().disabled).toBe(true);
    pick(newAccount<HTMLSelectElement>(), "3000");
    expect(add().disabled).toBe(false);
    fireEvent.click(add());
    expect(lines()).toHaveLength(3);
    expect(lines()[2]).toMatchObject({
      account: "3000",
      accountName: "Salgsinntekt",
      vatCode: "MVA25",
      debitMinor: 0,
      creditMinor: 0,
    });
    // The new line is editable at once, and the add row is ready for the next.
    expect(cell("Debet", 3).value).toBe("");
    expect(newAccount<HTMLSelectElement>().value).toBe("");
    expect(add().disabled).toBe(true);
  });

  it("adds a line from a typed account when there is no chart", () => {
    const { lines } = setup({ accounts: undefined });
    const input = newAccount<HTMLInputElement>();
    fireEvent.input(input, { target: { value: "1920" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(lines().map((line) => line.account)).toEqual(["1500", "3000", "1920"]);
  });

  it("removes the line whose button was pressed", () => {
    const { lines, onLinesChange } = setup();
    fireEvent.click(cell<HTMLButtonElement>("Fjern linje", 1));
    expect(lines().map((line) => line.id)).toEqual(["sales"]);
    expect(onLinesChange.mock.lastCall?.[1].reason).toBe("remove-line");
    // The remaining line is now line 1 and still edits itself.
    pick(cell<HTMLSelectElement>("Avdeling", 1), "D1");
    expect(lines()[0]).toMatchObject({ id: "sales", department: "D1" });
  });
});

describe("the editable table and the agent share one voucher", () => {
  it("shows an agent's edit in the person's controls, and keeps a person's draft out of the snapshot", async () => {
    const { agent, line } = setup();
    const result = await agent.act({
      steps: [{ ref: "Voucher lines", action: "setDebit", args: ["recv", 99_900] }],
    });
    expect(result.ok).toBe(true);
    expect(cell("Debet", 1).value).toBe("999,00");

    type(cell("Debet", 1), "5");
    expect(line("recv")?.debitMinor).toBe(99_900);
    const entry = agent.snapshot().find((c) => c.component === "voucher-composer")!;
    expect(Object.keys(entry)).not.toContain("drafts");
    expect(Object.keys(entry)).not.toContain("rowError");
  });

  it("does not offer the person's edit methods to an agent", async () => {
    const { agent, lines } = setup();
    const before = lines();
    for (const action of ["editLine", "commitDraft", "addLineByPerson", "removeLineByPerson"]) {
      const result = await agent.act({
        steps: [{ ref: "Voucher lines", action, args: ["recv", "debit", "1"] }],
      });
      expect(result.ok).toBe(false);
      expect(result.error?.message).toMatch(new RegExp(`takes no ${action} now`));
    }
    expect(lines()).toEqual(before);
  });

  it("an agent's refused action still fails the step and shows no row error", async () => {
    const { agent } = setup();
    const result = await agent.act({
      steps: [{ ref: "Voucher lines", action: "setVatCode", args: ["sales", "MVA15"] }],
    });
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/cannot be posted with VAT code MVA15/);
    expect(alerts()).toEqual([]);
  });
});

describe("editable strings come from the locale profile", () => {
  it("is in English for the US profile", () => {
    setup({ defaultLines: [seed[0]!], accounts: undefined }, "US");
    expect(document.querySelector('[data-slot="voucher-line-add"]')?.textContent).toBe("Add line");
    expect(document.querySelector('[aria-label="Debit, Line 1"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Remove line, Line 1"]')?.textContent).toBe("Remove line");
    const debit = document.querySelector('[aria-label="Debit, Line 1"]') as HTMLInputElement;
    expect(debit.value).toBe("125.00");
    type(debit, "x");
    fireEvent.blur(debit);
    expect(alerts()).toEqual(["Invalid amount"]);
  });
});
