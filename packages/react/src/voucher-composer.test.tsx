import type { VoucherLine } from "@booki/core/voucher";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createBookiAgent } from "./booki-agent.js";
import { BookiLocaleProvider } from "./locale.js";
import { VoucherComposer } from "./voucher-composer.js";

afterEach(() => {
  cleanup();
});

const seed: VoucherLine[] = [
  {
    id: "recv",
    account: "1500",
    accountName: "AR",
    debitMinor: 12_500,
    creditMinor: 0,
  },
];

const chart = [
  { number: "1500", name: "Kundefordringer" },
  { number: "2701", name: "Utgående MVA" },
  { number: "3000", name: "Salgsinntekt" },
];

function linesOf(agent: ReturnType<typeof createBookiAgent>) {
  const entry = agent.snapshot().find((c) => c.component === "voucher-composer") as
    | { lines?: VoucherLine[] }
    | undefined;
  return entry?.lines;
}

function mounted() {
  return document.querySelector('[data-slot="voucher-composer"]') !== null;
}

function renderComposer(props: Partial<React.ComponentProps<typeof VoucherComposer>> = {}) {
  return render(
    <BookiLocaleProvider defaultCountry="NO">
      <VoucherComposer defaultLines={seed} aria-label="Voucher lines" {...props} />
    </BookiLocaleProvider>,
  );
}

describe("VoucherComposer rejects invalid agent input", () => {
  const rejected: Array<[string, unknown[], RegExp]> = [
    ["fractional debit", ["1500", "AR", 10.5, 0], /debitMinor.*non-negative integer.*10\.5/],
    ["negative debit", ["3000", "Sales", -100, 0], /debitMinor.*-100/],
    ["negative credit", ["3000", "Sales", 0, -1], /creditMinor.*-1/],
    ["both sides", ["3000", "Sales", 100, 50], /debit or a credit, not both/],
    ["negative and both sides", ["3000", "Sales", -100, 50], /debitMinor.*-100/],
    ["non-numeric debit", ["3000", "Sales", "abc", 0], /debitMinor.*"abc"/],
    ["null credit", ["3000", "Sales", 0, null], /creditMinor.*null/],
    ["unsafe integer", ["3000", "Sales", 2 ** 60, 0], /debitMinor/],
    ["missing account", ["", "Sales", 100, 0], /account/],
  ];

  for (const [name, args, message] of rejected) {
    it(`addLine: ${name}`, async () => {
      const agent = createBookiAgent({ agentId: "test" });
      renderComposer();
      const before = linesOf(agent);
      const result = await agent.act({
        steps: [{ ref: "Voucher lines", action: "addLine", args }],
      });
      expect(result.ok).toBe(false);
      expect(result.error?.message).toMatch(message);
      expect(mounted()).toBe(true);
      expect(linesOf(agent)).toEqual(before);
    });
  }

  it("setDebit / setCredit reject bad amounts and unknown lines", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    renderComposer();
    const before = linesOf(agent);
    for (const step of [
      { action: "setDebit", args: ["recv", 1.5], message: /debitMinor/ },
      { action: "setDebit", args: ["recv", "12,50"], message: /debitMinor/ },
      { action: "setCredit", args: ["recv", -5], message: /creditMinor/ },
      { action: "setCredit", args: ["nope", 5], message: /No voucher line "nope".*recv/ },
    ]) {
      const result = await agent.act({
        steps: [{ ref: "Voucher lines", action: step.action, args: step.args }],
      });
      expect(result.ok, step.action).toBe(false);
      expect(result.error?.message).toMatch(step.message);
    }
    expect(mounted()).toBe(true);
    expect(linesOf(agent)).toEqual(before);
  });

  it("still accepts valid input", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    renderComposer();
    const result = await agent.act({
      steps: [
        { ref: "Voucher lines", action: "addLine", args: ["3000", "Sales", 0, 12_500] },
        { ref: "Voucher lines", action: "assertBalance", args: [] },
      ],
    });
    expect(result.ok).toBe(true);
    const lines = linesOf(agent) ?? [];
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatchObject({
      account: "3000",
      accountName: "Sales",
      debitMinor: 0,
      creditMinor: 12_500,
    });
  });
});

describe("VoucherComposer setLines", () => {
  it("replaces lines after validating each one", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    renderComposer();
    const next = [
      { id: "a", account: "1500", accountName: "AR", debitMinor: 100, creditMinor: 0 },
      { id: "b", account: "3000", accountName: "Sales", debitMinor: 0, creditMinor: 100 },
    ];
    const ok = await agent.act({
      steps: [{ ref: "Voucher lines", action: "setLines", args: [next] }],
    });
    expect(ok.ok).toBe(true);
    expect(linesOf(agent)).toEqual(next);

    for (const [bad, message] of [
      ["nope", /list of voucher lines/],
      [[{ ...next[0], debitMinor: 1.5 }], /debitMinor/],
      [[{ ...next[0], creditMinor: 5 }], /not both/],
      [[next[0], next[0]], /appears twice/],
      [[{ account: "1500", debitMinor: 1, creditMinor: 0 }], /string id/],
    ] as const) {
      const result = await agent.act({
        steps: [{ ref: "Voucher lines", action: "setLines", args: [bad] }],
      });
      expect(result.ok).toBe(false);
      expect(result.error?.message).toMatch(message);
    }
    expect(linesOf(agent)).toEqual(next);
    expect(mounted()).toBe(true);
  });

  it("enforces the closed chart", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    renderComposer({ accounts: chart });
    const result = await agent.act({
      steps: [
        {
          ref: "Voucher lines",
          action: "setLines",
          args: [[{ id: "x", account: "9999", accountName: "?", debitMinor: 1, creditMinor: 0 }]],
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/not in the chart/);
  });
});

describe("VoucherComposer closed chart", () => {
  it("rejects accounts outside the chart with valid suggestions", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    renderComposer({ accounts: chart });
    const before = linesOf(agent);
    const add = await agent.act({
      steps: [{ ref: "Voucher lines", action: "addLine", args: ["9999", "Made up", 0, 100] }],
    });
    expect(add.ok).toBe(false);
    expect(add.error?.message).toMatch(/"9999" is not in the chart of accounts.*1500 Kundefordringer/);
    const set = await agent.act({
      steps: [{ ref: "Voucher lines", action: "setAccount", args: ["recv", "4000"] }],
    });
    expect(set.ok).toBe(false);
    expect(set.error?.message).toMatch(/"4000" is not in the chart/);
    expect(linesOf(agent)).toEqual(before);
  });

  it("takes the account name from the chart", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    renderComposer({ accounts: chart });
    const result = await agent.act({
      steps: [
        { ref: "Voucher lines", action: "addLine", args: ["3000", "Wrong name", 0, 10_000] },
        { ref: "Voucher lines", action: "addLine", args: ["2701", undefined, 0, 2_500] },
        { ref: "Voucher lines", action: "setAccount", args: ["recv", "1500", "Typo"] },
      ],
    });
    expect(result.ok).toBe(true);
    const lines = linesOf(agent) ?? [];
    expect(lines.map((line) => [line.account, line.accountName])).toEqual([
      ["1500", "Kundefordringer"],
      ["3000", "Salgsinntekt"],
      ["2701", "Utgående MVA"],
    ]);
  });

  it("stays open without a chart", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    renderComposer();
    const result = await agent.act({
      steps: [{ ref: "Voucher lines", action: "addLine", args: ["9999", "Suspense", 0, 100] }],
    });
    expect(result.ok).toBe(true);
    expect(linesOf(agent)?.[1]).toMatchObject({ account: "9999", accountName: "Suspense" });
  });
});

describe("VoucherComposer VAT codes, dimensions and account rules", () => {
  const rules = {
    accounts: [
      { number: "1500", name: "Kundefordringer" },
      { number: "2701", name: "Utgående MVA" },
      {
        number: "3000",
        name: "Salgsinntekt",
        vatCodes: ["MVA25", "MVA15"],
        defaultVatCode: "MVA25",
        requiresDepartment: true,
      },
    ],
    departments: [
      { code: "10", name: "Oslo" },
      { code: "20", name: "Bergen" },
    ],
    projects: [{ code: "P1", name: "Utrulling" }],
  };
  const act = (agent: ReturnType<typeof createBookiAgent>, action: string, args: unknown[]) =>
    agent.act({ steps: [{ ref: "Voucher lines", action, args }] }) as Promise<{
      ok: boolean;
      error?: { message: string };
    }>;
  const entry = (agent: ReturnType<typeof createBookiAgent>) =>
    agent.snapshot().find((c) => c.component === "voucher-composer") as unknown as {
      lines: VoucherLine[];
      postable: boolean;
    };

  it("gives a line its account's default VAT code and reports what blocks posting", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    renderComposer(rules);
    expect((await act(agent, "addLine", ["3000", undefined, 0, 12_500])).ok).toBe(true);
    const state = entry(agent);
    expect(state.lines[1]).toMatchObject({ account: "3000", vatCode: "MVA25" });
    expect(state.postable).toBe(false);
    expect("issues" in state).toBe(false);
    const refused = await act(agent, "assertPostable", []);
    expect(refused.ok).toBe(false);
    expect(refused.error?.message).toMatch(/not postable.*needs a department/);
    // People see the same reason under the table, in their language (NO here).
    expect(document.querySelector('[data-slot="voucher-composer-issues"]')?.textContent).toMatch(/må ha/);
  });

  it("becomes postable once the required department is set", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    renderComposer(rules);
    await act(agent, "addLine", ["3000", undefined, 0, 12_500, { department: "10", vatCode: "MVA15" }]);
    const state = entry(agent);
    expect(state.lines[1]).toMatchObject({ vatCode: "MVA15", department: "10" });
    expect(state.postable).toBe(true);
    expect((await act(agent, "assertPostable", [])).ok).toBe(true);
  });

  it("refuses VAT codes and dimensions outside the rules, leaving lines unchanged", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    renderComposer(rules);
    await act(agent, "addLine", ["3000", undefined, 0, 12_500]);
    const before = entry(agent).lines;
    const id = before[1]!.id;
    const cases: Array<[string, unknown[], RegExp]> = [
      ["setVatCode", [id, "MVA99"], /No VAT code "MVA99"/],
      ["setVatCode", [id, "MVA0"], /Account 3000 cannot be posted with VAT code MVA0.*MVA25, MVA15/],
      ["setDepartment", [id, "99"], /No department "99".*10 Oslo, 20 Bergen/],
      ["setProject", [id, "P9"], /No project "P9".*P1 Utrulling/],
      ["addLine", ["3000", undefined, 0, 1, { vatCode: "MVA0" }], /cannot be posted with VAT code MVA0/],
      ["addLine", ["3000", undefined, 0, 1, "MVA25"], /fifth addLine argument is an object/],
    ];
    for (const [action, args, message] of cases) {
      const result = await act(agent, action, args);
      expect(result.ok, `${action} ${JSON.stringify(args)}`).toBe(false);
      expect(result.error?.message).toMatch(message);
      expect(entry(agent).lines).toEqual(before);
      expect(mounted()).toBe(true);
    }
  });

  it("sets and clears VAT code, department and project", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    renderComposer(rules);
    await act(agent, "addLine", ["3000", undefined, 0, 12_500]);
    const id = entry(agent).lines[1]!.id;
    expect((await act(agent, "setVatCode", [id, "MVA15"])).ok).toBe(true);
    expect((await act(agent, "setDepartment", [id, "20"])).ok).toBe(true);
    expect((await act(agent, "setProject", [id, "P1"])).ok).toBe(true);
    expect(entry(agent).lines[1]).toMatchObject({ vatCode: "MVA15", department: "20", project: "P1" });
    expect((await act(agent, "setProject", [id, ""])).ok).toBe(true);
    expect("project" in entry(agent).lines[1]!).toBe(false);
  });

  it("moving a line to another account drops a VAT code that account does not allow", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    renderComposer(rules);
    await act(agent, "setVatCode", ["recv", "MVA0"]);
    expect(entry(agent).lines[0]!.vatCode).toBe("MVA0");
    await act(agent, "setAccount", ["recv", "3000"]);
    expect(entry(agent).lines[0]).toMatchObject({ account: "3000", vatCode: "MVA25" });
  });

  it("shows VAT and dimension columns only when a line uses them", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    renderComposer(rules);
    const headers = () => [...document.querySelectorAll("th")].map((th) => th.textContent);
    expect(headers()).toEqual(["Konto", "Navn", "Debet", "Kredit"]);
    await act(agent, "addLine", ["3000", undefined, 0, 12_500, { department: "10" }]);
    expect(headers()).toEqual(["Konto", "Navn", "MVA", "Dimensjoner", "Debet", "Kredit"]);
  });
});
