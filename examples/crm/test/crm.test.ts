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

  it("refuses an unknown caller", () => {
    const crm = seedCrm();
    expect(apply(crm, undefined, { action: "deals", deals: with_(crm, "D-102", { stageId: "quote" }) })).toMatchObject({
      ok: false,
      status: 401,
    });
  });
});
