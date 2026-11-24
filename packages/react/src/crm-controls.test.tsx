import type { Activity } from "@booki/core/activity";
import type { Deal, PipelineStage } from "@booki/core/pipeline";
import { mount } from "@ui-sdk/core/testing";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ActivityTimeline, activityTimeline } from "./activity-timeline.js";
import { createBookiAgent } from "./booki-agent.js";
import { DealPipeline, dealPipeline } from "./deal-pipeline.js";
import { BookiLocaleProvider } from "./locale.js";

afterEach(() => cleanup());

type Result = { ok: boolean; value?: unknown; error?: { message: string } };

function setup(component: string, ref: string, ui: ReactElement, country: "US" | "NO" = "US") {
  const agent = createBookiAgent({ agentId: "test" });
  const heard: { source?: string; key?: string }[] = [];
  agent.subscribe((event) => heard.push(event as never));
  render(<BookiLocaleProvider defaultCountry={country}>{ui}</BookiLocaleProvider>);
  const entry = () => agent.snapshot().find((c) => c.component === component) as unknown as Record<string, any>;
  const act = (action: string, args: unknown[] = []) =>
    agent.act({ steps: [{ ref, action, args }] }) as Promise<Result>;
  const button = (name: string) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === name || b.textContent === name,
    )!;
  const alert = () => document.querySelector('[role="alert"]')?.textContent ?? "";
  return { agent, heard, entry, act, button, alert };
}

const stages: PipelineStage[] = [
  { id: "lead", name: "Lead", probability: 10 },
  { id: "quote", name: "Quote sent", probability: 50 },
  { id: "won", name: "Won", probability: 100, outcome: "won" },
  { id: "lost", name: "Lost", probability: 0, outcome: "lost" },
];
const deals: Deal[] = [
  {
    id: "D-1",
    name: "Licence 2027",
    company: "Example AS",
    stageId: "lead",
    valueMinor: 120_000_00,
    currency: "NOK",
    valueStatus: "known",
    valueSource: "Quote 114",
    ownerId: "u1",
  },
  {
    id: "D-2",
    name: "Support",
    stageId: "quote",
    valueMinor: 40_000_00,
    currency: "NOK",
    valueStatus: "unknown",
  },
];
const owners = [
  { id: "u1", name: "Kari Nordmann" },
  { id: "u2", name: "Ola Hansen" },
];

describe("DealPipeline", () => {
  const ui = (actor = "kari") => (
    <DealPipeline stages={stages} defaultDeals={deals} owners={owners} today="2026-11-24" actor={actor} />
  );

  it("lets an agent move, value and assign deals, never close them", async () => {
    const { entry, act } = setup("deal-pipeline", "Sales pipeline", ui());
    expect(entry().actions).toEqual(["moveDeal", "setValue", "setExpectedClose", "setOwner"]);
    expect(entry().dealFormat).toMatch(/valueMinor: 12500000/);
    expect(entry().forecast).toEqual([
      {
        currency: "NOK",
        knownMinor: 120_000_00,
        estimateMinor: 0,
        weightedMinor: 12_000_00,
        unverified: 1,
        missing: 0,
      },
    ]);
    expect(entry().issues["D-2"][0]).toMatch(/Deal "D-2" has an amount nobody vouched for/);
    // On the card the deal reads by its name: a product's ids are often UUIDs.
    expect(document.body.textContent).toMatch(/Deal "Support" has an amount nobody vouched for/);

    expect((await act("moveDeal", ["D-1", "quote"])).ok).toBe(true);
    expect(entry().deals[0].stageId).toBe("quote");
    expect(entry().forecast[0].weightedMinor).toBe(60_000_00);

    const won = await act("moveDeal", ["D-1", "won"]);
    expect(won.error?.message).toMatch(/marks it won\. That is a person's decision/);
    expect((await act("closeWon", ["D-1"])).ok).toBe(false);

    expect((await act("setValue", ["D-2", { valueStatus: "estimate" }])).error?.message).toMatch(/needs both/);
    expect((await act("setValue", ["D-2", { valueStatus: "estimate", valueSource: "Call 3 Nov" }])).ok).toBe(true);
    expect(entry().forecast[0].estimateMinor).toBe(40_000_00);
    expect((await act("setValue", ["D-2", { probability: 80 }])).error?.message).toMatch(
      /Fields: valueMinor, currency, valueStatus, valueSource/,
    );

    expect((await act("setOwner", ["D-2", "Ola Hansen"])).ok).toBe(true);
    expect(entry().deals[1].ownerId).toBe("u2");
    expect((await act("setOwner", ["D-2", "Per"])).error?.message).toMatch(/u1 \(Kari Nordmann\), u2 \(Ola Hansen\)/);
    expect((await act("setExpectedClose", ["D-2", "15.12.2026"])).error?.message).toMatch(/YYYY-MM-DD/);
    expect((await act("moveDeal", ["D-9", "lead"])).error?.message).toMatch(/Deals: D-1, D-2/);
  });

  it("lets a person close a deal won, lost with a reason, and reopen it", async () => {
    const { entry, button, alert } = setup("deal-pipeline", "Sales pipeline", ui());
    fireEvent.click(button("Mark lost: Support"));
    expect(alert()).toMatch(/needs a reason/);
    const reason = document.querySelector('textarea[aria-label="Why it was lost: Support"]') as HTMLTextAreaElement;
    fireEvent.change(reason, { target: { value: "Chose a competitor" } });
    fireEvent.click(button("Mark lost: Support"));
    expect(entry().deals[1]).toMatchObject({ stageId: "lost", closedBy: "kari", lostReason: "Chose a competitor" });

    fireEvent.click(button("Mark won: Licence 2027"));
    expect(entry().deals[0]).toMatchObject({ stageId: "won", closedBy: "kari" });
    expect(entry().forecast).toEqual([]);
    fireEvent.click(button("Reopen: Licence 2027"));
    expect(entry().deals[0].stageId).toBe("quote");
    expect(entry().deals[0].closedBy).toBeUndefined();
  });

  it("moves a deal from a person's stage picker, reported as theirs", async () => {
    const { entry, heard } = setup("deal-pipeline", "Sales pipeline", ui());
    const select = document.querySelector('select[aria-label="Stage: Licence 2027"]') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["lead", "quote"]);
    fireEvent.change(select, { target: { value: "quote" } });
    expect(entry().deals[0].stageId).toBe("quote");
    expect(heard.at(-1)?.source).not.toBe("agent");
  });

  it("keeps a controlled board's deals with the owner", async () => {
    function Owned() {
      const [list, setList] = useState(deals);
      return <DealPipeline stages={stages} deals={list} onDealsChange={setList} today="2026-11-24" actor="kari" />;
    }
    const { entry, act } = setup("deal-pipeline", "Sales pipeline", <Owned />);
    expect((await act("moveDeal", ["D-2", "lead"])).ok).toBe(true);
    await waitFor(() => expect(entry().deals[1].stageId).toBe("lead"));
    expect(entry().summary[0].count).toBe(2);
  });

  it("refuses in Norwegian on a Norwegian screen", async () => {
    const { act, button, alert } = setup("deal-pipeline", "Salgsløp", ui(), "NO");
    await act("moveDeal", ["D-1", "won"]);
    await waitFor(() => expect(alert()).toMatch(/Det er en persons beslutning/));
    fireEvent.click(button("Marker tapt: Support"));
    await waitFor(() => expect(alert()).toMatch(/krever en begrunnelse/));
  });

  it("works framework-free through mount", () => {
    const view = mount(dealPipeline, { stages, defaultDeals: deals, today: "2026-11-24" } as never, "<root></root>");
    const api = view.api as unknown as Record<string, (...args: unknown[]) => unknown>;
    api.moveDeal("D-2", "lead");
    expect((view.state as { summary: { count: number }[] }).summary[0]!.count).toBe(2);
    expect(() => api.moveDeal("D-2", "lost")).toThrow(/person's decision/);
  });
});

const NOW_DAY = new Date().toISOString().slice(0, 10);
const activities: Activity[] = [
  { id: "A-1", kind: "meeting", subject: "Demo", at: "2026-11-10T13:00:00Z", by: "kari", evidence: "cal:991" },
  { id: "A-2", kind: "call", subject: "Check-in", at: "2026-11-20T09:00:00Z", by: "kari" },
  { id: "T-1", kind: "task", subject: "Send quote", at: "2026-11-10T13:00:00Z", by: "kari", dueDate: "2026-11-20" },
];

describe("ActivityTimeline", () => {
  const ui = (actor = "kari") => (
    <ActivityTimeline defaultActivities={activities} people={owners} today="2026-11-24" actor={actor} />
  );

  it("lets an agent log, schedule and complete, recorded as the agent's, never remove", async () => {
    const { entry, act } = setup("activity-timeline", "Activity", ui());
    expect(entry().actions).toEqual(["logActivity", "scheduleTask", "completeTask", "rescheduleTask"]);
    expect(entry().overdue).toEqual(["T-1"]);
    expect(entry().nextTask).toBe("T-1");
    expect(entry().lastTouch).toEqual({ id: "A-2", kind: "call", at: "2026-11-20T09:00:00Z" });
    expect(entry().issues["A-2"][0]).toMatch(/nothing to check it against/);

    const logged = await act("logActivity", [{ kind: "email", subject: "Sent the quote", at: NOW_DAY }]);
    expect(logged.ok).toBe(true);
    expect(entry().timeline[0]).toMatchObject({ id: "A-3", kind: "email", by: "agent" });
    expect(entry().lastTouch.id).toBe("A-3");

    expect((await act("logActivity", [{ kind: "task", subject: "x" }])).error?.message).toMatch(/scheduleTask/);
    expect((await act("logActivity", [{ kind: "call", subject: "x", when: NOW_DAY }])).error?.message).toMatch(
      /Fields: kind, subject, body, at, evidence/,
    );
    expect((await act("logActivity", [{ kind: "call", subject: "x", at: "2999-01-01" }])).error?.message).toMatch(
      /has not happened yet/,
    );

    expect(
      (await act("scheduleTask", [{ subject: "Follow up", dueDate: "2026-12-01", assigneeId: "Ola Hansen" }])).ok,
    ).toBe(true);
    expect(entry().openTasks).toEqual(["T-1", "T-2"]);
    expect(
      (await act("scheduleTask", [{ subject: "x", dueDate: "2026-12-01", assigneeId: "Per" }])).error?.message,
    ).toMatch(/u1 \(Kari Nordmann\)/);

    expect((await act("completeTask", ["T-1"])).ok).toBe(true);
    expect(entry().overdue).toEqual([]);
    expect((await act("completeTask", ["A-1"])).error?.message).toMatch(/is a meeting, not a task/);
    expect((await act("rescheduleTask", ["T-2", "next week"])).error?.message).toMatch(/YYYY-MM-DD/);
    expect((await act("remove", ["A-1"])).ok).toBe(false);
  });

  it("lets a person complete and remove", async () => {
    const { entry, button } = setup("activity-timeline", "Activity", ui());
    fireEvent.click(button("Mark done: Send quote"));
    expect(entry().timeline.find((a: Activity) => a.id === "T-1")).toMatchObject({ doneBy: "kari" });
    fireEvent.click(button("Remove: Check-in"));
    expect(entry().timeline.map((a: Activity) => a.id)).not.toContain("A-2");
  });

  it("asks who removes an entry when nobody is signed in", async () => {
    const { entry, button, alert } = setup("activity-timeline", "Activity", ui(""));
    fireEvent.click(button("Remove: Check-in"));
    expect(alert()).toMatch(/Nobody is signed in/);
    expect(entry().timeline).toHaveLength(3);
  });

  it("reads in Norwegian", async () => {
    const { act, entry, alert } = setup("activity-timeline", "Aktivitet", ui(), "NO");
    expect(document.body.textContent).toMatch(/Siste kontakt: Samtale/);
    await act("logActivity", [{ kind: "call", subject: "x", at: "2999-01-01" }]);
    await waitFor(() => expect(alert()).toMatch(/ikke har skjedd ennå/));
    expect(entry().overdue).toEqual(["T-1"]);
  });

  it("works framework-free through mount", () => {
    const view = mount(
      activityTimeline,
      { defaultActivities: activities, today: "2026-11-24" } as never,
      "<root></root>",
    );
    const api = view.api as unknown as Record<string, (...args: unknown[]) => unknown>;
    expect(api.scheduleTask({ subject: "Call back", dueDate: "2026-11-30" })).toEqual({ id: "T-2" });
    expect((view.state as { openTasks: string[] }).openTasks).toEqual(["T-1", "T-2"]);
  });
});
