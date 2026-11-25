import type { PopulationItem, TickMark, Workpaper } from "@booki-aui/core/audit";
import type { DepreciationRun, Disposal, FixedAsset } from "@booki-aui/core/fixed-assets";
import { mount } from "@ui-sdk/core/testing";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createBookiAgent } from "./booki-agent.js";
import { AuditWorkpaper, auditWorkpaper } from "./audit-workpaper.js";
import { FixedAssetRegister, fixedAssetRegister } from "./fixed-asset-register.js";
import { BookiLocaleProvider } from "./locale.js";

afterEach(() => cleanup());

type Result = { ok: boolean; error?: { message: string } };

function setup(component: string, ref: string, ui: ReactElement, country: "US" | "NO" = "US") {
  const agent = createBookiAgent({ agentId: "test" });
  const view = render(<BookiLocaleProvider defaultCountry={country}>{ui}</BookiLocaleProvider>);
  const entry = () => agent.snapshot().find((c) => c.component === component) as unknown as Record<string, any>;
  const act = (action: string, args: unknown[] = []) =>
    agent.act({ steps: [{ ref, action, args }] }) as Promise<Result>;
  const button = (name: string) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent === name || b.getAttribute("aria-label") === name,
    )!;
  const field = <T extends HTMLElement = HTMLInputElement>(label: string) =>
    document.querySelector(`[aria-label="${label}"]`) as T;
  const alert = () => document.querySelector('[role="alert"]')?.textContent ?? "";
  const rerender = (next: ReactElement) =>
    view.rerender(<BookiLocaleProvider defaultCountry={country}>{next}</BookiLocaleProvider>);
  return { entry, act, button, field, alert, rerender };
}

describe("AuditWorkpaper", () => {
  const population: PopulationItem[] = [
    { id: "inv-1", amountMinor: 1_000_00, description: "Acme" },
    { id: "inv-2", amountMinor: 2_500_00 },
    { id: "inv-3", amountMinor: 4_000_00 },
    { id: "inv-4", amountMinor: 2_500_00 },
  ];
  const legend: TickMark[] = [
    { symbol: "✓", meaning: "Agreed to invoice" },
    { symbol: "B", meaning: "Agreed to bank" },
  ];
  const figures = { benchmarkMinor: 400_000_00, overallBp: 100, performanceBp: 5000, trivialBp: 500 };
  const ui = (actor = "kari", extra: { defaultWorkpaper?: Workpaper } = {}) => (
    <AuditWorkpaper population={population} materiality={figures} tickMarks={legend} actor={actor} {...extra} />
  );
  const drawn = async (actor = "kari") => {
    const view = setup("audit-workpaper", "Audit workpaper", ui(actor));
    await view.act("drawSample", ["all-above", { seed: "wp-7" }]);
    return view;
  };

  it("shows materiality and lets an agent draw a reproducible sample", async () => {
    const { entry, act } = setup("audit-workpaper", "Audit workpaper", ui());
    expect(entry().actions).toEqual([
      "drawSample",
      "setResult",
      "setTickMark",
      "setEvidence",
      "setNote",
      "assertReadyForSignOff",
    ]);
    expect(entry()).toMatchObject({
      materiality: { overallMinor: 4_000_00, performanceMinor: 2_000_00, trivialMinor: 200_00 },
      population: { count: 4, totalMinor: 10_000_00 },
      tickMarks: legend,
      readyForSignOff: false,
    });
    expect(document.querySelector('[data-slot="audit-workpaper-materiality"]')?.textContent).toContain("$4,000.00");
    expect((await act("drawSample", ["random", { size: 2 }])).error?.message).toMatch(/needs a `seed`/);
    expect((await act("drawSample", ["random", { size: 2, seed: "wp-7" }])).ok).toBe(true);
    const first = entry().workpaper.sample;
    expect(first).toMatchObject({
      method: "random",
      seed: "wp-7",
      size: 2,
      populationCount: 4,
      populationTotalMinor: 10_000_00,
    });
    // The same seed draws the same sample again.
    expect((await act("drawSample", ["random", { size: 2, seed: "wp-7" }])).ok).toBe(true);
    expect(entry().workpaper.sample).toEqual(first);
    // Performance materiality is the default threshold.
    expect((await act("drawSample", ["all-above", { seed: "wp-7" }])).ok).toBe(true);
    expect(entry().workpaper.sample).toMatchObject({ method: "all-above", tolerableMinor: 2_000_00 });
    expect(entry().workpaper.items.map((item: any) => item.id)).toEqual(["inv-2", "inv-3", "inv-4"]);
    expect(document.querySelector('[data-slot="audit-workpaper-sample"]')?.textContent).toMatch(
      /Seed wp-7 · 3 of 4 items/,
    );
  });

  it("marks an agent's results and keeps the conclusion and sign-offs for a person", async () => {
    const { entry, act, button, field, alert } = await drawn();
    expect((await act("setResult", ["inv-2", "ok"])).ok).toBe(true);
    expect((await act("setResult", ["inv-3", "exception", 150_00])).ok).toBe(true);
    expect((await act("setTickMark", ["inv-2", "✓"])).ok).toBe(true);
    expect((await act("setTickMark", ["inv-2", "?"])).error?.message).toMatch(/not in the tick-mark legend/);
    expect((await act("setEvidence", ["inv-2", "att-17"])).ok).toBe(true);
    expect((await act("setResult", ["inv-9", "ok"])).error?.message).toMatch(/No sample item "inv-9"/);
    expect(entry().workpaper.items[0]).toMatchObject({
      result: "ok",
      tickMark: "✓",
      evidenceId: "att-17",
      by: "agent",
    });
    expect(entry().workpaper.items[1]).toMatchObject({ result: "exception", misstatementMinor: 150_00, by: "agent" });
    expect(document.querySelectorAll("tr[data-by-agent]")).toHaveLength(2);
    // Known 150.00 on 9,000.00 sampled of 10,000.00 → 166.67.
    expect(entry().summary).toMatchObject({
      tested: 2,
      exceptions: 1,
      byAgent: 2,
      projectedMisstatementMinor: 166_67,
      exceedsTolerable: false,
    });
    const notYet = await act("assertReadyForSignOff");
    expect(notYet.error?.message).toMatch(/1 item\(s\) are untested: inv-4.*"inv-3" is an exception without a note/);

    // Nothing an agent can call sets the conclusion or signs.
    for (const [action, args] of [
      ["signAsPreparer", []],
      ["signAsReviewer", []],
      ["withdraw", []],
      ["setDraft", ["|conclusion", "Fine."]],
      ["commitDraft", ["|conclusion"]],
      ["setConclusion", ["Fine."]],
      ["setResultByPerson", ["inv-4", "ok"]],
    ] as const) {
      expect((await act(action, [...args])).ok, action).toBe(false);
    }
    expect(entry().workpaper.conclusion).toBeUndefined();
    expect(entry().workpaper.preparer).toBeUndefined();
    expect(entry().workpaper.items[2].result).toBe("untested");

    // A person finishes: tests the last item, explains the exception, concludes, signs.
    expect((button("Sign as preparer") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(field<HTMLSelectElement>("Result: inv-4"), { target: { value: "ok" } });
    expect(entry().workpaper.items[2]).toMatchObject({ result: "ok", by: "kari" });
    const note = field("Note: inv-3");
    fireEvent.change(note, { target: { value: "Cut-off: dated 3 January." } });
    expect(entry().workpaper.items[1].note).toBeUndefined();
    fireEvent.blur(note);
    expect(entry().workpaper.items[1]).toMatchObject({ note: "Cut-off: dated 3 January.", by: "kari" });
    expect(document.querySelectorAll("tr[data-by-agent]")).toHaveLength(1);
    const conclusion = field<HTMLTextAreaElement>("Conclusion");
    fireEvent.change(conclusion, { target: { value: "Receivables are fairly stated." } });
    fireEvent.blur(conclusion);
    expect(entry().workpaper.conclusion).toBe("Receivables are fairly stated.");
    expect((await act("assertReadyForSignOff")).ok).toBe(true);
    fireEvent.click(button("Sign as preparer"));
    expect(alert()).toBe("");
    expect(entry().workpaper.preparer.by).toBe("kari");

    // Signed: fixed for the agent and for the person.
    expect((await act("setResult", ["inv-2", "exception", 1])).error?.message).toMatch(
      /takes no setResult now|signed by preparer "kari"/,
    );
    expect(entry().workpaper.items[0].result).toBe("ok");
    expect((await act("drawSample", ["random", { size: 1, seed: "x" }])).ok).toBe(false);
    expect(field<HTMLSelectElement>("Result: inv-2").disabled).toBe(true);
    expect(conclusion.disabled).toBe(true);
    // The preparer cannot review their own work.
    fireEvent.click(button("Sign as reviewer"));
    expect(alert()).toMatch(/cannot also review it/);
    expect(entry().workpaper.reviewer).toBeUndefined();
    // But can withdraw, which opens the items again.
    fireEvent.click(button("Withdraw sign-off"));
    expect(entry().workpaper.preparer).toBeUndefined();
    expect(field<HTMLSelectElement>("Result: inv-2").disabled).toBe(false);
  });

  it("needs a second person to review and stops the preparer withdrawing after that", () => {
    const tested: Workpaper = {
      sample: {
        method: "all-above",
        seed: "s",
        tolerableMinor: 4_000_00,
        populationCount: 4,
        populationTotalMinor: 10_000_00,
        populationAbsMinor: 10_000_00,
        items: [population[2]!],
      },
      items: [{ ...population[2]!, result: "ok", by: "agent" }],
      preparer: { by: "kari", at: "2026-02-10T09:00:00Z" },
    };
    const reviewer = setup("audit-workpaper", "Audit workpaper", ui("ola", { defaultWorkpaper: tested }));
    fireEvent.click(reviewer.button("Withdraw sign-off"));
    expect(reviewer.alert()).toMatch(/Only "kari"/);
    fireEvent.click(reviewer.button("Sign as reviewer"));
    expect(reviewer.alert()).toBe("");
    const reviewed = reviewer.entry().workpaper as Workpaper;
    expect(reviewed.reviewer?.by).toBe("ola");
    expect(reviewer.button("Sign as reviewer")).toBeUndefined();
    cleanup();
    const preparer = setup("audit-workpaper", "Audit workpaper", ui("kari", { defaultWorkpaper: reviewed }));
    fireEvent.click(preparer.button("Withdraw sign-off"));
    expect(preparer.alert()).toMatch(/reviewed by "ola"/);
    expect(preparer.entry().workpaper.preparer.by).toBe("kari");
  });

  it("reads a typed misstatement as an exception and refuses text that is no amount", async () => {
    const { entry, field, alert } = await drawn();
    const cell = field("Misstatement: inv-2");
    fireEvent.change(cell, { target: { value: "12.50" } });
    fireEvent.blur(cell);
    expect(entry().workpaper.items[0]).toMatchObject({ result: "exception", misstatementMinor: 12_50, by: "kari" });
    fireEvent.change(cell, { target: { value: "lots" } });
    fireEvent.keyDown(cell, { key: "Enter" });
    expect(alert()).toMatch(/"lots" is not an amount/);
    expect(entry().workpaper.items[0].misstatementMinor).toBe(12_50);
    fireEvent.change(field<HTMLSelectElement>("Tick mark: inv-2"), { target: { value: "B" } });
    expect(entry().workpaper.items[0].tickMark).toBe("B");
  });

  it("lets a person draw the sample from the form, the same way an agent would", async () => {
    const { entry, button, alert } = setup("audit-workpaper", "Audit workpaper", ui());
    fireEvent.change(document.querySelector<HTMLSelectElement>('[data-slot="audit-workpaper-method"]')!, {
      target: { value: "random" },
    });
    fireEvent.change(document.querySelectorAll<HTMLInputElement>('[data-slot="audit-workpaper-sampler"]')[0]!, {
      target: { value: "x" },
    });
    fireEvent.click(button("Draw sample"));
    expect(alert()).toMatch(/whole number above zero/);
    fireEvent.change(document.querySelectorAll<HTMLInputElement>('[data-slot="audit-workpaper-sampler"]')[0]!, {
      target: { value: "2" },
    });
    const seed = document.querySelectorAll<HTMLInputElement>('[data-slot="audit-workpaper-sampler"]')[1]!;
    fireEvent.change(seed, { target: { value: "wp-7" } });
    fireEvent.click(button("Draw sample"));
    expect(entry().workpaper.sample).toMatchObject({ method: "random", seed: "wp-7" });
    expect(entry().workpaper.items).toHaveLength(2);
    // The form is gone once there is a sample.
    expect(button("Draw sample")).toBeUndefined();
  });

  it("does not let an agent redraw over a person's work", async () => {
    const { entry, act, field } = await drawn();
    fireEvent.change(field<HTMLSelectElement>("Result: inv-2"), { target: { value: "ok" } });
    const redraw = await act("drawSample", ["random", { size: 2, seed: "other" }]);
    expect(redraw.error?.message).toMatch(/A person has already tested inv-2/);
    expect(entry().workpaper.sample.method).toBe("all-above");
  });

  it("is named in Norwegian under the NO profile", () => {
    const { entry } = setup("audit-workpaper", "Arbeidspapir", ui(), "NO");
    expect(entry()).toBeDefined();
    expect(document.querySelector('[aria-label="Arbeidspapir"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Arbeidsvesentlighet");
  });

  it("reports the click as the source of a sign-off (ui-sdk mount)", async () => {
    const view = mount(
      auditWorkpaper,
      {
        actor: "kari",
        defaultWorkpaper: {
          sample: {
            method: "random",
            seed: "s",
            size: 1,
            populationCount: 1,
            populationTotalMinor: 5,
            populationAbsMinor: 5,
            items: [{ id: "a", amountMinor: 5 }],
          },
          items: [{ id: "a", amountMinor: 5, result: "ok", by: "agent" }],
        },
      },
      `<root><prepare>Sign</prepare></root>`,
    );
    try {
      await view.click(view.part("prepare")!);
      expect(view.state.workpaper.preparer?.by).toBe("kari");
      expect(view.changes.at(-1)).toMatchObject({ key: "workpaper", reason: "sign-preparer", source: "mouse" });
    } finally {
      view.unmount();
    }
  });

  it("runs without a DOM and records agent work", () => {
    const instance = auditWorkpaper({ id: "wp", population });
    try {
      instance.api.drawSample("monetary-unit", { seed: "s", size: 2 });
      const [first] = instance.get().workpaper.items;
      instance.api.setResult(first!.id, "ok");
      expect(instance.get().workpaper.items[0]).toMatchObject({ result: "ok", by: "agent" });
      expect(instance.get().workpaper.sample).toMatchObject({ intervalMinor: 5_000_00, populationAbsMinor: 10_000_00 });
    } finally {
      instance.destroy();
    }
  });
});

describe("FixedAssetRegister", () => {
  const assets: FixedAsset[] = [
    {
      id: "van",
      name: "Delivery van",
      acquiredOn: "2026-01-15",
      costMinor: 36_000_00,
      residualMinor: 0,
      method: "straight-line",
      usefulLifeMonths: 36,
    },
    {
      id: "press",
      name: "Printing press",
      acquiredOn: "2026-01-02",
      costMinor: 120_000_00,
      residualMinor: 10_000_00,
      method: "declining-balance",
      rateBp: 2000,
    },
    {
      id: "lift",
      name: "Forklift",
      acquiredOn: "2026-09-01",
      costMinor: 50_000_00,
      residualMinor: 0,
      method: "straight-line",
      usefulLifeMonths: 60,
    },
  ];
  const make = (props: Partial<Parameters<typeof FixedAssetRegister>[0]> = {}) => (
    <FixedAssetRegister defaultAssets={assets} defaultPeriod="2026-03" {...props} />
  );

  it("shows the register as of a period and lets an agent move around", async () => {
    const { entry, act } = setup("fixed-asset-register", "Fixed asset register", make());
    expect(entry().actions).toEqual(["setPeriod", "openAsset", "back", "proposeRun", "assertRunnable"]);
    expect(entry()).toMatchObject({ period: "2026-03", openAssetId: "", proposal: null, runs: [], runnable: true });
    // The van: 1,000.00 a month, three months in.
    expect(entry().rows[0]).toMatchObject({
      id: "van",
      costMinor: 36_000_00,
      depreciationMinor: 1_000_00,
      accumulatedMinor: 3_000_00,
      carryingMinor: 33_000_00,
    });
    // The press: 20% a year is 1/60 a month, of 120,000.00 in January and then of what is left.
    expect(entry().rows[1]).toMatchObject({
      depreciationMinor: 1_933_89,
      accumulatedMinor: 2_000_00 + 1_966_67 + 1_933_89,
    });
    expect(entry().rows[2]).toMatchObject({ id: "lift", accumulatedMinor: 0, carryingMinor: 0 });
    expect(document.querySelector("tbody tr")?.textContent).toContain("$33,000.00");

    expect((await act("setPeriod", ["2026"])).ok).toBe(true);
    expect(entry().rows[0]).toMatchObject({ depreciationMinor: 12_000_00, carryingMinor: 24_000_00 });
    expect((await act("setPeriod", ["March"])).error?.message).toMatch(/not a period code/);
    expect(entry().period).toBe("2026");

    expect((await act("openAsset", ["nope"])).error?.message).toMatch(/No asset "nope". Assets: van, press, lift/);
    expect((await act("openAsset", ["van"])).ok).toBe(true);
    expect(entry().openAssetId).toBe("van");
    expect(entry().schedule).toHaveLength(36);
    expect(entry().schedule[0]).toEqual({
      period: "2026-01",
      depreciationMinor: 1_000_00,
      accumulatedMinor: 1_000_00,
      carryingMinor: 35_000_00,
    });
    expect(document.querySelectorAll('tr[aria-current="true"]')).toHaveLength(12);
    expect((await act("back")).ok).toBe(true);
    expect(entry()).toMatchObject({ openAssetId: "", schedule: [] });
  });

  it("lets an agent propose a run and only a person confirm it, once", async () => {
    const posted: DepreciationRun[] = [];
    const { entry, act, button, alert } = setup(
      "fixed-asset-register",
      "Fixed asset register",
      make({ onRun: (run) => posted.push(run), expenseAccount: { number: "6010", name: "Depreciation" } }),
    );
    const check = await act("assertRunnable", ["2026-03"]);
    expect(check.ok).toBe(true);
    expect((await act("proposeRun", ["2026-03"])).ok).toBe(true);
    const proposal = entry().proposal as DepreciationRun;
    expect(proposal.entries).toEqual([
      { assetId: "van", amountMinor: 1_000_00 },
      { assetId: "press", amountMinor: 1_933_89 },
    ]);
    expect(proposal.lines).toHaveLength(4);
    expect(proposal.lines[0]).toMatchObject({
      account: "6010",
      debitMinor: 1_000_00,
      creditMinor: 0,
      dims: "Delivery van",
    });
    expect(proposal.lines[1]).toMatchObject({ account: "1209", debitMinor: 0, creditMinor: 1_000_00 });
    expect(proposal.skipped).toMatchObject([{ assetId: "lift", code: "not-acquired" }]);
    // Proposing changed no asset and recorded no run.
    expect(entry().runs).toEqual([]);
    expect(entry().rows[0].accumulatedMinor).toBe(3_000_00);
    expect(posted).toEqual([]);
    expect(document.querySelector('[data-slot="fixed-asset-register-run"]')?.textContent).toContain("$2,933.89");

    for (const [action, args] of [
      ["confirmRun", []],
      ["dispose", ["van", "2026-06-01", 0]],
      ["disposeTyped", []],
      ["discardRun", []],
      ["setDraft", ["date", "2026-06-01"]],
    ] as const) {
      expect((await act(action, [...args])).ok, action).toBe(false);
    }
    expect(entry().runs).toEqual([]);
    expect(entry().proposal).not.toBeNull();

    fireEvent.click(button("Confirm run"));
    expect(alert()).toBe("");
    expect(posted).toHaveLength(1);
    expect(posted[0]!.lines).toEqual(proposal.lines);
    expect(entry()).toMatchObject({ runs: ["2026-03"], proposal: null, runnable: false });
    expect(document.querySelector('[role="status"]')?.textContent).toMatch(/March 2026 · depreciation has been run/);
    expect((button("Propose depreciation run") as HTMLButtonElement).disabled).toBe(true);

    const again = await act("proposeRun", ["2026-03"]);
    expect(again.error?.message).toMatch(/2026-03 has already been run/);
    expect((await act("assertRunnable", ["2026"])).error?.message).toMatch(/overlaps the run already made for 2026-03/);
    expect((await act("proposeRun", ["2026-04"])).ok).toBe(true);
  });

  it("lets a person open an asset and dispose of it with a gain", async () => {
    const disposals: Disposal[] = [];
    const { entry, act, button, field, alert } = setup(
      "fixed-asset-register",
      "Fixed asset register",
      make({ onDispose: (d) => disposals.push(d) }),
    );
    await act("proposeRun", ["2026-03"]);
    fireEvent.click(button("Open: Delivery van"));
    expect(entry().openAssetId).toBe("van");
    fireEvent.click(button("Dispose of asset"));
    expect(alert()).toMatch(/disposal date must be a real date written YYYY-MM-DD/);
    fireEvent.change(field("Disposal date"), { target: { value: "2026-01-01" } });
    fireEvent.click(button("Dispose of asset"));
    expect(alert()).toMatch(/acquired on 2026-01-15/);
    fireEvent.change(field("Disposal date"), { target: { value: "2026-07-10" } });
    fireEvent.change(field("Proceeds"), { target: { value: "31,500.00" } });
    fireEvent.click(button("Dispose of asset"));
    expect(alert()).toBe("");
    // Six months depreciated: carrying 30,000.00, sold for 31,500.00.
    expect(disposals).toHaveLength(1);
    expect(disposals[0]).toMatchObject({ carryingMinor: 30_000_00, proceedsMinor: 31_500_00, gainLossMinor: 1_500_00 });
    expect(document.querySelector('[data-slot="fixed-asset-register-disposal"]')?.textContent).toMatch(
      /Gain on disposal: \$1,500.00/,
    );
    expect(entry().schedule).toHaveLength(6);
    expect(entry().proposal).toBeNull(); // worked out with the van still on the books
    expect(button("Dispose of asset")).toBeUndefined();
    fireEvent.click(button("Back to register"));
    expect(entry().rows[0]).toMatchObject({ disposedOn: "2026-07-10", depreciationMinor: 1_000_00 });
    await act("setPeriod", ["2026-08"]);
    expect(entry().rows[0]).toMatchObject({ depreciationMinor: 0, carryingMinor: 0 });
  });

  it("takes a typed period and follows controlled assets", () => {
    const { entry, field, alert } = setup("fixed-asset-register", "Fixed asset register", make());
    const period = field("Period");
    fireEvent.change(period, { target: { value: "2026-13" } });
    fireEvent.blur(period);
    expect(alert()).toMatch(/not a period code/);
    expect(period.value).toBe("2026-03");
    fireEvent.change(period, { target: { value: "2026-02" } });
    fireEvent.keyDown(period, { key: "Enter" });
    expect(alert()).toBe("");
    expect(entry().rows[0].accumulatedMinor).toBe(2_000_00);
    cleanup();
    const controlled = setup(
      "fixed-asset-register",
      "Fixed asset register",
      <FixedAssetRegister assets={assets} period="2026-03" />,
    );
    controlled.rerender(<FixedAssetRegister assets={[assets[2]!]} period="2026-10" />);
    expect(controlled.entry().rows).toMatchObject([
      { id: "lift", accumulatedMinor: 1_666_66, carryingMinor: 48_333_34 },
    ]);
    expect(controlled.entry().period).toBe("2026-10");
  });

  it("is named in Norwegian under the NO profile", () => {
    const { entry, button } = setup("fixed-asset-register", "Anleggsregister", make(), "NO");
    expect(entry()).toBeDefined();
    expect(document.querySelector('[aria-label="Anleggsregister"]')).not.toBeNull();
    expect(button("Foreslå avskrivningskjøring")).toBeDefined();
  });

  it("reports the click as the source of a confirmed run (ui-sdk mount)", async () => {
    const view = mount(
      fixedAssetRegister,
      { defaultAssets: assets, defaultPeriod: "2026-03" },
      `<root><propose>Propose</propose><confirm>Confirm</confirm><open value="van">Van</open></root>`,
    );
    try {
      await view.click(view.part("propose")!);
      expect(view.state.proposal?.totalMinor).toBe(2_933_89);
      expect(view.changes.at(-1)).toMatchObject({ key: "proposal", reason: "propose-run", source: "mouse" });
      await view.click(view.part("confirm")!);
      expect(view.state.runs).toEqual(["2026-03"]);
      expect(view.changes.at(-1)).toMatchObject({ key: "runs", reason: "depreciation-run", source: "mouse" });
      await view.click(view.part("open", "van")!);
      expect(view.changes.at(-1)).toMatchObject({ key: "openAssetId", reason: "open-asset", source: "mouse" });
    } finally {
      view.unmount();
    }
  });
});
