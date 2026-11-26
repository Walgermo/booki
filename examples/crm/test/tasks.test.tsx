import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CrmApp } from "@/components/crm-app";
import { asAgentWork, pageAgent } from "@/lib/agent";
import { crm } from "@/lib/store";
import { runTask } from "@/lib/tasks";

function open() {
  render(<CrmApp initial={structuredClone(crm())} />);
  return pageAgent();
}

/** A date some days from today on the local calendar, as the tasks write it. */
const fromToday = (days: number) => {
  const now = new Date();
  const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + days));
  return date.toISOString().slice(0, 10);
};

describe("common tasks, run by the scripted agent on the page", () => {
  it("logs the call and schedules the follow-up, recorded as the agent", async () => {
    const agent = open();
    const report = await runTask(agent, "log-call", { dealId: "D-101", me: "kari" });
    expect(report.did).toEqual(["samtale: logget", `oppfølging: planlagt ${fromToday(3)}`]);
    await waitFor(() =>
      expect(
        crm()
          .activities["D-101"]!.map((item) => item.by)
          .slice(-2),
      ).toEqual(["agent:crm-assistant", "agent:crm-assistant"]),
    );
    // Three days out from today, so the new follow-up is not overdue the moment it is made.
    const followUp = crm().activities["D-101"]!.at(-1)!;
    expect(followUp.dueDate! > fromToday(0)).toBe(true);
  });

  it("keeps the open deal while the agent works, so its follow-up lands on the deal it started on", async () => {
    const agent = open();
    const picker = () => screen.getByLabelText("Åpen avtale") as HTMLSelectElement;
    expect(picker().disabled).toBe(false);
    // Hold the first write on its way to the server: the person tries to switch deals between the two steps.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const server = globalThis.fetch;
    vi.stubGlobal("fetch", async (...args: Parameters<typeof fetch>) => {
      await held;
      return server(...args);
    });
    const task = asAgentWork(() => runTask(agent, "log-call", { dealId: "D-101", me: "kari" }));
    await waitFor(() => expect(picker().disabled).toBe(true));
    fireEvent.change(picker(), { target: { value: "D-102" } });
    release();
    await task;
    await waitFor(() => expect(picker().disabled).toBe(false));
    const lastTwo = crm().activities["D-101"]!.slice(-2);
    expect(lastTwo.map((item) => item.by)).toEqual(["agent:crm-assistant", "agent:crm-assistant"]);
    expect(crm().activities["D-102"]!.some((item) => item.by === "agent:crm-assistant")).toBe(false);
  });

  it("does not touch a won deal with the meeting task: no new figure, no write at all", async () => {
    const agent = open();
    const won = crm().deals.find((deal) => deal.stageId === "won")!;
    const before = structuredClone(won);
    const audit = crm().audit.length;
    const report = await runTask(agent, "after-meeting", { dealId: won.id, me: "kari" });
    expect(report.did).toEqual([]);
    expect(report.waiting.join(" ")).toMatch(/lukket/);
    expect(crm().deals.find((deal) => deal.id === won.id)).toEqual(before);
    expect(crm().audit.length).toBe(audit);
  });

  it("updates the deal after a meeting: an estimate with its source, the next stage and a close date", async () => {
    const agent = open();
    const report = await runTask(agent, "after-meeting", { dealId: "D-101", me: "kari" });
    expect(report.waiting).toEqual([]);
    await waitFor(() =>
      expect(crm().deals.find((deal) => deal.id === "D-101")).toMatchObject({
        stageId: "negotiation",
        valueMinor: 210_000_00,
        valueStatus: "estimate",
        expectedClose: fromToday(30),
      }),
    );
  });

  it("tidies the pipeline: moves a passed close date and leaves the rest for a person", async () => {
    const agent = open();
    const report = await runTask(agent, "tidy-pipeline", { dealId: "D-101", me: "kari" });
    expect(report.did.join(" ")).toContain(
      `Konsernrapportering: lukkedatoen hadde passert, flyttet til ${fromToday(14)}`,
    );
    expect(report.waiting.join(" ")).toMatch(/Lønnstjenester: beløpet mangler kilde/);
    expect(report.waiting.join(" ")).toMatch(/Rådgivning 2027: har ingen verdi/);
  });

  it("reads the forecast, the funnel and the slowest stage", async () => {
    const agent = open();
    const report = await runTask(agent, "quarter", { dealId: "D-101", me: "kari" });
    // Intl writes digit groups with a no-break space.
    expect(report.did.join(" ").replace(/\s/g, " ")).toMatch(/2026-Q4: vunnet 95 000 kr, sikker 180 000 kr/);
    expect(report.did.join(" ")).toMatch(/konvertering: størst frafall/);
    expect(report.did.join(" ")).toMatch(/tid i fase: tregest er/);
    expect(report.waiting.join(" ")).toMatch(/prognose: 2 avtaler uten beløp eller kilde/);
  });

  it("is refused marking a deal won, and the deal stays open", async () => {
    const agent = open();
    const report = await runTask(agent, "close-won", { dealId: "D-101", me: "kari" });
    expect(report.did).toEqual([]);
    expect(report.waiting[0]).toMatch(/person/);
    expect(crm().deals.find((deal) => deal.id === "D-101")?.stageId).toBe("quote");
  });
});

describe("the deal's value form", () => {
  const typeAmount = (text: string) => {
    const amount = screen.getByLabelText("Beløp", { selector: "input" });
    fireEvent.focus(amount);
    fireEvent.change(amount, { target: { value: text } });
    fireEvent.blur(amount);
  };

  it("drops the old evidence when the figure changes: the old quote vouched for the old amount only", async () => {
    render(<CrmApp initial={structuredClone(crm())} />);
    typeAmount("280000");
    expect((screen.getByLabelText("Kilde for beløpet") as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Lagre verdien" }));
    await waitFor(() =>
      expect(crm().deals.find((deal) => deal.id === "D-101")).toMatchObject({
        valueMinor: 280_000_00,
        valueStatus: "unknown",
      }),
    );
    expect(crm().deals.find((deal) => deal.id === "D-101")?.valueSource).toBeUndefined();
  });

  it("keeps the evidence the person gives for the new figure", async () => {
    render(<CrmApp initial={structuredClone(crm())} />);
    typeAmount("280000");
    fireEvent.change(screen.getByLabelText("Kilde for beløpet"), { target: { value: "Tilbud 2026-131" } });
    fireEvent.change(document.getElementById("deal-status")!, { target: { value: "known" } });
    fireEvent.click(screen.getByRole("button", { name: "Lagre verdien" }));
    await waitFor(() =>
      expect(crm().deals.find((deal) => deal.id === "D-101")).toMatchObject({
        valueMinor: 280_000_00,
        valueStatus: "known",
        valueSource: "Tilbud 2026-131",
      }),
    );
  });
});
