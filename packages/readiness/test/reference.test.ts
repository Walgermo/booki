import { describe, expect, it } from "vitest";

import { PERSON_ONLY_PERMISSIONS } from "../src/conformance/permissions.js";
import { createReference } from "../src/reference/index.js";

const setMinor = (ref: ReturnType<typeof createReference>, value: unknown) =>
  ref.bridge.act({ steps: [{ ref: "Amount", action: "setMinor", args: [value] }] });

describe("reference: snapshot", () => {
  it("returns fresh copies, so mutating them changes nothing inside", () => {
    const ref = createReference();
    const first = ref.bridge.snapshot() as Array<Record<string, unknown>>;
    (first[0].actions as string[]).push("hacked");
    first[0].minor = 999;
    const second = ref.bridge.snapshot() as Array<Record<string, unknown>>;
    expect(second[0].actions).toEqual(["clear", "setMinor"]);
    expect(second[0].minor).toBeNull();
  });

  it("lists the four controls, with refs equal to labels", () => {
    const ref = createReference();
    const components = ref.bridge.snapshot() as Array<{ ref: string; label: string; component: string }>;
    expect(components.map((c) => [c.ref, c.label, c.component])).toEqual([
      ["Amount", "Amount", "amount-field"],
      ["Account", "Account", "account-picker"],
      ["Bank account", "Bank account", "bank-account"],
      ["Approval", "Approval", "approval-chain"],
    ]);
  });

  it("offers the Approval control only assertApproved", () => {
    const ref = createReference();
    const approval = (ref.bridge.snapshot() as Array<{ ref: string; actions: string[] }>).find(
      (c) => c.ref === "Approval",
    );
    expect(approval?.actions).toEqual(["assertApproved"]);
  });
});

describe("reference: amounts", () => {
  it("accepts whole minor units and refuses decimals and text", () => {
    const ref = createReference();
    expect(setMinor(ref, 155000)).toEqual({ ok: true });
    expect((ref.bridge.snapshot()[0] as Record<string, unknown>).minor).toBe(155000);

    for (const bad of [12.5, "1 500,00", "155000", -1, 100_000_000_000]) {
      const result = setMinor(ref, bad);
      expect(result.ok).toBe(false);
    }
    expect(setMinor(ref, 12.5)).toEqual({
      ok: false,
      error: {
        message: "Amount must be a whole number of minor units (ore), for example 155000 for 1550.00, not 12.5.",
      },
    });
    expect(setMinor(ref, "1 500,00").ok).toBe(false);
  });
});

describe("reference: accounts", () => {
  it("names the valid accounts in the refusal, in en and nb", () => {
    const en = createReference();
    const nb = createReference({ locale: "nb" });
    const bad = (r: ReturnType<typeof createReference>) =>
      r.bridge.act({ steps: [{ ref: "Account", action: "setAccount", args: ["9999"] }] });

    const enMessage = bad(en).error?.message ?? "";
    const nbMessage = bad(nb).error?.message ?? "";
    expect(enMessage).toContain("1920");
    expect(enMessage).toContain("6800");
    expect(enMessage).toContain('"9999"');
    expect(nbMessage).toContain("1920");
    expect(nbMessage).toContain("6800");
    expect(nbMessage).toContain('"9999"');
    expect(nbMessage).not.toBe(enMessage);
  });

  it("accepts a listed account and shows it in the snapshot", () => {
    const ref = createReference();
    expect(ref.bridge.act({ steps: [{ ref: "Account", action: "setAccount", args: ["6800"] }] })).toEqual({
      ok: true,
    });
    expect((ref.bridge.snapshot()[1] as Record<string, unknown>).account).toBe("6800");
  });
});

describe("reference: bank account", () => {
  it("stores the value privately and never returns it in the snapshot", () => {
    const ref = createReference();
    expect(ref.bridge.act({ steps: [{ ref: "Bank account", action: "setAccount", args: ["86011117947"] }] })).toEqual({
      ok: true,
    });
    const snapshot = JSON.stringify(ref.bridge.snapshot());
    expect(snapshot).not.toContain("86011117947");
    const bank = (ref.bridge.snapshot() as Array<Record<string, unknown>>).find((c) => c.ref === "Bank account");
    expect(bank?.isSet).toBe(true);
  });
});

describe("reference: steps and refusals", () => {
  it("stops at the first refusal and never throws", () => {
    const ref = createReference();
    const result = ref.bridge.act({
      steps: [
        { ref: "Amount", action: "setMinor", args: [100] },
        { ref: "Nope", action: "clear" },
        { ref: "Amount", action: "clear" },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("Amount, Account, Bank account, Approval");
    expect((ref.bridge.snapshot()[0] as Record<string, unknown>).minor).toBe(100);
    expect(ref.audit).toHaveLength(1);
    expect(() => ref.bridge.act({ steps: [null as never] })).not.toThrow();
  });

  it("lists the control's actions for an unknown action", () => {
    const ref = createReference();
    const result = ref.bridge.act({ steps: [{ ref: "Amount", action: "approve" }] });
    expect(result.error?.message).toContain("clear, setMinor");
  });
});

describe("reference: audit and subscriptions", () => {
  it("records a successful agent act with the agent actor and notifies subscribers", () => {
    const ref = createReference();
    const seen: unknown[] = [];
    const unsubscribe = ref.bridge.subscribe((event) => seen.push(event));

    ref.bridge.act({ steps: [{ ref: "Amount", action: "clear" }] });
    expect(ref.audit).toEqual([{ source: "agent", ref: "Amount", action: "clear", actor: "agent:reference-agent" }]);
    expect(seen).toEqual(ref.audit);

    unsubscribe();
    ref.bridge.act({ steps: [{ ref: "Amount", action: "clear" }] });
    expect(seen).toHaveLength(1);
    expect(ref.audit).toHaveLength(2);
  });

  it("adds onBehalfOf when given, and records nothing for a refused act", () => {
    const ref = createReference({ agentId: "bot", onBehalfOf: "person:anna" });
    ref.bridge.act({ steps: [{ ref: "Amount", action: "setMinor", args: [12.5] }] });
    expect(ref.audit).toHaveLength(0);
    ref.bridge.act({ steps: [{ ref: "Amount", action: "clear" }] });
    expect(ref.audit[0]).toEqual({
      source: "agent",
      ref: "Amount",
      action: "clear",
      actor: "agent:bot",
      onBehalfOf: "person:anna",
    });
  });

  it("records a person click as the person, never as an agent", () => {
    const ref = createReference();
    expect(ref.person.id).toBe("person:anna");
    expect(ref.person.click("Account", "setAccount", ["1920"])).toEqual({ ok: true });
    expect(ref.audit[0]).toEqual({
      source: "person",
      ref: "Account",
      action: "setAccount",
      actor: "person:anna",
    });
  });
});

describe("reference: approval", () => {
  it("cannot be approved by an agent, whatever it sends", () => {
    const ref = createReference();
    for (const action of ["approve", "assertApproved"]) {
      const result = ref.bridge.act({ steps: [{ ref: "Approval", action }] });
      expect(result.ok).toBe(false);
    }
    expect(ref.audit).toHaveLength(0);
  });

  it("refuses assertApproved while pending and passes once a person approved", () => {
    const ref = createReference();
    expect(ref.bridge.act({ steps: [{ ref: "Approval", action: "assertApproved" }] })).toEqual({
      ok: false,
      error: { message: "Approval is still pending." },
    });
    expect(ref.person.click("Approval", "approve")).toEqual({ ok: true });
    expect(ref.bridge.act({ steps: [{ ref: "Approval", action: "assertApproved" }] })).toEqual({
      ok: true,
    });
    expect((ref.bridge.snapshot()[3] as Record<string, unknown>).status).toBe("approved");
    expect(ref.audit.at(-1)?.actor).toBe("agent:reference-agent");
  });

  it("refuses any other person action on Approval", () => {
    const ref = createReference();
    expect(ref.person.click("Approval", "clear").ok).toBe(false);
  });
});

describe("reference: server", () => {
  const ref = createReference();

  it("answers 401 without a signed-in actor", () => {
    expect(ref.server(null, "approval.decide")).toMatchObject({ status: 401, code: "not-signed-in" });
  });

  it("answers 403 person-only for an agent on a person-only permission, whatever its roles", () => {
    const agent = { kind: "agent" as const, id: "agent:x", roles: ["approval.decide"] };
    expect(ref.server(agent, "approval.decide")).toMatchObject({ status: 403, code: "person-only" });
    expect(ref.server(agent, "invoice.read")).toEqual({ status: 200 });
  });

  it("answers 403 role for a person without the permission, and 200 with it", () => {
    const person = { kind: "person" as const, id: "person:anna", roles: ["expense.approve"] };
    expect(ref.server(person, "approval.decide")).toMatchObject({ status: 403, code: "role" });
    expect(ref.server(person, "expense.approve")).toEqual({ status: 200 });
  });

  it("lists 22 unique person-only permissions", () => {
    expect(PERSON_ONLY_PERMISSIONS).toHaveLength(22);
    expect(new Set(PERSON_ONLY_PERMISSIONS).size).toBe(22);
  });
});
