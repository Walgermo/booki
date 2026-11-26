import type { ChartAccount, ProposedChange } from "@booki-aui/core/chart-of-accounts";
import { mount } from "@ui-sdk/core/testing";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { BookiAccessProvider } from "./access.js";
import {
  BOOKI_HISTORY_KEYS,
  attachAudit,
  createBookiAgent,
  createBookiHistory,
  proposeChanges,
  type AttachAuditPush,
} from "./booki-agent.js";
import { ChartOfAccounts, chartOfAccounts } from "./chart-of-accounts.js";
import { BookiLocaleProvider } from "./locale.js";

afterEach(() => cleanup());

type Result = { ok: boolean; value?: unknown; error?: { message: string } };
type Entry = Record<string, any>;

const acc = (number: string, name: string, type: ChartAccount["type"], more: Partial<ChartAccount> = {}) =>
  ({ number, name, type, active: true, standardAccount: number, ...more }) as ChartAccount;

const NO: ChartAccount[] = [
  acc("1500", "Kundefordringer", "asset", { locked: true }),
  acc("1920", "Bankinnskudd", "asset", { locked: true }),
  acc("2400", "Leverandørgjeld", "liability", { locked: true }),
  acc("2700", "Utgående merverdiavgift", "liability"),
  acc("3000", "Salgsinntekt, avgiftspliktig", "income", { vatCode: "3" }),
  acc("4300", "Innkjøp av varer", "expense", { vatCode: "1" }),
  acc("5000", "Lønn til ansatte", "expense"),
  acc("6800", "Kontorrekvisita", "expense", { vatCode: "1", standardAccount: undefined }),
  acc("7140", "Reisekostnad", "expense", { active: false }),
  acc("8050", "Annen renteinntekt", "income"),
];

function setup(ui: ReactElement, country: "NO" | "US" = "NO") {
  const rows: Parameters<AttachAuditPush>[0][] = [];
  const agent = createBookiAgent({ agentId: "bookkeeper" });
  attachAudit(agent, (row) => rows.push(row), "bookkeeper");
  const view = render(<BookiLocaleProvider defaultCountry={country}>{ui}</BookiLocaleProvider>);
  const entry = () => agent.snapshot().find((c) => c.component === "chart-of-accounts") as unknown as Entry;
  const act = (action: string, args: unknown[] = []) =>
    agent.act({ steps: [{ ref: entry().ref, action, args }] }) as Promise<Result>;
  const field = <T extends HTMLElement = HTMLInputElement>(label: string) =>
    document.querySelector(`[aria-label="${label}"]`) as T;
  const button = (name: string) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent === name || b.getAttribute("aria-label") === name,
    )!;
  const alert = () => document.querySelector('[role="alert"]')?.textContent ?? "";
  return { agent, rows, view, entry, act, field, button, alert };
}

/** An app that owns the accounts, as a real one does. */
function Owned({ initial = NO, onChange }: { initial?: ChartAccount[]; onChange?: (a: ChartAccount[]) => void }) {
  const [accounts, setAccounts] = useState(initial);
  return (
    <ChartOfAccounts
      accounts={accounts}
      onAccountsChange={(next) => {
        setAccounts(next);
        onChange?.(next);
      }}
      taxCodes={[
        { code: "1", label: "Inngående 25 %" },
        { code: "3", label: "Utgående 25 %" },
        { code: "0", label: "Ingen" },
      ]}
    />
  );
}

describe("ChartOfAccounts for an agent", () => {
  it("snapshots classes, rows, issues and the format hints, with the actions it offers", () => {
    const { entry } = setup(<ChartOfAccounts defaultAccounts={NO} />);
    const e = entry();
    expect(e.label).toBe("Kontoplan");
    expect(e.actions).toEqual([
      "find",
      "filterClass",
      "propose",
      "setProposal",
      "setVatCode",
      "mapStandard",
      "setSort",
      "clearSort",
      "setSearch",
      "setFilter",
      "clearFilters",
      "setPage",
      "setPageSize",
    ]);
    expect(e.scheme).toMatchObject({ id: "ns4102", requiresStandard: true });
    expect(e.classes.map((cls: Entry) => [cls.id, cls.range, cls.count])).toEqual([
      ["1", "1000–1999", 2],
      ["2", "2000–2999", 2],
      ["3", "3000–3999", 1],
      ["4", "4000–4999", 1],
      ["5", "5000–5999", 1],
      ["6", "6000–6999", 1],
      ["7", "7000–7999", 1],
      ["8", "8000–8999", 1],
    ]);
    expect(e.rows.map((row: Entry) => row.number)).toEqual(NO.map((a) => a.number));
    expect(e.rows[0]).toMatchObject({ number: "1500", class: "1", locked: true });
    expect(e.issues).toEqual([expect.objectContaining({ number: "6800", code: "missing-standard", level: "warning" })]);
    expect(e.proposeFormat).toContain("propose(");
    expect(e.queryFormat).toContain("setSort");
  });

  it("finds by number or name and filters by class", async () => {
    const { act, entry } = setup(<ChartOfAccounts defaultAccounts={NO} />);
    const found = await act("find", ["bank"]);
    expect(found.ok).toBe(true);
    expect(entry().rows.map((row: Entry) => row.number)).toEqual(["1920"]);
    await act("find", [""]);
    await act("filterClass", ["2"]);
    expect(entry().rows.map((row: Entry) => row.number)).toEqual(["2400", "2700"]);
    const refused = await act("filterClass", ["9"]);
    expect(refused.ok).toBe(false);
    expect(refused.error?.message).toContain('No account class "9". Classes: 1 (1000–1999)');
    await act("filterClass", [""]);
    await act("setFilter", ["status", "inactive"]);
    expect(entry().rows.map((row: Entry) => row.number)).toEqual(["7140"]);
  });

  it("sets a VAT code and maps a standard account, each one audited as the agent's", async () => {
    const changes: ChartAccount[][] = [];
    const { act, entry, rows } = setup(<Owned onChange={(next) => changes.push(next)} />);
    expect((await act("setVatCode", ["5000", "0"])).ok).toBe(true);
    expect((await act("mapStandard", ["6800", "6800"])).ok).toBe(true);
    expect(changes.at(-1)!.find((a) => a.number === "6800")?.standardAccount).toBe("6800");
    expect(entry().issues).toEqual([]);
    expect(rows.map((row) => [row.actor, row.action, row.detail])).toEqual([
      ["agent:bookkeeper", "chart-of-accounts.accounts", expect.stringContaining("5000: vatCode=0")],
      ["agent:bookkeeper", "chart-of-accounts.accounts", expect.stringContaining("6800: standardAccount=6800")],
    ]);
    const unknown = await act("setVatCode", ["5000", "25"]);
    expect(unknown.error?.message).toBe('No VAT code "25". VAT codes: 1, 3, 0.');
    const bad = await act("mapStandard", ["9999", "6800"]);
    expect(bad.error?.message).toContain('No account "9999" in the chart. Accounts: 1500, 1920');
  });

  it("proposes accounts that wait on screen until a person commits them", async () => {
    const { act, entry, rows, button } = setup(<Owned />);
    const result = await act("propose", [
      [
        { number: "6810", name: "Programvare", type: "expense", standardAccount: "6810" },
        { number: "1500", name: "Kundefordringer, innland" },
      ],
    ]);
    expect(result.ok).toBe(true);
    expect(entry().proposal).toEqual([
      { kind: "add", number: "6810", name: "Programvare", type: "expense", standardAccount: "6810" },
      { kind: "edit", number: "1500", name: "Kundefordringer, innland" },
    ]);
    // Nothing in the chart changed yet.
    expect(entry().rows.some((row: Entry) => row.number === "6810")).toBe(false);
    expect(rows.at(-1)).toMatchObject({ actor: "agent:bookkeeper", action: "chart-of-accounts.proposal" });
    expect(rows.at(-1)!.detail).toContain("+6810");
    expect(document.querySelector('[data-slot="chart-of-accounts-proposal"]')?.textContent).toContain("Programvare");

    fireEvent.click(button("Ta i bruk endringen"));
    expect(entry().proposal).toBeNull();
    expect(entry().rows.find((row: Entry) => row.number === "6810")).toMatchObject({
      name: "Programvare",
      active: true,
    });
    expect(entry().rows.find((row: Entry) => row.number === "1500")?.name).toBe("Kundefordringer, innland");
  });

  it("refuses a proposal that changes a locked account's type or number, or adds one without a type", async () => {
    const { act, entry } = setup(<ChartOfAccounts defaultAccounts={NO} />);
    expect((await act("propose", [{ number: "1920", type: "liability" }])).error?.message).toContain(
      "Account 1920 has postings, so its type is fixed.",
    );
    expect((await act("propose", [{ number: "1920", newNumber: "1921" }])).error?.message).toContain(
      "so its number is fixed",
    );
    expect((await act("propose", [{ number: "6810", name: "Programvare" }])).error?.message).toContain(
      "A new account 6810 needs a name and a type.",
    );
    expect((await act("propose", [{ number: "6810", nme: "x" }])).error?.message).toContain(
      'propose: no field "nme". Fields: number, newNumber, name, type, class, vatCode, standardAccount.',
    );
    expect(entry().proposal).toBeNull();
  });

  it("holds back a commit while the proposal has errors, and shows them", async () => {
    const { act, entry, button } = setup(<ChartOfAccounts defaultAccounts={NO} />);
    await act("propose", [{ number: "3900", name: "Annen driftsinntekt", type: "expense", standardAccount: "3900" }]);
    expect(entry().proposalBlocked).toBe(true);
    expect(entry().proposalIssues[0].message).toBe(
      'Account 3900 is "expense", but class 3 (3000–3999) holds "income".',
    );
    expect(button("Ta i bruk endringen").disabled).toBe(true);
    expect(document.querySelector('[data-slot="chart-of-accounts-proposal-issues"]')?.textContent).toBe(
      'Konto 3900 er "expense", men klasse 3 (3000–3999) har "income".',
    );
  });

  it("refuses an agent's press on commit and on activate, as a person's decision", async () => {
    const rows: { action: string; detail?: string }[] = [];
    const agent = createBookiAgent({ agentId: "bookkeeper", audit: (row) => rows.push(row) });
    render(
      <BookiLocaleProvider defaultCountry="US">
        <ChartOfAccounts
          defaultAccounts={[acc("6000", "Rent", "expense"), acc("6100", "Utilities", "expense")]}
          defaultProposal={[{ kind: "add", number: "6200", name: "Software", type: "expense" }]}
        />
      </BookiLocaleProvider>,
    );
    const ref = agent.snapshot().find((c) => c.component === "chart-of-accounts")!.ref;
    const commit = document.querySelector(
      '[data-person-only="Committing a change to the chart of accounts needs a person"]',
    )!;
    const pressed = (await agent.act({ steps: [{ ref, action: "press", args: [commit.textContent] }] })) as Result;
    expect(pressed.ok).toBe(false);
    expect(pressed.error?.message).toMatch(/person's decision.*Committing a change to the chart of accounts/);
    const deactivate = (await agent.act({
      steps: [{ ref, action: "press", args: ["Deactivate 6000 Rent"] }],
    })) as Result;
    expect(deactivate.ok).toBe(false);
    expect(deactivate.error?.message).toMatch(/Activating or deactivating an account needs a person/);
    const after = agent.snapshot().find((c) => c.component === "chart-of-accounts") as unknown as Entry;
    expect(after.rows[0].active).toBe(true);
    expect(rows.map((row) => row.action)).toEqual(["agent.person-only", "agent.person-only"]);
  });

  it("stages a proposal with proposeChanges and reverts it, and undoes it through history", async () => {
    const { agent, entry } = setup(<ChartOfAccounts defaultAccounts={NO} />);
    const staged = await proposeChanges(agent, [
      { ref: entry().ref, key: "proposal", value: [{ number: "6810", name: "Programvare", type: "expense" }] },
    ]);
    expect(staged.applied).toHaveLength(1);
    expect(entry().proposal).toEqual([{ kind: "add", number: "6810", name: "Programvare", type: "expense" }]);
    expect(await staged.revert()).toEqual([]);
    expect(entry().proposal).toBeNull();

    const history = createBookiHistory(agent, { keys: [...BOOKI_HISTORY_KEYS, "proposal"] });
    await agent.act({
      steps: [
        { ref: entry().ref, action: "propose", args: [{ number: "6810", name: "Programvare", type: "expense" }] },
      ],
    });
    expect(entry().proposal).toHaveLength(1);
    expect(await history.undoSource("agent")).toEqual([]);
    expect(entry().proposal).toBeNull();
  });
});

describe("ChartOfAccounts for a person", () => {
  it("groups accounts under class headings that fold away", () => {
    setup(<ChartOfAccounts defaultAccounts={NO} />);
    const headings = [...document.querySelectorAll('[data-slot="chart-of-accounts-heading"]')];
    expect(headings.map((h) => h.querySelector('[data-slot="chart-of-accounts-class-name"]')?.textContent)).toEqual([
      "Eiendeler",
      "Egenkapital og gjeld",
      "Salgs- og driftsinntekt",
      "Varekostnad",
      "Lønnskostnad",
      "Annen driftskostnad, avskrivning",
      "Annen driftskostnad",
      "Finansposter og skatt",
    ]);
    expect(document.querySelectorAll('[data-slot="chart-of-accounts-row"]')).toHaveLength(10);
    fireEvent.click(headings[0]!);
    expect(headings[0]!.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelectorAll('[data-slot="chart-of-accounts-row"]')).toHaveLength(8);
  });

  it("edits a name, a VAT code and a standard account inline, and shows a refusal", () => {
    const changes: ChartAccount[][] = [];
    const { field, alert } = setup(<Owned onChange={(next) => changes.push(next)} />);
    const name = field("Navn, konto 6800");
    fireEvent.change(name, { target: { value: "Kontorrekvisita og papir" } });
    fireEvent.blur(name);
    expect(changes.at(-1)!.find((a) => a.number === "6800")?.name).toBe("Kontorrekvisita og papir");

    fireEvent.change(field<HTMLSelectElement>("Mva-kode, konto 5000"), { target: { value: "0" } });
    expect(changes.at(-1)!.find((a) => a.number === "5000")?.vatCode).toBe("0");

    const standard = field("SAF-T, konto 6800");
    fireEvent.change(standard, { target: { value: "68" } });
    fireEvent.keyDown(standard, { key: "Enter" });
    expect(changes.at(-1)!.find((a) => a.number === "6800")?.standardAccount).toBe("68");

    fireEvent.change(standard, { target: { value: "680" } });
    fireEvent.blur(standard);
    expect(alert()).toBe('Standardkonto "680" er ikke en SAF-T-standardkonto: 2 eller 4 siffer, som "1500".');
  });

  it("deactivates an account with its own button, unless the role does not allow it", () => {
    const changes: ChartAccount[][] = [];
    const { button } = setup(<Owned onChange={(next) => changes.push(next)} />);
    fireEvent.click(button("Deaktiver 5000 Lønn til ansatte"));
    expect(changes.at(-1)!.find((a) => a.number === "5000")?.active).toBe(false);
    cleanup();

    render(
      <BookiLocaleProvider defaultCountry="NO">
        <BookiAccessProvider
          actor={{ id: "eva", roles: ["viewer"] }}
          roles={[{ id: "viewer", name: "Viewer", permissions: [] }]}
        >
          <ChartOfAccounts defaultAccounts={NO} />
        </BookiAccessProvider>
      </BookiLocaleProvider>,
    );
    fireEvent.click(
      [...document.querySelectorAll("button")].find(
        (b) => b.getAttribute("aria-label") === "Deaktiver 5000 Lønn til ansatte",
      )!,
    );
    expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/chart\.maintain|kontoplan|tillat/i);
  });

  it("searches and filters by status from the toolbar", () => {
    const { field } = setup(<ChartOfAccounts defaultAccounts={NO} />);
    fireEvent.change(field("Søk"), { target: { value: "lønn" } });
    expect(document.querySelectorAll('[data-slot="chart-of-accounts-row"]')).toHaveLength(1);
    fireEvent.change(field("Søk"), { target: { value: "" } });
    fireEvent.change(field<HTMLSelectElement>("Status"), { target: { value: "inactive" } });
    const rows = [...document.querySelectorAll('[data-slot="chart-of-accounts-row"]')];
    expect(rows.map((row) => row.querySelector("th")?.textContent)).toEqual(["7140"]);
  });

  it("uses the US ranges under the US profile", () => {
    const { entry } = setup(
      <ChartOfAccounts
        defaultAccounts={[
          acc("1000", "Cash", "asset"),
          acc("4000", "Sales", "income"),
          acc("8100", "Interest income", "income"),
        ]}
      />,
      "US",
    );
    expect(entry().classes.map((cls: Entry) => cls.id)).toEqual([
      "assets",
      "liabilities",
      "equity",
      "revenue",
      "expenses",
      "other",
    ]);
    expect(entry().issues).toEqual([]);
    expect(document.querySelector('[aria-label="Chart of accounts"]')).not.toBeNull();
  });

  it("says what it is when the chart is empty", () => {
    setup(<ChartOfAccounts defaultAccounts={[]} empty={<button type="button">Importer kontoplan</button>} />);
    expect(document.querySelector('[data-slot="chart-of-accounts-empty"]')?.textContent).toContain(
      "Ingen kontoer ennå",
    );
  });
});

describe("chartOfAccounts (ui-sdk mount)", () => {
  const html = `<root>
    <heading value="1">1</heading>
    <cell value="6800#name"></cell>
    <active value="6800#active">Active</active>
    <commit>Commit</commit>
    <discard>Discard</discard>
  </root>`;

  it("reports a person's click as the source of each change", async () => {
    const view = mount(
      chartOfAccounts,
      {
        country: "NO",
        defaultAccounts: NO,
        defaultProposal: [
          { kind: "add", number: "6810", name: "Programvare", type: "expense", standardAccount: "6810" },
        ] as ProposedChange[],
      },
      html,
    );
    try {
      await view.click(view.part("active", "6800#active")!);
      expect(view.state.accounts.find((a) => a.number === "6800")?.active).toBe(false);
      expect(view.changes.at(-1)).toMatchObject({ key: "accounts", reason: "deactivate-account", source: "mouse" });
      await view.click(view.part("commit")!);
      expect(view.state.accounts.some((a) => a.number === "6810")).toBe(true);
      expect(view.changes.map((c) => c.reason).slice(-2)).toEqual(["commit-plan", "commit-plan"]);
      expect(view.changes.at(-1)).toMatchObject({ key: "proposal", source: "mouse" });
    } finally {
      view.unmount();
    }
  });

  it("lets an agent propose through the api, as the bridge would", () => {
    const view = mount(chartOfAccounts, { country: "NO", defaultAccounts: NO }, html);
    try {
      const out = view.api.propose({ number: "6810", name: "Programvare", type: "expense" });
      expect(out).toEqual({
        proposed: 1,
        issues: ["Account 6810 has no SAF-T standard account. mapStandard(number, standardAccount) maps it."],
      });
      expect(view.changes.at(-1)).toMatchObject({ key: "proposal", reason: "propose" });
      expect(() => view.api.mapStandard("6800", "680")).toThrow("2 or 4 digits");
    } finally {
      view.unmount();
    }
  });
});
