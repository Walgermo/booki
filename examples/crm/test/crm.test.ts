import { describe, expect, it } from "vitest";
import { apply, seedCrm } from "@/lib/crm";
import { actorFor } from "@/lib/people";

const kari = actorFor("person:kari");
const agent = actorFor("agent:kari");
const with_ = (crm: ReturnType<typeof seedCrm>, id: string, patch: Record<string, unknown>) =>
  crm.deals.map((deal) => (deal.id === id ? { ...deal, ...patch } : deal));

describe("the server's rules", () => {
  it("lets the agent move and value a deal, recorded as the agent", () => {
    const crm = seedCrm();
    const answer = apply(crm, agent, { action: "deals", deals: with_(crm, "D-102", { stageId: "quote" }) });
    expect(answer.ok).toBe(true);
    expect(crm.deals.find((deal) => deal.id === "D-102")?.stageId).toBe("quote");
    expect(crm.audit[0]).toMatchObject({ actor: "agent:crm-assistant", action: "deal.move", target: "D-102" });
  });

  it("refuses the agent closing a deal, and lets the person close it, lost only with a reason", () => {
    const crm = seedCrm();
    const refused = apply(crm, agent, { action: "deals", deals: with_(crm, "D-101", { stageId: "won" }) });
    expect(refused).toMatchObject({ ok: false, status: 403 });
    expect(crm.deals.find((deal) => deal.id === "D-101")?.stageId).toBe("quote");
    expect(crm.audit[0]).toMatchObject({ action: "refused", target: "D-101" });

    expect(apply(crm, kari, { action: "deals", deals: with_(crm, "D-101", { stageId: "lost" }) })).toMatchObject({
      ok: false,
      status: 422,
    });
    const won = apply(crm, kari, { action: "deals", deals: with_(crm, "D-101", { stageId: "won" }) });
    expect(won.ok).toBe(true);
    expect(crm.deals.find((deal) => deal.id === "D-101")).toMatchObject({ stageId: "won", closedBy: "kari" });
  });

  it("refuses a known value without a source, and takes the closer from the credential, not the body", () => {
    const crm = seedCrm();
    expect(
      apply(crm, kari, { action: "deals", deals: with_(crm, "D-104", { valueMinor: 1000, valueStatus: "known" }) }),
    ).toMatchObject({ ok: false, status: 422 });
    apply(crm, kari, { action: "deals", deals: with_(crm, "D-101", { stageId: "won", closedBy: "ola" }) });
    expect(crm.deals.find((deal) => deal.id === "D-101")?.closedBy).toBe("kari");
  });

  it("stamps a new activity with who logged it, and keeps removing for a person", () => {
    const crm = seedCrm();
    const added = [
      ...crm.activities["D-102"]!,
      { id: "A-9", kind: "call" as const, subject: "Ringte", at: "2026-11-24", by: "kari" },
    ];
    expect(apply(crm, agent, { action: "activities", dealId: "D-102", activities: added }).ok).toBe(true);
    expect(crm.activities["D-102"]!.at(-1)).toMatchObject({ id: "A-9", by: "agent:crm-assistant" });
    expect(apply(crm, agent, { action: "activities", dealId: "D-102", activities: [] })).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(apply(crm, kari, { action: "activities", dealId: "D-102", activities: [] }).ok).toBe(true);
    expect(crm.activities["D-102"]).toEqual([]);
  });

  it("takes from an older screen only what it changed: another tab's newer change stays", () => {
    const crm = seedCrm();
    const older = structuredClone(crm.deals);
    // The first tab marks D-101 won.
    const won = with_(crm, "D-101", { stageId: "won" });
    expect(apply(crm, kari, { action: "deals", deals: won, base: older }).ok).toBe(true);
    // The second tab, still on the older list, saves a close date on D-102.
    const second = older.map((deal) => (deal.id === "D-102" ? { ...deal, expectedClose: "2027-02-01" } : deal));
    expect(apply(crm, kari, { action: "deals", deals: second, base: older }).ok).toBe(true);
    expect(crm.deals.find((deal) => deal.id === "D-101")).toMatchObject({ stageId: "won", closedBy: "kari" });
    expect(crm.deals.find((deal) => deal.id === "D-102")?.expectedClose).toBe("2027-02-01");
    // And a change to the deal the other tab changed is refused, not applied over it.
    const third = older.map((deal) => (deal.id === "D-101" ? { ...deal, expectedClose: "2027-03-01" } : deal));
    const refused = apply(crm, kari, { action: "deals", deals: third, base: older });
    expect(refused).toMatchObject({ ok: false, status: 409, code: "crm.stale" });
    expect(crm.deals.find((deal) => deal.id === "D-101")?.stageId).toBe("won");
  });

  it("keeps an activity another tab logged when an older timeline completes a task", () => {
    const crm = seedCrm();
    const older = structuredClone(crm.activities["D-101"]!);
    const call = { id: "A-90", kind: "call" as const, subject: "Ringte", at: "2026-11-20", by: "kari" };
    const logged = apply(crm, kari, {
      action: "activities",
      dealId: "D-101",
      activities: [...older, call],
      base: older,
    });
    expect(logged.ok).toBe(true);
    const task = older.find((item) => item.kind === "task" && !item.doneAt)!;
    const done = older.map((item) => (item.id === task.id ? { ...item, doneAt: "2026-11-24" } : item));
    expect(apply(crm, kari, { action: "activities", dealId: "D-101", activities: done, base: older }).ok).toBe(true);
    expect(crm.activities["D-101"]!.map((item) => item.id)).toContain("A-90");
    expect(crm.activities["D-101"]!.find((item) => item.id === task.id)?.doneAt).toBeTruthy();
  });

  it("keeps the stage history for the reports when a deal moves on and back", () => {
    const crm = seedCrm();
    const stays = crm.stays.length;
    apply(crm, kari, { action: "deals", deals: with_(crm, "D-102", { stageId: "quote" }) });
    // The meeting stay it finished counts in time in stage.
    expect(crm.stays).toHaveLength(stays + 1);
    expect(crm.stays.at(-1)).toMatchObject({ dealId: "D-102", stageId: "meeting", leftAt: expect.any(String) });
    apply(crm, kari, { action: "deals", deals: with_(crm, "D-102", { stageId: "meeting" }) });
    // Back in meeting, the funnel still knows it reached quote.
    expect(crm.history["D-102"]).toEqual(["lead", "meeting", "quote", "meeting"]);
    expect(crm.stays.at(-1)).toMatchObject({ dealId: "D-102", stageId: "quote" });
  });

  it("refuses an unknown caller", () => {
    const crm = seedCrm();
    expect(apply(crm, undefined, { action: "deals", deals: with_(crm, "D-102", { stageId: "quote" }) })).toMatchObject({
      ok: false,
      status: 401,
    });
  });
});
