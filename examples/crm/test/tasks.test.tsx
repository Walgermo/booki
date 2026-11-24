import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CrmApp } from "@/components/crm-app";
import { pageAgent } from "@/lib/agent";
import { crm } from "@/lib/store";
import { runTask } from "@/lib/tasks";

function open() {
  render(<CrmApp initial={structuredClone(crm())} />);
  return pageAgent();
}

describe("common tasks, run by the scripted agent on the page", () => {
  it("logs the call and schedules the follow-up, recorded as the agent", async () => {
    const agent = open();
    const report = await runTask(agent, "log-call", { dealId: "D-101", me: "kari" });
    expect(report.did).toEqual(["samtale: logget", "oppfølging: planlagt 2026-11-27"]);
    await waitFor(() =>
      expect(
        crm()
          .activities["D-101"]!.map((item) => item.by)
          .slice(-2),
      ).toEqual(["agent:crm-assistant", "agent:crm-assistant"]),
    );
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
        expectedClose: "2026-12-24",
      }),
    );
  });

  it("tidies the pipeline: moves a passed close date and leaves the rest for a person", async () => {
    const agent = open();
    const report = await runTask(agent, "tidy-pipeline", { dealId: "D-101", me: "kari" });
    expect(report.did.join(" ")).toMatch(/Konsernrapportering: lukkedatoen hadde passert, flyttet til 2026-12-08/);
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
